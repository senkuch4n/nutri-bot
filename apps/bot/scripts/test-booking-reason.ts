/**
 * HU-013: simula, sin WhatsApp real, el paso del motivo de consulta al reservar por el bot,
 * la alerta de turno nuevo con el motivo, el turno con seña, la edición desde el panel (dominio),
 * la consulta clínica y la privacidad frente a la IA.
 *
 * Reglas (SDD `Refactorizaciones/motivo-consulta-reserva.md`, 10.4):
 *  - Nunca manda WhatsApp: las respuestas al paciente se capturan con `send`; las alertas de turno
 *    nuevo van a un JID falso (ALERT_JID) vía `opts.alertJid` → `professionalAlertJid`. Nunca usa
 *    `Professional.phoneJid`. Cada fila de `OutboundMessage` se borra por id apenas se verifica.
 *  - Sin IA (claves borradas, `aiProvider: null`) y sin Mercado Pago (no llama al checkout: el
 *    servicio con seña está inactivo y se usa solo desde el dominio).
 *  - No modifica `Professional` ni ningún servicio, paciente o turno existente: crea sus propios
 *    pacientes y servicios "(TEST)" y borra SOLO por los ids que insertó. Sus turnos quedan con
 *    `needsGoogleSync: false` apenas se crean (por id), así nunca llegan a Google Calendar.
 *  - Aborta si el bot figura conectado (salvo ALLOW_BOT_RUNNING=1) o si está pausado.
 *
 * Uso: npm run test:booking-reason --workspace apps/bot
 */
delete process.env.API_KEY_IA_ANTHROPIC;
delete process.env.API_KEY_IA_DEEPSEEK;

import assert from "node:assert/strict";
import { prisma } from "@nutri-bot/db";
import {
  InvalidBookingReasonError,
  createAppointment,
  getAvailableSlotsForService,
  getProfessional,
  runBotAiTool,
  setAppointmentStatus,
  updateAppointmentReason,
} from "@nutri-bot/db/domain";
import { messages, reasonForAlert } from "@nutri-bot/core";
import { handleIncoming, handleIncomingMedia, type ConversationOptions } from "../src/conversation";
import { listActiveServices } from "../src/booking";

const ALERT_JID = "5490000000099@s.whatsapp.net";
const JID_ANA = "5490000000031@s.whatsapp.net";
const JID_BRUNO = "5490000000032@s.whatsapp.net";
const TEST_JIDS = [JID_ANA, JID_BRUNO];
const S_CON_NAME = "HU013 Con motivo (TEST)";
const S_SIN_NAME = "HU013 Sin motivo (TEST)";
const S_SENA_NAME = "HU013 Con seña (TEST)";
const SERVICE_NAMES = [S_CON_NAME, S_SIN_NAME, S_SENA_NAME];
const MIN = 60_000;
const NO_BOOKING = "Sin problema, no reservé nada. Escribí *menú* si querés hacer otra cosa.";

const patientIds: string[] = [];
const serviceIds: string[] = [];
const appointmentIds = new Set<string>();
const consultationIds = new Set<string>();
const outboundIds = new Set<string>();
const startedAt = new Date();

/** Alertas a ALERT_JID todavía no contadas. Las borra por id. */
async function takeNewAlerts(): Promise<{ id: string; body: string }[]> {
  const rows = await prisma.outboundMessage.findMany({
    where: { toJid: ALERT_JID, createdAt: { gte: startedAt } },
    select: { id: true, body: true },
  });
  const fresh = rows.filter((r) => !outboundIds.has(r.id));
  for (const r of fresh) outboundIds.add(r.id);
  if (fresh.length > 0) {
    await prisma.outboundMessage.deleteMany({ where: { id: { in: fresh.map((r) => r.id) } } });
  }
  return fresh.map((r) => ({ id: r.id, body: r.body ?? "" }));
}

