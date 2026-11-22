/**
 * Simula, sin WhatsApp real, el flujo completo de:
 *  - Épica 8: aviso de confirmación de turno 3 días antes (sí / no). Desde la HU-014 es "el
 *    recordatorio que pide confirmar" del servicio: el de prueba lo configura en 72 h (horas, para
 *    que no lo afecte el corrimiento nocturno de los recordatorios en días).
 *  - Épica 14: recomendaciones automáticas antes de un estudio.
 *
 * Crea datos de prueba propios (paciente/servicio/turnos con jid de test),
 * corre los crons de encolado y feedea las respuestas a handleIncoming como
 * si fueran mensajes entrantes reales, y al final borra todo lo que creó.
 *
 * Los crons se corren acotados al paciente de prueba (`scope.patientIds`): nunca encolan
 * mensajes para turnos de pacientes reales que caigan en la misma ventana.
 *
 * Aborta si el bot figura conectado (salvo ALLOW_BOT_RUNNING=1, para un BotStatus colgado).
 *
 * Uso: npm run test:confirm-flow --workspace apps/bot
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma, type Prisma } from "@nutri-bot/db";
import { enqueuePrepInstructions, enqueueServiceReminders } from "@nutri-bot/db/domain";
import { findLegacyConversationState } from "@nutri-bot/db/domain/conversationState";
import { resolveLegacySchedulingScope } from "@nutri-bot/db/domain/legacySchedulingScope";
import { handleIncoming } from "../src/conversation";
import { LEGACY_TENANT_ID } from "@nutri-bot/db/domain/tenantAccess";

// HU-025b-1: la simulación opera el consultorio original de forma explícita.
const T = { tenantId: LEGACY_TENANT_ID };

const TEST_JID = `confirm-fixture-${randomUUID()}@invalid`;
const HOUR = 3_600_000;
const appointmentIds: string[] = [];
let patientFixture: { id: string; whatsappJid: string; tenantId: string } | undefined;
let serviceId: string | undefined;

async function cleanup(): Promise<void> {
  if (appointmentIds.length > 0) {
    const messages = await prisma.outboundMessage.findMany({
      where: { appointmentId: { in: appointmentIds } },
      select: { id: true },
    });
    await prisma.outboundMessage.deleteMany({ where: { id: { in: messages.map(({ id }) => id) } } });
    await prisma.appointment.deleteMany({ where: { id: { in: appointmentIds } } });
  }
  if (patientFixture) {
    await prisma.conversationState.deleteMany({ where: { tenantId: patientFixture.tenantId, patientJid: patientFixture.whatsappJid } });
    await prisma.patient.delete({ where: { id: patientFixture.id } });
  }
  if (serviceId) await prisma.service.delete({ where: { id: serviceId } });
}

async function main() {
  const bot = await prisma.botStatus.findUnique({ where: { id: 1 } });
  if (bot?.connected && process.env.ALLOW_BOT_RUNNING !== "1") {
    throw new Error("Pará el bot antes de correr esta prueba (o ALLOW_BOT_RUNNING=1 si BotStatus quedó colgado)");
  }
  const { scope } = await resolveLegacySchedulingScope();
  // The current state key is global and first-contact state can exist without a patient.
  if (await prisma.patient.findFirst({ where: { whatsappJid: TEST_JID }, select: { id: true } }) ||
      await findLegacyConversationState(TEST_JID)) {
    throw new Error("El JID sintético ya existe. No se crearon datos de prueba.");
  }
  const patient = await prisma.patient.create({
    data: { tenantId: scope.tenantId, whatsappJid: TEST_JID, phone: TEST_JID.split("@")[0]!, name: "Paciente de Prueba" },
  });
  patientFixture = { ...patient, tenantId: scope.tenantId };

  const service = await prisma.service.create({
    data: {
      tenantId: scope.tenantId,
      name: "Antropometría (TEST)",
      durationMin: 30,
      price: 10000,
      prepInstructions: "Vení en ayunas de 4hs y con ropa liviana.",
      prepLeadHours: 24,
      // HU-014: el pedido de confirmación es el recordatorio que "pide confirmar".
      reminders: [{ amount: 72, unit: "HOURS", asksConfirmation: true }],
    },
  });
  serviceId = service.id;

  const createAppointment = async (data: Omit<Prisma.AppointmentUncheckedCreateInput, keyof typeof scope>) => {
    const appointment = await prisma.appointment.create({ data: { ...data, ...scope } });
    appointmentIds.push(appointment.id);
    return appointment;
  };

  let ok = 0;
  const step = async (label: string, fn: () => Promise<void>) => {
    try {
      await fn();
      console.log(`✅ ${label}`);
      ok++;
    } catch (err) {
      console.log(`❌ ${label}`);
      throw err;
    }
  };

  // --- Escenario A: pide confirmación y el paciente dice que SÍ va a venir ---
  const startsAtA = new Date(Date.now() + 72 * HOUR - 2 * 60_000);
  const apptA = await createAppointment({
    patientId: patient.id,
    serviceId: service.id,
    startsAt: startsAtA,
    endsAt: new Date(startsAtA.getTime() + 30 * 60_000),
    status: "CONFIRMED",
    bookedAt: new Date(Date.now() - 24 * HOUR),
    createdBy: "PATIENT",
    priceSnapshot: service.price,
  });

  await step("cron enqueueServiceReminders encola el pedido de confirmación", async () => {
    const res = await enqueueServiceReminders(T, { scope: { patientIds: [patient.id] } });
    assert.ok(res.confirmations >= 1, "esperaba al menos 1 turno encolado");
    const state = await findLegacyConversationState(TEST_JID);
    assert.equal(state?.step, "CONFIRM_ATTENDANCE");
    assert.equal((state?.context as { apptId?: string } | null)?.apptId, apptA.id);
    const outbound = await prisma.outboundMessage.findFirst({
      where: { appointmentId: apptA.id, kind: "CONFIRMATION_REQUEST" },
    });
    assert.ok(outbound, "debería existir un OutboundMessage CONFIRMATION_REQUEST");
    console.log(`   mensaje al paciente: "${outbound!.body.replace(/\n/g, " ")}"`);
  });

  await step('el paciente responde "sí" y el turno queda confirmado', async () => {
    const replies: string[] = [];
    await handleIncoming(TEST_JID, "sí", async (text) => void replies.push(text));
    assert.ok(replies.length >= 1, "el bot debería responder algo");
    console.log(`   respuesta del bot: "${replies[0]!.replace(/\n/g, " ")}"`);
    const updated = await prisma.appointment.findUniqueOrThrow({ where: { id: apptA.id } });
    assert.equal(updated.confirmationResponse, true);
    assert.equal(updated.status, "CONFIRMED");
  });

  // --- Escenario B: pide confirmación y el paciente dice que NO va a poder ---
  const startsAtB = new Date(Date.now() + 72 * HOUR - 1.5 * 60_000);
  const apptB = await createAppointment({
    patientId: patient.id,
    serviceId: service.id,
    startsAt: startsAtB,
    endsAt: new Date(startsAtB.getTime() + 30 * 60_000),
    status: "CONFIRMED",
    bookedAt: new Date(Date.now() - 24 * HOUR),
    createdBy: "PATIENT",
    priceSnapshot: service.price,
  });

  await step("cron enqueueServiceReminders encola el segundo turno (no duplica el primero)", async () => {
    const res = await enqueueServiceReminders(T, { scope: { patientIds: [patient.id] } });
    assert.equal(res.confirmations, 1, "no debería re-encolar el turno A, que ya tiene su mensaje");
    const state = await findLegacyConversationState(TEST_JID);
    assert.equal((state?.context as { apptId?: string } | null)?.apptId, apptB.id);
  });

  await step('el paciente responde "no" y el turno se cancela solo', async () => {
    const replies: string[] = [];
    await handleIncoming(TEST_JID, "no", async (text) => void replies.push(text));
    console.log(`   respuesta del bot: "${replies[0]?.replace(/\n/g, " ")}"`);
    const updated = await prisma.appointment.findUniqueOrThrow({ where: { id: apptB.id } });
    assert.equal(updated.confirmationResponse, false);
    assert.equal(updated.status, "CANCELLED");
    assert.equal(updated.cancelledBy, "PATIENT");
  });

  // --- Escenario D: el paciente responde horas después (la sesión de 20 min ya venció) ---
  const startsAtD = new Date(Date.now() + 72 * HOUR - 1 * 60_000);
  const apptD = await createAppointment({
    patientId: patient.id,
    serviceId: service.id,
    startsAt: startsAtD,
    endsAt: new Date(startsAtD.getTime() + 30 * 60_000),
    status: "CONFIRMED",
    bookedAt: new Date(Date.now() - 24 * HOUR),
    createdBy: "PATIENT",
    priceSnapshot: service.price,
  });
  await enqueueServiceReminders(T, { scope: { patientIds: [patient.id] } });
  const later = new Date(Date.now() + 2 * HOUR);

  await step("horas después, un mensaje común no dispara nada (silencio) y el turno sigue igual", async () => {
    const replies: string[] = [];
    await handleIncoming(TEST_JID, "hola, te quería comentar algo", async (t) => void replies.push(t), { now: later });
    assert.deepEqual(replies, []);
    const a = await prisma.appointment.findUniqueOrThrow({ where: { id: apptD.id } });
    assert.equal(a.confirmationResponse, null);
    assert.equal(a.status, "CONFIRMED");
  });

  await step('horas después, "no sé si llego" NO cancela el turno', async () => {
    const replies: string[] = [];
    await handleIncoming(TEST_JID, "no sé si llego", async (t) => void replies.push(t), { now: later });
    assert.deepEqual(replies, []);
    const a = await prisma.appointment.findUniqueOrThrow({ where: { id: apptD.id } });
    assert.equal(a.status, "CONFIRMED");
    assert.equal(a.confirmationResponse, null);
  });

  await step('horas después, "sí" confirma la asistencia', async () => {
    const replies: string[] = [];
    await handleIncoming(TEST_JID, "Sí!", async (t) => void replies.push(t), { now: later });
    assert.ok(replies.length >= 1, "el bot debería agradecer la confirmación");
    console.log(`   respuesta del bot: "${replies[0]!.replace(/\n/g, " ")}"`);
    const a = await prisma.appointment.findUniqueOrThrow({ where: { id: apptD.id } });
    assert.equal(a.confirmationResponse, true);
  });

  // --- Escenario C: recomendaciones automáticas antes del estudio ---
  const startsAtC = new Date(Date.now() + service.prepLeadHours! * HOUR + 5 * 60_000);
  const apptC = await createAppointment({
    patientId: patient.id,
    serviceId: service.id,
    startsAt: startsAtC,
    endsAt: new Date(startsAtC.getTime() + 30 * 60_000),
    status: "CONFIRMED",
    createdBy: "PATIENT",
    priceSnapshot: service.price,
  });

  await step("cron enqueuePrepInstructions manda las recomendaciones previas al estudio", async () => {
    const count = await enqueuePrepInstructions(T, 20, { patientIds: [patient.id] });
    assert.ok(count >= 1, "esperaba al menos 1 recomendación encolada");
    const outbound = await prisma.outboundMessage.findFirst({
      where: { appointmentId: apptC.id, kind: "PREP_INSTRUCTIONS" },
    });
    assert.ok(outbound, "debería existir un OutboundMessage PREP_INSTRUCTIONS");
    assert.ok(outbound!.body.includes(service.prepInstructions!));
    console.log(`   mensaje al paciente: "${outbound!.body.replace(/\n/g, " ")}"`);
  });

  console.log(`\n${ok}/${ok} escenarios OK.`);
}

main()
  .catch((err) => {
    console.error("\n🔥 Falló la simulación:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await cleanup();
    await prisma.$disconnect();
  });
