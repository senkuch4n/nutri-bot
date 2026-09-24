import { describe, expect, it } from "vitest";
import type { IsakMeasures } from "./isak";
import { CASE_A, CASE_B } from "./isak-fixtures.test-data";
import {
  ISAK_REPORT_TEXT,
  ISAK_REPORT_TEXT_KEYS,
  buildIsakReportDrafts,
  buildIsakReportModel,
  isakReportFileName,
  isakReportSourceKey,
  professionalSignature,
  resolveIsakReportTexts,
  variationLine,
  type IsakReportInput,
  type IsakReportRow,
} from "./isak-report";
import { buildIsakStudy, type IsakValue } from "./isak-study";

const study = (measures: IsakMeasures, ageYears: number, dateLabel: string) => ({
  result: buildIsakStudy({ measures, sex: "MALE", ageYears }),
  dateLabel,
  ageYears,
});

const NAME = "Paciente de prueba";
const AB: IsakReportInput = {
  patientName: NAME,
  current: study(CASE_A, 22, "08/05/2026"),
  previous: study(CASE_B, 21, "05/11/2025"),
};
const ONLY_A: IsakReportInput = { patientName: NAME, current: study(CASE_A, 22, "08/05/2026"), previous: null };
const NO_FEMUR: IsakReportInput = {
  patientName: NAME,
  current: study({ ...CASE_A, femurBreadthCm: null }, 22, "08/05/2026"),
  previous: study(CASE_B, 21, "05/11/2025"),
};
const MINOR: IsakReportInput = {
  patientName: NAME,
  current: study(CASE_A, 12, "08/05/2026"),
  previous: study(CASE_B, 11, "05/11/2025"),
};

const find = (rows: IsakReportRow[], key: string) => {
  const row = rows.find((r) => r.key === key);
  if (!row) throw new Error(`no hay fila ${key}`);
  return row;
};
const ok = (value: number): IsakValue => ({ status: "ok", value });