/** Filas encoladas a los jids de prueba (no debería haber: el bot responde en vivo). Las borra por id. */
async function takePatientMessages(): Promise<number> {
  const rows = await prisma.outboundMessage.findMany({
    where: { toJid: { in: TEST_JIDS }, createdAt: { gte: startedAt } },
    select: { id: true },
  });
  const fresh = rows.filter((r) => !outboundIds.has(r.id));
  for (const r of fresh) outboundIds.add(r.id);
  if (fresh.length > 0) {
    await prisma.outboundMessage.deleteMany({ where: { id: { in: fresh.map((r) => r.id) } } });
  }
  return fresh.length;
}

/** Anota los turnos nuevos de los pacientes TEST y les apaga needsGoogleSync (por id). */
async function trackAppointments(): Promise<void> {
  const rows = await prisma.appointment.findMany({
    where: { patientId: { in: patientIds } },
    select: { id: true },
  });
  const nuevos = rows.map((r) => r.id).filter((id) => !appointmentIds.has(id));
  for (const id of nuevos) appointmentIds.add(id);
  if (nuevos.length > 0) {
    await prisma.appointment.updateMany({ where: { id: { in: nuevos } }, data: { needsGoogleSync: false } });
  }
}

async function stateOf(jid: string): Promise<{ step: string; ctx: Record<string, unknown> }> {
  const row = await prisma.conversationState.findUniqueOrThrow({ where: { patientJid: jid } });
  return { step: row.step, ctx: (row.context ?? {}) as Record<string, unknown> };
}

async function preCleanup(): Promise<void> {
  const existing = await prisma.patient.findMany({ where: { whatsappJid: { in: TEST_JIDS } } });
  for (const p of existing) {
    if (!p.name?.endsWith("(TEST)")) {
      throw new Error(`Existe un paciente real con el jid de prueba ${p.whatsappJid} (${p.name}). No borro nada.`);
    }
  }
  const oldPatientIds = existing.map((p) => p.id);
  const oldServices = await prisma.service.findMany({ where: { name: { in: SERVICE_NAMES } }, select: { id: true } });
  const oldServiceIds = oldServices.map((s) => s.id);
  if (oldServiceIds.length > 0) {
    const foreign = await prisma.appointment.count({
      where: { serviceId: { in: oldServiceIds }, patientId: { notIn: oldPatientIds } },
    });
    if (foreign > 0) {
      throw new Error("Un servicio de prueba HU013 tiene turnos de pacientes que no son (TEST). No borro nada.");
    }
  }
  if (oldPatientIds.length === 0 && oldServiceIds.length === 0) {
    await prisma.conversationState.deleteMany({ where: { patientJid: { in: TEST_JIDS } } });
    return;
  }
  console.log(`Limpiando restos de una corrida anterior (${oldPatientIds.length} paciente(s), ${oldServiceIds.length} servicio(s))…`);
  const oldAppts = await prisma.appointment.findMany({
    where: { patientId: { in: oldPatientIds } },
    select: { id: true },
  });
  const oldApptIds = oldAppts.map((a) => a.id);
  const oldOutbound = await prisma.outboundMessage.findMany({
    where: { OR: [{ appointmentId: { in: oldApptIds } }, { toJid: { in: [...TEST_JIDS, ALERT_JID] } }] },
    select: { id: true },
  });
  await prisma.outboundMessage.deleteMany({ where: { id: { in: oldOutbound.map((o) => o.id) } } });
  const oldCons = await prisma.consultation.findMany({ where: { appointmentId: { in: oldApptIds } }, select: { id: true } });
  await prisma.consultation.deleteMany({ where: { id: { in: oldCons.map((c) => c.id) } } });
  const oldPays = await prisma.payment.findMany({ where: { appointmentId: { in: oldApptIds } }, select: { id: true } });
  await prisma.payment.deleteMany({ where: { id: { in: oldPays.map((p) => p.id) } } });
  await prisma.appointment.deleteMany({ where: { id: { in: oldApptIds } } });
  await prisma.conversationState.deleteMany({ where: { patientJid: { in: TEST_JIDS } } });
  await prisma.service.deleteMany({ where: { id: { in: oldServiceIds } } });
  await prisma.patient.deleteMany({ where: { id: { in: oldPatientIds } } });
}

