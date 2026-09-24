import { describe, expect, it } from "vitest";
import {
  ADJUSTED_WEIGHT_THRESHOLD_PERCENT,
  computeBmi,
  computeWaistHipRatio,
  CONICITY_HEALTHY_MAX,
  WAIST_TO_HEIGHT_HEALTHY_MAX,
  adjustedWeightKg,
  bmiExact,
  brocaBrugschIdealWeightKg,
  brocaIdealWeightKg,
  classifyBmi,
  classifyHealthyBelow,
  classifyWaist,
  classifyWaistHipRatio,
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
} from "./anthropometry";

describe("anthropometry", () => {
  it("calcula el IMC y redondea a un decimal", () => {
    expect(computeBmi(70, 175)).toBe(22.9);
  });

  it("devuelve null para el IMC con datos faltantes", () => {
    expect(computeBmi(null, 175)).toBeNull();
  });

  it("calcula el índice cintura/cadera y redondea a dos decimales", () => {
    expect(computeWaistHipRatio(80, 100)).toBe(0.8);
  });

  it("devuelve null para el índice cintura/cadera con datos faltantes", () => {
    expect(computeWaistHipRatio(80, undefined)).toBeNull();
  });
});

// ─── HU-004 ──────────────────────────────────────────────────────────────────
// Ana = FEMALE, 34 años, 66,5 kg, 162 cm, cintura 82, cadera 100.
// Luis = MALE, 45 años, 118 kg, 180 cm, cintura 110.

describe("roundTo y bmiExact", () => {
  it("roundTo", () => {
    expect(roundTo(25.33912, 1)).toBe(25.3);
    expect(roundTo(1.17418, 2)).toBe(1.17);
    expect(roundTo(1481.15, 0)).toBe(1481);
  });

  it("IMC exacto de Ana: 66,5 / 1,62² = 66,5 / 2,6244 = 25,33912…", () => {
    expect(bmiExact(66.5, 162)).toBeCloseTo(25.339125, 6);
    expect(roundTo(bmiExact(66.5, 162), 1)).toBe(25.3);
  });

  it("IMC exacto de Luis: 118 / 3,24 = 36,41975…", () => {
    expect(bmiExact(118, 180)).toBeCloseTo(36.419753, 6);
    expect(roundTo(bmiExact(118, 180), 1)).toBe(36.4);
  });
});

describe("classifyBmi (OMS), bordes", () => {
  it.each([
    [18.4, "UNDERWEIGHT"],
    [18.5, "NORMAL"],
    [24.9, "NORMAL"],
    [25.0, "OVERWEIGHT"],
    [29.9, "OVERWEIGHT"],
    [30.0, "OBESITY_I"],
    [34.9, "OBESITY_I"],
    [35.0, "OBESITY_II"],
    [39.9, "OBESITY_II"],
    [40.0, "OBESITY_III"],
    // Se clasifica el valor redondeado a 1 decimal: 24,96 se muestra 25,0 → Sobrepeso.
    [24.96, "OVERWEIGHT"],
    [36.41975, "OBESITY_II"],
  ] as const)("%s → %s", (bmi, expected) => {
    expect(classifyBmi(bmi)).toBe(expected);
  });
});

describe("classifyWaist", () => {
  it.each([
    ["FEMALE", 79.9, "NO_RISK"],
    ["FEMALE", 80, "ELEVATED"],
    ["FEMALE", 87.9, "ELEVATED"],
    ["FEMALE", 88, "VERY_ELEVATED"],
    ["MALE", 93.9, "NO_RISK"],
    ["MALE", 94, "ELEVATED"],
    ["MALE", 101.9, "ELEVATED"],
    ["MALE", 102, "VERY_ELEVATED"],
    ["FEMALE", 82, "ELEVATED"], // Ana: ≥ 80 y < 88
    ["MALE", 110, "VERY_ELEVATED"], // Luis: ≥ 102
  ] as const)("%s %s cm → %s", (sex, waist, expected) => {
    expect(classifyWaist(sex, waist)).toBe(expected);
  });
});

