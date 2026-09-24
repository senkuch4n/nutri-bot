import type { Sex } from "./patient-formula-data";
import { roundTo } from "./anthropometry";

/**
 * HU-006 (épicas 44 y 45): perfil restringido ISAK. Constantes y fórmulas puras.
 *
 * Todas las funciones devuelven el valor EXACTO; el redondeo se hace una sola vez en
 * buildIsakStudy (isak-study.ts) y las clasificaciones usan el valor ya redondeado a lo que se
 * muestra (convención de la HU-004).
 *
 * Referencias:
 * - Puntuación Z / Phantom: Ross W.D., Wilson N.C. (1974), "A stratagem for proportional growth
 *   assessment", Acta Paediatrica Belgica 28 (Suppl.): 169-182. Tabla del Phantom en Ross W.D.,
 *   Marfell-Jones M.J. (1991), "Kinanthropometry", en MacDougall, Wenger y Green (eds.),
 *   Physiological Testing of the High-Performance Athlete. Tejidos y perímetros corregidos:
 *   Phantom de Kerr (1988).
 * - Masa grasa: Durnin J.V.G.A., Womersley J. (1974), British Journal of Nutrition 32: 77-97
 *   (log de la suma de 4 pliegues) + Siri W.E. (1961), en Brozek y Henschel (eds.), Techniques
 *   for Measuring Body Composition.
 * - Tejido adiposo: Kerr D.A. (1988), tesis de maestría, Simon Fraser University; Ross W.D.,
 *   Kerr D.A. (1991), Apunts 28. Solo el componente adiposo.
 * - Tejido muscular: Lee R.C., Wang Z., Heo M., Ross R., Janssen I., Heymsfield S.B. (2000),
 *   American Journal of Clinical Nutrition 72: 796-803.
 * - Tejido óseo: Rocha M.S.L. (1975), Arquivos de Anatomia e Antropologia 1: 445-451 (Von Döbeln
 *   modificada; ISAKMetry la cita como "Rocha, 1974").
 * - Somatotipo: Carter J.E.L. (2002), The Heath-Carter Anthropometric Somatotype - Instruction
 *   Manual; categorías de Carter J.E.L., Heath B.H. (1990), Somatotyping: Development and
 *   Applications, Cambridge University Press.
 */

// ─── Medidas ────────────────────────────────────────────────────────────────

/** Las 21 medidas del perfil restringido ISAK, en el orden de ISAKMetry y del formulario.
 *  Coinciden 1:1 con columnas de EvolutionEntry. */
export const ISAK_MEASURE_KEYS = [
  "weightKg", "heightCm", "sittingHeightCm", "armSpanCm",
  "tricepsSkinfoldMm", "subscapularSkinfoldMm", "bicepsSkinfoldMm", "iliacCrestSkinfoldMm",
  "supraspinaleSkinfoldMm", "abdominalSkinfoldMm", "thighSkinfoldMm", "calfSkinfoldMm",
  "armCm", "armFlexedCm", "waistCm", "hipCm", "thighCm", "calfCm",
  "humerusBreadthCm", "bistyloidBreadthCm", "femurBreadthCm",
] as const;
export type IsakMeasureKey = (typeof ISAK_MEASURE_KEYS)[number];
export type IsakMeasures = Record<IsakMeasureKey, number | null>;

export type IsakMeasureGroupKey = "basic" | "skinfolds" | "girths" | "breadths";

export interface IsakMeasureDef {
  key: IsakMeasureKey;
  group: IsakMeasureGroupKey;
  /** Etiqueta de la tabla y del formulario. */
  label: string;
  unit: "kg" | "cm" | "mm";
  /** Lo que va en "Sin dato (falta …)". */
  missingLabel: string;
}

export const ISAK_MEASURE_GROUPS: ReadonlyArray<{ key: IsakMeasureGroupKey; title: string }> = [
  { key: "basic", title: "Medidas básicas" },
  { key: "skinfolds", title: "Pliegues (mm)" },
  { key: "girths", title: "Perímetros (cm)" },
  { key: "breadths", title: "Diámetros (cm)" },
];

