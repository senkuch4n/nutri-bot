import {
  ADJUSTED_WEIGHT_THRESHOLD_PERCENT,
  BMI_CLASS_LABELS,
  CONICITY_HEALTHY_MAX,
  HEALTHY_RANGE_LABELS,
  IDEAL_WEIGHT_FORMULA_LABELS,
  WAIST_HIP_RISK_LABELS,
  WAIST_RISK_LABELS,
  WAIST_TO_HEIGHT_HEALTHY_MAX,
  adjustedWeightKg,
  bmiExact,
  brocaBrugschIdealWeightKg,
  brocaIdealWeightKg,
  classifyBmi,
  classifyHealthyBelow,
  classifyWaist,
  classifyWaistHipRatio,
  computeWaistHipRatio,
  conicityIndex,
  deurenbergBodyFatPercent,
  devineIdealWeightKg,
  hamwiIdealWeightKg,
  lorentzIdealWeightKg,
  percentOfIdealWeight,
  roundTo,
  shouldSuggestAdjustedWeight,
  waistHipThresholdText,
  waistToHeightRatio,
  type BmiClass,
  type HealthyRangeClass,
  type IdealWeightFormula,
  type WaistHipRisk,
  type WaistRisk,
} from "./anthropometry";
import { DIAGNOSIS_MISSING_TEXT } from "./diagnosis-missing-text";
import {
  buildBmiForAgeRow,
  buildHeightForAgeRow,
  pediatricFooterText,
  type PediatricDiagnosis,
} from "./growth-reference";
import {
  ageGroupOf,
  bodyFrameLabel,
  effectiveBodyFrame,
  formatDecimalEs,
  isMinor,
  type AgeGroup,
  type BodyFrame,
  type Sex,
} from "./patient-formula-data";

/**
 * HU-004 (épica 19): diagnóstico antropométrico de una consulta. Se calcula en cada render con
 * las mediciones elegidas por pickFormulaMeasurements (D4). No se guarda.
 */

export interface DiagnosisInput {
  sex: Sex | null;
  /** A la fecha de la consulta; null = sin fecha de nacimiento. */
  ageYears: number | null;
  /** null → Mediana asumida (effectiveBodyFrame). */
  bodyFrame: BodyFrame | null;
  weightKg: number | null;
  heightCm: number | null;
  waistCm: number | null;
  hipCm: number | null;
  /** HU-008 (D8): meses cumplidos a la fecha de la medición del PESO. Solo se usa en PEDIATRIC.
   *  Opcional para no romper a quien no lo pasa; los callers de producción lo pasan SIEMPRE. */
  weightAgeMonths?: number | null;
  /** Ídem, a la fecha de la medición de la TALLA. */
  heightAgeMonths?: number | null;
}

/** Fila de un indicador. `value` ya redondeado a lo que se muestra. */
export type DiagnosisRow<K extends string> =
  | { status: "classified"; value: number; classKey: K; classLabel: string }
  | { status: "unclassified"; value: number; note: string | null }
  | { status: "missing"; note: string };

export interface IdealWeightRow {
  formula: IdealWeightFormula;
  label: string;
  /** Redondeado a 1 decimal; null si falta sexo. */
  valueKg: number | null;
  /** "Falta sexo" cuando valueKg es null. */
  note: string | null;
}

export interface AnthropometricDiagnosis {
  /** true para PEDIATRIC y UNDER_5 (igual que hoy: isMinor). */
  minor: boolean;
  /** HU-008. */
  ageGroup: AgeGroup;
  /** true si faltan peso y talla a la vez: la UI muestra solo el texto de vacío. */
  noMeasurements: boolean;
  /** Menor → "unclassified" con note null. */
  bmi: DiagnosisRow<BmiClass>;
  // Todo lo que sigue es null si minor:
  waist: DiagnosisRow<WaistRisk> | null;
  waistHipRatio: (DiagnosisRow<WaistHipRisk> & { thresholdText: string | null }) | null;
  waistToHeight: DiagnosisRow<HealthyRangeClass> | null;
  conicity: DiagnosisRow<HealthyRangeClass> | null;
  estimatedBodyFat: { status: "ok"; value: number } | { status: "missing"; note: string } | null;
  /** 5 filas: Devine, Hamwi, Broca, Broca-Brugsch, Lorentz; null si falta talla. */
  idealWeights: IdealWeightRow[] | null;
  /** % del peso ideal de Devine (1 decimal). null si falta peso, talla o sexo. */
  percentOfIdealDevine: number | null;
  /** Aviso de peso ajustado. null si no corresponde. */
  adjustedWeightSuggestion: { adjustedKg: number; thresholdPercent: number } | null;
  /** HU-008: solo PEDIATRIC; null en ADULT y UNDER_5. */
  pediatric: PediatricDiagnosis | null;
}

