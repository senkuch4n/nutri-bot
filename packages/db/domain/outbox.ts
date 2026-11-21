import { prisma, Prisma, type MessageKind } from "../index";

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
 * La restricción única (appointmentId, kind, dedupeKey) evita duplicados cuando
 * el mensaje está ligado a un turno. Devuelve true si creó la fila; false si ya
 * existía. En una transacción se omite el duplicado sin abortar la transacción.
 */
export async function enqueueMessage(params: {
  toJid: string;
  body: string;
  /** HU-014. Default "" (lo de siempre para todo lo que no es un recordatorio). */
  dedupeKey?: string;
} & (
  | { kind: MessageKind; appointmentId?: string | null; verifiedTenantId?: never }
  // Solo para alertas internas sin turno: el productor debe haber verificado el dueño.
  | { kind: "PROFESSIONAL_ALERT"; appointmentId?: null; verifiedTenantId: string }
), tx?: Prisma.TransactionClient): Promise<boolean> {
  const data = {
    toJid: params.toJid,
    body: params.body,
    kind: params.kind,
    ...(params.verifiedTenantId !== undefined ? { tenantId: params.verifiedTenantId } : {}),
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
