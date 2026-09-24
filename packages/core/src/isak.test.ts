import { describe, expect, it } from "vitest";
import { roundTo } from "./anthropometry";
import {
  ISAK_MEASURES,
  ISAK_MEASURE_KEYS,
  MUSCLE_BONE_CLASS_LABELS,
  PHANTOM,
  SOMATOTYPE_CATEGORY_LABELS,
  adiposeDistribution,
  classifyCormicIndex,
  classifyManouvrierIndex,
  classifyMuscleBoneIndex,
  classifyRelativeArmSpan,
  classifySomatotype,
  correctedGirthCm,
  durninWomersleyCoefficients,
  durninWomersleyDensity,
  ectomorphy,
  endomorphy,
  fatDistributionIndex,
  heightWeightRatio,
  kerrAdiposeTissueKg,
  kerrAdiposeZ,
  leeMuscleMassKg,
  mesomorphy,
  missingMeasuresNote,
  muscleDistribution,
  phantomScale,
  phantomZ,
  rochaBoneMassKg,
  siriBodyFatPercent,
  somatochartPoint,
  sum6SkinfoldsMm,
  sum8SkinfoldsMm,
  type IsakMeasureKey,
  type PhantomKey,
} from "./isak";
import { CASE_A, CASE_B, CASE_C } from "./isak-fixtures.test-data";
import type { Sex } from "./patient-formula-data";

type Full = Record<IsakMeasureKey, number>;
const A = CASE_A as Full;
const B = CASE_B as Full;
const C = CASE_C as Full;

const z = (m: Full, key: Exclude<IsakMeasureKey, "heightCm">) => roundTo(phantomZ(m[key], m.heightCm, PHANTOM[key]), 2);

const corrected = (m: Full) => ({
  arm: correctedGirthCm(m.armCm, m.tricepsSkinfoldMm),
  thigh: correctedGirthCm(m.thighCm, m.thighSkinfoldMm),
  calf: correctedGirthCm(m.calfCm, m.calfSkinfoldMm),
});

const lee = (m: Full, sex: Sex, ageYears: number) => {
  const c = corrected(m);
  return leeMuscleMassKg({
    heightCm: m.heightCm,
    sex,
    ageYears,
    correctedArmCm: c.arm,
    correctedThighCm: c.thigh,
    correctedCalfCm: c.calf,
  });
};

const somato = (m: Full) => ({
  endo: endomorphy(m),
  meso: mesomorphy(m),
  ecto: ectomorphy(m.heightCm, m.weightKg),
});

describe("medidas", () => {
  it("21 medidas en el orden de ISAKMetry", () => {
    expect(ISAK_MEASURE_KEYS).toHaveLength(21);
    expect(ISAK_MEASURES.map((d) => d.key)).toEqual([...ISAK_MEASURE_KEYS]);
    expect(ISAK_MEASURES.filter((d) => d.group === "skinfolds")).toHaveLength(8);
    expect(ISAK_MEASURES.filter((d) => d.group === "girths")).toHaveLength(6);
    expect(ISAK_MEASURES.filter((d) => d.group === "breadths")).toHaveLength(3);
  });

  it("missingMeasuresNote en el orden de ISAK_MEASURE_KEYS", () => {
    expect(missingMeasuresNote(["femurBreadthCm"])).toBe("Sin dato (falta fémur)");
    expect(missingMeasuresNote(["femurBreadthCm", "bistyloidBreadthCm"])).toBe("Sin dato (falta biestiloideo, fémur)");
    expect(missingMeasuresNote(["calfCm", "calfSkinfoldMm"])).toBe("Sin dato (falta pliegue pierna, perímetro pierna)");
  });
});