/** Textos exactos de faltantes. */
export const DIAGNOSIS_TEXT = {
  missingWeight: DIAGNOSIS_MISSING_TEXT.missingWeight,
  missingHeight: DIAGNOSIS_MISSING_TEXT.missingHeight,
  missingWaist: "Sin dato (falta cintura)",
  missingHip: "Sin dato (falta cadera)",
  missingSex: DIAGNOSIS_MISSING_TEXT.missingSex,
  missingBirthDate: DIAGNOSIS_MISSING_TEXT.missingBirthDate,
  noMeasurements: "Cargá peso y talla en Mediciones para ver el diagnóstico.",
  adjustedWeightAlert: (adjustedKg: number) =>
    `El peso actual supera el ${ADJUSTED_WEIGHT_THRESHOLD_PERCENT} % del peso ideal. Se sugiere calcular con peso ajustado: ${formatDecimalEs(adjustedKg, 1)} kg.`,
  percentOfIdeal: (percent: number) => `Peso actual: ${formatDecimalEs(percent, 1)} % del peso ideal (Devine)`,
} as const;

function missing(note: string): { status: "missing"; note: string } {
  return { status: "missing", note };
}

function healthyRow(value: number, max: number): DiagnosisRow<HealthyRangeClass> {
  const rounded = roundTo(value, 2);
  const classKey = classifyHealthyBelow(rounded, max);
  return { status: "classified", value: rounded, classKey, classLabel: HEALTHY_RANGE_LABELS[classKey] };
}

function buildBmiRow(input: DiagnosisInput, minor: boolean): DiagnosisRow<BmiClass> {
  if (input.weightKg === null) return missing(DIAGNOSIS_TEXT.missingWeight);
  if (input.heightCm === null) return missing(DIAGNOSIS_TEXT.missingHeight);
  const value = roundTo(bmiExact(input.weightKg, input.heightCm), 1);
  if (minor) return { status: "unclassified", value, note: null };
  const classKey = classifyBmi(value);
  return { status: "classified", value, classKey, classLabel: BMI_CLASS_LABELS[classKey] };
}

function buildWaistRow(input: DiagnosisInput): DiagnosisRow<WaistRisk> {
  if (input.waistCm === null) return missing(DIAGNOSIS_TEXT.missingWaist);
  if (input.sex === null) return { status: "unclassified", value: input.waistCm, note: DIAGNOSIS_TEXT.missingSex };
  const classKey = classifyWaist(input.sex, input.waistCm);
  return { status: "classified", value: input.waistCm, classKey, classLabel: WAIST_RISK_LABELS[classKey] };
}

function buildWaistHipRow(
  input: DiagnosisInput,
): DiagnosisRow<WaistHipRisk> & { thresholdText: string | null } {
  if (input.waistCm === null) return { ...missing(DIAGNOSIS_TEXT.missingWaist), thresholdText: null };
  if (input.hipCm === null) return { ...missing(DIAGNOSIS_TEXT.missingHip), thresholdText: null };
  const value = computeWaistHipRatio(input.waistCm, input.hipCm);
  if (value === null) return { ...missing(DIAGNOSIS_TEXT.missingHip), thresholdText: null };
  if (input.sex === null) {
    return { status: "unclassified", value, note: DIAGNOSIS_TEXT.missingSex, thresholdText: null };
  }
  const classKey = classifyWaistHipRatio(input.sex, value);
  return {
    status: "classified",
    value,
    classKey,
    classLabel: WAIST_HIP_RISK_LABELS[classKey],
    thresholdText: waistHipThresholdText(input.sex),
  };
}

function buildWaistToHeightRow(input: DiagnosisInput): DiagnosisRow<HealthyRangeClass> {
  if (input.waistCm === null) return missing(DIAGNOSIS_TEXT.missingWaist);
  if (input.heightCm === null) return missing(DIAGNOSIS_TEXT.missingHeight);
  return healthyRow(waistToHeightRatio(input.waistCm, input.heightCm), WAIST_TO_HEIGHT_HEALTHY_MAX);
}

function buildConicityRow(input: DiagnosisInput): DiagnosisRow<HealthyRangeClass> {
  if (input.waistCm === null) return missing(DIAGNOSIS_TEXT.missingWaist);
  if (input.weightKg === null) return missing(DIAGNOSIS_TEXT.missingWeight);
  if (input.heightCm === null) return missing(DIAGNOSIS_TEXT.missingHeight);
  return healthyRow(conicityIndex(input.waistCm, input.weightKg, input.heightCm), CONICITY_HEALTHY_MAX);
}

function buildEstimatedBodyFat(input: DiagnosisInput): AnthropometricDiagnosis["estimatedBodyFat"] {
  if (input.weightKg === null) return missing(DIAGNOSIS_TEXT.missingWeight);
  if (input.heightCm === null) return missing(DIAGNOSIS_TEXT.missingHeight);
  if (input.sex === null) return missing(DIAGNOSIS_TEXT.missingSex);
  if (input.ageYears === null) return missing(DIAGNOSIS_TEXT.missingBirthDate);
  const value = deurenbergBodyFatPercent({
    bmi: bmiExact(input.weightKg, input.heightCm),
    ageYears: input.ageYears,
    sex: input.sex,
  });
  return { status: "ok", value: roundTo(value, 1) };
}

