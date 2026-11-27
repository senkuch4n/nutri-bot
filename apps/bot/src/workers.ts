import cron from "node-cron";
import { prisma } from "@nutri-bot/db";
import { botAiRetentionCutoff, enqueueAfterHoursDigest, enqueuePrepInstructions, enqueueServiceReminders, clearExpiredConversationText, expireStalePendingPayments, listConnectedMercadoPagoTenants, listTenantsWithExpiredBotAiQuestions, listTenantsWithExpiredConversationText, listTenantsWithPendingMercadoPagoPayments, purgeExpiredBotAiQuestionsForTenant, reconcilePendingPayments, refreshMercadoPagoAccountToken } from "@nutri-bot/db/domain";
import { listConnectedGoogleCalendarTenants, syncGoogleCalendar } from "@nutri-bot/db/domain/googleCalendar";
import { outboxOwnershipWhere } from "@nutri-bot/db/domain/outbox";
import { LEGACY_TENANT_ID } from "@nutri-bot/db/domain/tenantAccess";
import { resolveTenantSchedulingContext, TenantScopeError } from "@nutri-bot/db/domain/tenantScope";
import type { WhatsAppConnection } from "./whatsapp";
import { OUTBOX_INCLUDE, resolveOutboundPayload } from "./outbound-payload";
import { env } from "./env";
import { logger } from "./logger";
import { getBotAiConfig } from "./ai/runtime";
import { getConversationTenant } from "./tenant";

const MAX_ATTEMPTS = 5;
// Prisma's 5s default is shorter than one Baileys query (60s by default). A send
// can include several queries, media upload and socket writes, with no end-to-end bound.
const OUTBOX_ATTEMPT_TIMEOUT_MS = 5 * 60_000;
const runningOutboxTenants = new Set<string>();
let paymentsRunning = false;

/** Une listas de consultorios sin repetir, conservando el primer orden de aparición. */
function uniqueTenants(tenants: { tenantId: string }[]): { tenantId: string }[] {
  const seen = new Set<string>();
  return tenants.filter(({ tenantId }) => (seen.has(tenantId) ? false : (seen.add(tenantId), true)));
}

/** HU-028a (D2a): conciliación y vencimiento de señas por consultorio (los que tienen cuenta conectada
 *  o señas pendientes). Una falla en un consultorio no frena a los demás. Nunca loguea el error crudo. */
async function reconcilePayments(): Promise<void> {
  if (paymentsRunning) return;
  paymentsRunning = true;
  try {
    const tenants = uniqueTenants([
      ...(await listConnectedMercadoPagoTenants()),
      ...(await listTenantsWithPendingMercadoPagoPayments()),
    ]);
    for (const tenant of tenants) {
      try {
        const result = await reconcilePendingPayments(tenant, (paymentId) => {
          logger.warn({ tenantId: tenant.tenantId, paymentId }, "Error conciliando pago de Mercado Pago");
        });
        if (result.processed || result.failed || result.skipped) {
          logger.info({ tenantId: tenant.tenantId, ...result }, "Conciliación Mercado Pago");
        }
        // Do not expire reservations when the provider could not be consulted.
        if (result.failed === 0) await expireStalePendingPayments(tenant);
      } catch {
        logger.error({ tenantId: tenant.tenantId }, "Error en conciliación Mercado Pago");
      }
    }
  } catch {
    logger.error("Error en conciliación Mercado Pago");
  } finally {
    paymentsRunning = false;
  }
}

type OutboxTransport = Pick<WhatsAppConnection, "tenantId" | "sendText" | "sendDocument">;

/** Consume solo el outbox del consultorio asociado al transporte. */
export function startOutboxConsumer(transport: OutboxTransport): () => void {
  let stopped = false;
  const timer = setInterval(() => void tick(transport, () => stopped), env.pollIntervalMs);
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}

