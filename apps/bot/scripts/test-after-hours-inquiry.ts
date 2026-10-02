/**
 * HU-011: simula, sin WhatsApp real, la opción 0 del bot dentro y fuera de la franja
 * "fuera de horario", la captura de consultas y el resumen de fin de franja.
 *
 * Reglas (SDD `Refactorizaciones/mensajes-fuera-de-horario.md`, 10.4):
 *  - Nunca manda WhatsApp: las respuestas al paciente se capturan con `send`, y las alertas van a
 *    un JID falso (ALERT_JID) vía `opts.alertJid`. Nunca usa `Professional.phoneJid`.
 *  - No modifica `Professional`: la franja y la hora se inyectan por opciones.
 *  - Crea sus propios pacientes "(TEST)" y borra SOLO por los ids que insertó. Cada fila de
 *    `OutboundMessage` que encola se borra por id apenas se verifica.
 *  - Aborta si el bot figura conectado (salvo ALLOW_BOT_RUNNING=1).
 *
 * Uso: npm run test:after-hours --workspace apps/bot
 */
import assert from "node:assert/strict";
import { prisma } from "@nutri-bot/db";
import {
  countPendingInquiries,
  enqueueAfterHoursDigest,
  getProfessional,
  markInquiryAnswered,
  recordInquiryMessage,
} from "@nutri-bot/db/domain";
import { formatClock, formatInTimeZone, messages, type AfterHoursConfig } from "@nutri-bot/core";
import { handleIncoming, handleIncomingMedia, type ConversationOptions } from "../src/conversation";

const ALERT_JID = "5490000000099@s.whatsapp.net";
const JID_ANA = "5490000000011@s.whatsapp.net";
const JID_BRUNO = "5490000000012@s.whatsapp.net";
const TEST_JIDS = [JID_ANA, JID_BRUNO];
const MIN = 60_000;

const patientIds: string[] = [];
const inquiryIds = new Set<string>();
const outboundIds = new Set<string>();
const startedAt = new Date();

/** Alertas a ALERT_JID creadas desde el arranque que todavía no se contaron. Las borra por id. */
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

async function stepOf(jid: string): Promise<string | undefined> {
  const row = await prisma.conversationState.findUnique({ where: { patientJid: jid } });
  return row?.step;
}

async function preCleanup(): Promise<void> {
  const existing = await prisma.patient.findMany({ where: { whatsappJid: { in: TEST_JIDS } } });
  for (const p of existing) {
    if (!p.name?.endsWith("(TEST)")) {
      throw new Error(`Existe un paciente real con el jid de prueba ${p.whatsappJid} (${p.name}). No borro nada.`);
    }
  }
  if (existing.length > 0) {
    console.log(`Limpiando ${existing.length} paciente(s) (TEST) de una corrida anterior…`);
    // PatientInquiry cae por onDelete: Cascade.
    await prisma.patient.deleteMany({ where: { id: { in: existing.map((p) => p.id) } } });
  }
  await prisma.conversationState.deleteMany({ where: { patientJid: { in: TEST_JIDS } } });
}