function hamwiLabel(bodyFrame: BodyFrame | null): string {
  if (bodyFrame === null) return `Hamwi (contextura ${bodyFrameLabel(effectiveBodyFrame(null))}, asumida)`;
  return `Hamwi (contextura ${bodyFrameLabel(bodyFrame)})`;
}

function buildIdealWeights(input: DiagnosisInput): IdealWeightRow[] | null {
  const heightCm = input.heightCm;
  if (heightCm === null) return null;
  const sex = input.sex;
  const bySex = (formula: IdealWeightFormula, label: string, compute: (s: Sex) => number): IdealWeightRow =>
    sex === null
      ? { formula, label, valueKg: null, note: DIAGNOSIS_TEXT.missingSex }
      : { formula, label, valueKg: roundTo(compute(sex), 1), note: null };
  return [
    bySex("DEVINE", IDEAL_WEIGHT_FORMULA_LABELS.DEVINE, (s) => devineIdealWeightKg(s, heightCm)),
    bySex("HAMWI", hamwiLabel(input.bodyFrame), (s) =>
      hamwiIdealWeightKg(s, heightCm, effectiveBodyFrame(input.bodyFrame)),
    ),
    {
      formula: "BROCA",
      label: IDEAL_WEIGHT_FORMULA_LABELS.BROCA,
      valueKg: roundTo(brocaIdealWeightKg(heightCm), 1),
      note: null,
    },
    bySex("BROCA_BRUGSCH", IDEAL_WEIGHT_FORMULA_LABELS.BROCA_BRUGSCH, (s) => brocaBrugschIdealWeightKg(s, heightCm)),
    bySex("LORENTZ", IDEAL_WEIGHT_FORMULA_LABELS.LORENTZ, (s) => lorentzIdealWeightKg(s, heightCm)),
  ];
}

export function buildAnthropometricDiagnosis(input: DiagnosisInput): AnthropometricDiagnosis {
  const minor = isMinor(input.ageYears);
  const ageGroup = ageGroupOf(input.ageYears);
  const noMeasurements = input.weightKg === null && input.heightCm === null;
  const bmi = buildBmiRow(input, minor);

  if (minor) {
    let pediatric: PediatricDiagnosis | null = null;
    if (ageGroup === "PEDIATRIC") {
      // D8: el IMC/E usa la edad a la fecha del PESO; la T/E, la de la TALLA.
      const bmiForAge = buildBmiForAgeRow({
        sex: input.sex,
        ageMonths: input.weightAgeMonths ?? null,
        weightKg: input.weightKg,
        heightCm: input.heightCm,
      });
      const heightForAge = buildHeightForAgeRow({
        sex: input.sex,
        ageMonths: input.heightAgeMonths ?? null,
        heightCm: input.heightCm,
      });
      pediatric = { bmiForAge, heightForAge, footer: pediatricFooterText(bmiForAge, heightForAge) };
    }
    return {
      minor,
      ageGroup,
      noMeasurements,
      bmi,
      waist: null,
      waistHipRatio: null,
      waistToHeight: null,
      conicity: null,
      estimatedBodyFat: null,
      idealWeights: null,
      percentOfIdealDevine: null,
      adjustedWeightSuggestion: null,
      pediatric,
    };
  }

  let percentOfIdealDevine: number | null = null;
  let adjustedWeightSuggestion: AnthropometricDiagnosis["adjustedWeightSuggestion"] = null;
  if (input.weightKg !== null && input.heightCm !== null && input.sex !== null) {
    const ideal = devineIdealWeightKg(input.sex, input.heightCm);
    percentOfIdealDevine = roundTo(percentOfIdealWeight(input.weightKg, ideal), 1);
    if (shouldSuggestAdjustedWeight(input.weightKg, ideal)) {
      adjustedWeightSuggestion = {
        adjustedKg: roundTo(adjustedWeightKg(input.weightKg, ideal), 1),
        thresholdPercent: ADJUSTED_WEIGHT_THRESHOLD_PERCENT,
      };
    }
  }

  return {
    minor,
    ageGroup,
    noMeasurements,
    bmi,
    waist: buildWaistRow(input),
    waistHipRatio: buildWaistHipRow(input),
    waistToHeight: buildWaistToHeightRow(input),
    conicity: buildConicityRow(input),
    estimatedBodyFat: buildEstimatedBodyFat(input),
    idealWeights: buildIdealWeights(input),
    percentOfIdealDevine,
    adjustedWeightSuggestion,
    pediatric: null,
  };
}
