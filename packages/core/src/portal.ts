// HU-017d-1 (SDD 4.1). Portal del paciente: textos, saludo, firma, WhatsApp de la profesional, conteo
// del diario, menor de edad, peso, altura e historial. Lógica pura: sin base ni red, y siempre en la zona
// horaria que se pasa (Professional.timezone), nunca en la del proceso.
import { es as esLocale } from "date-fns/locale";
import { firstName } from "./agenda";
import type { WeightPoint } from "./patient-summary";
import { professionalSignature, type ProfessionalIdentity } from "./professional-identity";
import { formatTimeAgo } from "./relative-date";
import { dayKeyInTz, formatInTimeZone, wallTimeToUtc } from "./time";
import { classifyWhatsappJid } from "./whatsapp-contact";

/** Textos exactos del portal (HU §2 y §4). */
export const PORTAL_TEXT = {
  // Acceso (D8)
  noLinkTitle: "Para entrar necesitás un link",
  noLinkBody: "Escribile portal a tu nutricionista por WhatsApp y te mandamos uno.", // "portal" va en <strong>
  expiredTitle: "Este link ya venció",
  expiredBody: "Por seguridad, cada link dura 15 minutos. Escribí portal por WhatsApp y te mandamos uno nuevo.",
  writeWhatsapp: "Escribir por WhatsApp",
  // Inicio
  nextAppointmentLabel: "Tu próximo turno",
  awaitingDeposit: "Falta pagar la seña para confirmarlo",
  noAppointmentsTitle: "No tenés turnos próximos.",
  noAppointmentsBody: "Escribile a tu nutricionista por WhatsApp para sacar uno.",
  planTitle: "Tu plan",
  planHint: "Mirá qué comer hoy",
  noPlan: "Todavía no tenés un plan.",
  diaryTitle: "Tu diario",
  diaryQuestion: "¿Qué comiste hoy?",
  addMeal: "Anotar comida",
  evolutionTitle: "Tu evolución",
  lastWeightLabel: "Tu último peso",
  noWeightYet: "Cuando tu nutricionista te pese, lo vas a ver acá.",
  insurancesTitle: "Obras sociales que atiende",
  logout: "Salir del portal",
  logoutConfirmTitle: "¿Salir del portal?",
  logoutConfirmBody: "Para volver a entrar vas a tener que pedir un link nuevo por WhatsApp.",
  logoutConfirm: "Salir",
  logoutCancel: "Cancelar",
  // Evolución
  weightLabel: "Peso",
  heightLabel: "Altura",
  chartSingle: "Cuando haya más registros, vas a ver cómo cambia.",
  historyTitle: "Historial",
  noRecordsTitle: "Todavía no hay registros",
  noRecordsBody: "Cuando tu nutricionista te pese, lo vas a ver acá.",
  // Errores (error.tsx)
  errorTitle: "Algo salió mal",
  errorBody: "No pudimos mostrar esta pantalla. Probá de nuevo.",
  retry: "Reintentar",
  backHome: "Volver al inicio",
} as const;

const kgFormat = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 });
const metersFormat = new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "Hola, María 👋" (firstName del nombre); sin nombre (null, "", espacios) → "Hola 👋". */
export function portalGreeting(patientName: string | null): string {
  const first = firstName(patientName);
  return first ? `Hola, ${first} 👋` : "Hola 👋";
}

