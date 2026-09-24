import { computeWaistHipRatio, roundTo } from "./anthropometry";
import { ISAK_MEASURE_KEYS, missingMeasuresNote, type IsakMeasureKey, type IsakMeasures } from "./isak";
import {
  ISAK_TEXT,
  SOMATOTYPE_MEASURE_KEYS,
  isakDifference,
  type IsakStudyResult,
  type IsakValue,
} from "./isak-study";
import { formatFixedEs, formatSignedFixedEs, type Sex } from "./patient-formula-data";

/**
 * HU-007 (épica 46): informe antropométrico en PDF. Arma el modelo del informe (filas ya
 * formateadas), los borradores de los textos interpretativos (D3), la firma, el nombre de archivo
 * y la huella de los datos de entrada. No recalcula nada: lee de IsakStudyResult.
 */

// ─── Tipos ──────────────────────────────────────────────────────────────────

export const ISAK_REPORT_TEXT_KEYS = [
  "girths",
  "distribution",
  "adiposeMuscle",
  "muscleBone",
  "waistHip",
  "somatotype",
  "conclusions",
] as const;
export type IsakReportTextKey = (typeof ISAK_REPORT_TEXT_KEYS)[number];
export type IsakReportTexts = Record<IsakReportTextKey, string>;

export interface IsakReportStudy {
  result: IsakStudyResult;
  /** "dd/MM/yyyy" de la consulta, en la zona de la profesional. */
  dateLabel: string;
  /** A la fecha de esa consulta. */
  ageYears: number | null;
}

export interface IsakReportInput {
  /** patient.name ?? patient.phone */
  patientName: string;
  current: IsakReportStudy;
  previous: IsakReportStudy | null;
}

/** Una fila anterior / actual. Todas las cadenas ya formateadas (es-AR). */
export interface IsakReportRow {
  key: string;
  label: string;
  previous: string | null;
  current: string;
  /** Con signo, sin unidad, para la columna "Dif." del panel: "−6,6". null si no hay anterior o algún lado no está ok. */
  diff: string | null;
  /** Para el PDF: "6,6 kg menos" / "0,8 cm más". null si diff es null o la diferencia redondeada es 0. */
  change: string | null;
}

export type IsakTissueKey = "adipose" | "muscle" | "bone" | "residual";
export type CompositionShares = Record<IsakTissueKey, number>;

export interface IsakReportBar {
  key: "arm" | "correctedArm" | "thigh" | "correctedThigh" | "calf" | "correctedCalf";
  label: string;
  previous: number | null;
  current: number | null;
  decimals: 1 | 2;
}

export interface IsakReportHealthIndicator {
  key: "adiposeMuscle" | "muscleBone" | "waistHip";
  label: string;
  value: string;
  category: string | null;
  /** Línea automática, no editable: "Bajó de 0,59 a 0,57 (−0,02)". null sin anterior o sin dato. */
  variation: string | null;
  textKey: IsakReportTextKey;
}

export interface IsakReportModel {
  title: string;
  subtitle: string;
  hasPrevious: boolean;
  minor: boolean;
  /** true si algún valor ACTUAL que el informe muestra es "Sin dato" o la somatocarta no tiene punto actual. */
  hasMissingData: boolean;
  columns: { previous: string | null; current: string };
  /** Leyenda de los gráficos: "Anterior (05/11/2025)" | null ; "Actual (08/05/2026)". */
  legend: { previous: string | null; current: string };
  personal: { name: string; age: string; date: string };
  measurements: {
    minorNote: string | null;
    rows: IsakReportRow[];
    bmi: IsakReportRow;
  };
  skinfolds: {
    intro: string;
    rows: IsakReportRow[];
    sum6: IsakReportRow;
    othersTitle: string;
    others: IsakReportRow[];
  };
  girths: {
    muscleIntro: string;
    muscle: IsakReportRow[];
    visceralIntro: string;
    visceral: IsakReportRow[];
    correctedIntro: string;
    corrected: IsakReportRow[];
  };
  distribution: {
    bars: IsakReportBar[];
    adipose: Array<{ key: "upper" | "central" | "lower"; label: string; value: string }>;
    muscle: Array<{ key: "arm" | "thigh" | "calf"; label: string; value: string }>;
  };
  health: { indicators: IsakReportHealthIndicator[] };
  /** null en menores (D10). */
  composition: null | {
    intro: string;
    methods: string;
    rows: Array<{ key: IsakTissueKey; label: string; previous: string | null; current: string }>;
    bars: { previous: CompositionShares | null; current: CompositionShares | null };
  };
  somatotype: {
    intro: string;
    components: string;
    category: string;
    chart: {
      current: { x: number; y: number } | null;
      previous: { x: number; y: number } | null;
      missingNote: string | null;
    };
  };
  /** Los textos que usa este informe, en orden (en menores sin adiposeMuscle ni muscleBone). */
  textKeys: IsakReportTextKey[];
}

// ─── Textos fijos ───────────────────────────────────────────────────────────