/** En el orden de ISAK_MEASURE_KEYS. */
export const ISAK_MEASURES: ReadonlyArray<IsakMeasureDef> = [
  { key: "weightKg", group: "basic", label: "Masa corporal", unit: "kg", missingLabel: "masa corporal" },
  { key: "heightCm", group: "basic", label: "Talla", unit: "cm", missingLabel: "talla" },
  { key: "sittingHeightCm", group: "basic", label: "Talla sentado", unit: "cm", missingLabel: "talla sentado" },
  { key: "armSpanCm", group: "basic", label: "Envergadura de brazos", unit: "cm", missingLabel: "envergadura" },
  { key: "tricepsSkinfoldMm", group: "skinfolds", label: "Tríceps", unit: "mm", missingLabel: "tríceps" },
  { key: "subscapularSkinfoldMm", group: "skinfolds", label: "Subescapular", unit: "mm", missingLabel: "subescapular" },
  { key: "bicepsSkinfoldMm", group: "skinfolds", label: "Bíceps", unit: "mm", missingLabel: "bíceps" },
  { key: "iliacCrestSkinfoldMm", group: "skinfolds", label: "Cresta ilíaca", unit: "mm", missingLabel: "cresta ilíaca" },
  { key: "supraspinaleSkinfoldMm", group: "skinfolds", label: "Supraespinal", unit: "mm", missingLabel: "supraespinal" },
  { key: "abdominalSkinfoldMm", group: "skinfolds", label: "Abdominal", unit: "mm", missingLabel: "abdominal" },
  { key: "thighSkinfoldMm", group: "skinfolds", label: "Muslo", unit: "mm", missingLabel: "pliegue muslo" },
  { key: "calfSkinfoldMm", group: "skinfolds", label: "Pierna", unit: "mm", missingLabel: "pliegue pierna" },
  { key: "armCm", group: "girths", label: "Brazo relajado", unit: "cm", missingLabel: "brazo relajado" },
  { key: "armFlexedCm", group: "girths", label: "Brazo flexionado y contraído", unit: "cm", missingLabel: "brazo flexionado" },
  { key: "waistCm", group: "girths", label: "Cintura", unit: "cm", missingLabel: "cintura" },
  { key: "hipCm", group: "girths", label: "Caderas", unit: "cm", missingLabel: "caderas" },
  { key: "thighCm", group: "girths", label: "Muslo medio", unit: "cm", missingLabel: "muslo medio" },
  { key: "calfCm", group: "girths", label: "Pierna", unit: "cm", missingLabel: "perímetro pierna" },
  { key: "humerusBreadthCm", group: "breadths", label: "Húmero", unit: "cm", missingLabel: "húmero" },
  { key: "bistyloidBreadthCm", group: "breadths", label: "Biestiloideo", unit: "cm", missingLabel: "biestiloideo" },
  { key: "femurBreadthCm", group: "breadths", label: "Fémur", unit: "cm", missingLabel: "fémur" },
];

/** "Sin dato (falta fémur)"; varios: "Sin dato (falta biestiloideo, fémur)" en el orden de ISAK_MEASURE_KEYS. */
export function missingMeasuresNote(keys: readonly IsakMeasureKey[]): string {
  const labels = ISAK_MEASURES.filter((def) => keys.includes(def.key)).map((def) => def.missingLabel);
  return `Sin dato (falta ${labels.join(", ")})`;
}

// ─── Phantom y puntuación Z (Ross y Wilson 1974) ────────────────────────────

export const PHANTOM_HEIGHT_CM = 170.18;
export interface PhantomRef {
  p: number;
  s: number;
  /** 1 = longitudes, pliegues, perímetros y diámetros; 3 = masas. */
  d: 1 | 3;
}

/** k = 170.18 / talla(cm). */
export function phantomScale(heightCm: number): number {
  return PHANTOM_HEIGHT_CM / heightCm;
}

/** (v · k^d − p) / s, exacto. */
export function phantomZ(value: number, heightCm: number, ref: PhantomRef): number {
  return (value * phantomScale(heightCm) ** ref.d - ref.p) / ref.s;
}

