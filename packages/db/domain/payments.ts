import { classifyMercadoPagoFailure, computeDepositAmount, DEPOSIT_AUTO_CANCEL_REASONS, mapMercadoPagoStatus, messages } from "@nutri-bot/core";
import { MercadoPagoConfig, Payment as MercadoPagoPayment, Preference } from "mercadopago";
import { prisma, type Payment as DbPayment, type Prisma } from "../index";
import { resolveLegacySchedulingScope } from "./legacySchedulingScope";
import {
  getMercadoPagoCredentials,
  markMercadoPagoAccountError,
  MercadoPagoUnavailableError,
  type MercadoPagoCredentials,
} from "./mercadopagoAccount";

// HU-023: el token sale de la cuenta vinculada por OAuth (getMercadoPagoCredentials), no del .env.
function mercadoPagoClient(accessToken: string): MercadoPagoConfig {
  return new MercadoPagoConfig({ accessToken, options: { timeout: 10_000 } });
}

/** HU-023: si MP responde que el token ya no vale (401 / invalid_token), marca la cuenta como
 *  "Hay que reconectar" (uno por incidente) y re-tira el error original. */
async function withRevocationGuard<T>(creds: MercadoPagoCredentials, call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    const status = typeof (error as { status?: unknown })?.status === "number" ? (error as { status: number }).status : undefined;
    const code = typeof (error as { error?: unknown })?.error === "string" ? (error as { error: string }).error : null;
    if (creds.source === "account" && classifyMercadoPagoFailure({ status, code }) === "revoked") {
      await markMercadoPagoAccountError("revoked").catch(() => {});
    }
    throw error;
  }
}

type LegacyPaymentScope = Awaited<ReturnType<typeof resolveLegacySchedulingScope>>["scope"];
type PaymentReservation = LegacyPaymentScope & { id: string; patientId: string; serviceId: string };
const verifiedAppointmentLinks = { tenantPatient: { isNot: null }, tenantService: { isNot: null } } as const;
const UNVERIFIED_CHECKOUT = "No se pudo verificar el turno de la instalación original.";