async function finalCleanup(): Promise<void> {
  const safety = await prisma.outboundMessage.findMany({
    where: { toJid: ALERT_JID, createdAt: { gte: startedAt } },
    select: { id: true },
  });
  const ids = [...outboundIds, ...safety.map((r) => r.id)];
  await prisma.outboundMessage.deleteMany({ where: { id: { in: ids } } });
  await prisma.patientInquiry.deleteMany({ where: { id: { in: [...inquiryIds] } } });
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
    data: { whatsappJid: JID_ANA, phone: "5490000000011", name: "Ana (TEST)" },
  });
  patientIds.push(ana.id);
  const bruno = await prisma.patient.create({
    data: { whatsappJid: JID_BRUNO, phone: "5490000000012", name: "Bruno (TEST)" },
  });
  patientIds.push(bruno.id);
  const scope = { patientIds: [ana.id, bruno.id] };

  const base = new Date();
  const hm = (d: Date) => formatInTimeZone(d, tz, "HH:mm");
  const at = (offsetMin: number) => new Date(base.getTime() + offsetMin * MIN);
  const NIGHT: AfterHoursConfig = { enabled: true, start: hm(at(-60)), end: hm(at(60)) };
  const DAY: AfterHoursConfig = { enabled: true, start: hm(at(60)), end: hm(at(-60)) };
  const CROSS: AfterHoursConfig = { enabled: true, start: hm(at(-60)), end: hm(at(2)) };

  let replies: string[] = [];
  const send = async (t: string) => {
    replies.push(t);
  };
  const say = async (jid: string, text: string, opts: ConversationOptions) => {
    replies = [];
    await handleIncoming(jid, text, send, { alertJid: ALERT_JID, ...opts });
    return replies;
  };
  const media = async (jid: string, opts: ConversationOptions) => {
    replies = [];
    await handleIncomingMedia(jid, send, { alertJid: ALERT_JID, ...opts });
    return replies;
  };
  const inquiriesOf = async (patientId: string) => {
    const rows = await prisma.patientInquiry.findMany({ where: { patientId }, orderBy: { createdAt: "asc" } });
    for (const r of rows) inquiryIds.add(r.id);
    return rows;
  };
  const nightHandoff = (c: AfterHoursConfig) =>
    messages.afterHoursHandoff({ attendFrom: formatClock(c.end), attendTo: formatClock(c.start) });

  let ok = 0;
  const scenario = async (label: string, fn: () => Promise<void>) => {
    try {
      await fn();
      console.log(`✅ ${label}`);
      ok++;
    } catch (err) {
      console.log(`❌ ${label}`);
      throw err;
    }
  };

  let anaNightId = "";

  await scenario("1. Día (D4): 0 → HANDOFF + alerta inmediata; el texto se guarda como consulta diurna", async () => {
    await say(JID_ANA, "menú", { now: base, afterHours: DAY });
    assert.equal(await stepOf(JID_ANA), "MENU");
    const r = await say(JID_ANA, "0", { now: base, afterHours: DAY });
    assert.deepEqual(r, [messages.HANDOFF]);
    const alerts = await takeNewAlerts();
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0]!.body, messages.professionalHandoffAlert({ patientName: "Ana (TEST)", patientPhone: "5490000000011" }));
    assert.equal(await stepOf(JID_ANA), "AWAIT_INQUIRY");

    const r2 = await say(JID_ANA, "¿Puedo cambiar la merienda?", { now: base, afterHours: DAY });
    assert.deepEqual(r2, [messages.INQUIRY_SAVED_DAY]);
    const rows = await inquiriesOf(ana.id);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.receivedAfterHours, false);
    assert.equal(rows[0]!.body, "¿Puedo cambiar la merienda?");
    assert.equal((await takeNewAlerts()).length, 0);
  });

  await scenario("2. Noche: 0 → afterHoursHandoff y sin alerta", async () => {
    const m = await say(JID_ANA, "menú", { now: base, afterHours: NIGHT });
    assert.deepEqual(m, [messages.MENU]);
    const r = await say(JID_ANA, "0", { now: base, afterHours: NIGHT });
    assert.deepEqual(r, [nightHandoff(NIGHT)]);
    assert.equal((await takeNewAlerts()).length, 0);
    assert.equal(await stepOf(JID_ANA), "AWAIT_INQUIRY");
  });

  await scenario("3. Noche, primer mensaje: consulta nueva nocturna y confirmación", async () => {
    const r = await say(JID_ANA, "¿Puedo cambiar la merienda por una fruta?", { now: base, afterHours: NIGHT });
    assert.deepEqual(r, [messages.inquirySavedAfterHours({ attendFrom: formatClock(NIGHT.end) })]);
    const rows = await inquiriesOf(ana.id);
    assert.equal(rows.length, 2);
    const night = rows.find((x) => x.receivedAfterHours)!;
    assert.ok(night);
    assert.equal(night.status, "PENDING");
    assert.equal(night.receivedAt.getTime(), base.getTime());
    assert.equal(night.body, "¿Puedo cambiar la merienda por una fruta?");
    anaNightId = night.id;
    assert.equal((await takeNewAlerts()).length, 0);
  });

  await scenario("4. Noche, segundo mensaje: se agrega a la misma consulta, sin respuesta", async () => {
    const r = await say(JID_ANA, "y otra cosa: ¿el yogur puede ser descremado?", { now: at(2), afterHours: NIGHT });
    assert.deepEqual(r, []);
    const row = await prisma.patientInquiry.findUniqueOrThrow({ where: { id: anaNightId } });
    assert.equal(row.body, "¿Puedo cambiar la merienda por una fruta?\ny otra cosa: ¿el yogur puede ser descremado?");
    assert.equal(row.lastMessageAt.getTime(), at(2).getTime());
    assert.equal(row.receivedAt.getTime(), base.getTime());
  });

  await scenario("5. Comandos estrictos: '¿Puedo salir a correr?' se guarda y no cierra", async () => {
    const r = await say(JID_ANA, "¿Puedo salir a correr?", { now: at(2), afterHours: NIGHT });
    assert.deepEqual(r, []);
    assert.equal(await stepOf(JID_ANA), "AWAIT_INQUIRY");
    const row = await prisma.patientInquiry.findUniqueOrThrow({ where: { id: anaNightId } });
    assert.ok(row.body.endsWith("\n¿Puedo salir a correr?"));
  });

  await scenario("6. Medios: 'solo texto' esperando la consulta; silencio después de salir", async () => {
    assert.deepEqual(await media(JID_ANA, { now: at(2), afterHours: NIGHT }), [messages.INQUIRY_TEXT_ONLY]);
    assert.equal(await stepOf(JID_ANA), "AWAIT_INQUIRY");
    assert.deepEqual(await say(JID_ANA, "salir", { now: at(2), afterHours: NIGHT }), [messages.DORMANT_BYE]);
    assert.equal(await stepOf(JID_ANA), "DORMANT");
    assert.deepEqual(await media(JID_ANA, { now: at(2), afterHours: NIGHT }), []);
  });

  await scenario("7. Misma noche, sesión nueva (D7): se agrega a la misma consulta y se reconfirma", async () => {
    await say(JID_ANA, "menú", { now: at(3), afterHours: NIGHT });
    assert.deepEqual(await say(JID_ANA, "0", { now: at(3), afterHours: NIGHT }), [nightHandoff(NIGHT)]);
    const r = await say(JID_ANA, "Me olvidé: ¿y el mate?", { now: at(3), afterHours: NIGHT });
    assert.deepEqual(r, [messages.inquirySavedAfterHours({ attendFrom: formatClock(NIGHT.end) })]);
    const rows = await inquiriesOf(ana.id);
    assert.equal(rows.filter((x) => x.receivedAfterHours).length, 1);
    const row = rows.find((x) => x.id === anaNightId)!;
    assert.ok(row.body.endsWith("\nMe olvidé: ¿y el mate?"));
    assert.equal((await takeNewAlerts()).length, 0);
  });

  await scenario("8. Cruce de franja: 0 de noche, texto de día → consulta diurna + alerta inmediata", async () => {
    await say(JID_BRUNO, "menú", { now: base, afterHours: CROSS });
    assert.deepEqual(await say(JID_BRUNO, "0", { now: base, afterHours: CROSS }), [nightHandoff(CROSS)]);
    assert.equal((await takeNewAlerts()).length, 0);
    const r = await say(JID_BRUNO, "Hola, consulta por la cena", { now: at(3), afterHours: CROSS });
    assert.deepEqual(r, [messages.INQUIRY_SAVED_DAY]);
    const rows = await inquiriesOf(bruno.id);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.receivedAfterHours, false);
    const alerts = await takeNewAlerts();
    assert.equal(alerts.length, 1);
    assert.ok(alerts[0]!.body.includes("Bruno (TEST)"));
  });

  await scenario("9. Resumen: no sale de noche; de día sale una vez y es idempotente", async () => {
    const night = await enqueueAfterHoursDigest({ now: base, config: NIGHT, scope, alertJid: ALERT_JID });
    assert.deepEqual(night, { digested: 0, outboundId: null });
    const day = await enqueueAfterHoursDigest({ now: at(4), config: DAY, scope, alertJid: ALERT_JID });
    assert.equal(day.digested, 1);
    assert.ok(day.outboundId);
    const alerts = await takeNewAlerts();
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0]!.id, day.outboundId);
    assert.ok(alerts[0]!.body.includes("Ana (TEST)"));
    assert.ok(!alerts[0]!.body.includes("Bruno (TEST)"));
    assert.ok(!alerts[0]!.body.includes("merienda"));
    const row = await prisma.patientInquiry.findUniqueOrThrow({ where: { id: anaNightId } });
    assert.ok(row.digestedAt);
    const again = await enqueueAfterHoursDigest({ now: at(5), config: DAY, scope, alertJid: ALERT_JID });
    assert.deepEqual(again, { digested: 0, outboundId: null });
    assert.equal((await takeNewAlerts()).length, 0);
  });

  await scenario("10. Noche sin consultas nocturnas: el resumen no encola nada", async () => {
    const r = await enqueueAfterHoursDigest({ now: at(5), config: DAY, scope: { patientIds: [bruno.id] }, alertJid: ALERT_JID });
    assert.deepEqual(r, { digested: 0, outboundId: null });
    assert.equal((await takeNewAlerts()).length, 0);
  });

  await scenario("11. Sin WhatsApp de alertas: se marca resumida sin encolar", async () => {
    const { inquiry, created } = await recordInquiryMessage({ patientId: bruno.id, text: "Consulta nocturna", at: base, afterHours: true });
    inquiryIds.add(inquiry.id);
    assert.equal(created, true);
    const r = await enqueueAfterHoursDigest({ now: at(5), config: DAY, scope: { patientIds: [bruno.id] }, alertJid: null });
    assert.deepEqual(r, { digested: 1, outboundId: null });
    const row = await prisma.patientInquiry.findUniqueOrThrow({ where: { id: inquiry.id } });
    assert.ok(row.digestedAt);
    assert.equal((await takeNewAlerts()).length, 0);
  });

  await scenario("12. Marcar respondida: baja el conteo y es idempotente", async () => {
    const before = await countPendingInquiries();
    assert.equal(await markInquiryAnswered(anaNightId), "answered");
    assert.equal(await countPendingInquiries(), before - 1);
    const row = await prisma.patientInquiry.findUniqueOrThrow({ where: { id: anaNightId } });
    assert.equal(row.status, "ANSWERED");
    assert.ok(row.answeredAt);
    assert.equal(await markInquiryAnswered(anaNightId), "already_answered");
  });

  console.log(`\n${ok}/12 escenarios OK`);
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