async function tick(delivery: OutboxTransport, isStopped: () => boolean): Promise<void> {
  let runningTenant: string | undefined;
  try {
    const { tenantId } = delivery;
    if (isStopped() || runningOutboxTenants.has(tenantId)) return;
    runningOutboxTenants.add(tenantId);
    runningTenant = tenantId;
    // Validate the binding on every poll without selecting a transport or tenant from the lookup.
    const verified = tenantId === LEGACY_TENANT_ID
      ? await getConversationTenant()
      : (await resolveTenantSchedulingContext(prisma, tenantId)).scope;
    if (isStopped()) return;
    if (verified.tenantId !== tenantId) throw new TenantScopeError();
    const pendingWhere = { ...outboxOwnershipWhere(tenantId), status: "PENDING" as const };
    const pending = await prisma.outboundMessage.findMany({
      where: pendingWhere,
      orderBy: { createdAt: "asc" },
      take: 5,
      select: { id: true },
    });

    for (const { id } of pending) {
      if (isStopped()) return;
      const outcome = await prisma.$transaction(async (tx) => {
        if (isStopped()) return;
        // The lock only coordinates consumers while this transaction/connection survives.
        // Expiry or loss can release it while WhatsApp is still in flight. An ambiguous
        // external send or an uncommitted result can be retried; this is not exactly-once.
        const key = JSON.stringify(["nutri-bot:outbox", tenantId, id]);
        const [lock] = await tx.$queryRaw<{ locked: boolean }[]>`
          SELECT pg_try_advisory_xact_lock(hashtextextended(${key}::text, 0)) AS locked
        `;
        if (!lock?.locked || isStopped()) return;

        // The polled ID can be stale. Read current eligibility and payload under the lock.
        const where = { ...pendingWhere, id };
        const msg = await tx.outboundMessage.findFirst({ where, include: OUTBOX_INCLUDE });
        if (isStopped() || !msg) return;
        const updateWhere = { ...where, attempts: msg.attempts };
        try {
          const payload = resolveOutboundPayload(msg);
          if (payload.type === "document") {
            await delivery.sendDocument(msg.toJid, payload.buffer, payload.fileName);
          } else {
            await delivery.sendText(msg.toJid, payload.body);
          }
        } catch (err) {
          if (isStopped()) return;
          const message = err instanceof Error ? err.message : "error desconocido";
          if (message.includes("no está conectado")) return { type: "disconnected" } as const;
          const attempts = msg.attempts + 1;
          const { count } = await tx.outboundMessage.updateMany({
            where: updateWhere,
            data: {
              status: attempts >= MAX_ATTEMPTS ? "FAILED" : "PENDING",
              attempts,
              lastError: message.slice(0, 300),
            },
          });
          return { type: "failed", count, attempts } as const;
        }
        const { count } = await tx.outboundMessage.updateMany({
          where: updateWhere,
          data: { status: "SENT", sentAt: new Date(), attempts: { increment: 1 }, lastError: null },
        });
        return { type: "sent", count, kind: msg.kind, to: msg.toJid } as const;
      }, { timeout: OUTBOX_ATTEMPT_TIMEOUT_MS, isolationLevel: "ReadCommitted" });

      if (!outcome) continue;
      if (outcome.type === "disconnected") {
        logger.warn("WhatsApp no conectado; se pausa el envío hasta reconectar");
        break;
      }
      if (outcome.type === "failed") {
        if (outcome.count) logger.warn({ id, attempts: outcome.attempts }, "Fallo al enviar mensaje");
        continue;
      }
      if (outcome.count) logger.info({ id, kind: outcome.kind, to: outcome.to }, "Mensaje enviado");
      else logger.warn({ id }, "Mensaje enviado sin poder actualizar el outbox");
      if (isStopped()) return;
      await new Promise((r) => setTimeout(r, 800));
    }
  } catch (err) {
    logger.error({ err }, "Error en el consumidor de outbox");
  } finally {
    if (runningTenant !== undefined) runningOutboxTenants.delete(runningTenant);
  }
}

