/**
 * HU-012: simula, sin WhatsApp real y sin la API de IA, la opción 5 del bot (preguntas con IA):
 * entrada al modo pregunta, tools de solo lectura, límites, errores, derivación con 0 de día y de
 * noche, medios, cola por jid y retención.
 *
 * Reglas (SDD `Refactorizaciones/preguntas-bot-ia.md`, 10.6):
 *  - NUNCA llama a la API real: borra las claves del entorno antes de todo, verifica que no haya
 *    runtime de IA y pasa SIEMPRE `aiProvider` (falso o null) a cada llamada.
 *  - Nunca manda WhatsApp: respuestas por `send`, alertas a ALERT_JID vía `opts.alertJid`.
 *  - No modifica `Professional`: interruptor, franja, hora y límites se inyectan por opciones.
 *  - Crea sus propios datos "(TEST)" y borra SOLO por los ids que insertó.
 *  - Aborta si el bot figura conectado (salvo ALLOW_BOT_RUNNING=1).
 *
 * Uso: npm run test:bot-ai --workspace apps/bot
 */
import assert from "node:assert/strict";
import { prisma } from "@nutri-bot/db";
import {
  countBotAiQuestionsToday,
  getProfessional,
  purgeExpiredBotAiQuestions,
  recordBotAiQuestion,
} from "@nutri-bot/db/domain";
import {
  dayKeyInTz,
  formatClock,
  formatInTimeZone,
  inquiryBodyFromAiQuestion,
  messages,
  wallTimeToUtc,
  type AfterHoursConfig,
  type AiTurn,
} from "@nutri-bot/core";
import type { BotAiToolResult } from "@nutri-bot/db/domain";
import { handleIncoming, handleIncomingMedia, type ConversationOptions } from "../src/conversation";
import { BotAiError, ZERO_USAGE, type AiAnswer, type BotAiProvider } from "../src/ai/provider";
import { getBotAiRuntime } from "../src/ai/runtime";
import { runSerialByJid } from "../src/jid-queue";

// Antes de cualquier otra cosa: sin claves, nada puede llegar a la API real.
delete process.env.API_KEY_IA_ANTHROPIC;
delete process.env.API_KEY_IA_DEEPSEEK;

const ALERT_JID = "5490000000099@s.whatsapp.net";
const JID_ANA = "5490000000021@s.whatsapp.net";
const JID_BRUNO = "5490000000022@s.whatsapp.net";
const TEST_JIDS = [JID_ANA, JID_BRUNO];
const SERVICE_NAME = "Antropometría (TEST)";
const MIN = 60_000;
const DAY_MS = 86_400_000;

const patientIds: string[] = [];
const appointmentIds: string[] = [];
let serviceId: string | null = null;
const outboundIds = new Set<string>();
const startedAt = new Date();

// --- Proveedor falso ---

type Script = (p: {
  userText: string;
  history: AiTurn[];
  runTool: (name: string, input: Record<string, unknown>) => Promise<BotAiToolResult>;
}) => Promise<AiAnswer>;

type FakeCall = { userText: string; historyLength: number; toolResults: BotAiToolResult[] };

const scripts: Script[] = [];
const calls: FakeCall[] = [];
const fake: BotAiProvider = {
  name: "fake",
  model: "fake-1",
  async answer(p) {
    const script = scripts.shift();
    if (!script) throw new Error("El proveedor falso fue llamado sin guion pendiente");
    const call: FakeCall = { userText: p.userText, historyLength: p.history.length, toolResults: [] };
    calls.push(call);
    return script({
      userText: p.userText,
      history: p.history,
      runTool: async (name, input) => {
        const r = await p.runTool(name, input);
        call.toolResults.push(r);
        return r;
      },
    });
  },
};
const usage = { inputTokens: 1200, outputTokens: 60, cacheCreationTokens: 0, cacheReadTokens: 0 };
const reply = (text: string, toolRounds = 0): AiAnswer => ({ kind: "answer", text, usage, toolRounds });
const simple = (text: string): Script => async () => reply(text);

