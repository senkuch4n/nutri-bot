// HU-017c-2 (SDD 4.1 de 017c-2). Resumen del paciente en lenguaje común: fechas cortas, qué se
// registró en una consulta, tendencia de peso, historial de turnos en palabras y textos de la ficha.
// Todo en la zona horaria que se pasa (Professional.timezone), nunca en la del proceso.
import { es as esLocale } from "date-fns/locale";
import {
  ANTHROPOMETRY_MEASURE_KEYS,
  BIOIMPEDANCE_MEASURE_KEYS,
  type MeasurementValues,
} from "./consultations";
import type { ActivityLevel, MissingFormulaDataItem } from "./patient-formula-data";
import { capitalizeFirst } from "./relative-date";
import { formatInTimeZone } from "./time";

/** "24/09" en tz. */
export function formatShortDate(instant: Date, tz: string): string {
  return formatInTimeZone(instant, tz, "dd/MM");
}

/** "Miércoles 24/09"; si es de otro año que now: "Miércoles 24/09/2025". */
export function formatConsultationDay(instant: Date, now: Date, tz: string): string {
  const sameYear = formatInTimeZone(instant, tz, "yyyy") === formatInTimeZone(now, tz, "yyyy");
  const pattern = sameYear ? "EEEE dd/MM" : "EEEE dd/MM/yyyy";
  return capitalizeFirst(formatInTimeZone(instant, tz, pattern, { locale: esLocale }));
}

export type RecordedItem = "peso" | "medidas" | "bioimpedancia" | "calorías" | "plan" | "notas";

/** Qué se registró en una consulta, en orden fijo. "peso" si alguna medición tiene weightKg;
 *  "medidas" si alguna tiene un campo de ANTHROPOMETRY_MEASURE_KEYS; "bioimpedancia" si alguna tiene
 *  uno de BIOIMPEDANCE_MEASURE_KEYS; "calorías" si hasPrescription; "plan" si hasPlan; "notas" si
 *  notes tiene texto (trim). Misma entrada que consultationChips. */
export function consultationRecordedItems(input: {
  measurements: MeasurementValues[];
  hasPrescription: boolean;
  hasPlan: boolean;
  notes: string | null;
}): RecordedItem[] {
  const has = (keys: readonly (keyof MeasurementValues)[]) =>
    input.measurements.some((m) => keys.some((k) => m[k] != null));
  const items: RecordedItem[] = [];
  if (input.measurements.some((m) => m.weightKg != null)) items.push("peso");
  if (has(ANTHROPOMETRY_MEASURE_KEYS)) items.push("medidas");
  if (has(BIOIMPEDANCE_MEASURE_KEYS)) items.push("bioimpedancia");
  if (input.hasPrescription) items.push("calorías");
  if (input.hasPlan) items.push("plan");
  if (input.notes != null && input.notes.trim().length > 0) items.push("notas");
  return items;
}

/** Unión es-AR: "a", "a y b", "a, b y c". */
export function joinSpanish(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

/** "Peso, calorías y notas" (form "short") | "Se registró: peso, calorías y notas" (form "sentence");
 *  [] → "Sin registros". Unión es-AR: "a", "a y b", "a, b y c". */
export function recordedItemsText(items: readonly RecordedItem[], form: "short" | "sentence"): string {
  if (items.length === 0) return PATIENT_SUMMARY_TEXT.noRecords;
  const joined = joinSpanish(items);
  return form === "short" ? capitalizeFirst(joined) : `Se registró: ${joined}`;
}

export interface WeightPoint {
  weightKg: number | null;
  recordedAt: Date;
}
export interface WeightTrend {
  latestKg: number;
  /** "24/09" */
  latestDateLabel: string;
  /** latest − anterior, redondeado a 1 decimal; null si hay una sola. */
  deltaKg: number | null;
  /** "Bajó 6,8 kg desde el 11/05" | "Subió 1,2 kg desde el 11/05" | "Igual que el 11/05" | null */
  text: string | null;
  /** Últimos 8 pesos, del más viejo al más nuevo (minigráfico). */
  series: number[];
}

const kgFormat = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 });
const WEIGHT_SERIES_LENGTH = 8;

/** null si ningún punto tiene peso. Ignora puntos sin peso. El orden de entrada no importa. */
export function weightTrend(points: readonly WeightPoint[], tz: string): WeightTrend | null {
  const withWeight = points
    .filter((p): p is { weightKg: number; recordedAt: Date } => p.weightKg != null && Number.isFinite(p.weightKg))
    .sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());
  const latest = withWeight.at(-1);
  if (!latest) return null;
  const previous = withWeight.length > 1 ? withWeight[withWeight.length - 2]! : null;
  let deltaKg: number | null = null;
  let text: string | null = null;
  if (previous) {
    const rounded = Math.round((latest.weightKg - previous.weightKg) * 10) / 10;
    deltaKg = rounded === 0 ? 0 : rounded;
    const since = formatShortDate(previous.recordedAt, tz);
    if (deltaKg === 0) text = `Igual que el ${since}`;
    else text = `${deltaKg < 0 ? "Bajó" : "Subió"} ${kgFormat.format(Math.abs(deltaKg))} kg desde el ${since}`;
  }
  return {
    latestKg: latest.weightKg,
    latestDateLabel: formatShortDate(latest.recordedAt, tz),
    deltaKg,
    text,
    series: withWeight.slice(-WEIGHT_SERIES_LENGTH).map((p) => p.weightKg),
  };
}