async function finalCleanup(): Promise<void> {
  if (patientIds.length > 0) await trackAppointments();
  const apptIds = [...appointmentIds];
  const safety = await prisma.outboundMessage.findMany({
    where: {
      OR: [
        { toJid: { in: [ALERT_JID, ...TEST_JIDS] }, createdAt: { gte: startedAt } },
        { appointmentId: { in: apptIds } },
      ],
    },
    select: { id: true },
  });
  await prisma.outboundMessage.deleteMany({ where: { id: { in: [...outboundIds, ...safety.map((r) => r.id)] } } });
  const cons = await prisma.consultation.findMany({ where: { appointmentId: { in: apptIds } }, select: { id: true } });
  await prisma.consultation.deleteMany({
    where: { id: { in: [...consultationIds, ...cons.map((c) => c.id)] } },
  });
  const pays = await prisma.payment.findMany({ where: { appointmentId: { in: apptIds } }, select: { id: true } });
  await prisma.payment.deleteMany({ where: { id: { in: pays.map((p) => p.id) } } });
  await prisma.appointment.deleteMany({ where: { id: { in: apptIds } } });
  await prisma.service.deleteMany({ where: { id: { in: serviceIds } } });
  // Solo si este script creó los pacientes (si abortó por un jid real, no toca su estado).
  if (patientIds.length > 0) {
    await prisma.conversationState.deleteMany({ where: { patientJid: { in: TEST_JIDS } } });
  }
  await prisma.patient.deleteMany({ where: { id: { in: patientIds } } });
}

