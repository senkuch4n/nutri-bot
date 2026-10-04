// HU-017c-1 (SDD 4.4). Directorio de pacientes del panel: arma las filas de la lista (con nombre y
// "Por completar"), descarta grupos/canales/difusiones y resuelve la búsqueda sin tildes ni formato.
import { formatPhone } from "./phone-format";
import { formatAppointmentWhen, formatTimeAgo } from "./relative-date";
import { normalize } from "./wake";
import { classifyWhatsappJid } from "./whatsapp-contact";

export interface PatientDirectoryInput {
  id: string;
  name: string | null;
  phone: string;
  whatsappJid: string;
  createdAt: Date;
  /** Próximo turno CONFIRMED o AWAITING_PAYMENT con startsAt >= now (el más cercano), o null. */
  nextAppointment: { startsAt: Date; status: "CONFIRMED" | "AWAITING_PAYMENT" } | null;
  /** consultedAt de la consulta más reciente, o null. */
  lastConsultationAt: Date | null;
  /** ConversationState.updatedAt del JID, o null si no hay fila. */
  lastContactAt: Date | null;
}

export interface PatientDirectoryRow {
  id: string;
  /** Nombre recortado (trim); null si no tiene o es solo espacios. */
  name: string | null;
  contactKind: "phone" | "hidden";
  /** formatPhone(phone) si contactKind = "phone"; null si "hidden". */
  phoneLabel: string | null;
  /** Solo dígitos de phone si "phone"; null si "hidden" (los dígitos de un @lid no se buscan). */
  phoneDigits: string | null;
  /** normalize(name ?? ""), para buscar. */
  searchName: string;
  /** Solo filas con nombre (en las sin nombre, ""). */
  statusLine: string;
  /** Solo filas sin nombre (en las con nombre, ""): "escribió " + formatTimeAgo(lastContactAt ?? createdAt). */
  lastContactLabel: string;
}

export interface PatientDirectory {
  /** Con nombre, orden alfabético es (Intl.Collator, sensitivity "base", numeric); empate por id. */
  named: PatientDirectoryRow[];
  /** Sin nombre, del contacto más reciente al más viejo (lastContactAt ?? createdAt, desc). */
  unnamed: PatientDirectoryRow[];
}

const collator = new Intl.Collator("es", { sensitivity: "base", numeric: true });

function statusLineFor(p: PatientDirectoryInput, now: Date, tz: string): string {
  if (p.nextAppointment) {
    const when = formatAppointmentWhen(p.nextAppointment.startsAt, now, tz);
    return p.nextAppointment.status === "AWAITING_PAYMENT" ? `${when} · Falta la seña` : when;
  }
  if (p.lastConsultationAt) return `Sin turno · Última consulta ${formatTimeAgo(p.lastConsultationAt, now, tz)}`;
  if (p.lastContactAt) return `Sin turno · Te escribió ${formatTimeAgo(p.lastContactAt, now, tz)}`;
  return "Sin turno";
}

const lastSeen = (p: PatientDirectoryInput) => (p.lastContactAt ?? p.createdAt).getTime();
const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Descarta los "not_person" y arma las filas.
 *  statusLine:
 *   - con próximo turno: formatAppointmentWhen(...) y, si AWAITING_PAYMENT, + " · Falta la seña";
 *   - sin turno y con consulta: "Sin turno · Última consulta " + formatTimeAgo(lastConsultationAt);
 *   - sin turno, sin consulta y con lastContactAt: "Sin turno · Te escribió " + formatTimeAgo(lastContactAt);
 *   - si no: "Sin turno". Nunca "—". */