export type PhantomKey =
  | Exclude<IsakMeasureKey, "heightCm">
  | "correctedArmCm"
  | "correctedThighCm"
  | "correctedCalfCm"
  | "fatMassKg"
  | "adiposeTissueKg"
  | "muscleTissueKg"
  | "boneTissueKg"
  | "residualTissueKg";

export const PHANTOM: Readonly<Record<PhantomKey, PhantomRef>> = {
  // Ross y Marfell-Jones (1991). D7: no reproduce exacto a ISAKMetry (A 0,42 vs 0,40; B 1,27 vs
  // 1,26); se deja el valor publicado y el test tolera ±0,02.
  weightKg: { p: 64.58, s: 8.6, d: 3 },
  // Ross y Marfell-Jones (1991): longitudes.
  sittingHeightCm: { p: 89.92, s: 4.5, d: 1 },
  armSpanCm: { p: 172.35, s: 7.41, d: 1 },
  // Ross y Marfell-Jones (1991): pliegues.
  tricepsSkinfoldMm: { p: 15.4, s: 4.47, d: 1 },
  subscapularSkinfoldMm: { p: 17.2, s: 5.07, d: 1 },
  bicepsSkinfoldMm: { p: 8.0, s: 2.0, d: 1 },
  iliacCrestSkinfoldMm: { p: 22.4, s: 6.8, d: 1 },
  supraspinaleSkinfoldMm: { p: 15.4, s: 4.47, d: 1 },
  abdominalSkinfoldMm: { p: 25.4, s: 7.78, d: 1 },
  thighSkinfoldMm: { p: 27.0, s: 8.33, d: 1 },
  calfSkinfoldMm: { p: 16.0, s: 4.67, d: 1 },
  // Ross y Marfell-Jones (1991): perímetros.
  armCm: { p: 26.89, s: 2.33, d: 1 },
  // D7: la tabla de Ross y Marfell-Jones trae s = 2,37; ISAKMetry usa 2,27 (reproduce A 1,67 y
  // B 2,18; con 2,37 daría 1,60 y 2,08). Se usa 2,27.
  armFlexedCm: { p: 29.41, s: 2.27, d: 1 },
  waistCm: { p: 71.91, s: 4.45, d: 1 },
  hipCm: { p: 94.67, s: 5.58, d: 1 },
  thighCm: { p: 53.2, s: 4.56, d: 1 }, // muslo medio
  calfCm: { p: 35.25, s: 2.3, d: 1 },
  // Ross y Marfell-Jones (1991): diámetros.
  humerusBreadthCm: { p: 6.48, s: 0.35, d: 1 },
  bistyloidBreadthCm: { p: 5.21, s: 0.28, d: 1 },
  femurBreadthCm: { p: 9.52, s: 0.48, d: 1 },
  // Perímetros corregidos (Phantom de Kerr, 1988).
  correctedArmCm: { p: 22.05, s: 1.91, d: 1 },
  // D5: ISAKMetry muestra el Z del muslo medio SIN corregir; acá se calcula con el Phantom del
  // muslo corregido (A 0,84, B 1,70).
  correctedThighCm: { p: 47.34, s: 3.59, d: 1 },
  correctedCalfCm: { p: 30.22, s: 1.97, d: 1 },
  // Masa grasa (Ross y Wilson).
  fatMassKg: { p: 12.13, s: 3.25, d: 3 },
  // Tejidos (Kerr, 1988).
  adiposeTissueKg: { p: 25.6, s: 5.85, d: 3 },
  muscleTissueKg: { p: 25.55, s: 2.99, d: 3 },
  boneTissueKg: { p: 10.49, s: 1.57, d: 3 },
  residualTissueKg: { p: 16.41, s: 1.9, d: 3 },
};

// ─── Durnin-Womersley (1974) + Siri (1961) ──────────────────────────────────

export interface DurninWomersleyCoefficients {
  c: number;
  m: number;
  ageRange: string;
}