async function lockPaymentReservation(tx: Prisma.TransactionClient, reservation: PaymentReservation, awaitingOnly: boolean) {
  const { id, tenantId, agendaId, patientId, serviceId } = reservation;
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Appointment"
    WHERE id = ${id} AND "tenantId" = ${tenantId} AND "agendaId" = ${agendaId}
      AND "patientId" = ${patientId} AND "serviceId" = ${serviceId}
      AND (NOT ${awaitingOnly} OR status = 'AWAITING_PAYMENT')
    FOR NO KEY UPDATE`;
  // With the appointment locked, composite FKs protect the verified recipient and service.
  return rows.length > 0;
}

async function lockReservationPayments(tx: Prisma.TransactionClient, reservation: PaymentReservation) {
  const { id, tenantId, agendaId, patientId, serviceId } = reservation;
  await tx.$queryRaw`SELECT id FROM "Payment" WHERE "appointmentId" = ${id}
    AND EXISTS (SELECT 1 FROM "Appointment" WHERE id = "Payment"."appointmentId"
      AND "tenantId" = ${tenantId} AND "agendaId" = ${agendaId}
      AND "patientId" = ${patientId} AND "serviceId" = ${serviceId})
    ORDER BY id FOR UPDATE`;
}

export async function createDepositCheckout(
  appointmentId: string,
): Promise<{ checkoutUrl: string; paymentId: string; amount: number }> {
  const { scope } = await resolveLegacySchedulingScope();
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId, ...scope, ...verifiedAppointmentLinks },
    include: {
      tenantService: true,
      tenantPatient: { select: { id: true } },
      agenda: { select: { professional: { select: { currency: true } } } },
    },
  });
  if (!appointment?.tenantPatient || !appointment.tenantService || !appointment.agenda) throw new Error(UNVERIFIED_CHECKOUT);
  if (appointment.status !== "AWAITING_PAYMENT") throw new Error("El turno no está esperando una seña.");

  const { tenantService: service, agenda: { professional: { currency } } } = appointment;
  const reservation = { id: appointmentId, ...scope, patientId: appointment.patientId, serviceId: appointment.serviceId };
  const ownedReservation = { ...reservation, ...verifiedAppointmentLinks };
  const awaitingReservation = { ...ownedReservation, status: "AWAITING_PAYMENT" } as const;
  try {
    const returnUrl = process.env.MERCADOPAGO_RETURN_URL?.trim();
    if (!returnUrl) throw new Error("Falta MERCADOPAGO_RETURN_URL. Configurá una URL pública de retorno para Mercado Pago.");
    const creds = await getMercadoPagoCredentials({ kind: "current" });
    if (!creds) throw new MercadoPagoUnavailableError("No hay cuenta de Mercado Pago usable");
    if (!service.requiresDeposit || !service.depositKind || service.depositValue == null) {
      throw new Error("El servicio no tiene una seña configurada.");
    }

    const amount = computeDepositAmount(
      Number(service.price),
      service.depositKind,
      Number(service.depositValue),
    );
    if (amount <= 0) throw new Error("El monto de la seña debe ser mayor a cero.");

    const payment = await prisma.$transaction(async (tx) => {
      if (!await lockPaymentReservation(tx, reservation, true)) throw new Error(UNVERIFIED_CHECKOUT);
      return tx.payment.create({
        data: { appointmentId, kind: "DEPOSIT", status: "PENDING", amount, mercadopagoUserId: creds.sellerUserId },
      });
    });
    // Do not hold DB locks during the provider request. Recheck before saving or returning the link.
    const preference = await withRevocationGuard(creds, () => new Preference(mercadoPagoClient(creds.accessToken)).create({
      body: {
        items: [{ id: service.id, title: service.name, quantity: 1, unit_price: amount, currency_id: currency }],
        external_reference: payment.id,
        notification_url: process.env.MERCADOPAGO_NOTIFICATION_URL || undefined,
        expires: true,
        expiration_date_to: new Date(appointment.createdAt.getTime() + 15 * 60_000).toISOString(),
        back_urls: {
          success: returnUrl,
          pending: returnUrl,
          failure: returnUrl,
        },
        auto_return: "approved",
      },
    }));
    const checkoutUrl = preference.init_point;
    if (!preference.id || !checkoutUrl) throw new Error("Mercado Pago no devolvió un link de pago.");

    await prisma.$transaction(async (tx) => {
      await lockReservationPayments(tx, reservation);
      if (!await lockPaymentReservation(tx, reservation, true)) throw new Error(UNVERIFIED_CHECKOUT);
      await tx.payment.update({
        where: { id: payment.id, appointmentId, status: "PENDING", appointment: awaitingReservation },
        data: { preferenceId: preference.id, checkoutUrl },
      });
    });
    return { checkoutUrl, paymentId: payment.id, amount };
  } catch (error) {
    // Release only this reservation, atomically with its pending payments. Use the
    // same lock order as reconciliation/expiry so a concurrent approval wins safely.
    await prisma.$transaction(async (tx) => {
      await lockReservationPayments(tx, reservation);
      if (!await lockPaymentReservation(tx, reservation, true)) return;
      const cancelled = await tx.appointment.updateMany({
        where: awaitingReservation,
        data: { status: "CANCELLED", cancelledBy: "PROFESSIONAL", cancelReason: DEPOSIT_AUTO_CANCEL_REASONS.checkoutFailed },
      });
      if (cancelled.count > 0) {
        await tx.payment.updateMany({ where: { appointmentId, status: "PENDING", appointment: ownedReservation }, data: { status: "CANCELLED" } });
      }
    });
    throw error;
  }
}

export async function handleMercadoPagoWebhook(
  query: Record<string, string | string[] | undefined>,
): Promise<void> {
  const type = typeof query.type === "string" ? query.type : undefined;
  const rawId = type === "payment" ? query["data.id"] : undefined;
  const paymentId = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!paymentId) return;

  await syncMercadoPagoPayment(paymentId);
}

export async function syncMercadoPagoPayment(
  paymentId: string,
  expectedInternalId?: string,
  credentials?: MercadoPagoCredentials,
): Promise<void> {
  const { scope, professional: pro } = await resolveLegacySchedulingScope();
  const creds = credentials ?? (await getMercadoPagoCredentials({ kind: "current" }));
  if (!creds) throw new MercadoPagoUnavailableError("No hay cuenta de Mercado Pago usable");
  const mpPayment = await withRevocationGuard(creds, () =>
    new MercadoPagoPayment(mercadoPagoClient(creds.accessToken)).get({ id: paymentId }),
  );
  const internalId = mpPayment.external_reference;
  if (!internalId || (expectedInternalId && internalId !== expectedInternalId)) return;
  await prisma.$transaction(async (tx) => {
    // Serialize webhook and polling. Lock the payment before locking its appointment.
    const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Payment" WHERE id = ${internalId}
      AND provider = 'mercadopago' AND EXISTS (SELECT 1 FROM "Appointment" WHERE id = "Payment"."appointmentId"
        AND "tenantId" = ${scope.tenantId} AND "agendaId" = ${scope.agendaId}) FOR UPDATE`;
    if (!locked.length) return;
    const existing = await tx.payment.findUnique({
      where: { id: internalId, provider: "mercadopago", appointment: { ...scope, ...verifiedAppointmentLinks } },
      include: { appointment: { include: { tenantPatient: true, tenantService: true } } },
    });
    const appointment = existing?.appointment;
    if (!existing || !appointment?.tenantPatient || !appointment.tenantService) return;
    if (existing.mercadopagoUserId && existing.mercadopagoUserId !== creds.sellerUserId) return;
    const reservation = { ...scope, id: appointment.id, patientId: appointment.patientId, serviceId: appointment.serviceId };
    const ownedReservation = { ...reservation, ...verifiedAppointmentLinks };
    if (!await lockPaymentReservation(tx, reservation, false)) return;

    const status = mapMercadoPagoStatus(mpPayment.status);
    const wasApproved = existing.status === "APPROVED";
    if (wasApproved && status !== "APPROVED" && status !== "CANCELLED") return;
    const updated = await tx.payment.update({
      where: { id: existing.id, provider: "mercadopago", appointment: ownedReservation },
      data: {
        status,
        externalId: String(mpPayment.id ?? paymentId),
        ...(status === "APPROVED" ? {
          paidAt: existing.paidAt ?? (mpPayment.date_approved ? new Date(mpPayment.date_approved) : new Date()),
        } : {}),
      },
    });

    if (status !== "APPROVED" || wasApproved || updated.kind !== "DEPOSIT") return;
    if (existing.appointment.status !== "AWAITING_PAYMENT") return;

    const confirmed = await tx.appointment.updateMany({
      where: { ...ownedReservation, status: "AWAITING_PAYMENT" },
      // HU-014 (D5): la aprobación de la seña es la reserva en firme.
      data: { status: "CONFIRMED", needsGoogleSync: true, bookedAt: new Date() },
    });
    if (confirmed.count === 0) return;
    await tx.outboundMessage.createMany({ skipDuplicates: true, data: [{
      tenantId: scope.tenantId,
      toJid: appointment.tenantPatient.whatsappJid,
      kind: "CONFIRMATION",
      appointmentId: appointment.id,
      body: messages.bookingConfirmed({
        serviceName: appointment.tenantService.name,
        startsAt: appointment.startsAt,
        tz: pro.timezone,
      }),
    }] });
    if (pro.phoneJid) {
      await tx.outboundMessage.createMany({ skipDuplicates: true, data: [{
        tenantId: scope.tenantId,
        toJid: pro.phoneJid,
        kind: "PROFESSIONAL_ALERT",
        appointmentId: appointment.id,
        body: messages.professionalNewBookingAlert({
          patientName: appointment.tenantPatient.name,
          patientPhone: appointment.tenantPatient.phone,
          serviceName: appointment.tenantService.name,
          startsAt: appointment.startsAt,
          tz: pro.timezone,
          reason: appointment.reason,
        }),
      }] });
    }
  });
}