export function buildPatientDirectory(
  input: readonly PatientDirectoryInput[],
  now: Date,
  tz: string,
): PatientDirectory {
  const named: { row: PatientDirectoryRow }[] = [];
  const unnamed: { row: PatientDirectoryRow; seen: number }[] = [];

  for (const p of input) {
    const kind = classifyWhatsappJid(p.whatsappJid);
    if (kind === "not_person") continue;
    const name = p.name?.trim() || null;
    const base = {
      id: p.id,
      name,
      contactKind: kind,
      phoneLabel: kind === "phone" ? formatPhone(p.phone) : null,
      phoneDigits: kind === "phone" ? p.phone.replace(/\D/g, "") : null,
      searchName: normalize(name ?? ""),
    } as const;
    if (name) {
      named.push({ row: { ...base, statusLine: statusLineFor(p, now, tz), lastContactLabel: "" } });
    } else {
      unnamed.push({
        row: {
          ...base,
          statusLine: "",
          lastContactLabel: `escribió ${formatTimeAgo(p.lastContactAt ?? p.createdAt, now, tz)}`,
        },
        seen: lastSeen(p),
      });
    }
  }

  named.sort((a, b) => collator.compare(a.row.name ?? "", b.row.name ?? "") || byId(a.row, b.row));
  unnamed.sort((a, b) => b.seen - a.seen || byId(a.row, b.row));
  return { named: named.map((x) => x.row), unnamed: unnamed.map((x) => x.row) };
}

const PHONE_ONLY = /^[\d\s+\-().]*$/;

/** ¿La fila coincide con lo que se escribió? Vacío o solo espacios → true.
 *  - Sin letras (solo dígitos, espacios, "+", "-", "(", ")", "."): se juntan los dígitos; si empiezan
 *    con "0", se prueba también sin ese 0. Coincide si phoneDigits los contiene. Con phoneDigits null → false.
 *  - Con letras: se parte en palabras (normalize + espacios). Cada palabra con letras tiene que estar en
 *    searchName; cada palabra solo de dígitos, en phoneDigits. Todas tienen que coincidir, en cualquier orden. */
export function matchesPatientQuery(
  row: Pick<PatientDirectoryRow, "searchName" | "phoneDigits">,
  query: string,
): boolean {
  const trimmed = query.trim();
  if (!trimmed) return true;

  if (PHONE_ONLY.test(trimmed)) {
    const digits = trimmed.replace(/\D/g, "");
    if (!digits) return true;
    if (row.phoneDigits === null) return false;
    const candidates = digits.startsWith("0") && digits.length > 1 ? [digits, digits.slice(1)] : [digits];
    return candidates.some((c) => row.phoneDigits!.includes(c));
  }

  const words = normalize(trimmed).split(/\s+/).filter(Boolean);
  return words.every((word) => {
    const bare = word.replace(/[^\p{L}\p{N}]/gu, "");
    if (!bare) return true; // solo signos: no filtra
    if (/^\d+$/.test(bare)) return row.phoneDigits !== null && row.phoneDigits.includes(bare);
    return row.searchName.includes(word) || row.searchName.includes(bare);
  });
}

/** "12 pacientes", "1 paciente"; buscando: "3 de 12". */
export function patientCountLabel(shown: number, total: number, searching: boolean): string {
  if (searching) return `${shown} de ${total}`;
  return shown === 1 ? "1 paciente" : `${shown} pacientes`;
}

export const PATIENT_DIRECTORY_TEXT = {
  title: "Pacientes",
  searchLabel: "Buscar pacientes por nombre o teléfono",
  searchPlaceholder: "Buscá por nombre o teléfono",
  clearSearch: "Borrar búsqueda",
  emptyTitle: "Todavía no hay pacientes",
  emptyDescription: "Aparecen acá cuando alguien te escribe por WhatsApp o cuando cargás un turno.",
  noResultsTitle: (q: string) => `No encontramos a «${q}»`,
  noResultsDescription: "Probá con otra parte del nombre o con el teléfono.",
  incompleteTitle: (n: number) => `Por completar (${n})`,
  incompleteDescription: "Contactos que te escribieron y todavía no tienen nombre.",
  unnamedLabel: "Sin nombre",
  setName: "Poner nombre",
  setNameTitle: "Poner nombre",
  setNameField: "Nombre y apellido",
  save: "Guardar",
  cancel: "Cancelar",
  setNameDone: (name: string) => `Listo, ${name} ya está en tus pacientes`,
  nameRequired: "Escribí el nombre",
  nameTooLong: "El nombre puede tener hasta 120 caracteres",
  saveError: "No se pudo guardar. Probá de nuevo.",
} as const;