describe("classifyWaistHipRatio (D3, estricto)", () => {
  it.each([
    ["FEMALE", 0.85, "NO_RISK"],
    ["FEMALE", 0.86, "INCREASED"],
    ["MALE", 0.9, "NO_RISK"],
    ["MALE", 0.91, "INCREASED"],
    ["FEMALE", 82 / 100, "NO_RISK"], // Ana 0,82
    ["FEMALE", 0.8549, "NO_RISK"], // se redondea a 0,85 antes de comparar
  ] as const)("%s %s → %s", (sex, ratio, expected) => {
    expect(classifyWaistHipRatio(sex, ratio)).toBe(expected);
  });

  it("texto del umbral aplicado", () => {
    expect(waistHipThresholdText("FEMALE")).toBe("riesgo aumentado > 0,85 en mujeres");
    expect(waistHipThresholdText("MALE")).toBe("riesgo aumentado > 0,9 en hombres");
  });
});

describe("índices de salud (D6)", () => {
  it("cintura/talla de Ana: 82 / 162 = 0,50617… → 0,51 fuera de rango", () => {
    const ratio = waistToHeightRatio(82, 162);
    expect(ratio).toBeCloseTo(0.506173, 6);
    expect(roundTo(ratio, 2)).toBe(0.51);
    expect(classifyHealthyBelow(ratio, WAIST_TO_HEIGHT_HEALTHY_MAX)).toBe("OUT_OF_RANGE");
    expect(classifyHealthyBelow(0.49, WAIST_TO_HEIGHT_HEALTHY_MAX)).toBe("HEALTHY");
    expect(classifyHealthyBelow(0.5, WAIST_TO_HEIGHT_HEALTHY_MAX)).toBe("OUT_OF_RANGE");
  });

  it("conicidad de Ana: 0,82 / (0,109·√(66,5/1,62)) = 0,82 / 0,698361 = 1,17418…", () => {
    const c = conicityIndex(82, 66.5, 162);
    expect(c).toBeCloseTo(1.174178, 5); // √41,04938 = 6,40698; 0,109·6,40698 = 0,698361
    expect(roundTo(c, 2)).toBe(1.17);
    expect(classifyHealthyBelow(c, CONICITY_HEALTHY_MAX)).toBe("HEALTHY");
  });

  it("conicidad de Luis: 1,10 / (0,109·√(118/1,8)) = 1,10 / 0,882534 = 1,24641…", () => {
    const c = conicityIndex(110, 118, 180);
    expect(c).toBeCloseTo(1.246411, 5);
    expect(roundTo(c, 2)).toBe(1.25);
    expect(classifyHealthyBelow(c, CONICITY_HEALTHY_MAX)).toBe("HEALTHY");
    expect(classifyHealthyBelow(1.4, CONICITY_HEALTHY_MAX)).toBe("OUT_OF_RANGE");
  });
});

describe("Deurenberg", () => {
  it("Ana: 1,2·25,33912 + 0,23·34 − 0 − 5,4 = 30,40695 + 7,82 − 5,4 = 32,82695", () => {
    const v = deurenbergBodyFatPercent({ bmi: bmiExact(66.5, 162), ageYears: 34, sex: "FEMALE" });
    expect(v).toBeCloseTo(32.82695, 5);
    expect(roundTo(v, 1)).toBe(32.8);
  });

  it("Luis: 1,2·36,41975 + 0,23·45 − 10,8 − 5,4 = 43,70370 + 10,35 − 16,2 = 37,85370", () => {
    const v = deurenbergBodyFatPercent({ bmi: bmiExact(118, 180), ageYears: 45, sex: "MALE" });
    expect(v).toBeCloseTo(37.853704, 5);
    expect(roundTo(v, 1)).toBe(37.9);
  });
});

