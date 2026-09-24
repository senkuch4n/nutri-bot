import { bmiExact, roundTo } from "./anthropometry";
import { DIAGNOSIS_MISSING_TEXT } from "./diagnosis-missing-text";
import {
  PEDIATRIC_TEXT,
  ageMonthsLabel,
  formatFixedEs,
  formatSignedFixedEs,
  type Sex,
} from "./patient-formula-data";
import { WHO_LMS, WHO_LMS_FIRST_MONTH, WHO_LMS_LAST_MONTH, type WhoIndicator } from "./who/who-lms-data";

export { WHO_LMS_SOURCES, WHO_LMS_DOWNLOADED_AT, type WhoIndicator } from "./who/who-lms-data";

/**
 * HU-008 (épica 56): referencia de crecimiento de la OMS 2007 para pacientes de 5 a 17 años.
 * IMC para la edad y talla para la edad con el método LMS, la extensión de la OMS para las Z
 * extremas del IMC, el percentil y la clasificación. Las tablas L, M, S están en ./who/ (generadas
 * desde los .xlsx oficiales). No se guarda nada: se calcula en cada render.
 */

export interface LmsRow {
  month: number;
  L: number;
  M: number;
  S: number;
}

/** Fila del mes exacto; null si el mes está fuera de 60…228. */
export function whoLmsRow(indicator: WhoIndicator, sex: Sex, ageMonths: number): LmsRow | null {
  if (!Number.isInteger(ageMonths) || ageMonths < WHO_LMS_FIRST_MONTH || ageMonths > WHO_LMS_LAST_MONTH) {
    return null;
  }
  const tuple = WHO_LMS[indicator][sex][ageMonths - WHO_LMS_FIRST_MONTH];
  if (!tuple || tuple[0] !== ageMonths) return null;
  const [month, L, M, S] = tuple;
  return { month, L, M, S };
}

/** Z LMS directa: L ≠ 0 → ((x/M)^L − 1)/(L·S); L = 0 → ln(x/M)/S. */
export function lmsZScore(value: number, row: LmsRow): number {
  const { L, M, S } = row;
  if (L === 0) return Math.log(value / M) / S;
  return (Math.pow(value / M, L) - 1) / (L * S);
}

/** Valor en la Z dada: M·(1 + L·S·z)^(1/L) (L = 0 → M·e^(S·z)). */
export function lmsValueAtZ(row: LmsRow, z: number): number {
  const { L, M, S } = row;
  if (L === 0) return M * Math.exp(S * z);
  return M * Math.pow(1 + L * S * z, 1 / L);
}

/** IMC/E con la extensión de la OMS (D6), exacta (sin redondear):
 *  z = lmsZScore; si z > 3: 3 + (x − SD3)/(SD3 − SD2); si z < −3: −3 + (x − SD3neg)/(SD2neg − SD3neg),
 *  con SDk = lmsValueAtZ(row, k). */
export function bmiForAgeZScore(bmi: number, row: LmsRow): number {
  const z = lmsZScore(bmi, row);
  if (z > 3) {
    const sd3 = lmsValueAtZ(row, 3);
    const sd2 = lmsValueAtZ(row, 2);
    return 3 + (bmi - sd3) / (sd3 - sd2);
  }
  if (z < -3) {
    const sd3neg = lmsValueAtZ(row, -3);
    const sd2neg = lmsValueAtZ(row, -2);
    return -3 + (bmi - sd3neg) / (sd2neg - sd3neg);
  }
  return z;
}

/** T/E: lmsZScore directa, sin extensión (en la OMS 2007, L = 1: distribución normal). */
export function heightForAgeZScore(heightCm: number, row: LmsRow): number {
  return lmsZScore(heightCm, row);
}

/**
 * erfc(x) de Numerical Recipes ("erfcc"), aproximación de Chebyshev con error relativo < 1,2e-7:
 *   t = 1 / (1 + z/2), z = |x|
 *   erfc(z) = t · exp(−z² − 1,26551223 + t·(1,00002368 + t·(0,37409196 + t·(0,09678418 +
 *             t·(−0,18628806 + t·(0,27886807 + t·(−1,13520398 + t·(1,48851587 +
 *             t·(−0,82215223 + t·0,17087277)))))))))
 *   erfc(−z) = 2 − erfc(z).
 */