/** Tabla de Durnin y Womersley (1974), log de la suma de 4 pliegues (D21: los 20 coeficientes
 *  confirmados contra la publicación). `minAge` inclusivo; el tramo sigue hasta el siguiente. */
const DW_TABLE: Readonly<Record<Sex, ReadonlyArray<{ minAge: number } & DurninWomersleyCoefficients>>> = {
  MALE: [
    { minAge: 17, c: 1.162, m: 0.063, ageRange: "17–19" },
    { minAge: 20, c: 1.1631, m: 0.0632, ageRange: "20–29" },
    { minAge: 30, c: 1.1422, m: 0.0544, ageRange: "30–39" },
    { minAge: 40, c: 1.162, m: 0.07, ageRange: "40–49" },
    { minAge: 50, c: 1.1715, m: 0.0779, ageRange: "50 o más" },
  ],
  FEMALE: [
    { minAge: 16, c: 1.1549, m: 0.0678, ageRange: "16–19" },
    { minAge: 20, c: 1.1599, m: 0.0717, ageRange: "20–29" },
    { minAge: 30, c: 1.1423, m: 0.0632, ageRange: "30–39" },
    { minAge: 40, c: 1.1333, m: 0.0612, ageRange: "40–49" },
    { minAge: 50, c: 1.1339, m: 0.0645, ageRange: "50 o más" },
  ],
};

/** Tramo por sexo y edad (años cumplidos). null si no hay ecuación: hombres < 17, mujeres < 16. */
export function durninWomersleyCoefficients(sex: Sex, ageYears: number): DurninWomersleyCoefficients | null {
  const rows = DW_TABLE[sex];
  let found: DurninWomersleyCoefficients | null = null;
  for (const row of rows) {
    if (ageYears >= row.minAge) found = { c: row.c, m: row.m, ageRange: row.ageRange };
  }
  return found;
}

/** Densidad corporal (g/ml), exacta. D = c − m · log10(Σ4). */
export function durninWomersleyDensity(p: { sex: Sex; ageYears: number; sum4SkinfoldsMm: number }): number | null {
  const coef = durninWomersleyCoefficients(p.sex, p.ageYears);
  if (coef === null) return null;
  return coef.c - coef.m * Math.log10(p.sum4SkinfoldsMm);
}

/** 495 / D − 450, exacto. */
export function siriBodyFatPercent(density: number): number {
  return 495 / density - 450;
}

// ─── Tejido adiposo: Kerr (1988) ────────────────────────────────────────────

type SkinfoldKey =
  | "tricepsSkinfoldMm"
  | "subscapularSkinfoldMm"
  | "supraspinaleSkinfoldMm"
  | "abdominalSkinfoldMm"
  | "thighSkinfoldMm"
  | "calfSkinfoldMm";
export type Sum6Input = Record<SkinfoldKey, number>;
export type Sum8Input = Sum6Input & Record<"bicepsSkinfoldMm" | "iliacCrestSkinfoldMm", number>;

/** tríceps + subescapular + supraespinal + abdominal + muslo + pierna. */
export function sum6SkinfoldsMm(m: Sum6Input): number {
  return (
    m.tricepsSkinfoldMm +
    m.subscapularSkinfoldMm +
    m.supraspinaleSkinfoldMm +
    m.abdominalSkinfoldMm +
    m.thighSkinfoldMm +
    m.calfSkinfoldMm
  );
}

/** Σ6 + bíceps + cresta ilíaca. */
export function sum8SkinfoldsMm(m: Sum8Input): number {
  return sum6SkinfoldsMm(m) + m.bicepsSkinfoldMm + m.iliacCrestSkinfoldMm;
}

/** (Σ6 · k − 116.41) / 34.79. */
export function kerrAdiposeZ(sum6Mm: number, heightCm: number): number {
  return (sum6Mm * phantomScale(heightCm) - 116.41) / 34.79;
}

/** (Z_adiposo · 5.85 + 25.6) / k³. */
export function kerrAdiposeTissueKg(sum6Mm: number, heightCm: number): number {
  const ref = PHANTOM.adiposeTissueKg;
  return (kerrAdiposeZ(sum6Mm, heightCm) * ref.s + ref.p) / phantomScale(heightCm) ** 3;
}

