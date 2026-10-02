import type { InquiryStatus, PatientInquiry } from "@prisma/client";
import {
  afterHoursConfigFrom,
  isWithinAfterHours,
  messages,
  type AfterHoursConfig,
} from "@nutri-bot/core";
import { prisma } from "../index";
import { getProfessional } from "./availability";

/** Tope por mensaje: lo que exceda se recorta (sin aviso al paciente). */
export const INQUIRY_MESSAGE_MAX = 4000;

/**
 * Agrega `text` al final de una consulta PENDING, de forma atómica (sin leer y reescribir el body).
 * El UPDATE crudo no dispara @updatedAt: por eso va explícito. Devuelve las filas afectadas.
 */
async function appendToInquiry(id: string, patientId: string, text: string, at: Date): Promise<number> {
  return prisma.$executeRaw`
    UPDATE "PatientInquiry"
    SET "body" = "body" || ${"\n" + text}, "lastMessageAt" = ${at}, "updatedAt" = ${new Date()}
    WHERE "id" = ${id} AND "patientId" = ${patientId} AND "status" = 'PENDING'::"InquiryStatus"`;
}

async function appendAndLoad(
  id: string,
  patientId: string,
  text: string,
  at: Date,
): Promise<PatientInquiry | null> {
  const affected = await appendToInquiry(id, patientId, text, at);
  if (affected === 0) return null;
  return prisma.patientInquiry.findUnique({ where: { id } });
}

/**
 * BOT. Registra un mensaje de consulta.
 * 1. Si `inquiryId` (de la sesión) apunta a una consulta PENDING del mismo paciente → la agrega.
 * 2. Si no, y `afterHours` → busca la consulta PENDING más reciente del paciente con
 *    receivedAfterHours=true y digestedAt=null (es "la de esta noche", D7) → la agrega.
 * 3. Si no → crea una nueva.
 * Si el UPDATE afecta 0 filas (la marcaron respondida en el medio), sigue con el paso 2/3.
 * `text` se recorta (trim) y se corta a INQUIRY_MESSAGE_MAX. Texto vacío → lanza Error.
 */
export async function recordInquiryMessage(params: {
  patientId: string;
  text: string;
  at: Date;
  afterHours: boolean;
  inquiryId?: string | null;
}): Promise<{ inquiry: PatientInquiry; created: boolean }> {
  const text = params.text.trim().slice(0, INQUIRY_MESSAGE_MAX);
  if (!text) throw new Error("recordInquiryMessage: el texto de la consulta está vacío");
  const { patientId, at, afterHours } = params;

  // 1. La consulta de esta sesión.
  if (params.inquiryId) {
    const inquiry = await appendAndLoad(params.inquiryId, patientId, text, at);
    if (inquiry) return { inquiry, created: false };
  }

  // 2. La consulta nocturna sin resumir de este paciente (misma noche, sesión nueva).
  if (afterHours) {
    const tonight = await prisma.patientInquiry.findFirst({
      where: { patientId, status: "PENDING", receivedAfterHours: true, digestedAt: null },
      orderBy: { receivedAt: "desc" },
    });
    if (tonight) {
      const inquiry = await appendAndLoad(tonight.id, patientId, text, at);
      if (inquiry) return { inquiry, created: false };
    }
  }

  // 3. Consulta nueva.
  const inquiry = await prisma.patientInquiry.create({
    data: { patientId, body: text, receivedAt: at, lastMessageAt: at, receivedAfterHours: afterHours },
  });
  return { inquiry, created: true };
}

/** WEB. Fila de la lista de /mensajes. */
export type InquiryListItem = {
  id: string;
  status: InquiryStatus;
  body: string;
  receivedAt: Date;
  lastMessageAt: Date;
  receivedAfterHours: boolean;
  answeredAt: Date | null;
  patient: { id: string; name: string | null; phone: string };
};

const LIST_SELECT = {
  id: true,
  status: true,
  body: true,
  receivedAt: true,
  lastMessageAt: true,
  receivedAfterHours: true,
  answeredAt: true,
  patient: { select: { id: true, name: true, phone: true } },
} as const;

/**
 * WEB. Todas las PENDING + las últimas `answeredLimit` ANSWERED (por answeredAt desc), devueltas
 * juntas ordenadas por receivedAt ASC (de la más vieja a la más nueva).
 */
