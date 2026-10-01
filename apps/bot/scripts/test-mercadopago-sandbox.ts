import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import assert from "node:assert/strict";
import { prisma } from "@nutri-bot/db";
import {
  createDepositCheckout,
  reconcilePendingPayments,
  syncMercadoPagoPayment,
} from "@nutri-bot/db/domain";

// Run with the bot stopped: this script never imports Baileys or consumes outbox.
const input = createInterface({ input: stdin, output: stdout });
const abort = new AbortController();
const interrupt = () => abort.abort();
input.on("SIGINT", interrupt);
process.on("SIGINT", interrupt);
process.on("SIGTERM", interrupt);
const question = (prompt: string) =>
  input.question(prompt, { signal: abort.signal });
let patientId: string | undefined;
let serviceId: string | undefined;
let appointmentId: string | undefined;
try {
  assert(
    process.env.MERCADOPAGO_ACCESS_TOKEN,
    "MERCADOPAGO_ACCESS_TOKEN is required.",
  );
  assert.equal(
    process.env.MERCADOPAGO_SANDBOX,
    "true",
    "MERCADOPAGO_SANDBOX=true is required to run this sandbox test.",
  );
  const patient = await prisma.patient.create({
    data: {
      name: "Mercado Pago sandbox",
      phone: "sandbox",
      whatsappJid: `sandbox-${randomUUID()}@invalid`,
    },
  });
  patientId = patient.id;
  const service = await prisma.service.create({
    data: {
      name: "Mercado Pago sandbox",
      price: 10000,
      durationMin: 30,
      requiresDeposit: true,
      depositKind: "FIXED",
      depositValue: 10000,
      active: false,
    },
  });
  serviceId = service.id;
  const startsAt = new Date(Date.now() + 7 * 24 * 60 * 60_000);
  const appointment = await prisma.appointment.create({
    data: {
      patientId,
      serviceId,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 30 * 60_000),
      status: "AWAITING_PAYMENT",
      createdBy: "PATIENT",
      priceSnapshot: 10000,
      needsGoogleSync: false,
    },
  });
  appointmentId = appointment.id;
  const checkout = await createDepositCheckout(appointmentId);
  console.log(
    "Open this checkout using a test buyer and test card:",
    checkout.checkoutUrl,
  );
  console.log("Fixture payment id:", checkout.paymentId);
  await question(
    "Complete the sandbox payment, then press Enter to reconcile: ",
  );
  const result = await reconcilePendingPayments(
    () => console.error("Sandbox reconciliation failed."),
    [checkout.paymentId],
  );
  assert.equal(result.failed, 0);
  const payment = await prisma.payment.findUniqueOrThrow({
    where: { id: checkout.paymentId },
  });
  assert.equal(
    payment.status,
    "APPROVED",
    "Payment is not approved yet. Check the sandbox checkout.",
  );
  assert(payment.externalId);
  const confirmed = await prisma.appointment.findUniqueOrThrow({
    where: { id: appointmentId },
  });
  assert.equal(confirmed.status, "CONFIRMED");
  assert.equal(confirmed.needsGoogleSync, true);
  const before = await prisma.outboundMessage.findMany({
    where: { appointmentId },
  });
  assert.equal(
    before.filter((message) => message.kind === "CONFIRMATION").length,
    1,
  );
  await syncMercadoPagoPayment(payment.externalId, checkout.paymentId);
  const after = await prisma.outboundMessage.findMany({
    where: { appointmentId },
  });
  assert.equal(after.length, before.length, "Duplicate messages detected.");
  console.log(
    "PASS: approved payment, confirmed appointment and no duplicate messages. Nothing sent to WhatsApp.",
  );
} catch (error) {
  console.error("Sandbox test failed:", error);
  console.error("Fixture cleanup follows.");
  process.exitCode = 1;
} finally {
  input.close();
  process.off("SIGINT", interrupt);
  process.off("SIGTERM", interrupt);
  // Only ids created by this invocation are removed, including any webhook messages.
  if (appointmentId) {
    await prisma.$transaction([
      prisma.outboundMessage.deleteMany({ where: { appointmentId } }),
      prisma.payment.deleteMany({ where: { appointmentId } }),
      prisma.appointment.delete({ where: { id: appointmentId } }),
    ]);
  }
  if (serviceId) await prisma.service.delete({ where: { id: serviceId } });
  if (patientId) await prisma.patient.delete({ where: { id: patientId } });
  await prisma.$disconnect();
}