export const ISAK_REPORT_TEXT = {
  title: "Informe antropométrico",
  pageTitle: "Informe antropométrico",
  subtitle: (currentDate: string, previousDate: string | null) =>
    previousDate
      ? `Consulta del ${currentDate} · comparado con el estudio del ${previousDate}`
      : `Consulta del ${currentDate} · primer estudio, sin comparación`,
  columnPrevious: (date: string) => `Medición anterior (${date})`,
  columnCurrent: (date: string) => `Medición actual (${date})`,
  legendPrevious: (date: string) => `Anterior (${date})`,
  legendCurrent: (date: string) => `Actual (${date})`,
  sections: {
    personal: "Datos personales",
    measurements: "Mediciones antropométricas",
    skinfolds: "Pliegues cutáneos",
    girths: "Perímetros y perímetros corregidos",
    distribution: "Distribución adiposo-muscular",
    health: "Indicadores de salud",
    composition: "Composición corporal",
    somatotype: "Somatotipo",
    conclusions: "Conclusiones",
  },
  personalName: "Nombre y apellido",
  personalAge: "Edad",
  personalDate: "Fecha de evaluación",
  skinfoldsIntro: "Los siguientes pliegues son indicadores de grasa corporal subcutánea (externa).",
  otherSkinfolds: "Otros pliegues",
  girthsMuscleIntro: "Los siguientes perímetros son indicadores de masa muscular.",
  girthsVisceralIntro: "Los siguientes perímetros son indicadores de grasa visceral (abdominal).",
  girthsCorrectedIntro:
    "Los perímetros corregidos descuentan el pliegue y estiman la masa muscular: cuando aumentan, aumenta la masa muscular.",
  compositionIntro:
    "La composición corporal es la forma en que se distribuye el peso total del cuerpo en sus distintos componentes. Permite conocer qué parte del peso corresponde a tejido adiposo, muscular, óseo y residual.",
  compositionMethods: "Métodos: Kerr (1991), Lee (2000), Rocha (1974), residual por diferencia",
  somatotypeIntro:
    "El somatotipo clasifica el cuerpo de una persona según sus características físicas predominantes: la forma, la distribución de la masa muscular y de la grasa, y la contextura general.",
  adiposeTissue: "Tejido adiposo",
  muscleTissue: "Tejido muscular",
  noData: "Sin dato",
  // Pantalla
  reviewNotice: "Revisá y editá los textos antes de generar el PDF.",
  missingDataNotice: "Faltan datos en el estudio: el PDF va a mostrar «Sin dato» en algunos valores.",
  editStudy: "Editar estudio",
  licenseMissing: "Tu matrícula no está cargada. Completala en Ajustes para que aparezca en el informe.",
  goToSettings: "Ir a Ajustes",
  stalePdf: "El estudio cambió después de generar este PDF. Generalo de nuevo antes de enviarlo.",
  draftBadge: "Borrador automático",
  editedBadge: "Editado",
  resetDraft: "Volver al borrador",
  resetDraftTitle: "¿Reemplazar tu texto por el borrador automático?",
  resetDraftDescription: "Se pierde lo que escribiste en esta sección.",
  saveTexts: "Guardar textos",
  savingTexts: "Guardando…",
  textsSaved: "Textos del informe guardados",
  generate: "Generar PDF",
  generating: "Generando…",
  generated: "Informe generado",
  download: "Descargar",
  send: "Enviar por WhatsApp",
  sending: "Enviando…",
  sendConfirmTitle: (phone: string) => `¿Enviar el informe a ${phone}?`,
  sendConfirmDescription: "Se genera el PDF con los textos actuales y se encola para WhatsApp.",
  sendConfirmLabel: "Enviar",
  queued: (phone: string) => `Encolado para enviar por WhatsApp a ${phone}.`,
  lastPdf: (label: string) => `Último PDF: ${label}`,
  noPdf: "Todavía no generaste el PDF.",
  cardGenerated: (label: string) => `Informe generado el ${label}`,
  conclusionsRequired: "Escribí las conclusiones antes de generar el informe",
  saveError: "No se pudieron guardar los textos. Probá de nuevo.",
  generateError: "No se pudo generar el informe. Probá de nuevo.",
  sendError: "No se pudo encolar el envío. Probá de nuevo.",
  discardTitle: "¿Descartar los cambios de los textos?",
  discardDescription: "Hay textos del informe sin guardar.",
  discardLabel: "Descartar",
  noStudyNotice: "Primero cargá el estudio ISAK de esta consulta.",
  backToStudy: "Volver al estudio",
  whatsappCaption: (dateLabel: string) =>
    `📄 Te comparto tu informe antropométrico del ${dateLabel}. Cualquier duda lo charlamos en la próxima consulta.`,
  textLabels: {
    girths: "Texto de perímetros",
    distribution: "Texto de distribución adiposo-muscular",
    adiposeMuscle: "Comentario del índice adiposo muscular",
    muscleBone: "Comentario del índice músculo/óseo",
    waistHip: "Comentario del índice cintura/cadera",
    somatotype: "Texto del somatotipo",
    conclusions: "Conclusiones",
  } satisfies Record<IsakReportTextKey, string>,
} as const;

/** Umbrales de "estable" de los borradores (D3). Ajustables sin tocar lógica. Inclusivos: |dif| <= umbral → estable. */
export const ISAK_REPORT_STABLE_THRESHOLDS = {
  weightKg: 0.5,
  girthCm: 0.5, // perímetros y corregidos
  sum6Mm: 2,
  index: 0.02, // IAM e IMO
  distributionPoints: 1, // puntos porcentuales de la distribución adiposa
  somatotype: 0.5, // cada componente
} as const;

// ─── Helpers internos ───────────────────────────────────────────────────────