describe("buildIsakReportModel: A contra B", () => {
  const m = buildIsakReportModel(AB);

  it("encabezado y datos personales", () => {
    expect(m.title).toBe("Informe antropométrico");
    expect(m.subtitle).toBe("Consulta del 08/05/2026 · comparado con el estudio del 05/11/2025");
    expect(m.columns).toEqual({ previous: "Medición anterior (05/11/2025)", current: "Medición actual (08/05/2026)" });
    expect(m.personal).toEqual({ name: NAME, age: "22 años", date: "08/05/2026" });
    expect(m.legend).toEqual({ previous: "Anterior (05/11/2025)", current: "Actual (08/05/2026)" });
    expect(m.hasPrevious).toBe(true);
    expect(m.minor).toBe(false);
  });

  it("mediciones", () => {
    expect(find(m.measurements.rows, "weightKg")).toEqual({
      key: "weightKg",
      label: "Peso",
      previous: "67,6 kg",
      current: "61,0 kg",
      diff: "−6,6",
      change: "6,6 kg menos",
    });
    const talla = find(m.measurements.rows, "heightCm");
    expect(talla.current).toBe("164,0 cm");
    expect(talla.change).toBeNull();
    expect(talla.diff).toBe("0,0");
    expect(m.measurements.bmi.label).toBe("IMC (OMS)");
    expect(m.measurements.bmi.previous).toBe("25,1 · Sobrepeso");
    expect(m.measurements.bmi.current).toBe("22,7 · Normal");
    expect(m.measurements.bmi.diff).toBeNull();
    expect(m.measurements.minorNote).toBeNull();
  });

  it("pliegues", () => {
    expect(m.skinfolds.rows.map((r) => r.label)).toEqual([
      "Tríceps",
      "Subescapular",
      "Supraespinal",
      "Abdominal",
      "Muslo",
      "Pierna",
    ]);
    expect(m.skinfolds.sum6).toMatchObject({ previous: "80,5 mm", current: "71,0 mm", change: "9,5 mm menos" });
    const biceps = find(m.skinfolds.others, "bicepsSkinfoldMm");
    expect([biceps.previous, biceps.current, biceps.change]).toEqual(["4,0 mm", "4,0 mm", null]);
    const iliac = find(m.skinfolds.others, "iliacCrestSkinfoldMm");
    expect([iliac.previous, iliac.current]).toEqual(["30,0 mm", "19,0 mm"]);
    expect(m.skinfolds.intro).toBe(ISAK_REPORT_TEXT.skinfoldsIntro);
  });

  it("perímetros corregidos", () => {
    const [arm, thigh, calf] = m.girths.corrected;
    expect([arm!.previous, arm!.current]).toEqual(["28,53 cm", "26,74 cm"]);
    expect([thigh!.previous, thigh!.current]).toEqual(["51,49 cm", "48,54 cm"]);
    expect([calf!.previous, calf!.current, calf!.change]).toEqual(["31,80 cm", "32,62 cm", "0,82 cm más"]);
    expect(m.girths.muscle.map((r) => r.label)).toEqual([
      "Brazo relajado",
      "Brazo flexionado y contraído",
      "Muslo medio",
      "Pierna",
    ]);
    expect(m.girths.visceral.map((r) => r.current)).toEqual(["73,0 cm", "88,0 cm"]);
  });

  it("distribución", () => {
    expect(m.distribution.bars.map((b) => b.key)).toEqual([
      "arm",
      "correctedArm",
      "thigh",
      "correctedThigh",
      "calf",
      "correctedCalf",
    ]);
    expect(m.distribution.bars[0]).toMatchObject({ previous: 32.3, current: 30.2, decimals: 1 });
    expect(m.distribution.bars[1]).toMatchObject({ previous: 28.53, current: 26.74, decimals: 2 });
    expect(m.distribution.adipose.map((z) => z.value)).toEqual(["30,99 %", "45,07 %", "23,94 %"]);
    expect(m.distribution.muscle.map((z) => z.value)).toEqual(["24,79 %", "44,99 %", "30,23 %"]);
  });

  it("indicadores de salud", () => {
    const [iam, imo, icc] = m.health.indicators;
    expect(iam).toMatchObject({ key: "adiposeMuscle", value: "0,57", category: null, variation: "Bajó de 0,59 a 0,57 (−0,02)" });
    expect(imo).toMatchObject({ key: "muscleBone", value: "2,80", category: "Medio", variation: "Bajó de 2,99 a 2,80 (−0,19)" });
    expect(icc).toMatchObject({
      key: "waistHip",
      value: "0,83",
      category: "Sin riesgo aumentado",
      variation: "Bajó de 0,87 a 0,83 (−0,04)",
    });
  });

  it("composición", () => {
    const c = m.composition!;
    expect(c.methods).toBe("Métodos: Kerr (1991), Lee (2000), Rocha (1974), residual por diferencia");
    const row = (k: string) => c.rows.find((r) => r.key === k)!;
    expect([row("adipose").previous, row("adipose").current]).toEqual(["26,57 % (17,96 kg)", "27,02 % (16,48 kg)"]);
    expect([row("muscle").previous, row("muscle").current]).toEqual(["44,76 % (30,26 kg)", "47,49 % (28,97 kg)"]);
    expect([row("bone").previous, row("bone").current]).toEqual(["14,99 % (10,13 kg)", "16,95 % (10,34 kg)"]);
    expect([row("residual").previous, row("residual").current]).toEqual(["13,68 % (9,25 kg)", "8,54 % (5,21 kg)"]);
    expect(c.bars.current!.muscle).toBe(47.49);
    expect(c.bars.previous!.adipose).toBe(26.57);
  });

  it("somatotipo", () => {
    expect(m.somatotype.components).toBe("Endomorfia 4,95 → 4,03 · Mesomorfia 5,72 → 5,69 · Ectomorfia 1,01 → 1,92");
    expect(m.somatotype.category).toBe("Endo-mesomorfo");
    expect(m.somatotype.chart).toEqual({ current: { x: -2.12, y: 5.43 }, previous: { x: -3.94, y: 5.48 }, missingNote: null });
  });

  it("resto", () => {
    expect(m.hasMissingData).toBe(false);
    expect(m.textKeys).toEqual([...ISAK_REPORT_TEXT_KEYS]);
  });
});