// ─── Perímetros corregidos y tejido muscular: Lee et al. (2000) ─────────────

/** perímetro(cm) − π · pliegue(mm) / 10, exacto. */
export function correctedGirthCm(girthCm: number, skinfoldMm: number): number {
  return girthCm - (Math.PI * skinfoldMm) / 10;
}

/** D14: 0 blancos/hispanos; −2,0 asiáticos; +1,1 afroamericanos. Patient no tiene el dato. */
export const LEE_ETHNICITY_TERM = 0;

/** talla(m) · (0.00744·PBC² + 0.00088·PMC² + 0.00441·PPC²) + 2.4·sexo − 0.048·edad + etnia + 7.8. */
export function leeMuscleMassKg(p: {
  heightCm: number;
  sex: Sex;
  ageYears: number;
  correctedArmCm: number;
  correctedThighCm: number;
  correctedCalfCm: number;
}): number {
  const heightM = p.heightCm / 100;
  const sexTerm = p.sex === "MALE" ? 1 : 0;
  return (
    heightM *
      (0.00744 * p.correctedArmCm ** 2 + 0.00088 * p.correctedThighCm ** 2 + 0.00441 * p.correctedCalfCm ** 2) +
    2.4 * sexTerm -
    0.048 * p.ageYears +
    LEE_ETHNICITY_TERM +
    7.8
  );
}

// ─── Tejido óseo: Rocha (1975) ──────────────────────────────────────────────

/** 3.02 · (talla(m)² · biestiloideo(m) · fémur(m) · 400)^0.712. */
export function rochaBoneMassKg(p: { heightCm: number; bistyloidBreadthCm: number; femurBreadthCm: number }): number {
  const h = p.heightCm / 100;
  return 3.02 * (h * h * (p.bistyloidBreadthCm / 100) * (p.femurBreadthCm / 100) * 400) ** 0.712;
}

// ─── Distribución ───────────────────────────────────────────────────────────

/** (tríceps + subescapular) / Σ6, (supraespinal + abdominal) / Σ6, (muslo + pierna) / Σ6. Fracciones 0..1, exactas. */
export function adiposeDistribution(m: Sum6Input): { upper: number; central: number; lower: number } {
  const sum = sum6SkinfoldsMm(m);
  return {
    upper: (m.tricepsSkinfoldMm + m.subscapularSkinfoldMm) / sum,
    central: (m.supraspinaleSkinfoldMm + m.abdominalSkinfoldMm) / sum,
    lower: (m.thighSkinfoldMm + m.calfSkinfoldMm) / sum,
  };
}

/** PBC / (PBC+PMC+PPC), PMC / …, PPC / …. Fracciones exactas. */
export function muscleDistribution(c: { arm: number; thigh: number; calf: number }): {
  arm: number;
  thigh: number;
  calf: number;
} {
  const sum = c.arm + c.thigh + c.calf;
  return { arm: c.arm / sum, thigh: c.thigh / sum, calf: c.calf / sum };
}

/** D11 (deducida, aislada para cambiarla fácil): (tríceps + muslo + pierna) / (subescapular + supraespinal + abdominal). */
export function fatDistributionIndex(m: Sum6Input): number {
  return (
    (m.tricepsSkinfoldMm + m.thighSkinfoldMm + m.calfSkinfoldMm) /
    (m.subscapularSkinfoldMm + m.supraspinaleSkinfoldMm + m.abdominalSkinfoldMm)
  );
}

// ─── Índices de composición ─────────────────────────────────────────────────

/** adiposo / muscular, con los kg ya redondeados a 2 (lo hace el que llama). D8: sin categoría. */
export function adiposeMuscleIndex(adiposeKg: number, muscleKg: number): number {
  return adiposeKg / muscleKg;
}

/** muscular / óseo, con los kg redondeados a 2. */
export function muscleBoneIndex(muscleKg: number, boneKg: number): number {
  return muscleKg / boneKg;
}

