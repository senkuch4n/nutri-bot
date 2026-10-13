// HU-017b-3 (SDD 4.1 de 017b-3, D13/D15). Textos de la cola de mensajes del bot y del comunicado, en
// castellano simple. Lo que se encola (el texto que le llega al paciente) no cambia (T4).
import { formatPhone } from "./phone-format";
import { HIDDEN_NUMBER_TEXT, classifyWhatsappJid, isPersonJid } from "./whatsapp-contact";

export type MessageKindLike =
  | "CONFIRMATION"
  | "CONFIRMATION_REQUEST"
  | "CANCELLATION"
  | "REMINDER"
  | "PREP_INSTRUCTIONS"
  | "PAYMENT_LINK"
  | "PLAN_PDF"
  | "ANTHROPOMETRIC_REPORT_PDF"
  | "PROFESSIONAL_ALERT"
  | "AD_HOC";

/** Tabla de la HU §4.6, exacta. */
export const MESSAGE_KIND_TEXT: Record<MessageKindLike, string> = {
  CONFIRMATION: "Confirmación de turno",
  CONFIRMATION_REQUEST: "Pedido de confirmación",
  CANCELLATION: "Cancelación de turno",
  REMINDER: "Recordatorio de turno",
  PREP_INSTRUCTIONS: "Recomendaciones antes del turno",
  PAYMENT_LINK: "Link de pago de la seña",
  PLAN_PDF: "Plan de alimentación (PDF)",
  ANTHROPOMETRIC_REPORT_PDF: "Informe antropométrico (PDF)",
  PROFESSIONAL_ALERT: "Aviso para vos",
  AD_HOC: "Comunicado",
};

export const OUTBOX_STATUS_TEXT = {
  PENDING: "Por enviar",
  SENT: "Enviado",
  FAILED: "No se envió",
} as const;

/** "549351…@s.whatsapp.net:12" → "549351…" (sin dispositivo ni sufijo, en minúscula). */
function jidUser(jid: string): string {
  return jid.trim().toLowerCase().split("@")[0]!.split(":")[0]!;
}

function sameJid(a: string, b: string): boolean {
  const suffix = (j: string) => j.trim().toLowerCase().split("@")[1] ?? "";
  return jidUser(a) === jidUser(b) && suffix(a) === suffix(b);
}

/** "Vos" si toJid === professionalJid; si no, nombre del paciente; si no, formatPhone (phone) o
 *  HIDDEN_NUMBER_TEXT (contactos sin número visible: `@lid`, canales, grupos). */
export function outboxRecipientLabel(m: {
  toJid: string;
  patientName: string | null;
  professionalJid: string | null;
}): string {
  if (m.professionalJid && sameJid(m.toJid, m.professionalJid)) return OUTBOX_TEXT.you;
  const name = m.patientName?.trim();
  if (name) return name;
  if (classifyWhatsappJid(m.toJid) !== "phone") return HIDDEN_NUMBER_TEXT;
  const digits = jidUser(m.toJid).replace(/\D/g, "");
  return digits ? formatPhone(digits) : HIDDEN_NUMBER_TEXT;
}

/** Destinatarios del comunicado: solo isPersonJid, sin repetidos, en el orden de entrada. (D13) */
export function broadcastRecipients(jids: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const jid of jids) {
    if (!isPersonJid(jid)) continue;
    const key = jid.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(jid);
  }
  return out;
}

function pacientes(n: number): string {
  return n === 1 ? "1 paciente" : `${n} pacientes`;
}

export const OUTBOX_TEXT = {
  // Comunicado
  broadcastTitle: "Mandar un aviso a todas tus pacientes",
  placeholder: "Ej: La semana que viene estoy de vacaciones, retomo el lunes 22.",
  fieldLabel: "Texto del aviso",
  reach: (n: number) => `Le llega a ${pacientes(n)} por WhatsApp`,
  noRecipients: "Todavía no hay pacientes con WhatsApp para mandarles el aviso.",
  review: "Revisar y enviar",
  previewTitle: "Así le llega a tus pacientes",
  backToEdit: "Volver a editar",
  send: (n: number) => `Enviar a ${pacientes(n)}`,
  scheduled: (n: number) => `Comunicado listo para enviar a ${pacientes(n)}`,
  undone: "Listo, no se mandó",
  committed: (n: number) => `Comunicado en camino a ${pacientes(n)}`,
  error: "No se pudo mandar el comunicado. Probá de nuevo.",
  emptyBody: "Escribí el aviso antes de revisarlo.",
  // Cola
  queueTitle: "Mensajes que mandó el bot",
  live: "Se actualiza sola",
  paused: "Pausada",
  pause: "Pausar",
  resume: "Reanudar",
  refresh: "Actualizar ahora",
  pendingCount: (n: number) => (n === 1 ? "1 por enviar" : `${n} por enviar`),
  filterAll: "Todos",
  filterPending: "Por enviar",
  filterSent: "Enviados",
  filterFailed: "No se enviaron",
  you: "Vos",
  notSent: "No se pudo enviar.",
  seeDetail: "Ver detalle",
  hideDetail: "Ocultar detalle",
  retry: "Reintentar",
  retrying: "Reintentando…",
  retryAll: (n: number) => (n === 1 ? "Reintentar el mensaje" : `Reintentar los ${n}`),
  retryAllTitle: (n: number) => (n === 1 ? "¿Reintentar 1 mensaje?" : `¿Reintentar los ${n} mensajes?`),
  retryDescription: "Se vuelven a mandar por WhatsApp.",
  emptyQueue: "Todavía no hay mensajes",
  emptyQueueDescription: "Acá aparecen las confirmaciones, los recordatorios y los avisos que manda el bot.",
  emptyFilter: "No hay mensajes en este filtro.",
} as const;