describe("buildIsakReportDrafts: A contra B", () => {
  const d = buildIsakReportDrafts(AB);

  it("perímetros (mixto, sin O3)", () => {
    expect(d.girths).toBe(
      "Respecto de la evaluación anterior, el brazo corregido bajó 1,79 cm, el muslo corregido bajó 2,95 cm y la pierna corregida subió 0,82 cm. La cintura bajó 9,1 cm y la cadera bajó 6,0 cm.",
    );
  });
  it("distribución", () => {
    expect(d.distribution).toBe(
      "Respecto de la distribución de la grasa corporal, predomina la zona central (45,07 %). En cuanto a la masa muscular, se concentra principalmente en el muslo (44,99 %). Frente a la evaluación anterior, la proporción de grasa de la zona inferior pasó de 18,63 % a 23,94 %.",
    );
  });
  it("indicadores", () => {
    expect(d.adiposeMuscle).toBe("Se mantiene estable la relación entre el tejido adiposo y la masa muscular.");
    expect(d.muscleBone).toBe("Muestra una disminución de la masa muscular en relación con la masa ósea.");
    expect(d.waistHip).toBe(
      "El resultado indica que la distribución de la grasa corporal no representa un factor de riesgo cardiometabólico aumentado.",
    );
  });
  it("somatotipo", () => {
    expect(d.somatotype).toBe(
      "El análisis del somatotipo evidencia un perfil endo-mesomorfo. Predomina la mesomorfia (desarrollo músculo-esquelético relativo). Respecto de la evaluación anterior, se mantiene la categoría; la endomorfia bajó 0,92 y la ectomorfia subió 0,91.",
    );
  });
  it("conclusiones", () => {
    expect(d.conclusions).toBe(
      "En comparación con la evaluación del 05/11/2025, el peso bajó 6,6 kg y la sumatoria de 6 pliegues bajó 9,5 mm. El tejido muscular pasó de 44,76 % a 47,49 % y el tejido adiposo pasó de 26,57 % a 27,02 %. Se sugiere continuar con controles periódicos para monitorear la evolución.",
    );
  });
  it("es determinista", () => {
    expect(buildIsakReportDrafts(AB)).toEqual(d);
  });
});