export type MuscleBoneClass = "VERY_LOW" | "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH";
export const MUSCLE_BONE_CLASS_LABELS: Record<MuscleBoneClass, string> = {
  VERY_LOW: "Muy bajo",
  LOW: "Bajo",
  MEDIUM: "Medio",
  HIGH: "Alto",
  VERY_HIGH: "Muy alto",
};

/** Tabla para mostrar (desplegable). */
export const MUSCLE_BONE_TABLE: ReadonlyArray<{ key: MuscleBoneClass; range: string }> = [
  { key: "VERY_LOW", range: "< 2,34" },
  { key: "LOW", range: "2,34 a < 2,44" },
  { key: "MEDIUM", range: "2,44 a < 3,11" },
  { key: "HIGH", range: "3,11 a 3,29" },
  { key: "VERY_HIGH", range: "> 3,29" },
];

/** D9. Con roundTo(v, 2): < 2.34 VERY_LOW; < 2.44 LOW; < 3.11 MEDIUM; <= 3.29 HIGH; resto VERY_HIGH. Misma tabla para los dos sexos. */
export function classifyMuscleBoneIndex(value: number): MuscleBoneClass {
  const v = roundTo(value, 2);
  if (v < 2.34) return "VERY_LOW";
  if (v < 2.44) return "LOW";
  if (v < 3.11) return "MEDIUM";
  if (v <= 3.29) return "HIGH";
  return "VERY_HIGH";
}

// ─── Proporcionalidad ───────────────────────────────────────────────────────

/** talla sentado / talla. */
export function cormicIndex(sittingHeightCm: number, heightCm: number): number {
  return sittingHeightCm / heightCm;
}

/** (talla − sentado) / sentado · 100. */
export function manouvrierIndex(sittingHeightCm: number, heightCm: number): number {
  return ((heightCm - sittingHeightCm) / sittingHeightCm) * 100;
}

/** envergadura / talla. */
export function relativeArmSpan(armSpanCm: number, heightCm: number): number {
  return armSpanCm / heightCm;
}

export type CormicClass = "BRACHYCORMIC" | "METRICORMIC" | "MACROCORMIC";
export const CORMIC_CLASS_LABELS = {
  BRACHYCORMIC: "Braquicórmico (tronco corto)",
  METRICORMIC: "Metricórmico (tronco medio)",
  MACROCORMIC: "Macrocórmico (tronco largo)",
} as const;

/** D10. v = roundTo(x, 2): <= 0.50 BRACHY; <= 0.52 METRI; resto MACRO. Misma tabla para los dos sexos. */
export function classifyCormicIndex(value: number): CormicClass {
  const v = roundTo(value, 2);
  if (v <= 0.5) return "BRACHYCORMIC";
  if (v <= 0.52) return "METRICORMIC";
  return "MACROCORMIC";
}

export type ManouvrierClass = "BRACHYSKELIC" | "MESATISKELIC" | "MACROSKELIC";
export const MANOUVRIER_CLASS_LABELS = {
  BRACHYSKELIC: "Miembros inferiores cortos",
  MESATISKELIC: "Miembros inferiores medios",
  MACROSKELIC: "Miembros inferiores largos",
} as const;

/** v = roundTo(x, 0) (se muestra entero): < 85 BRACHY; < 90 MESATI; resto MACRO. */
export function classifyManouvrierIndex(value: number): ManouvrierClass {
  const v = roundTo(value, 0);
  if (v < 85) return "BRACHYSKELIC";
  if (v < 90) return "MESATISKELIC";
  return "MACROSKELIC";
}

export type RelativeSpanClass = "GREATER" | "EQUAL" | "LESS";
export const RELATIVE_SPAN_CLASS_LABELS = {
  GREATER: "Envergadura mayor a la talla",
  EQUAL: "Envergadura igual a la talla",
  LESS: "Envergadura menor a la talla",
} as const;

/** v = roundTo(x, 2): > 1 GREATER; === 1 EQUAL; < 1 LESS. */
export function classifyRelativeArmSpan(value: number): RelativeSpanClass {
  const v = roundTo(value, 2);
  if (v > 1) return "GREATER";
  if (v === 1) return "EQUAL";
  return "LESS";
}

