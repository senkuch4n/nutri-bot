import { prisma, Prisma, type MessageKind } from "../index";

/**
 * Encola un mensaje saliente para que el proceso del bot lo envíe.
 * La restricción única (appointmentId, kind) evita duplicados cuando
 * el mensaje está ligado a un turno.
 */
export async function enqueueMessage(params: {
  toJid: string;
  body: string;
  kind: MessageKind;
  appointmentId?: string | null;
}): Promise<void> {
  try {
    await prisma.outboundMessage.create({
      data: {
        toJid: params.toJid,
        body: params.body,
        kind: params.kind,
        appointmentId: params.appointmentId ?? null,
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return;
    }
    throw err;
  }
}