export function startCron(): void {
  cron.schedule("* * * * *", () => reconcilePayments());
  // HU-014: recordatorios por servicio (incluye el pedido de confirmación de asistencia).
  cron.schedule("*/5 * * * *", () => runServiceReminders());

  cron.schedule("*/15 * * * *", () => runPrepInstructions());

  cron.schedule("* * * * *", () => runGoogleCalendarSync());

  // HU-023 (D4): renovación diaria del token de Mercado Pago (si faltan menos de 30 días).
  cron.schedule("0 6 * * *", () => runMercadoPagoRefresh());

  // Privacidad (HU-012/HU-013): el texto del paciente no queda guardado en sesiones vencidas.
  cron.schedule("*/5 * * * *", () => runSessionTextCleanup());
  // HU-012 (D7): retención de las preguntas a la IA (antes del resumen, que tiene que ser el último).
  cron.schedule("30 4 * * *", () => runBotAiPurge());
  // HU-011: resumen de consultas fuera de horario (último cron: los tests miran calls[0]).
  cron.schedule("* * * * *", () => runAfterHoursDigest());
}

let calendarRunning = false;

/** HU-028b (D2a): sync de Google Calendar por consultorio conectado; una falla no frena a los demás.
 *  Nunca loguea el error crudo (un GaxiosError trae el header Authorization). */
export async function runGoogleCalendarSync(): Promise<void> {
  if (calendarRunning) return;
  calendarRunning = true;
  try {
    let tenants: { tenantId: string }[];
    try {
      tenants = await listConnectedGoogleCalendarTenants();
    } catch {
      logger.error("Error en sync de Google Calendar");
      return;
    }
    for (const tenant of tenants) {
      try {
        const res = await syncGoogleCalendar(tenant);
        if (res.processed > 0 || res.error) {
          logger.info({ tenantId: tenant.tenantId, processed: res.processed, error: res.error }, "Sync Google Calendar");
        }
      } catch {
        logger.error({ tenantId: tenant.tenantId }, "Error en sync de Google Calendar");
      }
    }
  } finally {
    calendarRunning = false;
  }
}

/** HU-023 (D4) / HU-028a: renueva el token de cada consultorio con cuenta de Mercado Pago vinculada,
 *  aislando fallas por consultorio. Nunca loguea el error crudo (puede traer headers con el token). */
export async function runMercadoPagoRefresh(): Promise<void> {
  let tenants: { tenantId: string }[];
  try {
    tenants = await listConnectedMercadoPagoTenants();
  } catch {
    logger.error("Error renovando Mercado Pago");
    return;
  }
  for (const tenant of tenants) {
    try {
      const result = await refreshMercadoPagoAccountToken(tenant);
      if (result !== "not_needed" && result !== "not_connected") {
        logger.info({ tenantId: tenant.tenantId, result }, "Renovación Mercado Pago");
      }
    } catch {
      logger.error({ tenantId: tenant.tenantId }, "Error renovando Mercado Pago");
    }
  }
}