// ─── Somatotipo de Heath-Carter ─────────────────────────────────────────────

/** Piso de la escala. Para la ectomorfia es la regla del manual (Carter 2002); para la
 *  endomorfia y la mesomorfia es una decisión de diseño: la escala no tiene valores ≤ 0 y solo
 *  pasa con medidas absurdas. */
const SOMATOTYPE_FLOOR = 0.1;
const withFloor = (v: number) => (v <= 0 ? SOMATOTYPE_FLOOR : v);

/** X = (tríceps + subescapular + supraespinal) · k; −0.7182 + 0.1451·X − 0.00068·X² + 0.0000014·X³. */
export function endomorphy(p: {
  tricepsSkinfoldMm: number;
  subscapularSkinfoldMm: number;
  supraspinaleSkinfoldMm: number;
  heightCm: number;
}): number {
  const x = (p.tricepsSkinfoldMm + p.subscapularSkinfoldMm + p.supraspinaleSkinfoldMm) * phantomScale(p.heightCm);
  return withFloor(-0.7182 + 0.1451 * x - 0.00068 * x ** 2 + 0.0000014 * x ** 3);
}

/** 0.858·húmero + 0.601·fémur + 0.188·(brazo flexionado − tríceps/10) + 0.161·(pierna − pliegue pierna/10) − 0.131·talla + 4.5. */
export function mesomorphy(p: {
  humerusBreadthCm: number;
  femurBreadthCm: number;
  armFlexedCm: number;
  tricepsSkinfoldMm: number;
  calfCm: number;
  calfSkinfoldMm: number;
  heightCm: number;
}): number {
  return withFloor(
    0.858 * p.humerusBreadthCm +
      0.601 * p.femurBreadthCm +
      0.188 * (p.armFlexedCm - p.tricepsSkinfoldMm / 10) +
      0.161 * (p.calfCm - p.calfSkinfoldMm / 10) -
      0.131 * p.heightCm +
      4.5,
  );
}

/** HWR = talla / masa^(1/3). */
export function heightWeightRatio(heightCm: number, weightKg: number): number {
  return heightCm / Math.cbrt(weightKg);
}

/** HWR >= 40.75 → 0.732·HWR − 28.58; 38.25 < HWR < 40.75 → 0.463·HWR − 17.63; HWR <= 38.25 → 0.1. */
export function ectomorphy(heightCm: number, weightKg: number): number {
  const hwr = heightWeightRatio(heightCm, weightKg);
  if (hwr >= 40.75) return withFloor(0.732 * hwr - 28.58);
  if (hwr > 38.25) return withFloor(0.463 * hwr - 17.63);
  return SOMATOTYPE_FLOOR;
}

/** X = ecto − endo; Y = 2·meso − (endo + ecto). Con los componentes sin redondear. */
export function somatochartPoint(s: { endo: number; meso: number; ecto: number }): { x: number; y: number } {
  return { x: s.ecto - s.endo, y: 2 * s.meso - (s.endo + s.ecto) };
}

export type SomatotypeCategory =
  | "BALANCED_ENDOMORPH"
  | "MESOMORPHIC_ENDOMORPH"
  | "ENDOMORPH_MESOMORPH"
  | "ENDOMORPHIC_MESOMORPH"
  | "BALANCED_MESOMORPH"
  | "ECTOMORPHIC_MESOMORPH"
  | "MESOMORPH_ECTOMORPH"
  | "MESOMORPHIC_ECTOMORPH"
  | "BALANCED_ECTOMORPH"
  | "ENDOMORPHIC_ECTOMORPH"
  | "ENDOMORPH_ECTOMORPH"
  | "ECTOMORPHIC_ENDOMORPH"
  | "CENTRAL";