const NO_DATA = ISAK_REPORT_TEXT.noData;
const EPS = 1e-9;

type Unit = "kg" | "cm" | "mm" | "%" | null;

const okValue = (value: number): IsakValue => ({ status: "ok", value });
const fromNumber = (value: number | null | undefined): IsakValue =>
  value === null || value === undefined ? { status: "missing", note: NO_DATA } : okValue(value);

/** "61,0 kg" | "0,57" | "Sin dato". */
function cell(v: IsakValue | null | undefined, decimals: number, unit: Unit): string {
  if (!v || v.status !== "ok") return NO_DATA;
  const n = formatFixedEs(v.value, decimals);
  return unit ? `${n} ${unit}` : n;
}

function rowOf(params: {
  key: string;
  label: string;
  current: IsakValue;
  /** undefined = sin estudio anterior. */
  previous: IsakValue | undefined;
  decimals: number;
  unit: Unit;
}): IsakReportRow {
  const { key, label, current, previous, decimals, unit } = params;
  const d = previous === undefined ? null : isakDifference(current, previous, decimals);
  let change: string | null = null;
  if (d !== null && roundTo(d, decimals) !== 0) {
    const abs = formatFixedEs(Math.abs(d), decimals);
    change = `${unit ? `${abs} ${unit}` : abs} ${d < 0 ? "menos" : "más"}`;
  }
  return {
    key,
    label,
    previous: previous === undefined ? null : cell(previous, decimals, unit),
    current: cell(current, decimals, unit),
    diff: d === null ? null : formatSignedFixedEs(d, decimals),
    change,
  };
}