function erfc(x: number): number {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const ans =
    t *
    Math.exp(
      -z * z -
        1.26551223 +
        t *
          (1.00002368 +
            t *
              (0.37409196 +
                t *
                  (0.09678418 +
                    t *
                      (-0.18628806 +
                        t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))),
    );
  return x >= 0 ? ans : 2 - ans;
}

/** Φ(z), normal estándar: 0,5·erfc(−z/√2). */
export function normalCdf(z: number): number {
  return 0.5 * erfc(-z / Math.SQRT2);
}

/** Percentil entero sobre la Z YA redondeada a 2 decimales (la que se muestra):
 *  r = Math.round(Φ(zRounded)·100); r < 1 → "< P1"; r > 99 → "> P99"; si no, `P${r}`. */
export function formatPercentile(zRounded: number): string {
  const r = Math.round(normalCdf(zRounded) * 100);
  if (r < 1) return "< P1";
  if (r > 99) return "> P99";
  return `P${r}`;
}

/** "Z +0,45 · P67" (formatSignedFixedEs(z, 2): U+2212, sin signo en 0,00). Con percentil "" → "Z −6,46". */
export function growthZText(zRounded: number, percentileText: string): string {
  const z = `Z ${formatSignedFixedEs(zRounded, 2)}`;
  return percentileText === "" ? z : `${z} · ${percentileText}`;
}

export type BmiForAgeClass = "SEVERE_THINNESS" | "THINNESS" | "NORMAL" | "OVERWEIGHT" | "OBESITY";
export type HeightForAgeClass = "SEVERELY_STUNTED" | "STUNTED" | "ADEQUATE";

export const BMI_FOR_AGE_CLASS_LABELS: Record<BmiForAgeClass, string> = {
  SEVERE_THINNESS: "Delgadez severa",
  THINNESS: "Delgadez",
  NORMAL: "Normal",
  OVERWEIGHT: "Sobrepeso",
  OBESITY: "Obesidad",
};

export const HEIGHT_FOR_AGE_CLASS_LABELS: Record<HeightForAgeClass, string> = {
  SEVERELY_STUNTED: "Talla baja severa",
  STUNTED: "Talla baja",
  ADEQUATE: "Talla adecuada",
};

/** Sobre la Z redondeada (D4): < −3 severa; −3 ≤ z < −2 delgadez; −2 ≤ z ≤ +1 normal;
 *  +1 < z ≤ +2 sobrepeso; > +2 obesidad. */
export function classifyBmiForAge(zRounded: number): BmiForAgeClass {
  if (zRounded < -3) return "SEVERE_THINNESS";
  if (zRounded < -2) return "THINNESS";
  if (zRounded <= 1) return "NORMAL";
  if (zRounded <= 2) return "OVERWEIGHT";
  return "OBESITY";
}

/** < −3 talla baja severa; −3 ≤ z < −2 talla baja; ≥ −2 adecuada (D5). */
export function classifyHeightForAge(zRounded: number): HeightForAgeClass {
  if (zRounded < -3) return "SEVERELY_STUNTED";
  if (zRounded < -2) return "STUNTED";
  return "ADEQUATE";
}

export const IMPLAUSIBLE_Z_LIMIT: Record<WhoIndicator, number> = { BMI_FOR_AGE: 5, HEIGHT_FOR_AGE: 6 };

/** |zRounded| > límite (estricto): −5,00 no es implausible; −5,01 sí. */
export function isImplausibleZ(indicator: WhoIndicator, zRounded: number): boolean {
  return Math.abs(zRounded) > IMPLAUSIBLE_Z_LIMIT[indicator];
}

/** Fila de un indicador pediátrico. value ya redondeado a lo que se muestra
 *  (IMC 1 decimal; talla tal cual se midió). z redondeada a 2 decimales. */
export type GrowthRow<K extends string> =
  | { status: "classified"; value: number; ageMonths: number; z: number; percentileText: string; classKey: K; classLabel: string }
  | { status: "implausible"; value: number; ageMonths: number; z: number; note: string }
  | { status: "unclassified"; value: number; ageMonths: number | null; note: string }
  | { status: "missing"; note: string };

/** -0 → 0, para que un 0,00 negativo no se cuele en los asserts ni en el texto. */
function roundZ(z: number): number {
  const r = roundTo(z, 2);
  return r === 0 ? 0 : r;
}

/** Pasos 4 a 9 comunes a los dos indicadores. */
function classifyGrowth<K extends string>(params: {
  indicator: WhoIndicator;
  sex: Sex | null;
  ageMonths: number | null;
  value: number;
  zOf: (row: LmsRow) => number;
  classify: (z: number) => K;
  labels: Record<K, string>;
}): GrowthRow<K> {
  const { indicator, sex, ageMonths, value } = params;
  if (ageMonths === null) {
    return { status: "unclassified", value, ageMonths: null, note: DIAGNOSIS_MISSING_TEXT.missingBirthDate };
  }
  if (sex === null) return { status: "unclassified", value, ageMonths, note: DIAGNOSIS_MISSING_TEXT.missingSex };
  const row = whoLmsRow(indicator, sex, ageMonths);
  if (row === null) {
    return { status: "unclassified", value, ageMonths, note: PEDIATRIC_TEXT.noReferenceForMeasurementAge };
  }
  const z = roundZ(params.zOf(row));
  if (isImplausibleZ(indicator, z)) {
    return { status: "implausible", value, ageMonths, z, note: PEDIATRIC_TEXT.implausible };
  }
  const classKey = params.classify(z);
  return {
    status: "classified",
    value,
    ageMonths,
    z,
    percentileText: formatPercentile(z),
    classKey,
    classLabel: params.labels[classKey],
  };
}

/** Orden de los chequeos:
 *  1) weightKg null → missing DIAGNOSIS_TEXT.missingWeight;
 *  2) heightCm null → missing DIAGNOSIS_TEXT.missingHeight;
 *  3) value = roundTo(bmiExact(w, h), 1);
 *  4) ageMonths null → unclassified DIAGNOSIS_TEXT.missingBirthDate (ageMonths null);
 *  5) sex null → unclassified DIAGNOSIS_TEXT.missingSex (con ageMonths);
 *  6) whoLmsRow null → unclassified PEDIATRIC_TEXT.noReferenceForMeasurementAge;
 *  7) z = roundTo(bmiForAgeZScore(bmiExact, row), 2)  ← la Z sale del IMC EXACTO;
 *  8) isImplausibleZ → implausible con PEDIATRIC_TEXT.implausible;
 *  9) classified con formatPercentile(z) y classifyBmiForAge(z). */
export function buildBmiForAgeRow(input: {
  sex: Sex | null;
  ageMonths: number | null;
  weightKg: number | null;
  heightCm: number | null;
}): GrowthRow<BmiForAgeClass> {
  const { weightKg, heightCm } = input;
  if (weightKg === null) return { status: "missing", note: DIAGNOSIS_MISSING_TEXT.missingWeight };
  if (heightCm === null) return { status: "missing", note: DIAGNOSIS_MISSING_TEXT.missingHeight };
  const exact = bmiExact(weightKg, heightCm);
  return classifyGrowth({
    indicator: "BMI_FOR_AGE",
    sex: input.sex,
    ageMonths: input.ageMonths,
    value: roundTo(exact, 1),
    zOf: (row) => bmiForAgeZScore(exact, row),
    classify: classifyBmiForAge,
    labels: BMI_FOR_AGE_CLASS_LABELS,
  });
}

/** Igual, con heightCm (missingHeight si null), heightForAgeZScore, límite 6 y classifyHeightForAge.
 *  value = heightCm tal cual. */
export function buildHeightForAgeRow(input: {
  sex: Sex | null;
  ageMonths: number | null;
  heightCm: number | null;
}): GrowthRow<HeightForAgeClass> {
  const { heightCm } = input;
  if (heightCm === null) return { status: "missing", note: DIAGNOSIS_MISSING_TEXT.missingHeight };
  return classifyGrowth({
    indicator: "HEIGHT_FOR_AGE",
    sex: input.sex,
    ageMonths: input.ageMonths,
    value: heightCm,
    zOf: (row) => heightForAgeZScore(heightCm, row),
    classify: classifyHeightForAge,
    labels: HEIGHT_FOR_AGE_CLASS_LABELS,
  });
}

export interface PediatricDiagnosis {
  bmiForAge: GrowthRow<BmiForAgeClass>;
  heightForAge: GrowthRow<HeightForAgeClass>;
  /** Pie gris (ver pediatricFooterText). */
  footer: string;
}

function ageMonthsOf(row: GrowthRow<string>): number | null {
  return row.status === "missing" ? null : row.ageMonths;
}

/** Con los ageMonths no nulos de las dos filas:
 *  - ninguno: "Referencia: OMS 2007."
 *  - iguales (o uno solo): `Referencia: OMS 2007. Edad: ${ageMonthsLabel(m)}.`
 *  - distintos (D8): `Referencia: OMS 2007. Edad a cada medición: IMC/E ${a} meses, T/E ${b} meses.` */
export function pediatricFooterText(bmiForAge: GrowthRow<string>, heightForAge: GrowthRow<string>): string {
  const a = ageMonthsOf(bmiForAge);
  const b = ageMonthsOf(heightForAge);
  const base = "Referencia: OMS 2007.";
  if (a === null && b === null) return base;
  if (a === null || b === null || a === b) return `${base} Edad: ${ageMonthsLabel((a ?? b)!)}.`;
  return `${base} Edad a cada medición: IMC/E ${a} meses, T/E ${b} meses.`;
}

/** "Valor fuera de rango: revisá la medición." → "Valor fuera de rango" (celda del informe). */
const IMPLAUSIBLE_SHORT = PEDIATRIC_TEXT.implausible.split(":")[0]!;

/** Celda del informe (HU-007):
 *  classified   → "17,8 · Normal (Z −0,02, P49)" / "150,0 cm · Talla adecuada (Z −0,26, P40)"
 *  implausible  → "9,3 · Valor fuera de rango (Z −6,46)"
 *  unclassified → "17,8" / "150,0 cm"
 *  missing      → noData ("Sin dato"; el caller la pasa) */
export function growthReportCell(row: GrowthRow<string>, unit: "" | "cm", noData: string): string {
  if (row.status === "missing") return noData;
  const n = formatFixedEs(row.value, 1);
  const valueText = unit ? `${n} ${unit}` : n;
  if (row.status === "unclassified") return valueText;
  const z = `Z ${formatSignedFixedEs(row.z, 2)}`;
  if (row.status === "implausible") return `${valueText} · ${IMPLAUSIBLE_SHORT} (${z})`;
  return `${valueText} · ${row.classLabel} (${z}, ${row.percentileText})`;
}
