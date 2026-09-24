import { describe, expect, it } from "vitest";
import { DIAGNOSIS_TEXT, buildAnthropometricDiagnosis, type DiagnosisInput } from "./anthropometric-diagnosis";

const ana: DiagnosisInput = {
  sex: "FEMALE",
  ageYears: 34,
  bodyFrame: null,
  weightKg: 66.5,
  heightCm: 162,
  waistCm: 82,
  hipCm: 100,
};

const luis: DiagnosisInput = {
  sex: "MALE",
  ageYears: 45,
  bodyFrame: null,
  weightKg: 118,
  heightCm: 180,
  waistCm: 110,
  hipCm: null,
};

describe("buildAnthropometricDiagnosis", () => {
  it("Ana completa (contextura sin cargar)", () => {
    const d = buildAnthropometricDiagnosis(ana);
    expect(d.minor).toBe(false);
    expect(d.noMeasurements).toBe(false);
    // 66,5 / 1,62² = 25,339 → 25,3 Sobrepeso
    expect(d.bmi).toEqual({ status: "classified", value: 25.3, classKey: "OVERWEIGHT", classLabel: "Sobrepeso" });
    expect(d.waist).toEqual({ status: "classified", value: 82, classKey: "ELEVATED", classLabel: "Riesgo elevado" });
    expect(d.waistHipRatio).toEqual({
      status: "classified",
      value: 0.82,
      classKey: "NO_RISK",
      classLabel: "Sin riesgo aumentado",
      thresholdText: "riesgo aumentado > 0,85 en mujeres",
    });
    expect(d.waistToHeight).toMatchObject({ status: "classified", value: 0.51, classKey: "OUT_OF_RANGE" });
    expect(d.conicity).toMatchObject({ status: "classified", value: 1.17, classKey: "HEALTHY" });
    expect(d.estimatedBodyFat).toEqual({ status: "ok", value: 32.8 });
    expect(d.idealWeights).toEqual([
      { formula: "DEVINE", label: "Devine", valueKg: 54.2, note: null },
      { formula: "HAMWI", label: "Hamwi (contextura Mediana, asumida)", valueKg: 53.8, note: null },
      { formula: "BROCA", label: "Broca", valueKg: 62, note: null },
      { formula: "BROCA_BRUGSCH", label: "Broca-Brugsch", valueKg: 52.7, note: null },
      { formula: "LORENTZ", label: "Lorentz", valueKg: 57.2, note: null },
    ]);
    expect(d.percentOfIdealDevine).toBe(122.7);
    expect(DIAGNOSIS_TEXT.percentOfIdeal(d.percentOfIdealDevine!)).toBe("Peso actual: 122,7 % del peso ideal (Devine)");
    expect(d.adjustedWeightSuggestion).toBeNull();
  });

  it("Hamwi con contextura cargada", () => {
    const d = buildAnthropometricDiagnosis({ ...ana, bodyFrame: "SMALL" });
    expect(d.idealWeights![1]).toEqual({
      formula: "HAMWI",
      label: "Hamwi (contextura Pequeña)",
      valueKg: 48.4,
      note: null,
    });
  });

  it("Luis sin cadera: obesidad, sugerencia de peso ajustado", () => {
    const d = buildAnthropometricDiagnosis(luis);
    expect(d.bmi).toMatchObject({ status: "classified", value: 36.4, classKey: "OBESITY_II", classLabel: "Obesidad grado II" });
    expect(d.waist).toMatchObject({ classKey: "VERY_ELEVATED", classLabel: "Riesgo muy elevado" });
    expect(d.waistHipRatio).toEqual({ status: "missing", note: "Sin dato (falta cadera)", thresholdText: null });
    expect(d.idealWeights![0]!.valueKg).toBe(75);
    // 118 / 74,99213 ·100 = 157,34985 → 157,3 (fe de erratas de la HU)
    expect(d.percentOfIdealDevine).toBe(157.3);
    expect(d.adjustedWeightSuggestion).toEqual({ adjustedKg: 85.7, thresholdPercent: 130 });
    expect(DIAGNOSIS_TEXT.adjustedWeightAlert(85.7)).toBe(
      "El peso actual supera el 130 % del peso ideal. Se sugiere calcular con peso ajustado: 85,7 kg.",
    );
    expect(d.estimatedBodyFat).toEqual({ status: "ok", value: 37.9 });
  });

  it("Ana sin sexo", () => {
    const d = buildAnthropometricDiagnosis({ ...ana, sex: null });
    expect(d.bmi).toMatchObject({ status: "classified", classKey: "OVERWEIGHT" });
    expect(d.idealWeights!.map((r) => [r.formula, r.valueKg, r.note])).toEqual([
      ["DEVINE", null, "Falta sexo"],
      ["HAMWI", null, "Falta sexo"],
      ["BROCA", 62, null],
      ["BROCA_BRUGSCH", null, "Falta sexo"],
      ["LORENTZ", null, "Falta sexo"],
    ]);
    expect(d.waist).toEqual({ status: "unclassified", value: 82, note: "Falta sexo" });
    expect(d.waistHipRatio).toEqual({ status: "unclassified", value: 0.82, note: "Falta sexo", thresholdText: null });
    expect(d.estimatedBodyFat).toEqual({ status: "missing", note: "Falta sexo" });
    expect(d.percentOfIdealDevine).toBeNull();
    expect(d.adjustedWeightSuggestion).toBeNull();
    expect(d.waistToHeight).toMatchObject({ status: "classified", value: 0.51 });
    expect(d.conicity).toMatchObject({ status: "classified", value: 1.17 });
  });

  it("sin fecha de nacimiento", () => {
    const d = buildAnthropometricDiagnosis({ ...ana, ageYears: null });
    expect(d.minor).toBe(false);
    expect(d.estimatedBodyFat).toEqual({ status: "missing", note: "Falta fecha de nacimiento" });
    expect(d.bmi).toMatchObject({ status: "classified" });
  });

  it("menor (12 años): solo IMC sin clasificar", () => {
    const d = buildAnthropometricDiagnosis({ ...ana, ageYears: 12 });
    expect(d.minor).toBe(true);
    expect(d.bmi).toEqual({ status: "unclassified", value: 25.3, note: null });
    expect(d.waist).toBeNull();
    expect(d.waistHipRatio).toBeNull();
    expect(d.waistToHeight).toBeNull();
    expect(d.conicity).toBeNull();
    expect(d.estimatedBodyFat).toBeNull();
    expect(d.idealWeights).toBeNull();
    expect(d.percentOfIdealDevine).toBeNull();
    expect(d.adjustedWeightSuggestion).toBeNull();
  });

  it("sin peso ni talla → noMeasurements", () => {
    const d = buildAnthropometricDiagnosis({ ...ana, weightKg: null, heightCm: null });
    expect(d.noMeasurements).toBe(true);
    expect(d.bmi).toEqual({ status: "missing", note: "Sin dato (falta peso)" });
    expect(d.idealWeights).toBeNull();
  });

  it("faltantes con su motivo", () => {
    const noHeight = buildAnthropometricDiagnosis({ ...ana, heightCm: null });
    expect(noHeight.noMeasurements).toBe(false);
    expect(noHeight.bmi).toEqual({ status: "missing", note: "Sin dato (falta talla)" });
    expect(noHeight.idealWeights).toBeNull();
    expect(noHeight.waistToHeight).toEqual({ status: "missing", note: "Sin dato (falta talla)" });
    const noWaist = buildAnthropometricDiagnosis({ ...ana, waistCm: null });
    expect(noWaist.waist).toEqual({ status: "missing", note: "Sin dato (falta cintura)" });
    expect(noWaist.waistHipRatio).toMatchObject({ status: "missing", note: "Sin dato (falta cintura)" });
    expect(noWaist.conicity).toEqual({ status: "missing", note: "Sin dato (falta cintura)" });
    const noWeight = buildAnthropometricDiagnosis({ ...ana, weightKg: null });
    expect(noWeight.conicity).toEqual({ status: "missing", note: "Sin dato (falta peso)" });
    expect(noWeight.estimatedBodyFat).toEqual({ status: "missing", note: "Sin dato (falta peso)" });
    expect(noWeight.idealWeights).toHaveLength(5);
  });
});