/** joinEs(["a","b","c"]) = "a, b y c". */
function joinEs(parts: string[]): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} y ${parts[parts.length - 1]}`;
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1);
}

function lowerFirst(s: string): string {
  return s.length === 0 ? s : s[0]!.toLowerCase() + s.slice(1);
}

type Trend = "stable" | "down" | "up";
function trend(d: number, threshold: number): Trend {
  if (Math.abs(d) <= threshold + EPS) return "stable";
  return d < 0 ? "down" : "up";
}
const verbOf = (t: Exclude<Trend, "stable">) => (t === "down" ? "bajó" : "subió");

/** Valor de una medida cruda como IsakValue. */
function measureValue(result: IsakStudyResult, key: IsakMeasureKey): IsakValue {
  return fromNumber(result.measures.find((m) => m.key === key)?.value ?? null);
}

/** ICC de un estudio: adultos con el diagnóstico de la HU-004; menores con computeWaistHipRatio, sin categoría. */
function waistHipOf(result: IsakStudyResult): { value: IsakValue; category: string | null; classKey: "NO_RISK" | "INCREASED" | null } {
  const row = result.health.diagnosis.waistHipRatio;
  if (!result.minor && row) {
    if (row.status === "classified") return { value: okValue(row.value), category: row.classLabel, classKey: row.classKey };
    if (row.status === "unclassified") return { value: okValue(row.value), category: null, classKey: null };
    return { value: { status: "missing", note: row.note }, category: null, classKey: null };
  }
  const waist = measureValue(result, "waistCm");
  const hip = measureValue(result, "hipCm");
  const ratio =
    waist.status === "ok" && hip.status === "ok" ? computeWaistHipRatio(waist.value, hip.value) : null;
  return { value: fromNumber(ratio), category: null, classKey: null };
}

function textKeysFor(minor: boolean): IsakReportTextKey[] {
  return ISAK_REPORT_TEXT_KEYS.filter((k) => !minor || (k !== "adiposeMuscle" && k !== "muscleBone"));
}

// ─── Funciones públicas chicas ──────────────────────────────────────────────

/** "Bajó de 0,59 a 0,57 (−0,02)" | "Subió de 2,80 a 2,95 (+0,15)" | "Se mantuvo en 0,83". null si alguno no está ok. */
export function variationLine(
  current: IsakValue,
  previous: IsakValue | null | undefined,
  decimals: number,
): string | null {
  const d = isakDifference(current, previous, decimals);
  if (d === null || current.status !== "ok" || !previous || previous.status !== "ok") return null;
  const cur = formatFixedEs(current.value, decimals);
  if (d === 0) return `Se mantuvo en ${cur}`;
  const prev = formatFixedEs(previous.value, decimals);
  return `${d < 0 ? "Bajó" : "Subió"} de ${prev} a ${cur} (${formatSignedFixedEs(d, decimals)})`;
}

/** "Lic. Ana Pérez · M.P. 123"; sin título: "Ana Pérez · M.P. 123"; sin matrícula: "Lic. Ana Pérez". */
export function professionalSignature(p: { title: string | null; name: string; licenseNumber: string | null }): string {
  const title = p.title?.trim() ?? "";
  const name = p.name.trim();
  const license = p.licenseNumber?.trim() ?? "";
  const who = [title, name].filter((s) => s !== "").join(" ");
  return license === "" ? who : `${who} · ${license}`;
}

/** "informe-antropometrico-2026-05-08.pdf" a partir del dayKey de la consulta. */
export function isakReportFileName(consultationDayKey: string): string {
  return `informe-antropometrico-${consultationDayKey}.pdf`;
}

type SourceStudy = { entryId: string; measures: IsakMeasures; dateLabel: string; ageYears: number | null };

/** Huella de los datos de entrada (D13): FNV-1a de 32 bits (hex, 8 caracteres) sobre el JSON canónico. */
export function isakReportSourceKey(input: {
  sex: Sex | null;
  current: SourceStudy;
  previous: SourceStudy | null;
}): string {
  const canon = (s: SourceStudy) => ({
    entryId: s.entryId,
    measures: ISAK_MEASURE_KEYS.map((k) => s.measures[k] ?? null),
    dateLabel: s.dateLabel,
    ageYears: s.ageYears,
  });
  const json = JSON.stringify({
    sex: input.sex,
    current: canon(input.current),
    previous: input.previous ? canon(input.previous) : null,
  });
  const bytes = new TextEncoder().encode(json);
  let hash = 0x811c9dc5;
  for (const b of bytes) {
    hash ^= b;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/** Texto guardado (si no es null) o borrador, por clave. */
export function resolveIsakReportTexts(
  saved: Record<IsakReportTextKey, string | null> | null,
  drafts: IsakReportTexts,
): IsakReportTexts {
  const out = {} as IsakReportTexts;
  for (const k of ISAK_REPORT_TEXT_KEYS) {
    const s = saved?.[k];
    out[k] = s === null || s === undefined ? drafts[k] : s;
  }
  return out;
}

// ─── Modelo ─────────────────────────────────────────────────────────────────

const SKINFOLD_ROWS: ReadonlyArray<{ key: IsakMeasureKey; label: string }> = [
  { key: "tricepsSkinfoldMm", label: "Tríceps" },
  { key: "subscapularSkinfoldMm", label: "Subescapular" },
  { key: "supraspinaleSkinfoldMm", label: "Supraespinal" },
  { key: "abdominalSkinfoldMm", label: "Abdominal" },
  { key: "thighSkinfoldMm", label: "Muslo" },
  { key: "calfSkinfoldMm", label: "Pierna" },
];
const OTHER_SKINFOLD_ROWS: ReadonlyArray<{ key: IsakMeasureKey; label: string }> = [
  { key: "bicepsSkinfoldMm", label: "Bíceps" },
  { key: "iliacCrestSkinfoldMm", label: "Cresta ilíaca" },
];
const MUSCLE_GIRTH_ROWS: ReadonlyArray<{ key: IsakMeasureKey; label: string }> = [
  { key: "armCm", label: "Brazo relajado" },
  { key: "armFlexedCm", label: "Brazo flexionado y contraído" },
  { key: "thighCm", label: "Muslo medio" },
  { key: "calfCm", label: "Pierna" },
];
const VISCERAL_GIRTH_ROWS: ReadonlyArray<{ key: IsakMeasureKey; label: string }> = [
  { key: "waistCm", label: "Cintura" },
  { key: "hipCm", label: "Cadera" },
];
type CorrectedKey = "correctedArm" | "correctedThigh" | "correctedCalf";
const CORRECTED_ROWS: ReadonlyArray<{ key: CorrectedKey; label: string; draft: string; short: string }> = [
  { key: "correctedArm", label: "Brazo corregido", draft: "el brazo corregido", short: "brazo" },
  { key: "correctedThigh", label: "Muslo corregido", draft: "el muslo corregido", short: "muslo" },
  { key: "correctedCalf", label: "Pierna corregida", draft: "la pierna corregida", short: "pierna" },
];
const BARS: ReadonlyArray<{ key: IsakReportBar["key"]; label: string; measure?: IsakMeasureKey; corrected?: CorrectedKey }> = [
  { key: "arm", label: "Brazo relajado", measure: "armCm" },
  { key: "correctedArm", label: "Brazo corregido", corrected: "correctedArm" },
  { key: "thigh", label: "Muslo medio", measure: "thighCm" },
  { key: "correctedThigh", label: "Muslo corregido", corrected: "correctedThigh" },
  { key: "calf", label: "Pierna", measure: "calfCm" },
  { key: "correctedCalf", label: "Pierna corregida", corrected: "correctedCalf" },
];
const ADIPOSE_ZONES = [
  { key: "upper", label: "Superior", draft: "superior" },
  { key: "central", label: "Central", draft: "central" },
  { key: "lower", label: "Inferior", draft: "inferior" },
] as const;
const MUSCLE_ZONES = [
  { key: "arm", label: "Brazo", draft: "el brazo" },
  { key: "thigh", label: "Muslo", draft: "el muslo" },
  { key: "calf", label: "Pierna", draft: "la pierna" },
] as const;
const TISSUES: ReadonlyArray<{ key: IsakTissueKey; label: string }> = [
  { key: "adipose", label: "Adiposo" },
  { key: "muscle", label: "Muscular" },
  { key: "bone", label: "Óseo" },
  { key: "residual", label: "Residual" },
];
const SOMATO_COMPONENTS = [
  { key: "endo", label: "Endomorfia", lower: "endomorfia", meaning: "adiposidad relativa" },
  { key: "meso", label: "Mesomorfia", lower: "mesomorfia", meaning: "desarrollo músculo-esquelético relativo" },
  { key: "ecto", label: "Ectomorfia", lower: "ectomorfia", meaning: "linealidad relativa" },
] as const;

function compositionShares(result: IsakStudyResult): CompositionShares | null {
  const t = result.tissues;
  if (t.residual.negative) return null;
  const out = {} as CompositionShares;
  for (const { key } of TISSUES) {
    const p = t[key].percent;
    if (p.status !== "ok") return null;
    out[key] = p.value;
  }
  return out;
}

function tissueCell(result: IsakStudyResult, key: IsakTissueKey): string {
  const t = result.tissues[key];
  if (t.percent.status !== "ok" || t.kg.status !== "ok") return NO_DATA;
  return `${formatFixedEs(t.percent.value, 2)} % (${formatFixedEs(t.kg.value, 2)} kg)`;
}

function chartPoint(result: IsakStudyResult): { x: number; y: number } | null {
  const c = result.somatotype.chart;
  return c.status === "ok" ? { x: c.x, y: c.y } : null;
}

/** Arma el modelo del informe. Pura; no recalcula nada: lee de IsakStudyResult. */
export function buildIsakReportModel(input: IsakReportInput): IsakReportModel {
  const cur = input.current.result;
  const prevStudy = input.previous;
  const prev = prevStudy?.result;
  const hasPrevious = prevStudy !== null;
  const minor = cur.minor;
  let missingData = false;
  const track = <T extends { current: string }>(row: T): T => {
    if (row.current === NO_DATA) missingData = true;
    return row;
  };

  const measureRow = (key: IsakMeasureKey, label: string, unit: Unit) =>
    track(
      rowOf({
        key,
        label,
        current: measureValue(cur, key),
        previous: prev ? measureValue(prev, key) : undefined,
        decimals: 1,
        unit,
      }),
    );

  // Mediciones.
  const bmiCell = (result: IsakStudyResult): string => {
    const b = result.health.diagnosis.bmi;
    if (b.status === "classified") return `${formatFixedEs(b.value, 1)} · ${b.classLabel}`;
    if (b.status === "unclassified") return formatFixedEs(b.value, 1);
    return NO_DATA;
  };
  const bmi = track<IsakReportRow>({
    key: "bmi",
    label: "IMC (OMS)",
    previous: prev ? bmiCell(prev) : null,
    current: bmiCell(cur),
    diff: null,
    change: null,
  });

  // Pliegues.
  const skinfoldRows = SKINFOLD_ROWS.map((r) => measureRow(r.key, r.label, "mm"));
  const sum6 = track(
    rowOf({
      key: "sum6",
      label: "Sumatoria de 6 pliegues",
      current: cur.adiposity.sum6,
      previous: prev?.adiposity.sum6,
      decimals: 1,
      unit: "mm",
    }),
  );
  const otherSkinfolds = OTHER_SKINFOLD_ROWS.map((r) => measureRow(r.key, r.label, "mm"));

  // Perímetros.
  const muscleGirths = MUSCLE_GIRTH_ROWS.map((r) => measureRow(r.key, r.label, "cm"));
  const visceralGirths = VISCERAL_GIRTH_ROWS.map((r) => measureRow(r.key, r.label, "cm"));
  const correctedRows = CORRECTED_ROWS.map((r) =>
    track(
      rowOf({
        key: r.key,
        label: r.label,
        current: cur.muscularity[r.key].value,
        previous: prev?.muscularity[r.key].value,
        decimals: 2,
        unit: "cm",
      }),
    ),
  );

  // Distribución.
  const barValue = (result: IsakStudyResult | undefined, b: (typeof BARS)[number]): number | null => {
    if (!result) return null;
    const v = b.measure ? measureValue(result, b.measure) : result.muscularity[b.corrected!].value;
    return v.status === "ok" ? v.value : null;
  };
  const bars: IsakReportBar[] = BARS.map((b) => {
    const current = barValue(cur, b);
    if (current === null) missingData = true;
    return {
      key: b.key,
      label: b.label,
      previous: barValue(prev, b),
      current,
      decimals: b.measure ? 1 : 2,
    };
  });
  const adiposeDist = ADIPOSE_ZONES.map((z) => {
    const value = cell(cur.distribution.adipose[z.key], 2, "%");
    if (value === NO_DATA) missingData = true;
    return { key: z.key, label: z.label, value };
  });
  const muscleDist = MUSCLE_ZONES.map((z) => {
    const value = cell(cur.distribution.muscle[z.key], 2, "%");
    if (value === NO_DATA) missingData = true;
    return { key: z.key, label: z.label, value };
  });

  // Salud.
  const indicators: IsakReportHealthIndicator[] = [];
  if (!minor) {
    const iam = cur.compositionIndices.adiposeMuscle;
    indicators.push({
      key: "adiposeMuscle",
      label: "Índice adiposo muscular",
      value: cell(iam, 2, null),
      category: null,
      variation: variationLine(iam, prev?.compositionIndices.adiposeMuscle, 2),
      textKey: "adiposeMuscle",
    });
    const imo = cur.compositionIndices.muscleBone;
    indicators.push({
      key: "muscleBone",
      label: "Índice músculo/óseo",
      value: cell(imo, 2, null),
      category: imo.status === "ok" ? imo.classLabel : null,
      variation: variationLine(imo, prev?.compositionIndices.muscleBone, 2),
      textKey: "muscleBone",
    });
  }
  const iccCur = waistHipOf(cur);
  indicators.push({
    key: "waistHip",
    label: "Índice cintura/cadera",
    value: cell(iccCur.value, 2, null),
    category: iccCur.category,
    variation: variationLine(iccCur.value, prev ? waistHipOf(prev).value : null, 2),
    textKey: "waistHip",
  });
  if (indicators.some((i) => i.value === NO_DATA)) missingData = true;

  // Composición.
  let composition: IsakReportModel["composition"] = null;
  if (!minor) {
    const rows = TISSUES.map((t) => {
      const current = tissueCell(cur, t.key);
      if (current === NO_DATA) missingData = true;
      return { key: t.key, label: t.label, previous: prev ? tissueCell(prev, t.key) : null, current };
    });
    composition = {
      intro: ISAK_REPORT_TEXT.compositionIntro,
      methods: ISAK_REPORT_TEXT.compositionMethods,
      rows,
      bars: { previous: prev ? compositionShares(prev) : null, current: compositionShares(cur) },
    };
  }

  // Somatotipo.
  const components = SOMATO_COMPONENTS.map((c) => {
    const curCell = cell(cur.somatotype[c.key], 2, null);
    if (curCell === NO_DATA) missingData = true;
    return prev ? `${c.label} ${cell(prev.somatotype[c.key], 2, null)} → ${curCell}` : `${c.label} ${curCell}`;
  }).join(" · ");
  const currentPoint = chartPoint(cur);
  let missingNote: string | null = null;
  if (currentPoint === null) {
    missingData = true;
    const needed = new Set<IsakMeasureKey>([
      ...SOMATOTYPE_MEASURE_KEYS.endo,
      ...SOMATOTYPE_MEASURE_KEYS.meso,
      ...SOMATOTYPE_MEASURE_KEYS.ecto,
    ]);
    const absent = ISAK_MEASURE_KEYS.filter((k) => needed.has(k) && measureValue(cur, k).status !== "ok");
    const chart = cur.somatotype.chart;
    const note = absent.length > 0 ? missingMeasuresNote(absent) : chart.status === "missing" ? chart.note : NO_DATA;
    missingNote = `Somatotipo ${lowerFirst(note)}`;
  }
  const category = cur.somatotype.category.status === "ok" ? cur.somatotype.category.label : NO_DATA;

  const measurementRows = [measureRow("weightKg", "Peso", "kg"), measureRow("heightCm", "Talla", "cm")];

  return {
    title: ISAK_REPORT_TEXT.title,
    subtitle: ISAK_REPORT_TEXT.subtitle(input.current.dateLabel, prevStudy?.dateLabel ?? null),
    hasPrevious,
    minor,
    hasMissingData: missingData,
    columns: {
      previous: prevStudy ? ISAK_REPORT_TEXT.columnPrevious(prevStudy.dateLabel) : null,
      current: ISAK_REPORT_TEXT.columnCurrent(input.current.dateLabel),
    },
    legend: {
      previous: prevStudy ? ISAK_REPORT_TEXT.legendPrevious(prevStudy.dateLabel) : null,
      current: ISAK_REPORT_TEXT.legendCurrent(input.current.dateLabel),
    },
    personal: {
      name: input.patientName,
      age:
        input.current.ageYears === null
          ? NO_DATA
          : `${input.current.ageYears} ${input.current.ageYears === 1 ? "año" : "años"}`,
      date: input.current.dateLabel,
    },
    measurements: {
      minorNote: minor ? ISAK_TEXT.minorWarning : null,
      rows: measurementRows,
      bmi,
    },
    skinfolds: {
      intro: ISAK_REPORT_TEXT.skinfoldsIntro,
      rows: skinfoldRows,
      sum6,
      othersTitle: ISAK_REPORT_TEXT.otherSkinfolds,
      others: otherSkinfolds,
    },
    girths: {
      muscleIntro: ISAK_REPORT_TEXT.girthsMuscleIntro,
      muscle: muscleGirths,
      visceralIntro: ISAK_REPORT_TEXT.girthsVisceralIntro,
      visceral: visceralGirths,
      correctedIntro: ISAK_REPORT_TEXT.girthsCorrectedIntro,
      corrected: correctedRows,
    },
    distribution: { bars, adipose: adiposeDist, muscle: muscleDist },
    health: { indicators },
    composition,
    somatotype: {
      intro: ISAK_REPORT_TEXT.somatotypeIntro,
      components,
      category,
      chart: { current: currentPoint, previous: prev ? chartPoint(prev) : null, missingNote },
    },
    textKeys: textKeysFor(minor),
  };
}

// ─── Borradores (D3) ────────────────────────────────────────────────────────

const T = ISAK_REPORT_STABLE_THRESHOLDS;

/** " bajó 1,79 cm" | " se mantuvo estable". */
function changePhrase(d: number, threshold: number, decimals: number, unit: string | null): string {
  const t = trend(d, threshold);
  if (t === "stable") return " se mantuvo estable";
  const n = formatFixedEs(Math.abs(d), decimals);
  return ` ${verbOf(t)} ${unit ? `${n} ${unit}` : n}`;
}

function sentences(list: Array<string | null>): string {
  return list.filter((s): s is string => s !== null && s !== "").join(" ");
}

function girthsDraft(cur: IsakStudyResult, prev: IsakStudyResult | undefined): string {
  if (prev) {
    const correctedDiffs = CORRECTED_ROWS.map((r) => ({
      r,
      d: isakDifference(cur.muscularity[r.key].value, prev.muscularity[r.key].value, 2),
    }));
    const o1Parts = correctedDiffs
      .filter((x): x is { r: (typeof CORRECTED_ROWS)[number]; d: number } => x.d !== null)
      .map((x) => `${x.r.draft}${changePhrase(x.d, T.girthCm, 2, "cm")}`);
    const o1 = o1Parts.length > 0 ? `Respecto de la evaluación anterior, ${joinEs(o1Parts)}.` : null;

    const o2Parts: string[] = [];
    for (const [key, name] of [
      ["waistCm", "la cintura"],
      ["hipCm", "la cadera"],
    ] as const) {
      const d = isakDifference(measureValue(cur, key), measureValue(prev, key), 1);
      if (d !== null) o2Parts.push(`${name}${changePhrase(d, T.girthCm, 1, "cm")}`);
    }
    const o2 = o2Parts.length > 0 ? `${capitalize(joinEs(o2Parts))}.` : null;

    let o3: string | null = null;
    if (correctedDiffs.every((x) => x.d !== null)) {
      const trends = correctedDiffs.map((x) => trend(x.d as number, T.girthCm));
      if (trends.every((t) => t === "down")) o3 = "En conjunto, sugiere una disminución de la masa muscular.";
      else if (trends.every((t) => t === "up")) o3 = "En conjunto, sugiere un aumento de la masa muscular.";
      else if (trends.every((t) => t === "stable"))
        o3 = "En conjunto, los cambios son mínimos y sugieren una masa muscular estable.";
    }
    return sentences([o1, o2, o3]);
  }

  const correctedParts = CORRECTED_ROWS.flatMap((r) => {
    const v = cur.muscularity[r.key].value;
    return v.status === "ok" ? [`${r.short} ${cell(v, 2, "cm")}`] : [];
  });
  const o1 = correctedParts.length > 0 ? `Perímetros corregidos: ${joinEs(correctedParts)}.` : null;
  const visceralParts = (
    [
      ["waistCm", "cintura"],
      ["hipCm", "cadera"],
    ] as const
  ).flatMap(([key, name]) => {
    const v = measureValue(cur, key);
    return v.status === "ok" ? [`${name} ${cell(v, 1, "cm")}`] : [];
  });
  const o2 = visceralParts.length > 0 ? `${capitalize(joinEs(visceralParts))}.` : null;
  return sentences([o1, o2]);
}

/** Índice del máximo (en empate, el primero). null si alguno no está ok. */
function argMax(values: IsakValue[]): number | null {
  if (values.some((v) => v.status !== "ok")) return null;
  let best = 0;
  values.forEach((v, i) => {
    if ((v as { value: number }).value > (values[best] as { value: number }).value) best = i;
  });
  return best;
}

function distributionDraft(cur: IsakStudyResult, prev: IsakStudyResult | undefined): string {
  const adiposeValues = ADIPOSE_ZONES.map((z) => cur.distribution.adipose[z.key]);
  const ai = argMax(adiposeValues);
  const o1 =
    ai === null
      ? null
      : `Respecto de la distribución de la grasa corporal, predomina la zona ${ADIPOSE_ZONES[ai]!.draft} (${cell(adiposeValues[ai], 2, "%")}).`;
  const muscleValues = MUSCLE_ZONES.map((z) => cur.distribution.muscle[z.key]);
  const mi = argMax(muscleValues);
  const o2 =
    mi === null
      ? null
      : `En cuanto a la masa muscular, se concentra principalmente en ${MUSCLE_ZONES[mi]!.draft} (${cell(muscleValues[mi], 2, "%")}).`;

  let o3: string | null = null;
  if (prev) {
    let best: { zone: (typeof ADIPOSE_ZONES)[number]; d: number } | null = null;
    for (const zone of ADIPOSE_ZONES) {
      const d = isakDifference(cur.distribution.adipose[zone.key], prev.distribution.adipose[zone.key], 2);
      if (d === null) continue;
      if (best === null || Math.abs(d) > Math.abs(best.d)) best = { zone, d };
    }
    if (best) {
      if (Math.abs(best.d) <= T.distributionPoints + EPS) {
        o3 = "La distribución de la grasa se mantuvo similar a la evaluación anterior.";
      } else {
        const p = prev.distribution.adipose[best.zone.key];
        const c = cur.distribution.adipose[best.zone.key];
        o3 = `Frente a la evaluación anterior, la proporción de grasa de la zona ${best.zone.draft} pasó de ${cell(p, 2, "%")} a ${cell(c, 2, "%")}.`;
      }
    }
  }
  return sentences([o1, o2, o3]);
}

function adiposeMuscleDraft(cur: IsakStudyResult, prev: IsakStudyResult | undefined): string {
  if (cur.minor) return "";
  const v = cur.compositionIndices.adiposeMuscle;
  if (v.status !== "ok") return "";
  const d = prev ? isakDifference(v, prev.compositionIndices.adiposeMuscle, 2) : null;
  if (d === null) return ISAK_TEXT.adiposeMuscleHint;
  const t = trend(d, T.index);
  if (t === "down") return "Refleja una reducción del tejido adiposo en relación con la masa muscular.";
  if (t === "up") return "Refleja un aumento del tejido adiposo en relación con la masa muscular.";
  return "Se mantiene estable la relación entre el tejido adiposo y la masa muscular.";
}

function muscleBoneDraft(cur: IsakStudyResult, prev: IsakStudyResult | undefined): string {
  if (cur.minor) return "";
  const v = cur.compositionIndices.muscleBone;
  if (v.status !== "ok") return "";
  const d = prev ? isakDifference(v, prev.compositionIndices.muscleBone, 2) : null;
  if (d === null) {
    return `Se ubica en la categoría ${v.classLabel.toLowerCase()} de la relación entre masa muscular y masa ósea.`;
  }
  const t = trend(d, T.index);
  if (t === "down") return "Muestra una disminución de la masa muscular en relación con la masa ósea.";
  if (t === "up") return "Muestra un aumento de la masa muscular en relación con la masa ósea.";
  return "Se mantiene estable la relación entre la masa muscular y la masa ósea.";
}

function waistHipDraft(cur: IsakStudyResult): string {
  const icc = waistHipOf(cur);
  if (icc.classKey === "NO_RISK") {
    return "El resultado indica que la distribución de la grasa corporal no representa un factor de riesgo cardiometabólico aumentado.";
  }
  if (icc.classKey === "INCREASED") {
    return "El resultado indica una distribución de la grasa corporal asociada a un riesgo cardiometabólico aumentado.";
  }
  return "";
}

function somatotypeDraft(cur: IsakStudyResult, prev: IsakStudyResult | undefined): string {
  const s = cur.somatotype;
  if (s.category.status !== "ok") return "";
  const o1 = `El análisis del somatotipo evidencia un perfil ${s.category.label.toLowerCase()}.`;

  let o2: string | null;
  if (s.category.key === "CENTRAL") o2 = "Ningún componente predomina claramente.";
  else {
    const i = argMax(SOMATO_COMPONENTS.map((c) => s[c.key]));
    o2 = i === null ? null : `Predomina la ${SOMATO_COMPONENTS[i]!.lower} (${SOMATO_COMPONENTS[i]!.meaning}).`;
  }

  let o3: string | null = null;
  const pc = prev?.somatotype.category;
  if (prev && pc && pc.status === "ok") {
    const cat =
      pc.key === s.category.key
        ? "se mantiene la categoría"
        : `la categoría pasó de ${pc.label.toLowerCase()} a ${s.category.label.toLowerCase()}`;
    const parts: string[] = [];
    for (const c of SOMATO_COMPONENTS) {
      const d = isakDifference(s[c.key], prev.somatotype[c.key], 2);
      if (d === null) continue;
      const t = trend(d, T.somatotype);
      if (t !== "stable") parts.push(`la ${c.lower} ${verbOf(t)} ${formatFixedEs(Math.abs(d), 2)}`);
    }
    const comp = parts.length > 0 ? `; ${joinEs(parts)}` : "; los tres componentes se mantienen estables";
    o3 = `Respecto de la evaluación anterior, ${cat}${comp}.`;
  }
  return sentences([o1, o2, o3]);
}

function conclusionsDraft(input: IsakReportInput): string {
  const cur = input.current.result;
  const prev = input.previous?.result;
  let o1: string | null;
  if (input.previous && prev) {
    const parts: string[] = [];
    const dw = isakDifference(measureValue(cur, "weightKg"), measureValue(prev, "weightKg"), 1);
    if (dw !== null) parts.push(`el peso${changePhrase(dw, T.weightKg, 1, "kg")}`);
    const ds = isakDifference(cur.adiposity.sum6, prev.adiposity.sum6, 1);
    if (ds !== null) parts.push(`la sumatoria de 6 pliegues${changePhrase(ds, T.sum6Mm, 1, "mm")}`);
    o1 = parts.length > 0 ? `En comparación con la evaluación del ${input.previous.dateLabel}, ${joinEs(parts)}.` : null;
  } else {
    const parts: string[] = [];
    const w = measureValue(cur, "weightKg");
    if (w.status === "ok") parts.push(`el peso es de ${cell(w, 1, "kg")}`);
    if (cur.adiposity.sum6.status === "ok") parts.push(`la sumatoria de 6 pliegues es de ${cell(cur.adiposity.sum6, 1, "mm")}`);
    o1 = parts.length > 0 ? `En esta primera evaluación, ${joinEs(parts)}.` : null;
  }

  let o2: string | null = null;
  if (!cur.minor) {
    const parts: string[] = [];
    for (const [key, name] of [
      ["muscle", "el tejido muscular"],
      ["adipose", "el tejido adiposo"],
    ] as const) {
      const c = cur.tissues[key].percent;
      if (c.status !== "ok") continue;
      if (prev) {
        const p = prev.tissues[key].percent;
        if (p.status === "ok") parts.push(`${name} pasó de ${cell(p, 2, "%")} a ${cell(c, 2, "%")}`);
      } else {
        parts.push(`${name} representa el ${cell(c, 2, "%")} del peso`);
      }
    }
    o2 = parts.length > 0 ? `${capitalize(joinEs(parts))}.` : null;
  }

  const o3 = "Se sugiere continuar con controles periódicos para monitorear la evolución.";
  return sentences([o1, o2, o3]);
}

/** Borradores de los 7 textos (D3). Deterministas. Los que no aplican (p. ej. IAM en menores) dan "". */
export function buildIsakReportDrafts(input: IsakReportInput): IsakReportTexts {
  const cur = input.current.result;
  const prev = input.previous?.result;
  return {
    girths: girthsDraft(cur, prev),
    distribution: distributionDraft(cur, prev),
    adiposeMuscle: adiposeMuscleDraft(cur, prev),
    muscleBone: muscleBoneDraft(cur, prev),
    waistHip: waistHipDraft(cur),
    somatotype: somatotypeDraft(cur, prev),
    conclusions: conclusionsDraft(input),
  };
}