describe("Phantom y Z", () => {
  it("phantomScale", () => {
    expect(phantomScale(164)).toBeCloseTo(1.037683, 6);
  });

  it("Z de las 20 medidas del caso A", () => {
    const expected: Record<Exclude<IsakMeasureKey, "heightCm" | "weightKg">, number> = {
      sittingHeightCm: -0.84,
      armSpanCm: 0.09,
      tricepsSkinfoldMm: -0.89,
      subscapularSkinfoldMm: -1.14,
      bicepsSkinfoldMm: -1.92,
      iliacCrestSkinfoldMm: -0.39,
      supraspinaleSkinfoldMm: 0.27,
      abdominalSkinfoldMm: -1.13,
      thighSkinfoldMm: -1.87,
      calfSkinfoldMm: -2.09,
      armCm: 1.91,
      // D7: s = 2,27 (la tabla publicada dice 2,37 y daría 1,60).
      armFlexedCm: 1.67,
      waistCm: 0.86,
      hipCm: -0.6,
      thighCm: 0.17,
      calfCm: 0.24,
      humerusBreadthCm: 0.76,
      bistyloidBreadthCm: 1.41,
      femurBreadthCm: 1.14,
    };
    for (const [key, value] of Object.entries(expected)) {
      expect(z(A, key as keyof typeof expected), key).toBe(value);
    }
  });

  it("D7: Z de la masa con el Phantom publicado (±0,02 contra ISAKMetry)", () => {
    // ISAKMetry muestra 0,40 (A) y 1,26 (B). El Phantom publicado (64,58 / 8,60) da 0,42 y 1,27.
    expect(Math.abs(z(A, "weightKg") - 0.4)).toBeLessThanOrEqual(0.02 + 1e-9);
    expect(Math.abs(z(B, "weightKg") - 1.26)).toBeLessThanOrEqual(0.02 + 1e-9);
    expect(z(A, "weightKg")).toBe(0.42);
    expect(z(B, "weightKg")).toBe(1.27);
  });

  it("Z del caso B", () => {
    const expected: Partial<Record<IsakMeasureKey, number>> = {
      iliacCrestSkinfoldMm: 1.28,
      supraspinaleSkinfoldMm: 1.55,
      thighSkinfoldMm: -2.24,
      armCm: 2.84,
      armFlexedCm: 2.18, // D7
      waistCm: 2.99,
      calfCm: 0.01,
      bistyloidBreadthCm: 1.03,
      femurBreadthCm: 0.92,
      tricepsSkinfoldMm: -0.66,
      subscapularSkinfoldMm: -0.53,
      bicepsSkinfoldMm: -1.92,
      abdominalSkinfoldMm: -0.86,
      calfSkinfoldMm: -1.87,
      hipCm: 0.51,
      thighCm: 0.62,
      humerusBreadthCm: 0.76,
      sittingHeightCm: -0.84,
      armSpanCm: 0.09,
    };
    for (const [key, value] of Object.entries(expected)) {
      expect(z(B, key as Exclude<IsakMeasureKey, "heightCm">), key).toBe(value);
    }
  });

  it("Phantom de los perímetros corregidos", () => {
    const zc = (m: Full, part: "arm" | "thigh" | "calf", key: PhantomKey) =>
      roundTo(phantomZ(corrected(m)[part], m.heightCm, PHANTOM[key]), 2);
    expect(zc(A, "arm", "correctedArmCm")).toBe(2.99);
    expect(zc(A, "calf", "correctedCalfCm")).toBe(1.84);
    expect(zc(B, "arm", "correctedArmCm")).toBe(3.96);
    expect(zc(B, "calf", "correctedCalfCm")).toBe(1.41);
    // D5: ISAKMetry muestra 0,17 (A) y 0,62 (B), que es el Z del muslo medio SIN corregir. Acá se
    // usa el Phantom del muslo corregido (47,34 / 3,59).
    expect(zc(A, "thigh", "correctedThighCm")).toBe(0.84);
    expect(zc(B, "thigh", "correctedThighCm")).toBe(1.7);
  });
});

describe("Durnin-Womersley + Siri", () => {
  const cases: Array<[Sex, number, number, number]> = [
    ["MALE", 18, 1.0611, 16.51],
    ["MALE", 25, 1.0618, 16.17],
    ["MALE", 35, 1.055, 19.17],
    ["MALE", 45, 1.0499, 21.49],
    ["MALE", 60, 1.0467, 22.92],
    ["FEMALE", 18, 1.0463, 23.1],
    ["FEMALE", 25, 1.045, 23.67],
    ["FEMALE", 35, 1.041, 25.48],
    ["FEMALE", 45, 1.0353, 28.14],
    ["FEMALE", 60, 1.0306, 30.32],
  ];
  it.each(cases)("%s %i años, Σ4 = 40 mm", (sex, age, density, percent) => {
    const d = durninWomersleyDensity({ sex, ageYears: age, sum4SkinfoldsMm: 40 });
    expect(d).not.toBeNull();
    expect(d!).toBeCloseTo(density, 4);
    expect(siriBodyFatPercent(d!)).toBeCloseTo(percent, 2);
  });

  it("bordes de los tramos", () => {
    expect(durninWomersleyCoefficients("MALE", 16)).toBeNull();
    expect(durninWomersleyCoefficients("MALE", 17)?.ageRange).toBe("17–19");
    expect(durninWomersleyCoefficients("FEMALE", 15)).toBeNull();
    expect(durninWomersleyCoefficients("FEMALE", 16)?.ageRange).toBe("16–19");
    expect(durninWomersleyCoefficients("MALE", 29)?.ageRange).toBe("20–29");
    expect(durninWomersleyCoefficients("MALE", 30)?.ageRange).toBe("30–39");
    expect(durninWomersleyCoefficients("MALE", 50)?.ageRange).toBe("50 o más");
    expect(durninWomersleyDensity({ sex: "MALE", ageYears: 16, sum4SkinfoldsMm: 40 })).toBeNull();
  });

  it("caso A: 10,73 kg / 17,59 %", () => {
    const d = durninWomersleyDensity({ sex: "MALE", ageYears: 22, sum4SkinfoldsMm: 4 + 11 + 11 + 19 })!;
    const pf = siriBodyFatPercent(d);
    expect(roundTo(pf, 2)).toBe(17.59);
    expect(roundTo((61 * pf) / 100, 2)).toBe(10.73);
  });
});

