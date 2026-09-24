import { describe, expect, it } from "vitest";
import { buildAnthropometricDiagnosis } from "./anthropometric-diagnosis";
import type { IsakMeasures } from "./isak";
import { CASE_A, CASE_B, CASE_C } from "./isak-fixtures.test-data";
import {
  ISAK_TEXT,
  buildIsakStudy,
  buildIsakSummary,
  daysBetweenDayKeys,
  isakDifference,
  type IsakStudyResult,
  type IsakTissue,
  type IsakValue,
} from "./isak-study";

const A = buildIsakStudy({ measures: CASE_A, sex: "MALE", ageYears: 22 });
const B = buildIsakStudy({ measures: CASE_B, sex: "MALE", ageYears: 21 });
const C = buildIsakStudy({ measures: CASE_C, sex: "FEMALE", ageYears: 35 });

const val = (v: IsakValue): number => {
  if (v.status !== "ok") throw new Error(`esperaba ok, vino ${JSON.stringify(v)}`);
  return v.value;
};
const tissue = (t: IsakTissue) => [val(t.kg), val(t.percent), val(t.z)];
const zOf = (r: IsakStudyResult, key: string) => {
  const row = r.measures.find((m) => m.key === key)!;
  return row.z === null ? null : val(row.z);
};

describe("buildIsakStudy: caso A completo", () => {
  it("medidas y Z", () => {
    expect(A.measures).toHaveLength(21);
    expect(A.measures.find((m) => m.key === "heightCm")!.z).toBeNull();
    expect(zOf(A, "weightKg")).toBe(0.42); // D7: ISAKMetry 0,40 (±0,02)
    expect(zOf(A, "armFlexedCm")).toBe(1.67);
    expect(zOf(A, "femurBreadthCm")).toBe(1.14);
    expect(zOf(A, "thighCm")).toBe(0.17);
    expect(A.measures.find((m) => m.key === "armSpanCm")!.value).toBe(166.7);
  });

  it("fraccionamiento molecular", () => {
    expect(tissue(A.molecular.fatMass)).toEqual([10.73, 17.59, -0.04]);
    expect([val(A.molecular.fatFreeMass.kg), val(A.molecular.fatFreeMass.percent)]).toEqual([50.27, 82.41]);
  });

  it("fraccionamiento tisular", () => {
    // D6: Z adiposo = Z de Kerr del Σ6.
    expect(tissue(A.tissues.adipose)).toEqual([16.48, 27.02, -1.23]);
    expect(tissue(A.tissues.muscle)).toEqual([28.97, 47.49, 2.28]);
    expect(tissue(A.tissues.bone)).toEqual([10.34, 16.95, 0.68]);
    expect(tissue(A.tissues.residual)).toEqual([5.21, 8.54, -5.57]);
    expect(A.tissues.residual.negative).toBe(false);
    const t = A.tissues;
    const kgSum = [t.adipose, t.muscle, t.bone, t.residual].reduce((s, x) => s + val(x.kg), 0);
    const pctSum = [t.adipose, t.muscle, t.bone, t.residual].reduce((s, x) => s + val(x.percent), 0);
    expect(kgSum).toBeCloseTo(61, 6);
    expect(Math.abs(pctSum - 100)).toBeLessThanOrEqual(0.01 + 1e-9);
  });

  it("distribución", () => {
    const d = A.distribution;
    expect([val(d.adipose.upper), val(d.adipose.central), val(d.adipose.lower)]).toEqual([30.99, 45.07, 23.94]);
    expect([val(d.muscle.arm), val(d.muscle.thigh), val(d.muscle.calf)]).toEqual([24.79, 44.99, 30.23]);
  });

  it("índices de composición", () => {
    expect(val(A.compositionIndices.adiposeMuscle)).toBe(0.57);
    expect(A.compositionIndices.muscleBone).toEqual({ status: "ok", value: 2.8, classKey: "MEDIUM", classLabel: "Medio" });
  });

  it("adiposidad y muscularidad", () => {
    expect(val(A.adiposity.sum6)).toBe(71);
    expect(val(A.adiposity.sum8)).toBe(94);
    const m = A.muscularity;
    expect([val(m.correctedArm.value), val(m.correctedArm.z)]).toEqual([26.74, 2.99]);
    // D5: ISAKMetry muestra 0,17 (el Z del muslo medio sin corregir).
    expect([val(m.correctedThigh.value), val(m.correctedThigh.z)]).toEqual([48.54, 0.84]);
    expect([val(m.correctedCalf.value), val(m.correctedCalf.z)]).toEqual([32.62, 1.84]);
    expect(val(m.armDifference)).toBe(1.8);
  });

  it("proporcionalidad", () => {
    const p = A.proportionality;
    expect(p.cormic).toEqual({ status: "ok", value: 0.51, classKey: "METRICORMIC", classLabel: "Metricórmico (tronco medio)" });
    expect(p.manouvrier).toEqual({ status: "ok", value: 98, classKey: "MACROSKELIC", classLabel: "Miembros inferiores largos" });
    expect(p.relativeSpan).toEqual({ status: "ok", value: 1.02, classKey: "GREATER", classLabel: "Envergadura mayor a la talla" });
  });

  it("somatotipo y somatocarta", () => {
    const s = A.somatotype;
    expect([val(s.endo), val(s.meso), val(s.ecto)]).toEqual([4.03, 5.69, 1.92]);
    expect(s.category).toEqual({ status: "ok", key: "ENDOMORPHIC_MESOMORPH", label: "Endo-mesomorfo" });
    expect(s.chart).toEqual({ status: "ok", x: -2.12, y: 5.43 });
  });

  it("índices de salud (reuso de la HU-004)", () => {
    const d = A.health.diagnosis;
    expect(d.bmi).toMatchObject({ status: "classified", value: 22.7, classLabel: "Normal" });
    expect(d.waistHipRatio).toMatchObject({ status: "classified", value: 0.83, classLabel: "Sin riesgo aumentado" });
    expect(d.waistToHeight).toMatchObject({ status: "classified", value: 0.45, classLabel: "En rango saludable" });
    expect(d.conicity).toMatchObject({ status: "classified", value: 1.1, classLabel: "En rango saludable" });
    expect(val(A.health.fatDistributionIndex)).toBe(0.65);
    expect(d).toEqual(
      buildAnthropometricDiagnosis({
        sex: "MALE",
        ageYears: 22,
        bodyFrame: null,
        weightKg: 61,
        heightCm: 164,
        waistCm: 73,
        hipCm: 88,
      }),
    );
  });

  it("sin faltantes", () => {
    expect(A.minor).toBe(false);
    expect(A.missingSex).toBe(false);
    expect(A.missingBirthDate).toBe(false);
  });
});