// --- Helpers de base (solo por ids propios) ---

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

async function stateOf(jid: string): Promise<{ step?: string; ctx: Record<string, unknown> }> {
  const row = await prisma.conversationState.findUnique({ where: { patientJid: jid } });
  return { step: row?.step, ctx: (row?.context ?? {}) as Record<string, unknown> };
}

async function preCleanup(): Promise<void> {
  const existing = await prisma.patient.findMany({ where: { whatsappJid: { in: TEST_JIDS } } });
  for (const p of existing) {
    if (!p.name?.endsWith("(TEST)")) {
      throw new Error(`Existe un paciente real con el jid de prueba ${p.whatsappJid} (${p.name}). No borro nada.`);
    }
  }
  const oldServices = await prisma.service.findMany({ where: { name: SERVICE_NAME }, select: { id: true } });
  const oldAppts = await prisma.appointment.findMany({
    where: {
      OR: [
        { patientId: { in: existing.map((p) => p.id) } },
        { serviceId: { in: oldServices.map((s) => s.id) } },
      ],
    },
    select: { id: true },
  });
  if (existing.length + oldServices.length > 0) {
    console.log(`Limpiando datos (TEST) de una corrida anterior (${existing.length} pacientes, ${oldServices.length} servicios)…`);
  }
  await prisma.appointment.deleteMany({ where: { id: { in: oldAppts.map((a) => a.id) } } });
  await prisma.service.deleteMany({ where: { id: { in: oldServices.map((s) => s.id) } } });
  // PatientInquiry y BotAiQuestion caen por onDelete: Cascade.
  await prisma.patient.deleteMany({ where: { id: { in: existing.map((p) => p.id) } } });
  await prisma.conversationState.deleteMany({ where: { patientJid: { in: TEST_JIDS } } });
}

async function finalCleanup(): Promise<void> {
  const safety = await prisma.outboundMessage.findMany({
    where: { toJid: ALERT_JID, createdAt: { gte: startedAt } },
    select: { id: true },
  });
  await prisma.outboundMessage.deleteMany({ where: { id: { in: [...outboundIds, ...safety.map((r) => r.id)] } } });
  if (patientIds.length > 0) {
    const inquiries = await prisma.patientInquiry.findMany({
      where: { patientId: { in: patientIds } },
      select: { id: true },
    });
    await prisma.patientInquiry.deleteMany({ where: { id: { in: inquiries.map((r) => r.id) } } });
    const questions = await prisma.botAiQuestion.findMany({
      where: { patientId: { in: patientIds } },
      select: { id: true },
    });
    await prisma.botAiQuestion.deleteMany({ where: { id: { in: questions.map((r) => r.id) } } });
  }
  await prisma.appointment.deleteMany({ where: { id: { in: appointmentIds } } });
  if (serviceId) await prisma.service.deleteMany({ where: { id: serviceId } });
  // Solo si este script creó los pacientes (si abortó por un jid real, no toca su estado).
  if (patientIds.length > 0) {
    await prisma.conversationState.deleteMany({ where: { patientJid: { in: TEST_JIDS } } });
  }
  await prisma.patient.deleteMany({ where: { id: { in: patientIds } } });
}