describe("Kerr (tejido adiposo)", () => {
  it("caso A: Σ6 71", () => {
    expect(sum6SkinfoldsMm(A)).toBe(71);
    expect(sum8SkinfoldsMm(A)).toBe(94);
    expect(kerrAdiposeZ(71, 164)).toBeCloseTo(-1.2284, 4);
    expect(roundTo(kerrAdiposeTissueKg(71, 164), 2)).toBe(16.48);
  });

  it("caso B: Σ6 80,5", () => {
    expect(sum6SkinfoldsMm(B)).toBe(80.5);
    // D6: el Excel (versión vieja de ISAKMetry) muestra 2,44, que no sale de ninguna fórmula
    // reconstruible. Se usa el Z de Kerr del Σ6, como el PDF de la versión actual.
    expect(roundTo(kerrAdiposeZ(80.5, 164), 2)).toBe(-0.94);
    expect(roundTo(kerrAdiposeTissueKg(80.5, 164), 2)).toBe(17.96);
  });
});

describe("perímetros corregidos, Lee y Rocha", () => {
  it("corregidos", () => {
    const a = corrected(A);
    const b = corrected(B);
    expect([a.arm, a.thigh, a.calf].map((x) => roundTo(x, 2))).toEqual([26.74, 48.54, 32.62]);
    expect([b.arm, b.thigh, b.calf].map((x) => roundTo(x, 2))).toEqual([28.53, 51.49, 31.8]);
  });

  it("Lee (etnia 0, D14)", () => {
    expect(roundTo(lee(A, "MALE", 22), 2)).toBe(28.97);
    expect(roundTo(lee(B, "MALE", 21), 2)).toBe(30.26);
    expect(roundTo(lee(C, "FEMALE", 35), 2)).toBe(20.64);
  });

  it("Rocha", () => {
    expect(roundTo(rochaBoneMassKg(A), 2)).toBe(10.34);
    expect(roundTo(rochaBoneMassKg(B), 2)).toBe(10.13);
    expect(roundTo(rochaBoneMassKg(C), 2)).toBe(8.69);
  });
});

