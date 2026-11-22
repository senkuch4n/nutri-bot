import { prisma, Prisma, type MessageKind } from "../index";
import type { TenantRef } from "./tenantScope";

export function outboxOwnershipWhere(tenantId: string): Prisma.OutboundMessageWhereInput {
  const appointment = { appointment: { tenantId } };
  const plan = { plan: { tenantId } };
  const report = { anthropometricReport: { tenantId } };

  return {
    OR: [
      { tenantId },
      // Without an explicit owner, at least one link must prove ownership and none may contradict it.
      {
        tenantId: null,
        AND: [
          { OR: [appointment, plan, report] },
          { OR: [{ appointmentId: null }, appointment] },
          { OR: [{ planId: null }, plan] },
          { OR: [{ anthropometricReportId: null }, report] },
        ],
      },
    ],
  };
}

/**
 * Encola un mensaje saliente para que el proceso del bot lo envíe.
 * HU-025: siempre escribe el `tenantId` del consultorio recibido; las FK compuestas
 * (appointmentId, tenantId) rechazan un turno de otro consultorio.
 * La restricción única (appointmentId, kind, dedupeKey) evita duplicados cuando
 * el mensaje está ligado a un turno. Devuelve true si creó la fila; false si ya
 * existía. En una transacción se omite el duplicado sin abortar la transacción.
 */
export async function enqueueMessage(t: TenantRef, params: {
  toJid: string;
  body: string;
  kind: MessageKind;
  appointmentId?: string | null;
  /** HU-014. Default "" (lo de siempre para todo lo que no es un recordatorio). */
  dedupeKey?: string;
}, tx?: Prisma.TransactionClient): Promise<boolean> {
  if (!t.tenantId) throw new Error("enqueueMessage: falta el consultorio");
  const data = {
    tenantId: t.tenantId,
    toJid: params.toJid,
    body: params.body,
    kind: params.kind,
    appointmentId: params.appointmentId ?? null,
    dedupeKey: params.dedupeKey ?? "",
  };
  if (tx) {
    // PostgreSQL aborta la transacción ante un INSERT que falla con P2002.
    const { count } = await tx.outboundMessage.createMany({ data: [data], skipDuplicates: true });
    return count === 1;
  }
  try {
    await prisma.outboundMessage.create({ data });
    return true;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return false;
    }
    throw err;
  }
}
