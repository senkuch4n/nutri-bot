import cron from "node-cron";
import { prisma } from "@nutri-bot/db";
import { enqueueAfterHoursDigest, enqueueAttendanceConfirmations, enqueueDueReminders, enqueuePrepInstructions, clearExpiredAiSessions, expireStalePendingPayments, purgeExpiredBotAiQuestions, reconcilePendingPayments, syncGoogleCalendar } from "@nutri-bot/db/domain";
import { sendDocument, sendText } from "./whatsapp";
import { OUTBOX_INCLUDE, resolveOutboundPayload } from "./outbound-payload";
import { env } from "./env";
import { logger } from "./logger";
import { getBotAiConfig } from "./ai/runtime";

const MAX_ATTEMPTS = 5;
let outboxRunning = false;
let paymentsRunning = false;

async function reconcilePayments(expire = false): Promise<void> {
  if (paymentsRunning) return;
  paymentsRunning = true;
  try {
    const result = await reconcilePendingPayments((paymentId) => {
      logger.warn({ paymentId }, "Error conciliando pago de Mercado Pago");
    });
    if (result.processed || result.failed) logger.info(result, "Conciliación Mercado Pago");
    // Do not expire reservations when the provider could not be consulted.
    if (expire && result.failed === 0) await expireStalePendingPayments();
  } catch {
    logger.error("Error en conciliación Mercado Pago");
  } finally {
    paymentsRunning = false;
  }
}

/** Consume la tabla OutboundMessage y envía por WhatsApp. */
export function startOutboxConsumer(): void {
  setInterval(() => void tick(), env.pollIntervalMs);
}

async function tick(): Promise<void> {
  if (outboxRunning) return;
  outboxRunning = true;
  try {
    const pending = await prisma.outboundMessage.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      take: 5,
      include: OUTBOX_INCLUDE,
    });

    for (const msg of pending) {
      try {
        const payload = resolveOutboundPayload(msg);
        if (payload.type === "document") {
          await sendDocument(msg.toJid, payload.buffer, payload.fileName);
        } else {
          await sendText(msg.toJid, payload.body);
        }
        await prisma.outboundMessage.update({
          where: { id: msg.id },
          data: { status: "SENT", sentAt: new Date(), attempts: { increment: 1 }, lastError: null },
        });
        logger.info({ id: msg.id, kind: msg.kind, to: msg.toJid }, "Mensaje enviado");
        await new Promise((r) => setTimeout(r, 800));
      } catch (err) {
        const message = err instanceof Error ? err.message : "error desconocido";
        if (message.includes("no está conectado")) {
          logger.warn("WhatsApp no conectado; se pausa el envío hasta reconectar");
          break;
        }
        const attempts = msg.attempts + 1;
        await prisma.outboundMessage.update({
          where: { id: msg.id },
          data: {
            status: attempts >= MAX_ATTEMPTS ? "FAILED" : "PENDING",
            attempts,
            lastError: message.slice(0, 300),
          },
        });
        logger.warn({ id: msg.id, attempts }, "Fallo al enviar mensaje");
      }
    }
  } catch (err) {
    logger.error({ err }, "Error en el consumidor de outbox");
  } finally {
    outboxRunning = false;
  }
}