function normalizeName(s: string): string {
  return s.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Q1: nombre vacío, o "Nutricionista" (el valor del seed) sin título. */
function isMissingProfessionalName(p: ProfessionalIdentity): boolean {
  if (p.name.trim() === "") return true;
  const noTitle = (p.title?.trim() ?? "") === "";
  return noTitle && normalizeName(p.name) === "nutricionista";
}

/** "Tu espacio con Lic. Daiana Ponce · M.P. 852" (professionalSignature, con matrícula como hoy).
 *  Sin nombre → "Tu espacio con tu nutricionista". "Sin nombre" = name vacío/espacios, o name igual a
 *  "Nutricionista" (sin distinguir mayúsculas ni tildes, con trim) y title vacío: el valor del seed (Q1). */
export function portalProfessionalLine(p: ProfessionalIdentity): string {
  if (isMissingProfessionalName(p)) return "Tu espacio con tu nutricionista";
  return `Tu espacio con ${professionalSignature(p)}`;
}

/** "https://wa.me/5493515552345" solo si phoneJid es de tipo "phone" (classifyWhatsappJid) y tiene
 *  dígitos. Los dígitos se toman antes de "@" y antes de ":" (sufijo de dispositivo "549…:12@s.whatsapp.net").
 *  null, "", "@lid", grupos y difusión → null (D7). */
export function professionalWhatsappUrl(phoneJid: string | null): string | null {
  if (!phoneJid || classifyWhatsappJid(phoneJid) !== "phone") return null;
  const user = phoneJid.trim().split("@")[0] ?? "";
  const digits = (user.split(":")[0] ?? "").replace(/\D/g, "");
  return digits ? `https://wa.me/${digits}` : null;
}

/** 0 → null; 1 → "Hoy anotaste 1 comida"; n → "Hoy anotaste n comidas" (D17). */
export function diaryTodayText(count: number): string | null {
  if (!Number.isFinite(count) || count <= 0) return null;
  return `Hoy anotaste ${count} ${count === 1 ? "comida" : "comidas"}`;
}

/** Instante UTC de las 00:00 de hoy en tz: wallTimeToUtc(dayKeyInTz(now, tz), "00:00", tz). */
export function startOfTodayInTz(now: Date, tz: string): Date {
  return wallTimeToUtc(dayKeyInTz(now, tz), "00:00", tz);
}

/** true si a la fecha de hoy en tz todavía no cumplió 18. birthDate es @db.Date (medianoche UTC): se
 *  lee con getUTCFullYear/getUTCMonth/getUTCDate y se compara con dayKeyInTz(now, tz). null → false (D3). */
export function isMinorOn(birthDate: Date | null, now: Date, tz: string): boolean {
  if (!birthDate || Number.isNaN(birthDate.getTime())) return false;
  const [ty, tm, td] = dayKeyInTz(now, tz).split("-").map(Number) as [number, number, number];
  const by = birthDate.getUTCFullYear();
  const bm = birthDate.getUTCMonth() + 1;
  const bd = birthDate.getUTCDate();
  const beforeBirthday = tm < bm || (tm === bm && td < bd);
  const age = ty - by - (beforeBirthday ? 1 : 0);
  return age < 18;
}

/** "12 de septiembre" en tz; si el año no es el de now (en tz): "12 de septiembre de 2025". */
export function formatPortalDate(instant: Date, now: Date, tz: string): string {
  const sameYear = formatInTimeZone(instant, tz, "yyyy") === formatInTimeZone(now, tz, "yyyy");
  const pattern = sameYear ? "d 'de' MMMM" : "d 'de' MMMM 'de' yyyy";
  return formatInTimeZone(instant, tz, pattern, { locale: esLocale });
}

/** "62,4 kg" (es-AR, hasta 1 decimal, espacio común antes de la unidad). */
export function formatWeightKg(kg: number): string {
  return `${kgFormat.format(Math.round(kg * 10) / 10)} kg`;
}

/** 132 → "1,32 m"; 165,5 → "1,66 m" (cm/100, exactamente 2 decimales, es-AR). */
export function formatHeightMeters(cm: number): string {
  return `${metersFormat.format(Math.round(cm) / 100)} m`;
}

export interface PortalWeightSummary {
  latestKg: number;
  /** "Último registro: hace 3 semanas" | "Último registro: hoy" | "Último registro: ayer" (formatTimeAgo). */
  latestAgoText: string;
  /** formatTimeAgo solo ("hace 3 semanas"), para la tarjeta del inicio. */
  latestAgo: string;
  /** Contra el peso anterior, redondeado a 1 decimal (D3):
   *  < 0 → "2 kg menos que el 3 de agosto"; > 0 → "1,2 kg más que el 3 de agosto";
   *  0 → "Igual que el 3 de agosto". Fecha con formatPortalDate. null si hay un solo peso o si
   *  hideChange (menores). */
  changeText: string | null;
}

/** null si ningún punto tiene peso. Ignora puntos sin peso; el orden de entrada no importa. */
export function portalWeightSummary(
  points: readonly WeightPoint[],
  now: Date,
  tz: string,
  opts: { hideChange: boolean },
): PortalWeightSummary | null {
  const withWeight = points
    .filter((p): p is { weightKg: number; recordedAt: Date } => p.weightKg != null && Number.isFinite(p.weightKg))
    .sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());
  const latest = withWeight.at(-1);
  if (!latest) return null;
  const previous = withWeight.length > 1 ? withWeight[withWeight.length - 2]! : null;
  const latestAgo = formatTimeAgo(latest.recordedAt, now, tz);
  let changeText: string | null = null;
  if (previous && !opts.hideChange) {
    const delta = Math.round((latest.weightKg - previous.weightKg) * 10) / 10;
    const since = formatPortalDate(previous.recordedAt, now, tz);
    if (delta === 0) changeText = `Igual que el ${since}`;
    else changeText = `${kgFormat.format(Math.abs(delta))} kg ${delta < 0 ? "menos" : "más"} que el ${since}`;
  }
  return { latestKg: latest.weightKg, latestAgoText: `Último registro: ${latestAgo}`, latestAgo, changeText };
}

