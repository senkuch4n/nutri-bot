import { computeDepositAmount, messages } from "@nutri-bot/core";
import { MercadoPagoConfig, Payment as MercadoPagoPayment, Preference } from "mercadopago";
import { prisma, type Payment as DbPayment } from "../index";
import { getProfessional } from "./availability";
import { enqueueMessage } from "./outbox";

function mercadoPagoClient(): MercadoPagoConfig {
  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!accessToken) throw new Error("Falta MERCADOPAGO_ACCESS_TOKEN.");
  return new MercadoPagoConfig({ accessToken });
}

export async function createDepositCheckout(
  appointmentId: string,
): Promise<{ checkoutUrl: string; paymentId: string; amount: number }> {
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
      notification_url: `${process.env.AUTH_URL}/api/webhooks/mercadopago`,
      back_urls: {
        success: process.env.AUTH_URL,
        pending: process.env.AUTH_URL,
        failure: process.env.AUTH_URL,
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
  const topic = typeof query.topic === "string" ? query.topic : undefined;
  const rawId = type === "payment" ? query["data.id"] : topic === "payment" ? query.id : undefined;
  const paymentId = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!paymentId) return;

  const mpPayment = await new MercadoPagoPayment(mercadoPagoClient()).get({ id: paymentId });
  const internalId = mpPayment.external_reference;
  if (!internalId) return;
  const existing = await prisma.payment.findUnique({
    where: { id: internalId },
    include: { appointment: { include: { patient: true, service: true } } },
  });
  if (!existing) return;

  const status = mpPayment.status === "approved"
    ? "APPROVED"
    : mpPayment.status === "rejected"
      ? "REJECTED"
      : mpPayment.status === "cancelled"
        ? "CANCELLED"
        : "PENDING";
  const wasApproved = existing.status === "APPROVED";
  const updated = await prisma.payment.update({
    where: { id: existing.id },
    data: {
      status,
      externalId: String(mpPayment.id ?? paymentId),
      ...(status === "APPROVED" ? { paidAt: existing.paidAt ?? new Date() } : {}),
    },
  });

  if (status !== "APPROVED" || wasApproved || updated.kind !== "DEPOSIT") return;
  if (existing.appointment.status !== "AWAITING_PAYMENT") return;

  const pro = await getProfessional();
  const appointment = await prisma.appointment.update({
    where: { id: existing.appointment.id },
    data: { status: "CONFIRMED", needsGoogleSync: true },
  });
  await enqueueMessage({
    toJid: existing.appointment.patient.whatsappJid,
    kind: "CONFIRMATION",
    appointmentId: appointment.id,
    body: messages.bookingConfirmed({
      serviceName: existing.appointment.service.name,
      startsAt: appointment.startsAt,
      tz: pro.timezone,
    }),
  });
  if (pro.phoneJid) {
    await enqueueMessage({
      toJid: pro.phoneJid,
      kind: "PROFESSIONAL_ALERT",
      body: messages.professionalNewBookingAlert({
        patientName: existing.appointment.patient.name,
        patientPhone: existing.appointment.patient.phone,
        serviceName: existing.appointment.service.name,
        startsAt: appointment.startsAt,
        tz: pro.timezone,
      }),
    });
  }
}

export async function expireStalePendingPayments(olderThanMinutes = 15): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanMinutes * 60_000);
  const appointments = await prisma.appointment.findMany({
    where: { status: "AWAITING_PAYMENT", createdAt: { lt: cutoff } },
    include: { patient: true, service: true },
  });
  if (appointments.length === 0) return 0;
  const pro = await getProfessional();
  for (const appointment of appointments) {
    await prisma.appointment.update({
      where: { id: appointment.id },
      data: { status: "CANCELLED", cancelledBy: "PROFESSIONAL", cancelReason: "Venció el tiempo para pagar la seña" },
    });
    await prisma.payment.updateMany({ where: { appointmentId: appointment.id, status: "PENDING" }, data: { status: "EXPIRED" } });
    await enqueueMessage({
      toJid: appointment.patient.whatsappJid,
      kind: "CANCELLATION",
      appointmentId: appointment.id,
      body: messages.depositExpired({ serviceName: appointment.service.name, startsAt: appointment.startsAt, tz: pro.timezone }),
    });
  }
  return appointments.length;
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