async function main(): Promise<void> {
  assert.equal(getBotAiRuntime(), null, "No debería haber runtime de IA (claves borradas)");
  const bot = await prisma.botStatus.findUnique({ where: { id: 1 } });
  if (bot?.connected && process.env.ALLOW_BOT_RUNNING !== "1") {
    throw new Error("Pará el bot antes de correr esta prueba");
  }
  const pro = await getProfessional(); // solo lectura
  if (pro.botPaused) throw new Error("El bot está pausado en /ajustes: la prueba necesita que responda.");
  const tz = pro.timezone;

  await preCleanup();

  const ana = await prisma.patient.create({
    data: { whatsappJid: JID_ANA, phone: "5490000000021", name: "Ana (TEST)" },
  });
  patientIds.push(ana.id);
  const bruno = await prisma.patient.create({
    data: { whatsappJid: JID_BRUNO, phone: "5490000000022", name: "Bruno (TEST)" },
  });
  patientIds.push(bruno.id);
  const service = await prisma.service.create({
    data: {
      name: SERVICE_NAME,
      price: 25000,
      durationMin: 45,
      prepInstructions: "Ir en ayunas (TEST).",
      active: true,
    },
  });
  serviceId = service.id;

  const base = new Date();
  const apptStart = wallTimeToUtc(dayKeyInTz(new Date(base.getTime() + 10 * DAY_MS), tz), "10:00", tz);
  for (const patientId of [ana.id, bruno.id]) {
    const a = await prisma.appointment.create({
      data: {
        patientId,
        serviceId: service.id,
        startsAt: apptStart,
        endsAt: new Date(apptStart.getTime() + 45 * MIN),
        status: "CONFIRMED",
        createdBy: "PATIENT",
        priceSnapshot: 25000,
        needsGoogleSync: false,
      },
    });
    appointmentIds.push(a.id);
  }

  const hm = (d: Date) => formatInTimeZone(d, tz, "HH:mm");
  const at = (offsetMin: number) => new Date(base.getTime() + offsetMin * MIN);
  const NIGHT: AfterHoursConfig = { enabled: true, start: hm(at(-60)), end: hm(at(60)) };
  const DAY: AfterHoursConfig = { enabled: true, start: hm(at(60)), end: hm(at(-60)) };

  let replies: string[] = [];
  const send = async (t: string) => {
    replies.push(t);
  };
  // Todas las llamadas llevan aiProvider explícito (falso por defecto) y alertJid falso.
  const defaults: ConversationOptions = {
    now: base,
    afterHours: DAY,
    alertJid: ALERT_JID,
    aiProvider: fake,
    aiEnabled: true,
  };
  const say = async (jid: string, text: string, opts: ConversationOptions = {}) => {
    replies = [];
    await handleIncoming(jid, text, send, { ...defaults, ...opts });
    return replies;
  };
  const media = async (jid: string, opts: ConversationOptions = {}) => {
    replies = [];
    await handleIncomingMedia(jid, send, { ...defaults, ...opts });
    return replies;
  };
  const questionsOf = (patientId: string) =>
    prisma.botAiQuestion.findMany({ where: { patientId }, orderBy: { createdAt: "asc" } });
  const callsBefore = () => calls.length;

  let ok = 0;
  const TOTAL = 18;
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

  await scenario("1. Opción oculta sin proveedor o con el interruptor apagado", async () => {
    const r = await say(JID_ANA, "menú", { aiProvider: null });
    assert.deepEqual(r, [messages.welcomeBack("Ana (TEST)", messages.MENU)]);
    assert.ok(!r[0]!.includes("5️⃣"));
    assert.deepEqual(await say(JID_ANA, "5", { aiProvider: null }), [messages.NOT_UNDERSTOOD]);
    assert.deepEqual(await say(JID_ANA, "menú", { aiEnabled: false }), [messages.MENU]);
    assert.deepEqual(await say(JID_ANA, "menú"), [messages.MENU_WITH_QUESTIONS]);
    assert.equal(calls.length, 0);
  });

  await scenario("2. Entrar al modo pregunta con 5", async () => {
    assert.deepEqual(await say(JID_ANA, "5"), [messages.QUESTION_MODE_INTRO]);
    assert.equal((await stateOf(JID_ANA)).step, "AWAIT_QUESTION");
    assert.equal(calls.length, 0);
  });

  await scenario("3. Pregunta de servicio: tool servicios, respuesta limpia y registro", async () => {
    const q = "cuánto sale la antropometría y cuánto dura?";
    let toolJson = "";
    scripts.push(async ({ runTool }) => {
      const r = await runTool("servicios", {});
      assert.equal(r.isError, false);
      toolJson = r.content;
      return reply("La **Antropometría (TEST)** sale $ 25.000 y dura 45 minutos.", 1);
    });
    const r = await say(JID_ANA, q);
    assert.deepEqual(r, ["La *Antropometría (TEST)* sale $ 25.000 y dura 45 minutos."]);
    const items = JSON.parse(toolJson) as { nombre: string; precio: string; duracionMin: number; preparacion: string | null }[];
    const mine = items.find((i) => i.nombre === SERVICE_NAME);
    assert.ok(mine, "el servicio TEST está en el resultado");
    assert.ok(mine.precio.includes("25.000"));
    assert.equal(mine.duracionMin, 45);
    assert.equal(mine.preparacion, "Ir en ayunas (TEST).");
    assert.ok(calls.at(-1)!.userText.endsWith(`Pregunta: ${q}`));
    assert.ok(!calls.at(-1)!.userText.includes("Ana (TEST)"), "el nombre del paciente no va al proveedor");
    const rows = await questionsOf(ana.id);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.outcome, "ANSWERED");
    assert.equal(rows[0]!.provider, "fake");
    assert.equal(rows[0]!.model, "fake-1");
    assert.equal(rows[0]!.question, q);
    assert.equal(rows[0]!.inputTokens, 1200);
    assert.equal(rows[0]!.outputTokens, 60);
    assert.equal(rows[0]!.toolRounds, 1);
    const st = await stateOf(JID_ANA);
    assert.equal(st.step, "AWAIT_QUESTION");
    assert.equal((st.ctx.aiHistory as unknown[]).length, 1);
  });

  await scenario("4. mis_turnos: solo los turnos de quien escribe (ignora un patientId)", async () => {
    let withOther = "";
    let plain = "";
    scripts.push(async ({ runTool, history }) => {
      assert.equal(history.length, 1);
      withOther = (await runTool("mis_turnos", { patientId: bruno.id })).content;
      plain = (await runTool("mis_turnos", {})).content;
      return reply("Tu turno es a las 10:00.", 1);
    });
    await say(JID_ANA, "a qué hora era mi turno?");
    assert.equal(withOther, plain);
    const list = JSON.parse(withOther) as { servicio: string; fechaHora: string }[];
    const mine = list.filter((t) => t.servicio === SERVICE_NAME);
    assert.equal(mine.length, 1);
    assert.ok(mine[0]!.fechaHora.endsWith("10:00"));
    assert.equal(calls.at(-1)!.historyLength, 1);
  });

  await scenario("5. disponibilidad informa y no reserva", async () => {
    let json = "";
    scripts.push(async ({ runTool }) => {
      const r = await runTool("disponibilidad", { servicio: service.id });
      assert.equal(r.isError, false);
      json = r.content;
      return reply("Hay lugar la semana que viene.", 1);
    });
    await say(JID_ANA, "hay lugar para la antropometría?");
    const parsed = JSON.parse(json) as { servicio: string; dias: unknown[]; sinLugar: boolean };
    assert.equal(parsed.servicio, SERVICE_NAME);
    assert.ok(Array.isArray(parsed.dias));
    assert.equal(await prisma.appointment.count({ where: { serviceId: service.id } }), 2);
  });

  await scenario("6. Dígitos y comandos no llaman a la IA; texto con 'salir' sí", async () => {
    const n = callsBefore();
    await say(JID_ANA, "1");
    assert.equal((await stateOf(JID_ANA)).step, "BOOK_SERVICE");
    assert.equal(calls.length, n);
    assert.deepEqual(await say(JID_ANA, "menú"), [messages.MENU_WITH_QUESTIONS]);
    await say(JID_ANA, "5");
    scripts.push(simple("Eso lo tiene que ver la nutricionista. Si querés que se lo pase, respondé *0*."));
    await say(JID_ANA, "¿puedo salir a correr antes del turno?");
    assert.equal(calls.length, n + 1);
    assert.equal((await stateOf(JID_ANA)).step, "AWAIT_QUESTION");
    assert.equal((await questionsOf(ana.id)).at(-1)!.outcome, "HANDOFF_OFFERED");
    assert.deepEqual(await say(JID_ANA, "menú"), [messages.MENU_WITH_QUESTIONS]);
    await say(JID_ANA, "5");
    assert.deepEqual(await say(JID_ANA, "chau"), [messages.DORMANT_BYE]);
    assert.equal((await stateOf(JID_ANA)).step, "DORMANT");
    assert.equal(calls.length, n + 1);
  });

  await scenario("7. Dormido: silencio y sin IA", async () => {
    const n = callsBefore();
    assert.deepEqual(await say(JID_ANA, "una pregunta, cuánto sale la consulta?"), []);
    assert.equal(calls.length, n);
  });

  await scenario("8. Pregunta demasiado larga: sin llamada ni registro", async () => {
    await say(JID_ANA, "menú");
    await say(JID_ANA, "5");
    const n = callsBefore();
    const rows = (await questionsOf(ana.id)).length;
    assert.deepEqual(await say(JID_ANA, "a".repeat(501)), [messages.AI_TOO_LONG]);
    assert.equal(calls.length, n);
    assert.equal((await questionsOf(ana.id)).length, rows);
  });

  await scenario("9. Límite diario del paciente", async () => {
    const counted = await countBotAiQuestionsToday({ patientId: ana.id, now: base, tz });
    const n = callsBefore();
    const r = await say(JID_ANA, "y la consulta común?", { aiLimits: { perPatientDaily: counted.patient } });
    assert.deepEqual(r, [messages.AI_DAILY_LIMIT]);
    assert.equal(calls.length, n);
    const last = (await questionsOf(ana.id)).at(-1)!;
    assert.equal(last.outcome, "LIMIT_PATIENT");
    assert.equal(last.answer, null);
  });

  await scenario("10. Límite global", async () => {
    const n = callsBefore();
    assert.deepEqual(await say(JID_ANA, "y la consulta común?", { aiLimits: { globalDaily: 0 } }), [messages.AI_UNAVAILABLE]);
    assert.equal(calls.length, n);
    assert.equal((await questionsOf(ana.id)).at(-1)!.outcome, "LIMIT_GLOBAL");
  });

  await scenario("11. Error del proveedor", async () => {
    scripts.push(async () => {
      throw new BotAiError("timeout", ZERO_USAGE, 0);
    });
    assert.deepEqual(await say(JID_ANA, "aceptan OSDE?"), [messages.AI_ERROR]);
    const last = (await questionsOf(ana.id)).at(-1)!;
    assert.equal(last.outcome, "ERROR");
    assert.equal(last.errorKind, "timeout");
    assert.equal((await stateOf(JID_ANA)).step, "AWAIT_QUESTION");
  });

  await scenario("12. Derivar con 0 de día: consulta con prefijo, alerta y handedOffAt", async () => {
    scripts.push(simple("No tengo ese dato. Si querés que se lo pase, respondé *0*."));
    await say(JID_ANA, "hacen factura C?");
    const questionRow = (await questionsOf(ana.id)).at(-1)!;
    assert.equal(questionRow.question, "hacen factura C?");
    assert.equal(await say(JID_ANA, "0", { afterHours: DAY }).then((r) => r.join()), messages.INQUIRY_SAVED_DAY);
    const inquiries = await prisma.patientInquiry.findMany({ where: { patientId: ana.id } });
    assert.equal(inquiries.length, 1);
    assert.equal(inquiries[0]!.body, inquiryBodyFromAiQuestion("hacen factura C?"));
    assert.equal(inquiries[0]!.body, "Pregunta al asistente: hacen factura C?");
    assert.equal(inquiries[0]!.receivedAfterHours, false);
    const alerts = await takeNewAlerts();
    assert.equal(alerts.length, 1);
    const updated = await prisma.botAiQuestion.findUniqueOrThrow({ where: { id: questionRow.id } });
    assert.ok(updated.handedOffAt);
    assert.equal((await stateOf(JID_ANA)).step, "AWAIT_INQUIRY");
  });

  await scenario("13. Derivar con 0 de noche: sin alerta, consulta nocturna", async () => {
    await say(JID_BRUNO, "menú", { afterHours: NIGHT });
    await say(JID_BRUNO, "5", { afterHours: NIGHT });
    scripts.push(simple("No tengo ese dato. Si querés que se lo pase, respondé *0*."));
    await say(JID_BRUNO, "puedo pagar en cuotas?", { afterHours: NIGHT });
    const r = await say(JID_BRUNO, "0", { afterHours: NIGHT });
    assert.deepEqual(r, [messages.inquirySavedAfterHours({ attendFrom: formatClock(NIGHT.end) })]);
    const inquiries = await prisma.patientInquiry.findMany({ where: { patientId: bruno.id } });
    assert.equal(inquiries.length, 1);
    assert.equal(inquiries[0]!.receivedAfterHours, true);
    assert.equal(inquiries[0]!.body, "Pregunta al asistente: puedo pagar en cuotas?");
    assert.equal((await takeNewAlerts()).length, 0);
  });

  await scenario("14. 0 sin pregunta previa: HANDOFF de la HU-011", async () => {
    await say(JID_ANA, "menú");
    await say(JID_ANA, "5");
    const r = await say(JID_ANA, "0", { afterHours: DAY });
    assert.deepEqual(r, [messages.HANDOFF]);
    assert.equal((await takeNewAlerts()).length, 1);
    assert.equal((await stateOf(JID_ANA)).step, "AWAIT_INQUIRY");
  });

  await scenario("15. Medios en el modo pregunta → AI_TEXT_ONLY", async () => {
    await say(JID_ANA, "menú");
    await say(JID_ANA, "5");
    assert.deepEqual(await media(JID_ANA), [messages.AI_TEXT_ONLY]);
    assert.equal((await stateOf(JID_ANA)).step, "AWAIT_QUESTION");
  });

  await scenario("16. IA apagada en medio de la sesión", async () => {
    const n = callsBefore();
    assert.deepEqual(await say(JID_ANA, "cuánto sale?", { aiEnabled: false }), [messages.AI_UNAVAILABLE]);
    assert.equal((await stateOf(JID_ANA)).step, "MENU");
    assert.equal(calls.length, n);
  });

  await scenario("17. Cola por jid (D14): en orden y con historial actualizado", async () => {
    await say(JID_ANA, "5");
    const order: string[] = [];
    const slow: Script = async () => {
      await new Promise((r) => setTimeout(r, 300));
      return reply("Primera respuesta.");
    };
    scripts.push(slow, simple("Segunda respuesta."));
    const n = callsBefore();
    const run = (text: string) =>
      runSerialByJid(JID_ANA, () =>
        handleIncoming(JID_ANA, text, async (t) => void order.push(t), { ...defaults }),
      );
    await Promise.all([run("primera pregunta?"), run("segunda pregunta?")]);
    assert.deepEqual(order, ["Primera respuesta.", "Segunda respuesta."]);
    assert.equal(calls[n]!.historyLength, 0);
    assert.equal(calls[n + 1]!.historyLength, calls[n]!.historyLength + 1);
  });

  await scenario("18. Retención: borra solo lo vencido de los pacientes TEST", async () => {
    const recent = (await questionsOf(ana.id)).length;
    await recordBotAiQuestion({
      patientId: ana.id,
      askedAt: new Date(base.getTime() - 91 * DAY_MS),
      question: "pregunta vieja (TEST)",
      answer: "x",
      outcome: "ANSWERED",
      provider: "fake",
      model: "fake-1",
    });
    const n = await purgeExpiredBotAiQuestions({
      retentionDays: 90,
      now: base,
      scope: { patientIds: [ana.id, bruno.id] },
    });
    assert.equal(n, 1);
    assert.equal((await questionsOf(ana.id)).length, recent);
  });

  assert.equal(scripts.length, 0, "quedaron guiones sin usar");
  console.log(`\n${ok}/${TOTAL} escenarios OK`);
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
