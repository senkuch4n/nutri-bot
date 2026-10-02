import "server-only";
import { prisma } from "@nutri-bot/db";
import { countPendingInquiries } from "@nutri-bot/db/domain";

export type BotShellStatus = "connected" | "paused" | "disconnected";

// El shell consulta prisma directo y tolera `null`: getProfessional() tira si falta la fila
// y dejaría el layout inutilizable.

export async function getProfessionalDisplayName(): Promise<string | null> {
  try {
    const pro = await prisma.professional.findUnique({ where: { id: 1 }, select: { name: true } });
    return pro?.name?.trim() || null;
  } catch {
    return null;
  }
}

/** Estado del bot para la sidebar. Si falta alguna fila → "disconnected". Nunca tira. */
export async function getBotShellStatus(): Promise<BotShellStatus> {
  try {
    const [pro, bot] = await Promise.all([
      prisma.professional.findUnique({ where: { id: 1 }, select: { botPaused: true } }),
      prisma.botStatus.findUnique({ where: { id: 1 }, select: { connected: true } }),
    ]);
    if (pro?.botPaused) return "paused";
    if (bot?.connected) return "connected";
    return "disconnected";
  } catch {
    return "disconnected";
  }
}

/** HU-011: consultas pendientes para el badge de "Mensajes" en la sidebar. Nunca tira: ante error, 0. */
export async function getPendingInquiryCount(): Promise<number> {
  try {
    return await countPendingInquiries();
  } catch {
    return 0;
  }
}