export async function reconcilePendingPayments(
  onError: (paymentId: string) => void = () => {},
  paymentIds?: string[],
): Promise<{ processed: number; failed: number; skipped: number }> {
  const { scope } = await resolveLegacySchedulingScope();
  const pending = await prisma.payment.findMany({
    where: {
      status: "PENDING",
      provider: "mercadopago",
      appointment: { ...scope, ...verifiedAppointmentLinks },
      ...(paymentIds ? { id: { in: paymentIds } } : {}),
    },
    orderBy: { createdAt: "asc" },
  });
  if (pending.length === 0) return { processed: 0, failed: 0, skipped: 0 };
  // HU-023: cada pago se consulta con la cuenta que lo creó (cache por mercadopagoUserId).
  const credsBySeller = new Map<string | null, MercadoPagoCredentials | null>();
  let processed = 0;
  let failed = 0;
  let skipped = 0;
  for (const payment of pending) {
    try {
      const seller = payment.mercadopagoUserId ?? null;
      if (!credsBySeller.has(seller)) {
        credsBySeller.set(seller, await getMercadoPagoCredentials({ kind: "payment", sellerUserId: seller }));
      }
      const creds = credsBySeller.get(seller) ?? null;
      if (!creds) {
        // Sin credencial no es un fallo: expireStalePendingPayments libera la reserva a los 15 min.
        skipped++;
        continue;
      }
      const api = new MercadoPagoPayment(mercadoPagoClient(creds.accessToken));
      if (payment.externalId) {
        await syncMercadoPagoPayment(payment.externalId, payment.id, creds);
      }
      if (payment.preferenceId) {
        let offset = 0;
        while (true) {
          const result = await withRevocationGuard(creds, () =>
            api.search({ options: { external_reference: payment.id, limit: 100, offset, sort: "date_created", criteria: "asc" } }),
          );
          for (const remote of result.results ?? []) {
            if (remote.id != null) await syncMercadoPagoPayment(String(remote.id), payment.id, creds);
          }
          offset += result.results?.length ?? 0;
          if (!result.results?.length || offset >= (result.paging?.total ?? offset)) break;
        }
      }
      processed++;
    } catch {
      failed++;
      onError(payment.id);
    }
  }
  return { processed, failed, skipped };
}

