import "server-only";
import { portalDocumentTitle, professionalDisplayName, professionalWhatsappUrl } from "@nutri-bot/core";
import { prisma } from "@nutri-bot/db";
import { countPendingInquiries, findTenantProfessionalSummary } from "@nutri-bot/db/domain";

export type BotShellStatus = "connected" | "paused" | "disconnected";

// El shell tolera `null`: si falta la fila, el layout tiene que seguir usable.
// HU-025: las funciones del panel reciben el tenant del contexto; las del portal, el de la sesión del portal (025c).

/** Nombre de la profesional de la agenda principal del consultorio. Nunca tira. */
export async function getProfessionalDisplayName(tenantId: string): Promise<string | null> {
  const pro = await findTenantProfessionalSummary(tenantId);
  return pro?.name?.trim() || null;
}

/** HU-017d-1 (D7, D8): nombre del portal y link de WhatsApp de la profesional del consultorio para la pantalla
 *  de acceso y el header del portal. HU-033 (025c): recibe el consultorio (el de la sesión del portal o, sin
 *  sesión, el de la instalación de WhatsApp). Nunca tira (ante error → { name: null, whatsappUrl: null }). */
export async function getProfessionalPortalContact(
  tenantId: string,
): Promise<{ name: string | null; whatsappUrl: string | null }> {
  try {
    const pro = await findTenantProfessionalSummary(tenantId);
    if (!pro) return { name: null, whatsappUrl: null };
    return {
      name: pro.name?.trim() ? professionalDisplayName(pro) : null,
      whatsappUrl: professionalWhatsappUrl(pro.phoneJid),
    };
  } catch {
    return { name: null, whatsappUrl: null };
  }
}

/** HU-017d-1: título de la pestaña del portal ("Tu espacio — Lic. Daiana Ponce"), del consultorio pedido. Nunca tira. */
export async function getPortalDocumentTitle(tenantId: string): Promise<string> {
  try {
    const pro = await findTenantProfessionalSummary(tenantId);
    return portalDocumentTitle(pro ?? { title: null, name: "" });
  } catch {
    return portalDocumentTitle({ title: null, name: "" });
  }
}

/** Estado del bot del consultorio para la sidebar. Si falta alguna fila → "disconnected". Nunca tira. */
export async function getBotShellStatus(tenantId: string): Promise<BotShellStatus> {
  try {
    const [pro, bot] = await Promise.all([
      findTenantProfessionalSummary(tenantId),
      prisma.botStatus.findUnique({ where: { tenantId }, select: { connected: true } }),
    ]);
    if (pro?.botPaused) return "paused";
    if (bot?.connected) return "connected";
    return "disconnected";
  } catch {
    return "disconnected";
  }
}

/** HU-011: consultas pendientes para el badge de "Mensajes" en la sidebar. Nunca tira: ante error, 0. */
export async function getPendingInquiryCount(tenantId: string): Promise<number> {
  try {
    return await countPendingInquiries({ tenantId });
  } catch {
    return 0;
  }
}