describe("Heath-Carter", () => {
  it("caso A (HWR ≥ 40,75)", () => {
    expect(roundTo(heightWeightRatio(164, 61), 2)).toBe(41.66);
    const s = somato(A);
    expect([s.endo, s.meso, s.ecto].map((x) => roundTo(x, 2))).toEqual([4.03, 5.69, 1.92]);
  });

  it("caso B (tramo intermedio del HWR)", () => {
    expect(roundTo(heightWeightRatio(164, 67.6), 2)).toBe(40.26);
    const s = somato(B);
    expect([s.endo, s.meso, s.ecto].map((x) => roundTo(x, 2))).toEqual([4.95, 5.72, 1.01]);
  });

  it("caso C", () => {
    const s = somato(C);
    expect([s.endo, s.meso, s.ecto].map((x) => roundTo(x, 2))).toEqual([4.73, 4.21, 1.68]);
  });

  it("ectomorfia con HWR ≤ 38,25 → 0,1", () => {
    expect(roundTo(heightWeightRatio(150, 70), 2)).toBe(36.4);
    expect(ectomorphy(150, 70)).toBe(0.1);
  });

  it("piso 0,1 en la endomorfia", () => {
    expect(
      endomorphy({ tricepsSkinfoldMm: 1, subscapularSkinfoldMm: 1, supraspinaleSkinfoldMm: 1, heightCm: 200 }),
    ).toBe(0.1);
  });

  it("somatocarta con los componentes sin redondear", () => {
    const point = (m: Full) => {
      const p = somatochartPoint(somato(m));
      return [roundTo(p.x, 2), roundTo(p.y, 2)];
    };
    expect(point(A)).toEqual([-2.12, 5.43]);
    expect(point(B)).toEqual([-3.94, 5.48]);
    expect(point(C)).toEqual([-3.05, 2.02]);
  });

  it("classifySomatotype", () => {
    const c = (endo: number, meso: number, ecto: number) => classifySomatotype({ endo, meso, ecto });
    expect(c(4.03, 5.69, 1.92)).toBe("ENDOMORPHIC_MESOMORPH");
    expect(SOMATOTYPE_CATEGORY_LABELS.ENDOMORPHIC_MESOMORPH).toBe("Endo-mesomorfo");
    expect(c(4.95, 5.72, 1.01)).toBe("ENDOMORPHIC_MESOMORPH");
    expect(c(4.73, 4.21, 1.68)).toBe("MESOMORPHIC_ENDOMORPH");
    expect(c(3, 3, 3)).toBe("CENTRAL");
    expect(c(3.5, 3, 2.6)).toBe("CENTRAL");
    expect(c(6, 2, 2)).toBe("BALANCED_ENDOMORPH");
    expect(c(2, 6, 2)).toBe("BALANCED_MESOMORPH");
    expect(c(2, 2, 6)).toBe("BALANCED_ECTOMORPH");
    expect(c(5, 5.3, 2)).toBe("ENDOMORPH_MESOMORPH");
    expect(c(5, 4.5, 1)).toBe("ENDOMORPH_MESOMORPH"); // 0,5 exacto cuenta como iguales
    expect(c(1.5, 4, 4.4)).toBe("MESOMORPH_ECTOMORPH");
    expect(c(4, 1, 4.3)).toBe("ENDOMORPH_ECTOMORPH");
    expect(c(2, 5, 3)).toBe("ECTOMORPHIC_MESOMORPH");
    expect(c(1, 3, 5)).toBe("MESOMORPHIC_ECTOMORPH");
    expect(c(3, 1, 5)).toBe("ENDOMORPHIC_ECTOMORPH");
    expect(c(5, 1, 3)).toBe("ECTOMORPHIC_ENDOMORPH");
  });
});

describe("clasificaciones", () => {
  it("índice músculo/óseo (D9)", () => {
    const cases: Array<[number, string]> = [
      [2.33, "Muy bajo"],
      [2.34, "Bajo"],
      [2.3449, "Bajo"],
      [2.43, "Bajo"],
      [2.44, "Medio"],
      [2.8, "Medio"],
      [3.1, "Medio"],
      [3.11, "Alto"],
      [3.29, "Alto"],
      [3.3, "Muy alto"],
    ];
    for (const [value, label] of cases) {
      expect(MUSCLE_BONE_CLASS_LABELS[classifyMuscleBoneIndex(value)], String(value)).toBe(label);
    }
  });

  it("córmico (D10), Manouvrier y envergadura relativa", () => {
    expect(classifyCormicIndex(0.5)).toBe("BRACHYCORMIC");
    expect(classifyCormicIndex(0.5061)).toBe("METRICORMIC");
    expect(classifyCormicIndex(0.52)).toBe("METRICORMIC");
    expect(classifyCormicIndex(0.53)).toBe("MACROCORMIC");
    expect(classifyManouvrierIndex(84)).toBe("BRACHYSKELIC");
    expect(classifyManouvrierIndex(84.6)).toBe("MESATISKELIC");
    expect(classifyManouvrierIndex(89)).toBe("MESATISKELIC");
    expect(classifyManouvrierIndex(97.59)).toBe("MACROSKELIC");
    expect(classifyRelativeArmSpan(1.0165)).toBe("GREATER");
    expect(classifyRelativeArmSpan(1.004)).toBe("EQUAL");
    expect(classifyRelativeArmSpan(0.9875)).toBe("LESS");
  });
});

describe("distribución", () => {
  it("caso A: adiposa y muscular", () => {
    const d = adiposeDistribution(A);
    expect([d.upper, d.central, d.lower].map((x) => roundTo(x * 100, 2))).toEqual([30.99, 45.07, 23.94]);
    const m = muscleDistribution(corrected(A));
    expect([m.arm, m.thigh, m.calf].map((x) => roundTo(x * 100, 2))).toEqual([24.79, 44.99, 30.23]);
  });

  it("índice de distribución grasa (D11)", () => {
    expect(roundTo(fatDistributionIndex(A), 2)).toBe(0.65);
    // HU decía 0,51; la fórmula D11 da 0,5047; validar con el próximo PDF de ISAKMetry (D11).
    expect(fatDistributionIndex(B)).toBeCloseTo(0.5047, 4);
    expect(roundTo(fatDistributionIndex(B), 2)).toBe(0.5);
  });
});
