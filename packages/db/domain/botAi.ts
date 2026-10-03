// HU-012: registro de preguntas a la IA del bot, límites diarios, retención y tools de SOLO LECTURA.
import type { BotAiOutcome } from "@prisma/client";
import {
  afterHoursConfigFrom,
  appointmentsForAi,
  availabilityForAi,
  clinicInfoForAi,
  dayBoundsInTz,
  normalize,
  servicesForAi,
  type AfterHoursConfig,
} from "@nutri-bot/core";
import { prisma } from "../index";
import { getAvailableSlotsForService, getProfessional } from "./availability";

/** Resultados que cuentan para los límites diarios (todos los que llamaron a la IA). */
export const BOT_AI_COUNTED_OUTCOMES: BotAiOutcome[] = [
  "ANSWERED",
  "HANDOFF_OFFERED",
  "REFUSED",
  "TRUNCATED",
  "TOOL_LIMIT",
  "ERROR",
];

/** BOT. Preguntas de hoy (día en tz) que llamaron a la IA: del paciente y globales. */
export async function countBotAiQuestionsToday(p: {
  patientId: string;
  now: Date;
  tz: string;
}): Promise<{ patient: number; global: number }> {
  const { from, to } = dayBoundsInTz(p.now, p.tz);
  const base = { askedAt: { gte: from, lt: to }, outcome: { in: BOT_AI_COUNTED_OUTCOMES } };
  const [patient, global] = await Promise.all([
    prisma.botAiQuestion.count({ where: { patientId: p.patientId, ...base } }),
    prisma.botAiQuestion.count({ where: base }),
  ]);
  return { patient, global };
}

export type BotAiQuestionInput = {
  patientId: string;
  askedAt: Date;
  question: string;
  answer: string | null;
  outcome: BotAiOutcome;
  provider: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
  toolRounds?: number;
  latencyMs?: number | null;
  errorKind?: string | null;
};

/** BOT. Crea la fila. `question` se recorta (trim, slice 2000) y `answer` (slice 4000) por las dudas. */
export async function recordBotAiQuestion(data: BotAiQuestionInput): Promise<{ id: string }> {
  return prisma.botAiQuestion.create({
    data: {
      patientId: data.patientId,
      askedAt: data.askedAt,
      question: data.question.trim().slice(0, 2000),
      answer: data.answer === null ? null : data.answer.slice(0, 4000),
      outcome: data.outcome,
      provider: data.provider,
      model: data.model,
      inputTokens: data.inputTokens ?? 0,
      outputTokens: data.outputTokens ?? 0,
      cacheCreationTokens: data.cacheCreationTokens ?? 0,
      cacheReadTokens: data.cacheReadTokens ?? 0,
      toolRounds: data.toolRounds ?? 0,
      latencyMs: data.latencyMs ?? null,
      errorKind: data.errorKind ?? null,
    },
    select: { id: true },
  });
}

/** BOT (D4 c). Marca la pregunta como derivada. Idempotente; no tira si no existe. */
export async function markBotAiQuestionHandedOff(p: {
  id: string;
  patientId: string;
  at: Date;
}): Promise<void> {
  await prisma.botAiQuestion.updateMany({
    where: { id: p.id, patientId: p.patientId, handedOffAt: null },
    data: { handedOffAt: p.at },
  });
}

const DAY_MS = 86_400_000;

/**
 * BOT (cron diario + arranque). Retención D7: borra las preguntas con askedAt anterior a
 * now − retentionDays. `scope` es SOLO para el script de prueba. retentionDays < 1 → lanza.
 */
export async function purgeExpiredBotAiQuestions(opts: {
  retentionDays: number;
  now?: Date;
  scope?: { patientIds: string[] };
}): Promise<number> {
  if (!Number.isFinite(opts.retentionDays) || opts.retentionDays < 1) {
    throw new Error("purgeExpiredBotAiQuestions: retentionDays tiene que ser >= 1");
  }
  const now = opts.now ?? new Date();
  const cutoff = new Date(now.getTime() - opts.retentionDays * DAY_MS);
  const res = await prisma.botAiQuestion.deleteMany({
    where: {
      askedAt: { lt: cutoff },
      ...(opts.scope ? { patientId: { in: opts.scope.patientIds } } : {}),
    },
  });
  return res.count;
}

/**
 * BOT (cron). Privacidad (D7): el historial con la IA vive en `ConversationState.context` mientras
 * dura el modo pregunta. Una sesión vencida (sin actividad en `sessionTimeoutMs`) pasa a DORMANT
 * con contexto vacío, que es como el bot ya la trata al volver a escribir. Si el paciente escribe
 * justo antes, su `updatedAt` cambia y la fila no entra. `scope` es SOLO para el script de prueba.
 */
