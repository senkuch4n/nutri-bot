/**
 * Simula, sin WhatsApp real, el flujo completo de:
 *  - Épica 8: aviso de confirmación de turno 3 días antes (sí / no).
 *  - Épica 14: recomendaciones automáticas antes de un estudio.
 *
 * Crea datos de prueba propios (paciente/servicio/turnos con jid de test),
 * corre los crons de encolado y feedea las respuestas a handleIncoming como
 * si fueran mensajes entrantes reales, y al final borra todo lo que creó.
 *
 * Los crons se corren acotados al paciente de prueba (`scope.patientIds`): nunca encolan
 * mensajes para turnos de pacientes reales que caigan en la misma ventana.
 *
 * Uso: npm run test:confirm-flow --workspace apps/bot
 */
import assert from "node:assert/strict";
import { prisma } from "@nutri-bot/db";
import { enqueueAttendanceConfirmations, enqueuePrepInstructions } from "@nutri-bot/db/domain";
import { handleIncoming } from "../src/conversation";

const TEST_JID = "5490000000001@s.whatsapp.net";
const HOUR = 3_600_000;

async function cleanup(): Promise<void> {
  const patient = await prisma.patient.findUnique({ where: { whatsappJid: TEST_JID } });
  if (patient) {
    await prisma.outboundMessage.deleteMany({
      where: { appointment: { patientId: patient.id } },
    });
    await prisma.appointment.deleteMany({ where: { patientId: patient.id } });
    await prisma.conversationState.deleteMany({ where: { patientJid: TEST_JID } });
    await prisma.patient.delete({ where: { id: patient.id } });
  }
  await prisma.service.deleteMany({ where: { name: "Antropometría (TEST)" } });
}

async function main() {
  console.log("Limpiando datos de prueba de una corrida anterior (si quedaron)…");
  await cleanup();

  const service = await prisma.service.create({
    data: {
      name: "Antropometría (TEST)",
      durationMin: 30,
      price: 10000,
      prepInstructions: "Vení en ayunas de 4hs y con ropa liviana.",
      prepLeadHours: 24,
    },
  });
  const patient = await prisma.patient.create({
    data: { whatsappJid: TEST_JID, phone: "5490000000001", name: "Paciente de Prueba" },
  });

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
  const startsAtA = new Date(Date.now() + 72 * HOUR + 10 * 60_000);
  const apptA = await prisma.appointment.create({
    data: {
      patientId: patient.id,
      serviceId: service.id,
      startsAt: startsAtA,
      endsAt: new Date(startsAtA.getTime() + 30 * 60_000),
      status: "CONFIRMED",
      createdBy: "PATIENT",
      priceSnapshot: service.price,
    },
  });

  await step("cron enqueueAttendanceConfirmations encola el pedido de confirmación", async () => {
    const count = await enqueueAttendanceConfirmations(30, { patientIds: [patient.id] });
    assert.ok(count >= 1, "esperaba al menos 1 turno encolado");
    const state = await prisma.conversationState.findUnique({ where: { patientJid: TEST_JID } });
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
    console.log(`   respuesta del bot: "${replies[0].replace(/\n/g, " ")}"`);
    const updated = await prisma.appointment.findUniqueOrThrow({ where: { id: apptA.id } });
    assert.equal(updated.confirmationResponse, true);
    assert.equal(updated.status, "CONFIRMED");
  });

  // --- Escenario B: pide confirmación y el paciente dice que NO va a poder ---
  const startsAtB = new Date(Date.now() + 72 * HOUR + 20 * 60_000);
  const apptB = await prisma.appointment.create({
    data: {
      patientId: patient.id,
      serviceId: service.id,
      startsAt: startsAtB,
      endsAt: new Date(startsAtB.getTime() + 30 * 60_000),
      status: "CONFIRMED",
      createdBy: "PATIENT",
      priceSnapshot: service.price,
    },
  });

  await step("cron enqueueAttendanceConfirmations encola el segundo turno (no duplica el primero)", async () => {
    const count = await enqueueAttendanceConfirmations(30, { patientIds: [patient.id] });
    assert.equal(count, 1, "no debería re-encolar el turno A, que ya tiene su mensaje");
    const state = await prisma.conversationState.findUnique({ where: { patientJid: TEST_JID } });
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

  // --- Escenario C: recomendaciones automáticas antes del estudio ---
  const startsAtC = new Date(Date.now() + service.prepLeadHours! * HOUR + 5 * 60_000);
  const apptC = await prisma.appointment.create({
    data: {
      patientId: patient.id,
      serviceId: service.id,
      startsAt: startsAtC,
      endsAt: new Date(startsAtC.getTime() + 30 * 60_000),
      status: "CONFIRMED",
      createdBy: "PATIENT",
      priceSnapshot: service.price,
    },
  });

  await step("cron enqueuePrepInstructions manda las recomendaciones previas al estudio", async () => {
    const count = await enqueuePrepInstructions(20, { patientIds: [patient.id] });
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
