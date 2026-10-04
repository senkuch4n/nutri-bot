// HU-017c-4 (HU §4.5, SDD 4.4): textos y reglas del editor del informe que son solo del panel.
// ISAK_REPORT_TEXT no cambia (sale en el PDF y en el caption de WhatsApp, D11b). Puro, con test.
import { classifyWhatsappJid, formatPhone } from "@nutri-bot/core";

export const REPORT_EDITOR_TEXT = {
  help: "Revisá los textos antes de generar el PDF.",
  issuesTitle: "Antes de enviar",
  stale: "El estudio cambió después del último PDF",
  regenerate: "Generar de nuevo",
  missingData: "Faltan medidas en el estudio: el PDF va a decir «Sin dato»",
  completeStudy: "Completar estudio",
  goToSettings: "Ir a Ajustes",
  edited: "Editado",
  restore: "Restaurar el texto original",
  restoreTitle: "¿Restaurar el texto original?",
  restoreConfirm: "Restaurar",
  sendConfirm: "Enviar",
} as const;

export type ReportIssueKey = "stale" | "missingData" | "professional";

/** Texto exacto de la HU §4.5 (ronda 2: se volvió al texto validado en vez de las variantes). */
export function professionalIssueText(p: { licenseMissing: boolean; signatureMissing: boolean }): string | null {
  return p.licenseMissing || p.signatureMissing ? "Falta tu matrícula o tu firma" : null;
}

/** Filas del bloque "Antes de enviar", en el orden de la HU §4.5. Vacío → no se muestra el bloque. */
export function reportIssues(p: {
  stale: boolean;
  hasMissingData: boolean;
  licenseMissing: boolean;
  signatureMissing: boolean;
}): { key: ReportIssueKey; text: string }[] {
  const issues: { key: ReportIssueKey; text: string }[] = [];
  if (p.stale) issues.push({ key: "stale", text: REPORT_EDITOR_TEXT.stale });
  if (p.hasMissingData) issues.push({ key: "missingData", text: REPORT_EDITOR_TEXT.missingData });
  const professional = professionalIssueText(p);
  if (professional) issues.push({ key: "professional", text: professional });
  return issues;
}

/** Marca "Editado": el texto actual difiere del borrador automático. */
export function isEditedText(current: string, defaultText: string): boolean {
  return current !== defaultText;
}

/** Confirmación de "Enviar por WhatsApp" (SDD 4.4). Para "@lid" (u otro JID sin número), sin número. */
export function sendConfirmCopy(p: { patientName: string | null; whatsappJid: string; phone: string }): {
  title: string;
  description: string;
  /** A quién se le encoló, para el aviso posterior. */
  recipient: string;
} {
  const name = p.patientName?.trim() || null;
  const withNumber = classifyWhatsappJid(p.whatsappJid) === "phone" && p.phone.replace(/\D/g, "") !== "";
  const phone = withNumber ? formatPhone(p.phone) : null;
  return {
    title: name ? `¿Enviar el informe a ${name}?` : "¿Enviar el informe por WhatsApp?",
    description: phone ? `Le llega por WhatsApp al ${phone}.` : "Le llega por WhatsApp.",
    recipient: phone ?? name ?? "la paciente",
  };
}