export type AppointmentStatusLike = "CONFIRMED" | "AWAITING_PAYMENT" | "COMPLETED" | "CANCELLED" | "NO_SHOW";

/** Estado en palabras: Confirmado, Falta la seña, Vino, Canceló, No vino. */
export const APPOINTMENT_STATUS_TEXT: Record<AppointmentStatusLike, string> = {
  CONFIRMED: "Confirmado",
  AWAITING_PAYMENT: "Falta la seña",
  COMPLETED: "Vino",
  CANCELLED: "Canceló",
  NO_SHOW: "No vino",
};

/** "8 turnos: 6 vino, 1 canceló, 1 no vino". Orden: vino (COMPLETED), canceló, no vino (NO_SHOW),
 *  por venir (CONFIRMED/AWAITING_PAYMENT con startsAt >= now), sin marcar (CONFIRMED/AWAITING_PAYMENT
 *  pasados). Se omiten los 0. "1 turno: 1 vino". [] → "Todavía no tuvo turnos". */
export function appointmentHistoryText(
  appts: readonly { status: AppointmentStatusLike; startsAt: Date }[],
  now: Date,
): string {
  if (appts.length === 0) return PATIENT_SUMMARY_TEXT.noAppointments;
  const counts = { vino: 0, canceló: 0, "no vino": 0, "por venir": 0, "sin marcar": 0 };
  for (const a of appts) {
    if (a.status === "COMPLETED") counts.vino += 1;
    else if (a.status === "CANCELLED") counts.canceló += 1;
    else if (a.status === "NO_SHOW") counts["no vino"] += 1;
    else if (a.startsAt.getTime() >= now.getTime()) counts["por venir"] += 1;
    else counts["sin marcar"] += 1;
  }
  const parts = Object.entries(counts)
    .filter(([, n]) => n > 0)
    .map(([label, n]) => `${n} ${label}`);
  return `${appts.length} ${appts.length === 1 ? "turno" : "turnos"}: ${parts.join(", ")}`;
}

/** Actividad física en lenguaje común (sin factor): Sedentaria, Ligera, Moderada, Intensa, Muy intensa. */
export const ACTIVITY_PLAIN_LABELS: Record<ActivityLevel, string> = {
  SEDENTARY: "Sedentaria",
  LIGHT: "Ligera",
  MODERATE: "Moderada",
  INTENSE: "Intensa",
  VERY_INTENSE: "Muy intensa",
};

/** "Para calcular calorías falta: sexo y actividad física"; [] → null. Usa los label de
 *  getMissingFormulaData. */
export function missingForCaloriesText(items: readonly MissingFormulaDataItem[]): string | null {
  if (items.length === 0) return null;
  return `Para calcular calorías falta: ${joinSpanish(items.map((i) => i.label))}`;
}

/** Textos de la ficha (glosario de la HU §4.2), exactos. */
export const PATIENT_SUMMARY_TEXT = {
  dataTitle: "Datos de la paciente",
  dataDescription: "Estos datos los usan las fórmulas de calorías.",
  notLoaded: "Sin cargar",
  notMeasured: "Sin medir",
  caloriesLabel: "Calorías indicadas",
  caloriesPerDay: (kcal: string, dateLabel: string) => `${kcal} por día · ${dateLabel}`,
  caloriesEmpty: "Todavía no indicaste calorías. Se calculan dentro de una consulta.",
  noAppointment: "Sin turno",
  noActivePlan: "Sin plan activo",
  seePlans: "Ver planes",
  noMeasurements: "Todavía no hay mediciones",
  loadWeight: "Cargar peso",
  openTodayConsultation: "Abrir la consulta de hoy",
  newConsultation: "Nueva consulta",
  editData: "Editar datos",
  dataSaved: "Datos guardados",
  seeDetail: "Ver detalle",
  seeBackground: "Ver antecedentes",
  complete: "Completar",
  whatsapp: "WhatsApp",
  opensInNewTab: "(se abre en otra pestaña)",
  unnamed: "Sin nombre",
  activityFactor: (factor: string) => `Factor de actividad: ${factor}`,
  bodyFrameDefault: "Mientras no la cargues, el cálculo usa contextura mediana.",
  recent: "Nuevo",
  recentHint: "(hay entradas de las últimas 24 hs)",
  noRecords: "Sin registros",
  noAppointments: "Todavía no tuvo turnos",
  awaitingPayment: "Falta la seña",
  ageYears: (n: number) => `${n} ${n === 1 ? "año" : "años"}`,
  ageNotLoaded: "Edad sin cargar",
  planSince: (dateLabel: string) => `desde el ${dateLabel}`,
  riskSuffix: "(riesgo)",
  backgroundLabel: "Antecedentes",
} as const;