describe("sin estudio anterior (solo A)", () => {
  const m = buildIsakReportModel(ONLY_A);
  const d = buildIsakReportDrafts(ONLY_A);

  it("modelo sin comparación", () => {
    expect(m.subtitle).toBe("Consulta del 08/05/2026 · primer estudio, sin comparación");
    expect(m.hasPrevious).toBe(false);
    expect(m.columns.previous).toBeNull();
    expect(m.legend).toEqual({ previous: null, current: "Actual (08/05/2026)" });
    const rows = [
      ...m.measurements.rows,
      m.measurements.bmi,
      ...m.skinfolds.rows,
      m.skinfolds.sum6,
      ...m.skinfolds.others,
      ...m.girths.muscle,
      ...m.girths.visceral,
      ...m.girths.corrected,
    ];
    for (const r of rows) {
      expect(r.previous).toBeNull();
      expect(r.diff).toBeNull();
      expect(r.change).toBeNull();
    }
    for (const i of m.health.indicators) expect(i.variation).toBeNull();
    for (const b of m.distribution.bars) expect(b.previous).toBeNull();
    expect(m.composition!.rows.every((r) => r.previous === null)).toBe(true);
    expect(m.composition!.bars.previous).toBeNull();
    expect(m.somatotype.chart.previous).toBeNull();
    expect(m.somatotype.components).toBe("Endomorfia 4,03 · Mesomorfia 5,69 · Ectomorfia 1,92");
  });

  it("borradores sin comparaciones", () => {
    for (const k of ISAK_REPORT_TEXT_KEYS) {
      expect(d[k]).not.toContain("anterior");
      expect(d[k]).not.toContain("pasó de");
    }
    expect(d.girths).toBe(
      "Perímetros corregidos: brazo 26,74 cm, muslo 48,54 cm y pierna 32,62 cm. Cintura 73,0 cm y cadera 88,0 cm.",
    );
    expect(d.conclusions.startsWith(
      "En esta primera evaluación, el peso es de 61,0 kg y la sumatoria de 6 pliegues es de 71,0 mm.",
    )).toBe(true);
    expect(d.conclusions).toContain("El tejido muscular representa el 47,49 % del peso y el tejido adiposo representa el 27,02 % del peso.");
    expect(d.muscleBone).toBe("Se ubica en la categoría medio de la relación entre masa muscular y masa ósea.");
    expect(d.somatotype).toBe(
      "El análisis del somatotipo evidencia un perfil endo-mesomorfo. Predomina la mesomorfia (desarrollo músculo-esquelético relativo).",
    );
  });
});

describe("sin fémur", () => {
  const m = buildIsakReportModel(NO_FEMUR);
  const d = buildIsakReportDrafts(NO_FEMUR);

  it("valores Sin dato", () => {
    const row = (k: string) => m.composition!.rows.find((r) => r.key === k)!;
    expect(row("bone").current).toBe("Sin dato");
    expect(row("residual").current).toBe("Sin dato");
    expect(row("adipose").current).toBe("27,02 % (16,48 kg)");
    expect(m.composition!.bars.current).toBeNull();
    const imo = m.health.indicators.find((i) => i.key === "muscleBone")!;
    expect(imo.value).toBe("Sin dato");
    expect(imo.variation).toBeNull();
    expect(imo.category).toBeNull();
    expect(m.somatotype.components).toContain("Mesomorfia 5,72 → Sin dato");
  });

  it("somatocarta sin punto actual", () => {
    expect(m.somatotype.category).toBe("Sin dato");
    expect(m.somatotype.chart.current).toBeNull();
    expect(m.somatotype.chart.previous).toEqual({ x: -3.94, y: 5.48 });
    expect(m.somatotype.chart.missingNote).toBe("Somatotipo sin dato (falta fémur)");
    expect(m.hasMissingData).toBe(true);
    expect(d.somatotype).toBe("");
    expect(d.muscleBone).toBe("");
  });
});

describe("menor (A a los 12, B a los 11)", () => {
  const m = buildIsakReportModel(MINOR);
  const d = buildIsakReportDrafts(MINOR);

  it("modelo", () => {
    expect(m.minor).toBe(true);
    expect(m.measurements.minorNote).toBe("Las fórmulas de composición corporal son para adultos.");
    expect(m.composition).toBeNull();
    expect(m.health.indicators).toHaveLength(1);
    expect(m.health.indicators[0]).toMatchObject({ key: "waistHip", value: "0,83", category: null });
    expect(m.health.indicators[0]!.variation).toBe("Bajó de 0,87 a 0,83 (−0,04)");
    expect(m.measurements.bmi.current).toBe("22,7");
    expect(m.textKeys).toEqual(["girths", "distribution", "waistHip", "somatotype", "conclusions"]);
    expect(m.hasMissingData).toBe(false);
    expect(m.personal.age).toBe("12 años");
  });

  it("borradores", () => {
    expect(d.adiposeMuscle).toBe("");
    expect(d.muscleBone).toBe("");
    expect(d.waistHip).toBe("");
    expect(d.conclusions).not.toContain("tejido");
    expect(d.conclusions).toBe(
      "En comparación con la evaluación del 05/11/2025, el peso bajó 6,6 kg y la sumatoria de 6 pliegues bajó 9,5 mm. Se sugiere continuar con controles periódicos para monitorear la evolución.",
    );
  });
});