describe("buildIsakStudy: caso B", () => {
  it("tejidos", () => {
    expect(tissue(B.tissues.adipose)).toEqual([17.96, 26.57, -0.94]); // D6: el Excel dice 2,44
    expect(tissue(B.tissues.muscle)).toEqual([30.26, 44.76, 2.76]);
    expect(tissue(B.tissues.bone)).toEqual([10.13, 14.99, 0.53]);
    expect(tissue(B.tissues.residual)).toEqual([9.25, 13.68, -3.2]);
  });

  it("índices, sumatorias y muscularidad", () => {
    expect(val(B.compositionIndices.adiposeMuscle)).toBe(0.59);
    expect(B.compositionIndices.muscleBone).toMatchObject({ value: 2.99, classLabel: "Medio" });
    expect(val(B.adiposity.sum6)).toBe(80.5);
    expect(val(B.adiposity.sum8)).toBe(114.5);
    expect(val(B.muscularity.correctedArm.z)).toBe(3.96);
    expect(val(B.muscularity.correctedCalf.z)).toBe(1.41);
    expect(val(B.muscularity.armDifference)).toBe(0.8);
    // HU decía 0,51; la fórmula D11 da 0,5047; validar con el próximo PDF de ISAKMetry (D11).
    expect(val(B.health.fatDistributionIndex)).toBe(0.5);
  });

  it("salud y masa grasa (sin contraste en el Excel)", () => {
    expect(B.health.diagnosis.bmi).toMatchObject({ value: 25.1, classLabel: "Sobrepeso" });
    expect(B.health.diagnosis.waistHipRatio).toMatchObject({ value: 0.87 });
    expect(B.health.diagnosis.conicity).toMatchObject({ value: 1.17 });
    expect([val(B.molecular.fatMass.kg), val(B.molecular.fatMass.percent)]).toEqual([14.27, 21.11]);
  });

  it("somatotipo", () => {
    const s = B.somatotype;
    expect([val(s.endo), val(s.meso), val(s.ecto)]).toEqual([4.95, 5.72, 1.01]);
    expect(s.chart).toEqual({ status: "ok", x: -3.94, y: 5.48 });
  });
});