describe("peso ideal", () => {
  it("Devine F 162: 45,5 + 2,3·9,6/2,54 = 45,5 + 8,69291 = 54,19291", () => {
    expect(devineIdealWeightKg("FEMALE", 162)).toBeCloseTo(54.192913, 5);
    expect(roundTo(devineIdealWeightKg("FEMALE", 162), 1)).toBe(54.2);
  });

  it("Devine M 180: 50 + 2,3·27,6/2,54 = 50 + 24,99213 = 74,99213", () => {
    expect(devineIdealWeightKg("MALE", 180)).toBeCloseTo(74.992126, 5);
    expect(roundTo(devineIdealWeightKg("MALE", 180), 1)).toBe(75);
  });

  it("Hamwi F 162 Mediana: 45,5 + 2,2·(162/2,54 − 60) = 45,5 + 2,2·3,77953 = 53,81496", () => {
    expect(hamwiIdealWeightKg("FEMALE", 162, "MEDIUM")).toBeCloseTo(53.814961, 5);
    expect(roundTo(hamwiIdealWeightKg("FEMALE", 162, "MEDIUM"), 1)).toBe(53.8);
  });

  it("Hamwi F 162 Pequeña / Grande: 53,81496·0,9 = 48,43346 / ·1,1 = 59,19646", () => {
    expect(hamwiIdealWeightKg("FEMALE", 162, "SMALL")).toBeCloseTo(48.433465, 5);
    expect(roundTo(hamwiIdealWeightKg("FEMALE", 162, "SMALL"), 1)).toBe(48.4);
    expect(hamwiIdealWeightKg("FEMALE", 162, "LARGE")).toBeCloseTo(59.196457, 5);
    expect(roundTo(hamwiIdealWeightKg("FEMALE", 162, "LARGE"), 1)).toBe(59.2);
  });

  it("Hamwi M 180 Mediana: 48 + 2,7·(70,86614 − 60) = 48 + 29,33858 = 77,33858", () => {
    expect(hamwiIdealWeightKg("MALE", 180, "MEDIUM")).toBeCloseTo(77.338583, 5);
    expect(roundTo(hamwiIdealWeightKg("MALE", 180, "MEDIUM"), 1)).toBe(77.3);
  });

  it("Broca: talla − 100", () => {
    expect(brocaIdealWeightKg(162)).toBe(62);
  });

  it("Broca-Brugsch: F 162 → 62·0,85 = 52,7; M 180 → 80·0,9 = 72", () => {
    expect(roundTo(brocaBrugschIdealWeightKg("FEMALE", 162), 1)).toBe(52.7);
    expect(roundTo(brocaBrugschIdealWeightKg("MALE", 180), 1)).toBe(72);
  });

  it("Lorentz: F 162 → 62 − 12/2,5 = 57,2; M 180 → 80 − 30/4 = 72,5", () => {
    expect(lorentzIdealWeightKg("FEMALE", 162)).toBeCloseTo(57.2, 6);
    expect(lorentzIdealWeightKg("MALE", 180)).toBeCloseTo(72.5, 6);
  });
});

describe("peso ajustado (D2)", () => {
  it("Ana: 66,5 / 54,19291 ·100 = 122,70977 → sin sugerencia", () => {
    const ideal = devineIdealWeightKg("FEMALE", 162);
    expect(percentOfIdealWeight(66.5, ideal)).toBeCloseTo(122.709772, 4);
    expect(roundTo(percentOfIdealWeight(66.5, ideal), 1)).toBe(122.7);
    expect(shouldSuggestAdjustedWeight(66.5, ideal)).toBe(false);
  });

  it("Luis: 118 / 74,99213 ·100 = 157,34985 → 157,3 % (fe de erratas: la HU decía 157,4) y sugerencia", () => {
    const ideal = devineIdealWeightKg("MALE", 180);
    expect(percentOfIdealWeight(118, ideal)).toBeCloseTo(157.349845, 4);
    expect(roundTo(percentOfIdealWeight(118, ideal), 1)).toBe(157.3);
    expect(shouldSuggestAdjustedWeight(118, ideal)).toBe(true);
  });

  it("ajustado Luis: 74,99213 + 0,25·(118 − 74,99213) = 85,74409", () => {
    const v = adjustedWeightKg(118, devineIdealWeightKg("MALE", 180));
    expect(v).toBeCloseTo(85.744094, 5);
    expect(roundTo(v, 1)).toBe(85.7);
  });

  it("ajustado Ana: 54,19291 + 0,25·12,30709 = 57,26969", () => {
    const v = adjustedWeightKg(66.5, devineIdealWeightKg("FEMALE", 162));
    expect(v).toBeCloseTo(57.269685, 5);
    expect(roundTo(v, 1)).toBe(57.3);
  });

  it("umbral 130 % estricto", () => {
    expect(ADJUSTED_WEIGHT_THRESHOLD_PERCENT).toBe(130);
    expect(shouldSuggestAdjustedWeight(130, 100)).toBe(false);
    expect(shouldSuggestAdjustedWeight(130.1, 100)).toBe(true);
    expect(shouldSuggestAdjustedWeight(130.04, 100)).toBe(false); // 130,04 se muestra 130,0
  });
});