/** Barre pendientes al arrancar, sin esperar al primer tick del cron. */
export async function runStartupJobs(): Promise<void> {
  await reconcilePayments();
  try {
    await runServiceReminders();
    await runPrepInstructions();
    await runGoogleCalendarSync();
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

function whatsappSweep(errorMessage: string, run: (tenant: { tenantId: string }) => Promise<void>): () => Promise<void> {
  let running = false;
  return async () => {
    if (running) return;
    running = true;
    try {
      // Declared intent only: connectivity doesn't gate enqueuing. The session manager
      // owns legacy bootstrap; an absent or unlinked row is not an implicit request.
      const rows = await prisma.botStatus.findMany({
        where: { tenantId: { not: null }, sessionKey: { not: null } },
        select: { tenantId: true },
      });
      const tenants = uniqueTenants(rows.flatMap(({ tenantId }) => tenantId ? [{ tenantId }] : []));
      for (const tenant of tenants) {
        try {
          await run(tenant);
        } catch {
          logger.error(tenant, errorMessage);
        }
      }
    } catch {
      logger.error(errorMessage);
    } finally {
      running = false;
    }
  };
}

/** HU-014: el dominio conserva la deduplicación persistente de recordatorios y confirmaciones. */
export const runServiceReminders = whatsappSweep("Error encolando recordatorios", async (tenant) => {
  const { reminders, confirmations } = await enqueueServiceReminders(tenant);
  if (reminders > 0) logger.info({ ...tenant, n: reminders }, "Recordatorios encolados");
  if (confirmations > 0) logger.info({ ...tenant, n: confirmations }, "Confirmaciones de asistencia encoladas");
});

const runPrepInstructions = whatsappSweep("Error encolando instrucciones previas", async (tenant) => {
  const n = await enqueuePrepInstructions(tenant);
  if (n > 0) logger.info({ ...tenant, n }, "Instrucciones previas encoladas");
});

/** HU-011: el dominio deduplica el resumen con digestedAt y una transacción. */
export const runAfterHoursDigest = whatsappSweep("Error en el resumen de consultas fuera de horario", async (tenant) => {
  const { digested, outboundId } = await enqueueAfterHoursDigest(tenant);
  if (digested > 0) logger.info({ ...tenant, digested, outboundId }, "Resumen de consultas fuera de horario");
});

let aiPurgeRunning = false;

/** HU-012 (D7): borra las preguntas a la IA de más de BOT_AI_RETENTION_DAYS días. No se solapa. */
export async function runBotAiPurge(): Promise<void> {
  if (aiPurgeRunning) return;
  aiPurgeRunning = true;
  try {
    const cutoff = botAiRetentionCutoff(getBotAiConfig().limits.retentionDays);
    const tenants = await listTenantsWithExpiredBotAiQuestions(cutoff);
    for (const tenant of tenants) {
      try {
        const n = await purgeExpiredBotAiQuestionsForTenant(tenant, cutoff);
        if (n > 0) logger.info({ ...tenant, n }, "Preguntas a la IA vencidas borradas");
      } catch {
        logger.error(tenant, "Error borrando preguntas a la IA vencidas");
      }
    }
  } catch {
    logger.error("Error borrando preguntas a la IA vencidas");
  } finally {
    aiPurgeRunning = false;
  }
}

/** Mismo vencimiento de sesión que usa la conversación (BOT_SESSION_TIMEOUT_MIN, 20 por defecto). */
const SESSION_TIMEOUT_MS = Number(process.env.BOT_SESSION_TIMEOUT_MIN ?? 20) * 60_000;

let sessionTextCleanupRunning = false;

/** HU-012/HU-013: borra el texto del paciente (historial con la IA, motivo) de sesiones vencidas. No se solapa. */
export async function runSessionTextCleanup(): Promise<void> {
  if (sessionTextCleanupRunning) return;
  sessionTextCleanupRunning = true;
  try {
    if (!Number.isFinite(SESSION_TIMEOUT_MS) || SESSION_TIMEOUT_MS <= 0) {
      logger.error("BOT_SESSION_TIMEOUT_MIN tiene que ser > 0 para limpiar el texto de sesiones vencidas");
      return;
    }
    const cutoff = new Date(Date.now() - SESSION_TIMEOUT_MS);
    const tenants = await listTenantsWithExpiredConversationText(cutoff);
    for (const tenant of tenants) {
      try {
        const n = await clearExpiredConversationText(tenant, cutoff);
        if (n > 0) logger.info({ ...tenant, n }, "Texto de sesiones vencidas borrado");
      } catch {
        logger.error(tenant, "Error borrando el texto de sesiones vencidas");
      }
    }
  } catch {
    logger.error("Error listando consultorios con texto de sesiones vencidas");
  } finally {
    sessionTextCleanupRunning = false;
  }
}
