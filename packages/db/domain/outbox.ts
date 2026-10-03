import { prisma, Prisma, type MessageKind } from "../index";

/**
 * Encola un mensaje saliente para que el proceso del bot lo envíe.
 * La restricción única (appointmentId, kind, dedupeKey) evita duplicados cuando
 * el mensaje está ligado a un turno. Devuelve true si creó la fila; false si ya
 * existía (P2002).
 */
export async function enqueueMessage(params: {
  toJid: string;
  body: string;
  kind: MessageKind;
  appointmentId?: string | null;
  /** HU-014. Default "" (lo de siempre para todo lo que no es un recordatorio). */
  dedupeKey?: string;
}): Promise<boolean> {
  try {
    await prisma.outboundMessage.create({
      data: {
        toJid: params.toJid,
        body: params.body,
        kind: params.kind,
        appointmentId: params.appointmentId ?? null,
        dedupeKey: params.dedupeKey ?? "",
      },
    });
    return true;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return false;
    }
    throw err;
  }
}