export async function expireStalePendingPayments(olderThanMinutes = 15): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanMinutes * 60_000);
  const { scope, professional: pro } = await resolveLegacySchedulingScope();
  const stale = { status: "AWAITING_PAYMENT", createdAt: { lt: cutoff } } as const;
  const appointments = await prisma.appointment.findMany({
    where: { ...scope, ...verifiedAppointmentLinks, ...stale },
    include: { tenantPatient: true, tenantService: true },
  });
  let expired = 0;
  for (const appointment of appointments) {
    const { id, patientId, serviceId, tenantPatient, tenantService } = appointment;
    if (!tenantPatient || !tenantService) continue;
    const reservation = { ...scope, id, patientId, serviceId };
    const ownedReservation = { ...reservation, ...verifiedAppointmentLinks };
    expired += await prisma.$transaction(async (tx) => {
      await lockReservationPayments(tx, reservation);
      const cancelled = await tx.appointment.updateMany({
        where: { ...ownedReservation, ...stale },
        data: { status: "CANCELLED", cancelledBy: "PROFESSIONAL", cancelReason: DEPOSIT_AUTO_CANCEL_REASONS.expired },
      });
      if (cancelled.count === 0) return 0;
      await tx.payment.updateMany({ where: { appointmentId: id, status: "PENDING", appointment: ownedReservation }, data: { status: "EXPIRED" } });
      await tx.outboundMessage.createMany({ skipDuplicates: true, data: [{
        tenantId: scope.tenantId,
        toJid: tenantPatient.whatsappJid,
        kind: "CANCELLATION",
        appointmentId: id,
        body: messages.depositExpired({ serviceName: tenantService.name, startsAt: appointment.startsAt, tz: pro.timezone }),
      }] });
      return 1;
    });
  }
  return expired;
}

export function listPendingPayments() {
  return prisma.payment.findMany({
    where: { status: "PENDING" },
    include: { appointment: { include: { patient: true, service: true } } },
    orderBy: { createdAt: "asc" },
  });
}

export function listApprovedPaymentsInRange(from: Date, to: Date) {
  return prisma.payment.findMany({
    where: { status: "APPROVED", paidAt: { gte: from, lte: to } },
    include: { appointment: { include: { patient: true, service: true } } },
    orderBy: { paidAt: "desc" },
  });
}

export function registerManualPayment(
  appointmentId: string,
  data: { kind: "DEPOSIT" | "FULL"; amount: number },
): Promise<DbPayment> {
  return prisma.payment.create({
    data: { appointmentId, kind: data.kind, amount: data.amount, provider: "manual", status: "APPROVED", paidAt: new Date() },
  });
}
