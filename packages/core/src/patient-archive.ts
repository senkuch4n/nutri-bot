// HU-019 (SDD 5.3). Archivar pacientes: formato de fechas y textos del panel. Ningún texto de
// WhatsApp vive acá: archivar no le manda nada a la paciente.
import { es as esLocale } from "date-fns/locale";
import { firstName } from "./agenda";
import { dayKeyInTz, formatInTimeZone } from "./time";

/** "24/10/2026" en tz. */
export function formatArchivedDate(instant: Date, tz: string): string {
  return formatInTimeZone(instant, tz, "dd/MM/yyyy");
}

/** "jueves 30/10 a las 10:00" (otro año que now: "jueves 30/10/2027 a las 10:00"), en tz, minúscula. */
export function formatPendingAppointment(startsAt: Date, now: Date, tz: string): string {
  const sameYear = dayKeyInTz(startsAt, tz).slice(0, 4) === dayKeyInTz(now, tz).slice(0, 4);
  const pattern = sameYear ? "EEEE dd/MM 'a las' HH:mm" : "EEEE dd/MM/yyyy 'a las' HH:mm";
  return formatInTimeZone(startsAt, tz, pattern, { locale: esLocale }).toLocaleLowerCase("es");
}

/** Texto del aviso de turno pendiente (D3):
 *  name con valor, moreCount 0: "Ana tiene un turno el jueves 30/10 a las 10:00. Cancelalo antes de archivarla."
 *  name con valor, moreCount n≥1: "Ana tiene un turno el jueves 30/10 a las 10:00 y n más. Cancelalos antes de archivarla."
 *  name null: "Este contacto tiene un turno el … Cancelalo antes de archivarlo." (y "… y n más. Cancelalos antes de archivarlo.")
 *  "Ana" = firstName(name) de agenda.ts. */
export function archiveBlockedText(p: {
  name: string | null;
  startsAt: Date;
  moreCount: number;
  now: Date;
  tz: string;
}): string {
  const first = firstName(p.name);
  const subject = first ?? "Este contacto";
  const when = formatPendingAppointment(p.startsAt, p.now, p.tz);
  const more = p.moreCount > 0 ? ` y ${p.moreCount} más` : "";
  const cancel = p.moreCount > 0 ? "Cancelalos" : "Cancelalo";
  const archive = first ? "archivarla" : "archivarlo";
  return `${subject} tiene un turno el ${when}${more}. ${cancel} antes de ${archive}.`;
}

const CONFIRM_DESCRIPTION =
  "Deja de aparecer en tu lista, en \"Nuevo turno\" y en los comunicados. No se borra nada: la encontrás en \"Archivadas\" y la podés desarchivar cuando quieras.";

export const PATIENT_ARCHIVE_TEXT = {
  menuArchive: "Archivar paciente",
  menuUnarchive: "Desarchivar",
  archivedBadge: "Archivado",
  confirmTitle: (name: string | null) => (name ? `¿Archivar a ${name}?` : "¿Archivar este contacto?"),
  confirmDescription: CONFIRM_DESCRIPTION,
  /** Sin nombre: el contacto (phoneLabel ?? HIDDEN_NUMBER_TEXT) + ". " + el mismo texto de confirmDescription. */
  confirmDescriptionUnnamed: (contactLabel: string) => `${contactLabel}. ${CONFIRM_DESCRIPTION}`,
  confirmLabel: "Archivar",
  cancel: "Cancelar",
  archived: (name: string | null) => (name ? `${name} quedó archivada` : "El contacto quedó archivado"),
  unarchived: (name: string | null) =>
    name ? `${name} volvió a tu lista de pacientes` : "El contacto volvió a tu lista de pacientes",
  blockedTitle: "Tiene un turno pendiente",
  seeAppointments: "Ver turnos",
  close: "Cerrar",
  archiveError: "No se pudo archivar. Probá de nuevo.",
  unarchiveError: "No se pudo desarchivar. Probá de nuevo.",
  banner: (dateLabel: string) =>
    `Paciente archivada el ${dateLabel}. No aparece en tu lista ni recibe comunicados.`,
  unarchiveButton: "Desarchivar",
  archivedSection: (n: number) => `Archivadas (${n})`,
  archivedTitle: "Archivadas",
  backToPatients: "Volver a pacientes",
  archivedOn: (dateLabel: string) => `Archivada el ${dateLabel}`,
  archivedEmpty: "No tenés pacientes archivadas.",
  archivedSearchLabel: "Buscar entre las archivadas por nombre o teléfono",
  archivedSearchPlaceholder: "Buscá entre las archivadas",
  phoneTakenArchived: (label: string) => `Ese número es de ${label}, que está archivada.`,
  unarchiveAndOpen: "Desarchivar y abrir su ficha",
} as const;
