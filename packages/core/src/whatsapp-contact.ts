// HU-017c-1 (SDD 4.1). Clasificación de un JID de WhatsApp por su sufijo: persona con número visible,
// persona con el número oculto (@lid) o algo que no es una persona (grupo, canal, difusión).

export type WhatsappContactKind = "phone" | "hidden" | "not_person";

const PHONE_SUFFIXES = ["@s.whatsapp.net", "@c.us"];
const NOT_PERSON_SUFFIXES = ["@g.us", "@newsletter", "@broadcast"];

/** Clasifica un JID por su sufijo (sin distinguir mayúsculas):
 *  "@s.whatsapp.net" y "@c.us" → "phone";
 *  "@lid" → "hidden" (WhatsApp oculta el número);
 *  "@g.us", "@newsletter", "@broadcast" (incluye "status@broadcast") → "not_person";
 *  sin "@" o con un sufijo desconocido → "hidden" (se muestra, pero sin número ni enlace:
 *  esconder a una persona real sería peor que mostrar un contacto raro). */
export function classifyWhatsappJid(jid: string): WhatsappContactKind {
  const lower = jid.trim().toLowerCase();
  if (PHONE_SUFFIXES.some((s) => lower.endsWith(s))) return "phone";
  if (NOT_PERSON_SUFFIXES.some((s) => lower.endsWith(s))) return "not_person";
  return "hidden";
}

/** true salvo "not_person". */
export function isPersonJid(jid: string): boolean {
  return classifyWhatsappJid(jid) !== "not_person";
}

/** "https://wa.me/<dígitos de phone>" solo si el JID es "phone" y `phone` tiene dígitos; si no, null. */
export function whatsappChatUrl(contact: { whatsappJid: string; phone: string }): string | null {
  if (classifyWhatsappJid(contact.whatsappJid) !== "phone") return null;
  const digits = contact.phone.replace(/\D/g, "");
  return digits ? `https://wa.me/${digits}` : null;
}

/** Texto exacto para los "hidden". */
export const HIDDEN_NUMBER_TEXT = "WhatsApp no muestra el número";