async function main(): Promise<void> {
  const bot = await prisma.botStatus.findUnique({ where: { id: 1 } });
  if (bot?.connected && process.env.ALLOW_BOT_RUNNING !== "1") {
    throw new Error("Pará el bot antes de correr esta prueba (encola alertas de prueba)");
  }
  const pro = await getProfessional(); // solo lectura
  if (pro.botPaused) throw new Error("El bot está pausado en /ajustes: la prueba necesita que responda.");
  const tz = pro.timezone;

  await preCleanup();

  const ana = await prisma.patient.create({
    data: { whatsappJid: JID_ANA, phone: "5490000000031", name: "Ana (TEST)" },
  });
  patientIds.push(ana.id);
  const bruno = await prisma.patient.create({
    data: { whatsappJid: JID_BRUNO, phone: "5490000000032", name: "Bruno (TEST)" },
  });
  patientIds.push(bruno.id);

  const sCon = await prisma.service.create({
    data: { name: S_CON_NAME, durationMin: 30, price: 25000, active: true, asksReason: true },
  });
  serviceIds.push(sCon.id);
  const sSin = await prisma.service.create({
    data: { name: S_SIN_NAME, durationMin: 30, price: 20000, active: true, asksReason: false },
  });
  serviceIds.push(sSin.id);
  const sSena = await prisma.service.create({
    data: {
      name: S_SENA_NAME,
      durationMin: 30,
      price: 25000,
      active: false,
      requiresDeposit: true,
      depositKind: "FIXED",
      depositValue: 5000,
      asksReason: true,
    },
  });
  serviceIds.push(sSena.id);

  let replies: string[] = [];
  const send = async (t: string) => {
    replies.push(t);
  };
  const say = async (jid: string, text: string, opts: ConversationOptions = {}) => {
    replies = [];
    await handleIncoming(jid, text, send, { alertJid: ALERT_JID, aiProvider: null, ...opts });
    await trackAppointments();
    return replies;
  };
  const media = async (jid: string, opts: ConversationOptions = {}) => {
    replies = [];
    await handleIncomingMedia(jid, send, { alertJid: ALERT_JID, aiProvider: null, ...opts });
    return replies;
  };
  const apptsOf = (patientId: string) =>
    prisma.appointment.findMany({ where: { patientId }, orderBy: { createdAt: "asc" } });

  /** menú → 1 → servicio → primer día → primer horario. Devuelve la respuesta del último paso. */
  const reachReasonStep = async (jid: string, serviceId: string): Promise<string[]> => {
    await say(jid, "menú");
    await say(jid, "1");
    const services = await listActiveServices();
    const idx = services.findIndex((s) => s.id === serviceId);
    assert.ok(idx >= 0, "el servicio de prueba no aparece en la lista del bot");
    const dayReply = await say(jid, String(idx + 1));
    if (!dayReply[0]?.startsWith(messages.askDay([]).split("\n")[0]!)) {
      throw new Error(
        "No hay disponibilidad cargada en /disponibilidad: no se puede simular la reserva",
      );
    }
    await say(jid, "1");
    return say(jid, "1");
  };
  /** Resumen esperado a partir del contexto guardado. */
  const expectedSummary = async (jid: string, serviceId: string, reason: string | null) => {
    const { ctx } = await stateOf(jid);
    const service = await prisma.service.findUniqueOrThrow({ where: { id: serviceId } });
    return messages.confirmBooking({
      serviceName: service.name,
      startsAt: new Date(ctx.startsAt as string),
      price: service.price.toString(),
      tz,
      currency: pro.currency,
      reason,
    });
  };

  let ok = 0;
  let total = 0;
  const scenario = async (label: string, fn: () => Promise<void>) => {
    total++;
    try {
      await fn();
      console.log(`✅ ${label}`);
      ok++;
    } catch (err) {
      console.log(`❌ ${label}`);
      console.error(err);
    }
  };

  const REASON_FELIZ = "Quiero bajar de peso, tengo hipotiroidismo";
  let felizApptId = "";

  await scenario("1. Pide motivo después del horario", async () => {
    const before = (await apptsOf(ana.id)).length;
    const r = await reachReasonStep(JID_ANA, sCon.id);
    assert.deepEqual(r, [messages.ASK_BOOKING_REASON]);
    assert.equal((await stateOf(JID_ANA)).step, "BOOK_REASON");
    assert.equal((await apptsOf(ana.id)).length, before);
  });

  await scenario("2. Camino feliz sin seña: resumen con motivo, turno con motivo y alerta", async () => {
    const r = await say(JID_ANA, REASON_FELIZ);
    assert.deepEqual(r, [await expectedSummary(JID_ANA, sCon.id, REASON_FELIZ)]);
    assert.ok(r[0]!.includes(`📝 Motivo: ${REASON_FELIZ}`));
    const st = await stateOf(JID_ANA);
    assert.equal(st.step, "BOOK_CONFIRM");
    assert.equal(st.ctx.reason, REASON_FELIZ);
    const startsAt = new Date(st.ctx.startsAt as string);

    const r2 = await say(JID_ANA, "sí");
    assert.deepEqual(r2, [messages.bookingConfirmed({ serviceName: sCon.name, startsAt, tz })]);
    const appts = await apptsOf(ana.id);
    const appt = appts.find((a) => a.startsAt.getTime() === startsAt.getTime())!;
    assert.ok(appt);
    assert.equal(appt.status, "CONFIRMED");
    assert.equal(appt.reason, REASON_FELIZ);
    felizApptId = appt.id;
    const alerts = await takeNewAlerts();
    assert.equal(alerts.length, 1);
    assert.ok(alerts[0]!.body.includes(`📝 Motivo: ${REASON_FELIZ}`));
    assert.equal(await takePatientMessages(), 0);
    const after = await stateOf(JID_ANA);
    assert.equal(after.step, "MENU");
    assert.equal(after.ctx.reason, undefined);
  });

  await scenario("3. Salteo y confirmación: turno sin motivo, alerta sin motivo", async () => {
    await reachReasonStep(JID_ANA, sCon.id);
    const r = await say(JID_ANA, "saltear");
    assert.deepEqual(r, [await expectedSummary(JID_ANA, sCon.id, null)]);
    assert.ok(!r[0]!.includes("📝"));
    const { ctx } = await stateOf(JID_ANA);
    const startsAt = new Date(ctx.startsAt as string);
    await say(JID_ANA, "sí");
    const appt = (await apptsOf(ana.id)).find((a) => a.startsAt.getTime() === startsAt.getTime())!;
    assert.ok(appt);
    assert.equal(appt.reason, null);
    const alerts = await takeNewAlerts();
    assert.equal(alerts.length, 1);
    assert.ok(!alerts[0]!.body.includes("Motivo"));
  });

  await scenario("4. Salteos (incluida la lista P2) + \"no\" en el resumen: nada reservado", async () => {
    const before = (await apptsOf(ana.id)).length;
    for (const skip of [
      "Saltear.",
      "omitir",
      "no",
      "-",
      "prefiero no",
      "saltar",
      "no gracias",
      "prefiero no decirlo",
      "no quiero",
      "después",
    ]) {
      await reachReasonStep(JID_ANA, sCon.id);
      const r = await say(JID_ANA, skip);
      assert.equal(r.length, 1, `salteo ${skip}`);
      assert.ok(r[0]!.startsWith("Confirmás este turno?"), `salteo ${skip}`);
      assert.ok(!r[0]!.includes("📝"), `salteo ${skip}`);
      assert.deepEqual(await say(JID_ANA, "no"), [NO_BOOKING]);
    }
    assert.equal((await apptsOf(ana.id)).length, before);
    assert.equal((await takeNewAlerts()).length, 0);
  });

  await scenario("5. Muy corto: pide de nuevo", async () => {
    await reachReasonStep(JID_ANA, sCon.id);
    assert.deepEqual(await say(JID_ANA, "ok"), [messages.BOOKING_REASON_TOO_SHORT]);
    assert.equal((await stateOf(JID_ANA)).step, "BOOK_REASON");
    assert.deepEqual(await say(JID_ANA, "1"), [messages.BOOKING_REASON_TOO_SHORT]);
    assert.equal((await stateOf(JID_ANA)).step, "BOOK_REASON");
  });

  await scenario("6. Muy largo: pide resumir y no guarda nada", async () => {
    const before = (await apptsOf(ana.id)).length;
    assert.deepEqual(await say(JID_ANA, "a".repeat(501)), [messages.BOOKING_REASON_TOO_LONG]);
    const st = await stateOf(JID_ANA);
    assert.equal(st.step, "BOOK_REASON");
    assert.equal(st.ctx.reason, undefined);
    const r = await say(JID_ANA, "no");
    assert.ok(r[0]!.startsWith("Confirmás este turno?") && !r[0]!.includes("📝"));
    assert.deepEqual(await say(JID_ANA, "no"), [NO_BOOKING]);
    assert.equal((await apptsOf(ana.id)).length, before);
  });

  await scenario("7. Palabras clave dentro del motivo no son comandos", async () => {
    await reachReasonStep(JID_ANA, sCon.id);
    const text = "Necesito un menú para la semana, chau harinas";
    const r = await say(JID_ANA, text);
    assert.deepEqual(r, [await expectedSummary(JID_ANA, sCon.id, text)]);
    assert.equal((await stateOf(JID_ANA)).step, "BOOK_CONFIRM");
    await say(JID_ANA, "no");
  });

  await scenario("8. Comandos estrictos: menú, salir, chau", async () => {
    const before = (await apptsOf(ana.id)).length;
    await reachReasonStep(JID_ANA, sCon.id);
    assert.deepEqual(await say(JID_ANA, "menú"), [messages.menu({ withQuestions: false })]);
    assert.equal((await stateOf(JID_ANA)).step, "MENU");
    await reachReasonStep(JID_ANA, sCon.id);
    assert.deepEqual(await say(JID_ANA, "salir"), [messages.DORMANT_BYE]);
    assert.equal((await stateOf(JID_ANA)).step, "DORMANT");
    await reachReasonStep(JID_ANA, sCon.id);
    assert.deepEqual(await say(JID_ANA, "chau"), [messages.DORMANT_BYE]);
    assert.equal((await stateOf(JID_ANA)).step, "DORMANT");
    assert.equal((await apptsOf(ana.id)).length, before);
  });

  await scenario("9. Medio sin texto: pide texto; el epígrafe cuenta como motivo", async () => {
    await reachReasonStep(JID_ANA, sCon.id);
    assert.deepEqual(await media(JID_ANA), [messages.BOOKING_REASON_TEXT_ONLY]);
    assert.equal((await stateOf(JID_ANA)).step, "BOOK_REASON");
    const text = "Me pidieron un plan para la diabetes";
    const r = await say(JID_ANA, text);
    assert.deepEqual(r, [await expectedSummary(JID_ANA, sCon.id, text)]);
    await say(JID_ANA, "no");
  });

  await scenario("10. Servicio sin motivo: va directo al resumen", async () => {
    const r = await reachReasonStep(JID_ANA, sSin.id);
    assert.deepEqual(r, [await expectedSummary(JID_ANA, sSin.id, null)]);
    assert.equal((await stateOf(JID_ANA)).step, "BOOK_CONFIRM");
    const { ctx } = await stateOf(JID_ANA);
    const startsAt = new Date(ctx.startsAt as string);
    await say(JID_ANA, "sí");
    const appt = (await apptsOf(ana.id)).find(
      (a) => a.startsAt.getTime() === startsAt.getTime() && a.serviceId === sSin.id,
    )!;
    assert.ok(appt);
    assert.equal(appt.reason, null);
    await takeNewAlerts();
  });

  await scenario("11. Horario ocupado mientras escribe el motivo → SLOT_TAKEN", async () => {
    await reachReasonStep(JID_ANA, sCon.id);
    const { ctx } = await stateOf(JID_ANA);
    const startsAt = new Date(ctx.startsAt as string);
    const brunoAppt = await createAppointment({
      patientId: bruno.id,
      serviceId: sCon.id,
      startsAt,
      createdBy: "PROFESSIONAL",
      notifyPatient: false,
      professionalAlertJid: ALERT_JID,
    });
    await trackAppointments();
    assert.ok(appointmentIds.has(brunoAppt.id));
    const before = (await apptsOf(ana.id)).length;
    const r = await say(JID_ANA, "Control");
    assert.ok(r[0]!.includes("📝 Motivo: Control"));
    assert.deepEqual(await say(JID_ANA, "sí"), [messages.SLOT_TAKEN]);
    assert.equal((await apptsOf(ana.id)).length, before);
    assert.equal((await takeNewAlerts()).length, 0);
  });

  await scenario("12. Abandono: pasada la sesión, silencio y ningún turno", async () => {
    await reachReasonStep(JID_ANA, sCon.id);
    const before = (await apptsOf(ana.id)).length;
    const now = Date.now();
    assert.deepEqual(await say(JID_ANA, "Quiero un plan", { now: new Date(now + 21 * MIN) }), []);
    assert.equal((await apptsOf(ana.id)).length, before);
    assert.deepEqual(await say(JID_ANA, "hola", { now: new Date(now + 22 * MIN) }), []);
  });

  await scenario("13. Motivo largo: completo en el turno, recortado en la alerta", async () => {
    const motivo = "Quiero mejorar mi alimentación para correr una maratón. ".repeat(6).slice(0, 300).trim();
    assert.ok(motivo.length > 200 && motivo.length <= 300);
    await reachReasonStep(JID_ANA, sCon.id);
    await say(JID_ANA, motivo);
    const { ctx } = await stateOf(JID_ANA);
    const startsAt = new Date(ctx.startsAt as string);
    await say(JID_ANA, "sí");
    const appt = (await apptsOf(ana.id)).find((a) => a.startsAt.getTime() === startsAt.getTime())!;
    assert.equal(appt.reason, motivo);
    const alerts = await takeNewAlerts();
    assert.equal(alerts.length, 1);
    assert.ok(alerts[0]!.body.includes(reasonForAlert(motivo)));
    assert.ok(alerts[0]!.body.includes("(completo en el panel)"));
    assert.ok(!alerts[0]!.body.includes(motivo));
  });

  await scenario("14. Seña (dominio): AWAITING_PAYMENT con motivo y sin alerta", async () => {
    const now = new Date();
    const slots = await getAvailableSlotsForService({
      serviceId: sCon.id,
      from: now,
      to: new Date(now.getTime() + 21 * 24 * 60 * MIN),
    });
    assert.ok(slots.length > 0, "sin horarios libres");
    const startsAt = slots[slots.length - 1]!;
    const appt = await createAppointment({
      patientId: ana.id,
      serviceId: sSena.id,
      startsAt,
      createdBy: "PATIENT",
      notifyPatient: false,
      reason: "Control (TEST)",
      professionalAlertJid: ALERT_JID,
    });
    await trackAppointments();
    assert.equal(appt.status, "AWAITING_PAYMENT");
    assert.equal(appt.reason, "Control (TEST)");
    assert.equal((await takeNewAlerts()).length, 0);
    assert.equal(await takePatientMessages(), 0);
  });

  await scenario("15. Edición desde el panel (dominio): normaliza, no sincroniza ni avisa", async () => {
    assert.ok(felizApptId);
    const u = await updateAppointmentReason({ id: felizApptId, reason: "  Control mensual  " });
    assert.equal(u.reason, "Control mensual");
    let row = await prisma.appointment.findUniqueOrThrow({ where: { id: felizApptId } });
    assert.equal(row.reason, "Control mensual");
    assert.equal(row.needsGoogleSync, false);
    assert.equal((await takeNewAlerts()).length, 0);
    assert.equal(await takePatientMessages(), 0);

    assert.equal((await updateAppointmentReason({ id: felizApptId, reason: "" })).reason, null);
    await updateAppointmentReason({ id: felizApptId, reason: "Control mensual" });
    await assert.rejects(
      updateAppointmentReason({ id: felizApptId, reason: "a".repeat(501) }),
      (err) => err instanceof InvalidBookingReasonError,
    );
    row = await prisma.appointment.findUniqueOrThrow({ where: { id: felizApptId } });
    assert.equal(row.reason, "Control mensual");
  });

  await scenario("16. Consulta (D8): el motivo no se copia y la consulta vacía se borra", async () => {
    const done = await setAppointmentStatus({ id: felizApptId, status: "COMPLETED" });
    assert.ok(done.consultation);
    consultationIds.add(done.consultation.id);
    const cons = await prisma.consultation.findUniqueOrThrow({ where: { id: done.consultation.id } });
    assert.equal(cons.notes, null);
    const back = await setAppointmentStatus({ id: felizApptId, status: "CONFIRMED" });
    assert.equal(back.removedEmptyConsultation, true);
    const row = await prisma.appointment.findUniqueOrThrow({ where: { id: felizApptId } });
    assert.equal(row.reason, "Control mensual");
    assert.equal(row.needsGoogleSync, false);
  });

  await scenario("17. IA (D9): mis_turnos no expone los motivos", async () => {
    const appts = await apptsOf(ana.id);
    const reasons = appts.map((a) => a.reason).filter((r): r is string => Boolean(r));
    assert.ok(reasons.length >= 2);
    const r = await runBotAiTool({ name: "mis_turnos", input: {}, patientId: ana.id, now: new Date() });
    assert.equal(r.isError, false);
    for (const reason of reasons) assert.ok(!r.content.includes(reason), "mis_turnos filtró un motivo");
    assert.ok(r.content.includes(sCon.name));
  });

  // Nada debió quedar encolado para los pacientes de prueba.
  assert.equal(await takePatientMessages(), 0);

  console.log(`\n${ok}/${total} escenarios OK`);
  if (ok !== total) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await finalCleanup();
      console.log("Datos de prueba borrados (por id).");
    } catch (err) {
      console.error("Error limpiando datos de prueba:", err);
      process.exitCode = 1;
    }
    await prisma.$disconnect();
  });