export async function clearExpiredAiSessions(opts: {
  sessionTimeoutMs: number;
  now?: Date;
  scope?: { jids: string[] };
}): Promise<number> {
  if (!Number.isFinite(opts.sessionTimeoutMs) || opts.sessionTimeoutMs <= 0) {
    throw new Error("clearExpiredAiSessions: sessionTimeoutMs tiene que ser > 0");
  }
  const now = opts.now ?? new Date();
  const res = await prisma.conversationState.updateMany({
    where: {
      step: "AWAIT_QUESTION",
      updatedAt: { lt: new Date(now.getTime() - opts.sessionTimeoutMs) },
      ...(opts.scope ? { patientJid: { in: opts.scope.jids } } : {}),
    },
    data: { step: "DORMANT", context: {} },
  });
  return res.count;
}

export type BotAiToolResult = { content: string; isError: boolean };

const TOOL_FAILED = "No se pudo consultar ese dato.";
const AVAILABILITY_DAYS = 21;

function ok(value: unknown): BotAiToolResult {
  return { content: JSON.stringify(value), isError: false };
}

function fail(content: string): BotAiToolResult {
  return { content, isError: true };
}

async function activeServices() {
  return prisma.service.findMany({ where: { active: true }, orderBy: { createdAt: "asc" } });
}

/**
 * BOT. Ejecuta una tool de SOLO LECTURA para el paciente `patientId` (lo pone el bot, nunca la IA).
 * Nunca lanza: cualquier excepción → { content: "No se pudo consultar ese dato.", isError: true }.
 * No lee ClinicalRecord, EvolutionEntry, NutritionPlan, DiaryEntry, Consultation, PatientInquiry ni Patient.
 */
export async function runBotAiTool(p: {
  name: string;
  input: unknown;
  patientId: string;
  now: Date;
  /** SOLO pruebas: reemplaza la franja de Professional. */
  afterHours?: AfterHoursConfig;
}): Promise<BotAiToolResult> {
  try {
    switch (p.name) {
      case "servicios": {
        const [pro, services] = await Promise.all([getProfessional(), activeServices()]);
        return ok(
          servicesForAi(
            services.map((s) => ({
              id: s.id,
              name: s.name,
              description: s.description,
              price: s.price.toString(),
              durationMin: s.durationMin,
              requiresDeposit: s.requiresDeposit,
              depositKind: s.depositKind,
              depositValue: s.depositValue === null ? null : s.depositValue.toString(),
              prepInstructions: s.prepInstructions,
            })),
            pro.currency,
          ),
        );
      }
      case "disponibilidad": {
        const input = (p.input ?? {}) as Record<string, unknown>;
        const wanted = typeof input.servicio === "string" ? input.servicio.trim() : "";
        if (!wanted) return fail("Falta el servicio.");
        const [pro, services] = await Promise.all([getProfessional(), activeServices()]);
        const key = normalize(wanted);
        const service =
          services.find((s) => s.id === wanted) ?? services.find((s) => normalize(s.name) === key);
        if (!service) return fail("No hay un servicio activo con ese nombre. Usá la herramienta servicios.");
        const slots = await getAvailableSlotsForService({
          serviceId: service.id,
          from: p.now,
          to: new Date(p.now.getTime() + AVAILABILITY_DAYS * DAY_MS),
          now: p.now,
        });
        return ok(availabilityForAi({ serviceName: service.name, slots, tz: pro.timezone }));
      }
      case "mis_turnos": {
        // El input se IGNORA: el paciente es siempre el que escribe (p.patientId).
        const [pro, appts] = await Promise.all([
          getProfessional(),
          prisma.appointment.findMany({
            where: {
              patientId: p.patientId,
              status: { in: ["CONFIRMED", "AWAITING_PAYMENT"] },
              startsAt: { gt: p.now },
            },
            include: { service: { select: { name: true } } },
            orderBy: { startsAt: "asc" },
            take: 5,
          }),
        ]);
        return ok(
          appointmentsForAi(
            appts.map((a) => ({
              serviceName: a.service.name,
              startsAt: a.startsAt,
              status: a.status as "CONFIRMED" | "AWAITING_PAYMENT",
            })),
            pro.timezone,
          ),
        );
      }
      case "datos_consultorio": {
        const pro = await getProfessional();
        return ok(
          clinicInfoForAi({
            professionalName: pro.name,
            title: pro.title,
            acceptedInsurances: pro.acceptedInsurances,
            currency: pro.currency,
            afterHours: p.afterHours ?? afterHoursConfigFrom(pro),
            tz: pro.timezone,
            now: p.now,
            extraInfo: pro.botAiInfo,
          }),
        );
      }
      default:
        return fail("Herramienta desconocida.");
    }
  } catch (err) {
    // Solo el nombre de la tool y la clase del error: nunca el input ni datos del paciente.
    console.warn(`[runBotAiTool] falló la tool ${p.name}: ${err instanceof Error ? err.name : "error"}`);
    return fail(TOOL_FAILED);
  }
}