describe("buildIsakStudy: caso C (sintético, mujer 35)", () => {
  it("composición", () => {
    const t = C.tissues;
    expect([t.adipose, t.muscle, t.bone, t.residual].map((x) => val(x.kg))).toEqual([20.32, 20.64, 8.69, 8.35]);
    expect([t.adipose, t.muscle, t.bone, t.residual].map((x) => val(x.percent))).toEqual([35.03, 35.59, 14.98, 14.4]);
    // Tramo mujeres 30–39.
    expect([val(C.molecular.fatMass.kg), val(C.molecular.fatMass.percent)]).toEqual([17.25, 29.74]);
  });

  it("índices y categoría", () => {
    expect(C.compositionIndices.muscleBone).toMatchObject({ value: 2.38, classLabel: "Bajo" });
    expect(C.proportionality.cormic).toMatchObject({ value: 0.53, classLabel: "Macrocórmico (tronco largo)" });
    expect(C.proportionality.manouvrier).toMatchObject({ value: 88, classLabel: "Miembros inferiores medios" });
    expect(C.proportionality.relativeSpan).toMatchObject({ value: 0.99, classLabel: "Envergadura menor a la talla" });
    expect(C.somatotype.category).toMatchObject({ label: "Meso-endomorfo" });
  });
});

describe("buildIsakStudy: faltantes", () => {
  it("sin sexo", () => {
    const r = buildIsakStudy({ measures: CASE_A, sex: null, ageYears: 22 });
    expect(r.missingSex).toBe(true);
    expect(r.molecular.fatMass.kg).toEqual({ status: "missing", note: "Falta sexo" });
    expect(r.tissues.muscle.kg).toEqual({ status: "missing", note: "Falta sexo" });
    const noMuscle = { status: "missing", note: "Sin dato (falta tejido muscular)" };
    expect(r.tissues.residual.kg).toEqual(noMuscle);
    expect(r.compositionIndices.adiposeMuscle).toEqual(noMuscle);
    expect(r.compositionIndices.muscleBone).toEqual(noMuscle);
    expect(val(r.tissues.adipose.kg)).toBe(16.48);
    expect(val(r.tissues.bone.kg)).toBe(10.34);
  });

  it("sin fecha de nacimiento", () => {
    const r = buildIsakStudy({ measures: CASE_A, sex: "MALE", ageYears: null });
    expect(r.minor).toBe(false);
    expect(r.missingBirthDate).toBe(true);
    expect(r.molecular.fatMass.kg).toEqual({ status: "missing", note: "Falta fecha de nacimiento" });
    expect(r.tissues.muscle.kg).toEqual({ status: "missing", note: "Falta fecha de nacimiento" });
  });

  it("estudio incompleto: masa, talla y 8 pliegues", () => {
    const measures = Object.fromEntries(
      Object.entries(CASE_A).map(([k, v]) => [k, k === "weightKg" || k === "heightCm" || k.endsWith("SkinfoldMm") ? v : null]),
    ) as IsakMeasures;
    const r = buildIsakStudy({ measures, sex: "MALE", ageYears: 22 });
    expect(r.tissues.bone.kg).toEqual({ status: "missing", note: "Sin dato (falta biestiloideo, fémur)" });
    expect(r.somatotype.meso).toEqual({
      status: "missing",
      note: "Sin dato (falta brazo flexionado, perímetro pierna, húmero, fémur)",
    });
    expect(r.somatotype.category).toEqual({ status: "missing", note: "Sin dato (falta mesomorfia)" });
    expect(r.somatotype.chart).toEqual({ status: "missing", note: "Sin dato (falta mesomorfia)" });
    expect(r.measures.find((m) => m.key === "femurBreadthCm")!.z).toEqual({ status: "missing", note: "Sin dato" });
    expect(val(r.adiposity.sum6)).toBe(71);
    expect(val(r.adiposity.sum8)).toBe(94);
    expect(val(r.somatotype.endo)).toBe(4.03);
    expect(val(r.somatotype.ecto)).toBe(1.92);
    expect(val(r.tissues.adipose.kg)).toBe(16.48);
    expect(val(r.molecular.fatMass.kg)).toBe(10.73);
  });

  it("residual negativo", () => {
    const r = buildIsakStudy({ measures: { ...CASE_A, weightKg: 50 }, sex: "MALE", ageYears: 22 });
    expect(val(r.tissues.residual.kg)).toBe(-5.79);
    expect(r.tissues.residual.negative).toBe(true);
  });

  it("menor (12 años)", () => {
    const r = buildIsakStudy({ measures: CASE_A, sex: "MALE", ageYears: 12 });
    const nfm = { status: "not_for_minors" };
    expect(r.minor).toBe(true);
    expect(r.molecular.fatMass.kg).toEqual(nfm);
    expect(r.molecular.fatFreeMass.kg).toEqual(nfm);
    for (const t of [r.tissues.adipose, r.tissues.muscle, r.tissues.bone, r.tissues.residual]) {
      expect(t.kg).toEqual(nfm);
      expect(t.percent).toEqual(nfm);
      expect(t.z).toEqual(nfm);
    }
    expect(r.compositionIndices.adiposeMuscle).toEqual(nfm);
    expect(r.compositionIndices.muscleBone).toEqual(nfm);
    expect(zOf(r, "tricepsSkinfoldMm")).toBe(-0.89);
    expect(val(r.adiposity.sum6)).toBe(71);
    expect(val(r.muscularity.correctedArm.value)).toBe(26.74);
    expect(val(r.distribution.adipose.upper)).toBe(30.99);
    expect(r.proportionality.cormic.status).toBe("ok");
    expect(val(r.somatotype.meso)).toBe(5.69);
    expect(r.health.diagnosis.bmi.status).toBe("unclassified");
    expect(r.health.diagnosis.waistHipRatio).toBeNull();
  });
});

