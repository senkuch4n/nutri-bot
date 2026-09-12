import cron from "node-cron";
import { prisma } from "@nutri-bot/db";
import { enqueueAttendanceConfirmations, enqueueDueReminders, enqueuePrepInstructions, expireStalePendingPayments, syncGoogleCalendar } from "@nutri-bot/db/domain";
import { sendDocument, sendText } from "./whatsapp";
import { env } from "./env";
import { logger } from "./logger";

const MAX_ATTEMPTS = 5;
let outboxRunning = false;

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
      include: { plan: { select: { pdfData: true, pdfFileName: true } } },
    });

    for (const msg of pending) {
      try {
        if (msg.kind === "PLAN_PDF") {
          if (!msg.plan?.pdfData) {
            throw new Error(`El plan no tiene PDF generado: ${msg.planId ?? msg.id}`);
          }
          await sendDocument(msg.toJid, msg.plan.pdfData, msg.plan.pdfFileName ?? "plan-alimentario.pdf");
        } else {
          await sendText(msg.toJid, msg.body);
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

  cron.schedule("*/5 * * * *", async () => {
    try {
      const n = await expireStalePendingPayments();
      if (n > 0) logger.info({ n }, "Reservas con seña vencida liberadas");
    } catch (err) {
      logger.error({ err }, "Error liberando reservas con seña vencida");
    }
  });
}

/** Barre pendientes al arrancar, sin esperar al primer tick del cron. */
export async function runStartupJobs(): Promise<void> {
  try {
    await enqueueDueReminders();
    await enqueueAttendanceConfirmations();
    await enqueuePrepInstructions();
    await syncGoogleCalendar();
    await expireStalePendingPayments();
  } catch (err) {
    logger.error({ err }, "Error en tareas de arranque");
  }
}
