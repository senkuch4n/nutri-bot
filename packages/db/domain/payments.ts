import { computeDepositAmount, mapMercadoPagoStatus, messages } from "@nutri-bot/core";
import { MercadoPagoConfig, Payment as MercadoPagoPayment, Preference } from "mercadopago";
import { prisma, type Payment as DbPayment } from "../index";
import { getProfessional } from "./availability";

function mercadoPagoClient(): MercadoPagoConfig {
  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!accessToken) throw new Error("Falta MERCADOPAGO_ACCESS_TOKEN.");
  return new MercadoPagoConfig({ accessToken, options: { timeout: 10_000 } });
}

export async function createDepositCheckout(
  appointmentId: string,
): Promise<{ checkoutUrl: string; paymentId: string; amount: number }> {
  const returnUrl = process.env.MERCADOPAGO_RETURN_URL?.trim();
  if (!returnUrl) throw new Error("Falta MERCADOPAGO_RETURN_URL. Configurá una URL pública de retorno para Mercado Pago.");

  const [appointment, pro] = await Promise.all([
    prisma.appointment.findUniqueOrThrow({
      where: { id: appointmentId },
      include: { service: true, patient: true },
    }),
    getProfessional(),
  ]);
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
    data: { appointmentId, kind: "DEPOSIT", status: "PENDING", amount },
  });
  const preference = await new Preference(mercadoPagoClient()).create({
    body: {
      items: [{ id: appointment.service.id, title: appointment.service.name, quantity: 1, unit_price: amount, currency_id: pro.currency }],
      external_reference: payment.id,
      notification_url: process.env.MERCADOPAGO_NOTIFICATION_URL || undefined,
      back_urls: {
        success: returnUrl,
        pending: returnUrl,
        failure: returnUrl,
      },
      auto_return: "approved",
    },
  });
  const checkoutUrl = preference.init_point;
  if (!preference.id || !checkoutUrl) throw new Error("Mercado Pago no devolvió un link de pago.");

  await prisma.payment.update({
    where: { id: payment.id },
    data: { preferenceId: preference.id, checkoutUrl },
  });
  return { checkoutUrl, paymentId: payment.id, amount };
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

export async function syncMercadoPagoPayment(paymentId: string, expectedInternalId?: string): Promise<void> {
  const mpPayment = await new MercadoPagoPayment(mercadoPagoClient()).get({ id: paymentId });
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

    const pro = await tx.professional.findUniqueOrThrow({ where: { id: 1 } });
    const appointment = existing.appointment;
    const confirmed = await tx.appointment.updateMany({
      where: { id: appointment.id, status: "AWAITING_PAYMENT" },
      data: { status: "CONFIRMED", needsGoogleSync: true },
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
): Promise<{ processed: number; failed: number }> {
  const pending = await prisma.payment.findMany({
    where: { status: "PENDING", provider: "mercadopago", ...(paymentIds ? { id: { in: paymentIds } } : {}) },
    orderBy: { createdAt: "asc" },
  });
  if (pending.length === 0) return { processed: 0, failed: 0 };
  const api = new MercadoPagoPayment(mercadoPagoClient());
  let processed = 0;
  let failed = 0;
  for (const payment of pending) {
    try {
      if (payment.externalId) {
        await syncMercadoPagoPayment(payment.externalId, payment.id);
      }
      if (payment.preferenceId) {
        let offset = 0;
        while (true) {
          const result = await api.search({ options: { external_reference: payment.id, limit: 100, offset, sort: "date_created", criteria: "asc" } });
          for (const remote of result.results ?? []) {
            if (remote.id != null) await syncMercadoPagoPayment(String(remote.id), payment.id);
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
  return { processed, failed };
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
        data: { status: "CANCELLED", cancelledBy: "PROFESSIONAL", cancelReason: "Venció el tiempo para pagar la seña" },
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