export interface PortalHeightSummary {
  cm: number;
  /** "1,32 m" */
  text: string;
  /** "Medida hace 2 meses" | "Medida hoy" | "Medida ayer" */
  agoText: string;
}

/** La altura más reciente; null si no hay ninguna (D4). */
export function portalHeightSummary(
  points: readonly { heightCm: number | null; recordedAt: Date }[],
  now: Date,
  tz: string,
): PortalHeightSummary | null {
  let latest: { heightCm: number; recordedAt: Date } | null = null;
  for (const p of points) {
    if (p.heightCm == null || !Number.isFinite(p.heightCm)) continue;
    if (!latest || p.recordedAt.getTime() > latest.recordedAt.getTime()) {
      latest = { heightCm: p.heightCm, recordedAt: p.recordedAt };
    }
  }
  if (!latest) return null;
  return {
    cm: latest.heightCm,
    text: formatHeightMeters(latest.heightCm),
    agoText: `Medida ${formatTimeAgo(latest.recordedAt, now, tz)}`,
  };
}

export interface PortalEvolutionRow {
  id: string;
  /** "12 de septiembre" (formatPortalDate) */
  dateLabel: string;
  /** "62,4 kg" | null */
  weightText: string | null;
  /** "1,32 m" | null */
  heightText: string | null;
}

/** Solo las filas con peso o altura (D5), de la más nueva a la más vieja. Ningún otro campo entra
 *  (D2: la entrada no tiene `note`). */
export function portalEvolutionRows(
  entries: readonly { id: string; recordedAt: Date; weightKg: number | null; heightCm: number | null }[],
  now: Date,
  tz: string,
): PortalEvolutionRow[] {
  return entries
    .filter((e) => e.weightKg != null || e.heightCm != null)
    .slice()
    .sort((a, b) => b.recordedAt.getTime() - a.recordedAt.getTime())
    .map((e) => ({
      id: e.id,
      dateLabel: formatPortalDate(e.recordedAt, now, tz),
      weightText: e.weightKg == null ? null : formatWeightKg(e.weightKg),
      heightText: e.heightCm == null ? null : formatHeightMeters(e.heightCm),
    }));
}