describe("resumen, diferencias y fechas", () => {
  it("buildIsakSummary con anterior", () => {
    const s = buildIsakSummary(A, { result: B, dateLabel: "05/11/2025" });
    expect(s.tissuesLine).toBe("Adiposo 27,02 % · Muscular 47,49 % · Óseo 16,95 % · Residual 8,54 %");
    expect(s.somatotypeLine).toBe("Somatotipo 4,03 – 5,69 – 1,92 (Endo-mesomorfo) · IMO 2,80");
    expect(s.muscleBone).toEqual({ key: "MEDIUM", label: "Medio" });
    expect(s.sum6Line).toBe("Σ 6 pliegues 71,0 mm (−9,5 respecto del 05/11/2025)");
  });

  it("buildIsakSummary sin anterior y menor", () => {
    expect(buildIsakSummary(A, null).sum6Line).toBe("Σ 6 pliegues 71,0 mm");
    const minor = buildIsakSummary(buildIsakStudy({ measures: CASE_A, sex: "MALE", ageYears: 12 }), null);
    expect(minor.tissuesLine).toBeNull();
    expect(minor.somatotypeLine).toBe("Somatotipo 4,03 – 5,69 – 1,92 (Endo-mesomorfo)");
    expect(minor.muscleBone).toBeNull();
  });

  it("sumsLive", () => {
    expect(ISAK_TEXT.sumsLive(71, 94)).toBe("Σ 6 pliegues: 71,0 mm · Σ 8 pliegues: 94,0 mm");
    expect(ISAK_TEXT.sumsLive(null, null)).toBe("Σ 6 pliegues: — · Σ 8 pliegues: —");
  });

  it("isakDifference", () => {
    expect(isakDifference({ status: "ok", value: 71 }, { status: "ok", value: 80.5 }, 1)).toBe(-9.5);
    expect(isakDifference({ status: "ok", value: 71 }, { status: "missing", note: "x" }, 1)).toBeNull();
    expect(isakDifference({ status: "missing", note: "x" }, { status: "ok", value: 1 }, 1)).toBeNull();
    expect(isakDifference({ status: "ok", value: 71 }, null, 1)).toBeNull();
  });

  it("daysBetweenDayKeys y comparedWith", () => {
    expect(daysBetweenDayKeys("2025-11-05", "2026-05-08")).toBe(184);
    expect(ISAK_TEXT.comparedWith("05/11/2025", 184)).toBe("Comparado con el estudio del 05/11/2025 (184 días antes)");
    expect(ISAK_TEXT.comparedWith("07/05/2026", 1)).toBe("Comparado con el estudio del 07/05/2026 (1 día antes)");
  });
});