export function startCron(): void {
  cron.schedule("* * * * *", () => reconcilePayments(new Date().getMinutes() % 5 === 0));
  cron.schedule("*/15 * * * *", async () => {
    try {
      const n = await enqueueDueReminders();
      if (n > 0) logger.info({ n }, "Recordatorios encolados");
    } catch (err) {
      logger.error({ err }, "Error encolando recordatorios");
    }
  });

  cron.schedule("*/30 * * * *", async () => {
    try {
      const n = await enqueueAttendanceConfirmations();
      if (n > 0) logger.info({ n }, "Confirmaciones de asistencia encoladas");
    } catch (err) {
      logger.error({ err }, "Error encolando confirmaciones de asistencia");
    }
  });

  cron.schedule("*/15 * * * *", async () => {
    try {
      const n = await enqueuePrepInstructions();
      if (n > 0) logger.info({ n }, "Instrucciones previas encoladas");
    } catch (err) {
      logger.error({ err }, "Error encolando instrucciones previas");
    }
  });

  cron.schedule("* * * * *", async () => {
    try {
      const res = await syncGoogleCalendar();
      if (res.processed > 0 || res.error) logger.info(res, "Sync Google Calendar");
    } catch (err) {
      logger.error({ err }, "Error en sync de Google Calendar");
    }
  });

  // HU-012 (privacidad): el historial con la IA no queda guardado en sesiones vencidas.
  cron.schedule("*/5 * * * *", () => runAiSessionCleanup());
  // HU-012 (D7): retención de las preguntas a la IA (antes del resumen, que tiene que ser el último).
  cron.schedule("30 4 * * *", () => runBotAiPurge());
  // HU-011: resumen de consultas fuera de horario (último cron: los tests miran calls[0]).
  cron.schedule("* * * * *", () => runAfterHoursDigest());
}

/** Barre pendientes al arrancar, sin esperar al primer tick del cron. */
export async function runStartupJobs(): Promise<void> {
  await reconcilePayments(true);
  try {
    await enqueueDueReminders();
    await enqueueAttendanceConfirmations();
    await enqueuePrepInstructions();
    await syncGoogleCalendar();
  } catch (err) {
    logger.error({ err }, "Error en tareas de arranque");
  }
  // HU-011: si el bot estuvo caído al terminar la franja, el resumen sale al arrancar.
  try {
    await runAfterHoursDigest();
  } catch (err) {
    logger.error({ err }, "Error en el resumen de consultas fuera de horario (arranque)");
  }
  // HU-012: retención de preguntas a la IA también al arrancar.
  try {
    await runBotAiPurge();
  } catch (err) {
    logger.error({ err }, "Error borrando preguntas a la IA vencidas (arranque)");
  }
}

let digestRunning = false;

/** HU-011: resumen de fin de franja. Idempotente (digestedAt + transacción); no se solapa. */
export async function runAfterHoursDigest(): Promise<void> {
  if (digestRunning) return;
  digestRunning = true;
  try {
    const { digested, outboundId } = await enqueueAfterHoursDigest();
    if (digested > 0) logger.info({ digested, outboundId }, "Resumen de consultas fuera de horario");
  } catch (err) {
    logger.error({ err }, "Error en el resumen de consultas fuera de horario");
  } finally {
    digestRunning = false;
  }
}

let aiPurgeRunning = false;

/** HU-012 (D7): borra las preguntas a la IA de más de BOT_AI_RETENTION_DAYS días. No se solapa. */
export async function runBotAiPurge(): Promise<void> {
  if (aiPurgeRunning) return;
  aiPurgeRunning = true;
  try {
    const n = await purgeExpiredBotAiQuestions({ retentionDays: getBotAiConfig().limits.retentionDays });
    if (n > 0) logger.info({ n }, "Preguntas a la IA vencidas borradas");
  } catch (err) {
    logger.error({ err }, "Error borrando preguntas a la IA vencidas");
  } finally {
    aiPurgeRunning = false;
  }
}

/** Mismo vencimiento de sesión que usa la conversación (BOT_SESSION_TIMEOUT_MIN, 20 por defecto). */
const SESSION_TIMEOUT_MS = Number(process.env.BOT_SESSION_TIMEOUT_MIN ?? 20) * 60_000;

let aiSessionCleanupRunning = false;

/** HU-012: borra el historial con la IA de las sesiones del modo pregunta vencidas. No se solapa. */
export async function runAiSessionCleanup(): Promise<void> {
  if (aiSessionCleanupRunning) return;
  aiSessionCleanupRunning = true;
  try {
    const n = await clearExpiredAiSessions({ sessionTimeoutMs: SESSION_TIMEOUT_MS });
    if (n > 0) logger.info({ n }, "Historial de IA de sesiones vencidas borrado");
  } catch (err) {
    logger.error({ err }, "Error borrando el historial de IA de sesiones vencidas");
  } finally {
    aiSessionCleanupRunning = false;
  }
}