describe("helpers", () => {
  it("variationLine", () => {
    expect(variationLine(ok(2.95), ok(2.8), 2)).toBe("Subió de 2,80 a 2,95 (+0,15)");
    expect(variationLine(ok(0.83), ok(0.83), 2)).toBe("Se mantuvo en 0,83");
    expect(variationLine(ok(0.57), ok(0.59), 2)).toBe("Bajó de 0,59 a 0,57 (−0,02)");
    expect(variationLine(ok(0.83), null, 2)).toBeNull();
    expect(variationLine({ status: "missing", note: "Sin dato" }, ok(1), 2)).toBeNull();
  });

  it("professionalSignature", () => {
    expect(professionalSignature({ title: "Lic.", name: "Ana Pérez", licenseNumber: "M.P. 123" })).toBe(
      "Lic. Ana Pérez · M.P. 123",
    );
    expect(professionalSignature({ title: null, name: "Ana Pérez", licenseNumber: null })).toBe("Ana Pérez");
    expect(professionalSignature({ title: "", name: "Ana Pérez", licenseNumber: "M.P. 123" })).toBe("Ana Pérez · M.P. 123");
    expect(professionalSignature({ title: "Lic.", name: "Ana Pérez", licenseNumber: "  " })).toBe("Lic. Ana Pérez");
    expect(professionalSignature({ title: "  Lic. ", name: " Ana Pérez ", licenseNumber: " M.P. 123 " })).toBe(
      "Lic. Ana Pérez · M.P. 123",
    );
  });

  it("isakReportFileName", () => {
    expect(isakReportFileName("2026-05-08")).toBe("informe-antropometrico-2026-05-08.pdf");
  });

  it("resolveIsakReportTexts", () => {
    const drafts = buildIsakReportDrafts(AB);
    expect(resolveIsakReportTexts(null, drafts)).toEqual(drafts);
    const saved = {
      girths: null,
      distribution: "",
      adiposeMuscle: "x",
      muscleBone: null,
      waistHip: null,
      somatotype: null,
      conclusions: "Mis conclusiones",
    };
    const r = resolveIsakReportTexts(saved, drafts);
    expect(r.girths).toBe(drafts.girths);
    expect(r.distribution).toBe("");
    expect(r.adiposeMuscle).toBe("x");
    expect(r.conclusions).toBe("Mis conclusiones");
  });
});

describe("isakReportSourceKey", () => {
  const base = {
    sex: "MALE" as const,
    current: { entryId: "a1", measures: CASE_A, dateLabel: "08/05/2026", ageYears: 22 },
    previous: { entryId: "b1", measures: CASE_B, dateLabel: "05/11/2025", ageYears: 21 },
  };
  const key = isakReportSourceKey(base);

  it("es estable y tiene 8 caracteres hex", () => {
    expect(key).toMatch(/^[0-9a-f]{8}$/);
    expect(isakReportSourceKey({ ...base, current: { ...base.current, measures: { ...CASE_A } } })).toBe(key);
  });

  it("cambia con los datos de entrada", () => {
    const variants = [
      { ...base, previous: { ...base.previous, measures: { ...CASE_B, tricepsSkinfoldMm: 13 } } },
      { ...base, sex: "FEMALE" as const },
      { ...base, current: { ...base.current, ageYears: 23 } },
      { ...base, previous: null },
      { ...base, current: { ...base.current, entryId: "a2" } },
      { ...base, current: { ...base.current, measures: { ...CASE_A, femurBreadthCm: null } } },
    ];
    for (const v of variants) expect(isakReportSourceKey(v)).not.toBe(key);
  });
});