/** Convención en castellano: "X-Y" = Y dominante con X segundo; "Xmorfo-Ymorfo" = dos iguales. */
export const SOMATOTYPE_CATEGORY_LABELS: Record<SomatotypeCategory, string> = {
  BALANCED_ENDOMORPH: "Endomorfo balanceado",
  MESOMORPHIC_ENDOMORPH: "Meso-endomorfo",
  ENDOMORPH_MESOMORPH: "Endomorfo-mesomorfo",
  ENDOMORPHIC_MESOMORPH: "Endo-mesomorfo",
  BALANCED_MESOMORPH: "Mesomorfo balanceado",
  ECTOMORPHIC_MESOMORPH: "Ecto-mesomorfo",
  MESOMORPH_ECTOMORPH: "Mesomorfo-ectomorfo",
  MESOMORPHIC_ECTOMORPH: "Meso-ectomorfo",
  BALANCED_ECTOMORPH: "Ectomorfo balanceado",
  ENDOMORPHIC_ECTOMORPH: "Endo-ectomorfo",
  ENDOMORPH_ECTOMORPH: "Endomorfo-ectomorfo",
  ECTOMORPHIC_ENDOMORPH: "Ecto-endomorfo",
  CENTRAL: "Central",
};

type SomatoComponent = "endo" | "meso" | "ecto";
const EPS = 1e-9;

const PAIR_CATEGORY: Record<string, SomatotypeCategory> = {
  "endo+meso": "ENDOMORPH_MESOMORPH",
  "meso+ecto": "MESOMORPH_ECTOMORPH",
  "endo+ecto": "ENDOMORPH_ECTOMORPH",
};
const BALANCED_CATEGORY: Record<SomatoComponent, SomatotypeCategory> = {
  endo: "BALANCED_ENDOMORPH",
  meso: "BALANCED_MESOMORPH",
  ecto: "BALANCED_ECTOMORPH",
};
/** Clave `${first}>${second}`: dominante y segundo. */
const DOMINANT_CATEGORY: Record<string, SomatotypeCategory> = {
  "endo>meso": "MESOMORPHIC_ENDOMORPH",
  "endo>ecto": "ECTOMORPHIC_ENDOMORPH",
  "meso>endo": "ENDOMORPHIC_MESOMORPH",
  "meso>ecto": "ECTOMORPHIC_MESOMORPH",
  "ecto>endo": "ENDOMORPHIC_ECTOMORPH",
  "ecto>meso": "MESOMORPHIC_ECTOMORPH",
};
const COMPONENT_ORDER: readonly SomatoComponent[] = ["endo", "meso", "ecto"];

/** Con los componentes ya redondeados a 2 (lo que se muestra). Carter y Heath (1990):
 *  dos componentes son "iguales" si difieren en 0,5 o menos. */
export function classifySomatotype(s: { endo: number; meso: number; ecto: number }): SomatotypeCategory {
  const values = COMPONENT_ORDER.map((c) => s[c]);
  if (Math.max(...values) - Math.min(...values) <= 1 + EPS) return "CENTRAL";
  const eq = (a: number, b: number) => Math.abs(a - b) <= 0.5 + EPS;
  // Orden estable: en empate exacto queda endo, meso, ecto.
  const [first, second, third] = [...COMPONENT_ORDER].sort((a, b) => s[b] - s[a]) as [
    SomatoComponent,
    SomatoComponent,
    SomatoComponent,
  ];
  if (eq(s[first], s[second])) {
    const pair = COMPONENT_ORDER.filter((c) => c === first || c === second).join("+");
    return PAIR_CATEGORY[pair]!;
  }
  if (eq(s[second], s[third])) return BALANCED_CATEGORY[first];
  return DOMINANT_CATEGORY[`${first}>${second}`]!;
}

/** Vértices de la somatocarta (Reuleaux simplificado a triángulo; el contorno curvo es de la HU-007). */
export const SOMATOCHART_VERTICES = {
  endomorph: { x: -6, y: -6 }, // 7-1-1
  mesomorph: { x: 0, y: 12 }, // 1-7-1
  ectomorph: { x: 6, y: -6 }, // 1-1-7
} as const;
export const SOMATOCHART_DOMAIN = { x: [-8, 8], y: [-10, 16] } as const;
