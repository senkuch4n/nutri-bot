import { classifyMercadoPagoFailure, computeDepositAmount, DEPOSIT_AUTO_CANCEL_REASONS, mapMercadoPagoStatus, messages } from "@nutri-bot/core";
import { MercadoPagoConfig, Payment as MercadoPagoPayment, Preference } from "mercadopago";
import { prisma, type Payment as DbPayment } from "../index";
import { getProfessional } from "./availability";
import { PROFESSIONAL_SELECT } from "./professionalSelect";
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

export async function createDepositCheckout(
  appointmentId: string,
): Promise<{ checkoutUrl: string; paymentId: string; amount: number }> {
  try {
    const returnUrl = process.env.MERCADOPAGO_RETURN_URL?.trim();
    if (!returnUrl) throw new Error("Falta MERCADOPAGO_RETURN_URL. Configurá una URL pública de retorno para Mercado Pago.");
    const creds = await getMercadoPagoCredentials({ kind: "current" });
    if (!creds) throw new MercadoPagoUnavailableError("No hay cuenta de Mercado Pago usable");
    const client = mercadoPagoClient(creds.accessToken);

    const [appointment, pro] = await Promise.all([
      prisma.appointment.findUniqueOrThrow({
        where: { id: appointmentId },
        include: { service: true, patient: true },
      }),
      getProfessional(),
    ]);
    if (appointment.status !== "AWAITING_PAYMENT") throw new Error("El turno no está esperando una seña.");
    if (!appointment.service.requiresDeposit || !appointment.service.depositKind || appointment.service.depositValue == null) {
      throw new Error("El servicio no tiene una seña configurada.");
    }

    const amount = computeDepositAmount(
      Number(appointment.service.price),
      appointment.service.depositKind,
      Number(appointment.service.depositValue),
    );
    if (amount <= 0) throw new Error("El monto de la seña debe ser mayor a cero.");

    const payment = await prisma.payment.create({
      data: { appointmentId, kind: "DEPOSIT", status: "PENDING", amount, mercadopagoUserId: creds.sellerUserId },
    });
    const preference = await withRevocationGuard(creds, () => new Preference(client).create({
      body: {
        items: [{ id: appointment.service.id, title: appointment.service.name, quantity: 1, unit_price: amount, currency_id: pro.currency }],
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

    await prisma.payment.update({
      where: { id: payment.id },
      data: { preferenceId: preference.id, checkoutUrl },
    });
    return { checkoutUrl, paymentId: payment.id, amount };
  } catch (error) {
    // Release only this reservation, atomically with its pending payments. Use the
    // same lock order as reconciliation/expiry so a concurrent approval wins safely.
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Payment" WHERE "appointmentId" = ${appointmentId} ORDER BY id FOR UPDATE`;
      const cancelled = await tx.appointment.updateMany({
        where: { id: appointmentId, status: "AWAITING_PAYMENT" },
        data: { status: "CANCELLED", cancelledBy: "PROFESSIONAL", cancelReason: DEPOSIT_AUTO_CANCEL_REASONS.checkoutFailed },
      });
      if (cancelled.count > 0) {
        await tx.payment.updateMany({ where: { appointmentId, status: "PENDING" }, data: { status: "CANCELLED" } });
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
  const creds = credentials ?? (await getMercadoPagoCredentials({ kind: "current" }));
  if (!creds) throw new MercadoPagoUnavailableError("No hay cuenta de Mercado Pago usable");
  const mpPayment = await withRevocationGuard(creds, () =>
    new MercadoPagoPayment(mercadoPagoClient(creds.accessToken)).get({ id: paymentId }),
  );
  const internalId = mpPayment.external_reference;
  if (!internalId || (expectedInternalId && internalId !== expectedInternalId)) return;
  await prisma.$transaction(async (tx) => {
    // Serialize webhook and polling for the same payment, including outbox writes.
    await tx.$queryRaw`SELECT id FROM "Payment" WHERE id = ${internalId} FOR UPDATE`;
    const existing = await tx.payment.findUnique({
      where: { id: internalId },
      include: { appointment: { include: { patient: true, service: true } } },
    });
    if (!existing || existing.provider !== "mercadopago") return;
    if (existing.mercadopagoUserId && existing.mercadopagoUserId !== creds.sellerUserId) return;

    const status = mapMercadoPagoStatus(mpPayment.status);
    const wasApproved = existing.status === "APPROVED";
    if (wasApproved && status !== "APPROVED" && status !== "CANCELLED") return;
    const updated = await tx.payment.update({
      where: { id: existing.id },
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

    const pro = await tx.professional.findUniqueOrThrow({ where: { id: 1 }, select: PROFESSIONAL_SELECT });
    const appointment = existing.appointment;
    const confirmed = await tx.appointment.updateMany({
      where: { id: appointment.id, status: "AWAITING_PAYMENT" },
      // HU-014 (D5): la aprobación de la seña es la reserva en firme.
      data: { status: "CONFIRMED", needsGoogleSync: true, bookedAt: new Date() },
    });
    if (confirmed.count === 0) return;
    await tx.outboundMessage.createMany({ skipDuplicates: true, data: [{
      toJid: appointment.patient.whatsappJid,
      kind: "CONFIRMATION",
      appointmentId: appointment.id,
      body: messages.bookingConfirmed({
        serviceName: appointment.service.name,
        startsAt: appointment.startsAt,
        tz: pro.timezone,
      }),
    }] });
    if (pro.phoneJid) {
      await tx.outboundMessage.createMany({ skipDuplicates: true, data: [{
        toJid: pro.phoneJid,
        kind: "PROFESSIONAL_ALERT",
        appointmentId: appointment.id,
        body: messages.professionalNewBookingAlert({
          patientName: appointment.patient.name,
          patientPhone: appointment.patient.phone,
          serviceName: appointment.service.name,
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
  const pending = await prisma.payment.findMany({
    where: { status: "PENDING", provider: "mercadopago", ...(paymentIds ? { id: { in: paymentIds } } : {}) },
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
  const appointments = await prisma.appointment.findMany({
    where: { status: "AWAITING_PAYMENT", createdAt: { lt: cutoff } },
    include: { patient: true, service: true },
  });
  if (appointments.length === 0) return 0;
  const pro = await getProfessional();
  let expired = 0;
  for (const appointment of appointments) {
    expired += await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Payment" WHERE "appointmentId" = ${appointment.id} ORDER BY id FOR UPDATE`;
      const cancelled = await tx.appointment.updateMany({
        where: { id: appointment.id, status: "AWAITING_PAYMENT" },
        data: { status: "CANCELLED", cancelledBy: "PROFESSIONAL", cancelReason: DEPOSIT_AUTO_CANCEL_REASONS.expired },
      });
      if (cancelled.count === 0) return 0;
      await tx.payment.updateMany({ where: { appointmentId: appointment.id, status: "PENDING" }, data: { status: "EXPIRED" } });
      await tx.outboundMessage.createMany({ skipDuplicates: true, data: [{
        toJid: appointment.patient.whatsappJid,
        kind: "CANCELLATION",
        appointmentId: appointment.id,
        body: messages.depositExpired({ serviceName: appointment.service.name, startsAt: appointment.startsAt, tz: pro.timezone }),
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