export async function listInquiries(opts: { answeredLimit?: number } = {}): Promise<InquiryListItem[]> {
  const answeredLimit = opts.answeredLimit ?? 100;
  const [pending, answered] = await Promise.all([
    prisma.patientInquiry.findMany({
      where: { status: "PENDING" },
      select: LIST_SELECT,
      orderBy: { receivedAt: "asc" },
    }),
    prisma.patientInquiry.findMany({
      where: { status: "ANSWERED" },
      select: LIST_SELECT,
      orderBy: { answeredAt: "desc" },
      take: answeredLimit,
    }),
  ]);
  return [...pending, ...answered].sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime());
}

/** WEB. Conteo por estado (para los chips del filtro). */
export async function countInquiriesByStatus(): Promise<{ PENDING: number; ANSWERED: number }> {
  const groups = await prisma.patientInquiry.groupBy({ by: ["status"], _count: { _all: true } });
  const out = { PENDING: 0, ANSWERED: 0 };
  for (const g of groups) out[g.status] = g._count._all;
  return out;
}

/** WEB (shell). Cantidad de PENDING. */
export async function countPendingInquiries(): Promise<number> {
  return prisma.patientInquiry.count({ where: { status: "PENDING" } });
}

/** WEB. Marca como respondida (status ANSWERED, answeredAt = at). Idempotente. */
export async function markInquiryAnswered(
  id: string,
  at: Date = new Date(),
): Promise<"answered" | "already_answered" | "not_found"> {
  const { count } = await prisma.patientInquiry.updateMany({
    where: { id, status: "PENDING" },
    data: { status: "ANSWERED", answeredAt: at },
  });
  if (count > 0) return "answered";
  const existing = await prisma.patientInquiry.findUnique({ where: { id }, select: { id: true } });
  return existing ? "already_answered" : "not_found";
}

/**
 * BOT (cron cada minuto + runStartupJobs). Resumen de fin de franja, idempotente.
 * Fuera de la franja, junta las consultas nocturnas sin resumir y, en una transacción, encola
 * UN `PROFESSIONAL_ALERT` (si hay destino) y las marca con `digestedAt`.
 * `scope`, `config` y `alertJid` son SOLO para el script de prueba.
 */
export async function enqueueAfterHoursDigest(
  opts: {
    now?: Date;
    scope?: { patientIds: string[] };
    config?: AfterHoursConfig;
    alertJid?: string | null;
  } = {},
): Promise<{ digested: number; outboundId: string | null }> {
  const pro = await getProfessional();
  const config = opts.config ?? afterHoursConfigFrom(pro);
  const now = opts.now ?? new Date();

  if (isWithinAfterHours(now, config, pro.timezone)) return { digested: 0, outboundId: null };

  return prisma.$transaction(async (tx) => {
    const rows = await tx.patientInquiry.findMany({
      where: {
        status: "PENDING",
        receivedAfterHours: true,
        digestedAt: null,
        receivedAt: { lte: now },
        ...(opts.scope ? { patientId: { in: opts.scope.patientIds } } : {}),
      },
      include: { patient: { select: { name: true, phone: true } } },
      orderBy: { receivedAt: "asc" },
    });
    if (rows.length === 0) return { digested: 0, outboundId: null };

    const alertJid = opts.alertJid !== undefined ? opts.alertJid : pro.phoneJid;
    let outboundId: string | null = null;
    if (alertJid) {
      const outbound = await tx.outboundMessage.create({
        data: {
          toJid: alertJid,
          kind: "PROFESSIONAL_ALERT",
          body: messages.afterHoursDigest({
            items: rows.map((r) => ({
              patientName: r.patient.name,
              patientPhone: r.patient.phone,
              receivedAt: r.receivedAt,
            })),
            tz: pro.timezone,
          }),
        },
      });
      outboundId = outbound.id;
    }

    const ids = rows.map((r) => r.id);
    const { count } = await tx.patientInquiry.updateMany({
      where: { id: { in: ids }, digestedAt: null },
      data: { digestedAt: now },
    });
    if (count !== ids.length) {
      // Otra corrida concurrente ya resumió alguna: se revierte (incluido el outbound).
      throw new Error(`enqueueAfterHoursDigest: se esperaban ${ids.length} consultas, se marcaron ${count}`);
    }
    return { digested: ids.length, outboundId };
  });
}
