import { describe, expect, it } from "vitest";
import {
  BMI_FOR_AGE_CLASS_LABELS,
  HEIGHT_FOR_AGE_CLASS_LABELS,
  WHO_LMS_SOURCES,
  bmiForAgeZScore,
  buildBmiForAgeRow,
  buildHeightForAgeRow,
  classifyBmiForAge,
  classifyHeightForAge,
  formatPercentile,
  growthReportCell,
  growthZText,
  heightForAgeZScore,
  isImplausibleZ,
  lmsValueAtZ,
  lmsZScore,
  normalCdf,
  pediatricFooterText,
  whoLmsRow,
  type GrowthRow,
  type LmsRow,
} from "./growth-reference";
import { WHO_LMS, type WhoIndicator } from "./who/who-lms-data";
import { WHO_SD_COLUMNS } from "./who/who-sd-columns.test-data";

const INDICATORS: WhoIndicator[] = ["BMI_FOR_AGE", "HEIGHT_FOR_AGE"];
const SEXES = ["MALE", "FEMALE"] as const;
const r2 = (z: number) => Math.round(z * 100) / 100 + 0; // + 0 normaliza −0
const M = "−";

describe("tablas OMS (integridad)", () => {
  for (const ind of INDICATORS) {
    for (const sex of SEXES) {
      it(`${ind} ${sex}: 169 filas contiguas 60…228, L/M/S finitos`, () => {
        const rows = WHO_LMS[ind][sex];
        expect(rows).toHaveLength(169);
        rows.forEach(([month, L, Mv, S], i) => {
          expect(month).toBe(60 + i);
          expect(Number.isFinite(L)).toBe(true);
          expect(Mv).toBeGreaterThan(0);
          expect(S).toBeGreaterThan(0);
          if (ind === "HEIGHT_FOR_AGE") expect(L).toBe(1);
        });
      });
    }
  }

  it("8 fuentes con URL de who.int y SHA-256", () => {
    expect(WHO_LMS_SOURCES).toHaveLength(8);
    for (const s of WHO_LMS_SOURCES) {
      expect(s.url.startsWith("https://cdn.who.int/")).toBe(true);
      expect(s.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});

describe("filas contra las DE publicadas por la OMS", () => {
  const ks = [-3, -2, -1, 0, 1, 2, 3];
  for (const ind of INDICATORS) {
    for (const sex of SEXES) {
      it(`${ind} ${sex}: lmsValueAtZ reproduce SD3neg…SD3`, () => {
        const sd = WHO_SD_COLUMNS[ind][sex];
        expect(sd).toHaveLength(169);
        for (const t of sd) {
          const row = whoLmsRow(ind, sex, t[0])!;
          const tol = t[0] === 60 ? 0.051 : 0.0006;
          ks.forEach((k, i) => {
            expect(Math.abs(lmsValueAtZ(row, k) - t[i + 1]!)).toBeLessThanOrEqual(tol);
          });
        }
      });
    }
  }

  for (const sex of SEXES) {
    it(`IMC/E ${sex}: SD4 y SD4neg dan Z ±4 con la extensión (D6), no con la LMS directa`, () => {
      for (const t of WHO_SD_COLUMNS.BMI_FOR_AGE[sex]) {
        if (t[0] === 60) {
          expect(t[8]).toBeNull();
          expect(t[9]).toBeNull();
          continue;
        }
        const row = whoLmsRow("BMI_FOR_AGE", sex, t[0])!;
        expect(Math.abs(bmiForAgeZScore(t[9]!, row) - 4)).toBeLessThanOrEqual(0.002);
        expect(Math.abs(bmiForAgeZScore(t[8]!, row) + 4)).toBeLessThanOrEqual(0.002);
      }
    });
  }

  it("niños mes 96: la LMS directa en SD4 da 3,71 (la extensión hace falta)", () => {
    const row = whoLmsRow("BMI_FOR_AGE", "MALE", 96)!;
    expect(r2(lmsZScore(25.895, row))).toBe(3.71);
    expect(r2(bmiForAgeZScore(25.895, row))).toBe(4);
  });
});

describe("filas concretas (escritas en el test)", () => {
  it("IMC/E niños mes 149", () => {
    const row = whoLmsRow("BMI_FOR_AGE", "MALE", 149);
    expect(row).toEqual({ month: 149, L: -1.7559, M: 17.8124, S: 0.11688 });
    expect(r2(bmiForAgeZScore(17.8124, row!))).toBe(0);
    expect(r2(bmiForAgeZScore(24.067, row!))).toBe(2);
    expect(r2(bmiForAgeZScore(14.644, row!))).toBe(-2);
    expect(r2(bmiForAgeZScore(20.302, row!))).toBe(1);
    expect(r2(bmiForAgeZScore(30.708, row!))).toBe(3);
  });

  it("T/E niños mes 149 (SD5neg sin extensión)", () => {
    const row = whoLmsRow("HEIGHT_FOR_AGE", "MALE", 149);
    expect(row).toEqual({ month: 149, L: 1, M: 151.8623, S: 0.04762 });
    expect(r2(heightForAgeZScore(151.8623, row!))).toBe(0);
    expect(r2(heightForAgeZScore(137.399, row!))).toBe(-2);
    expect(r2(heightForAgeZScore(115.704, row!))).toBe(-5);
  });

  it("IMC/E niños mes 96 y sus DE publicadas", () => {
    const row = whoLmsRow("BMI_FOR_AGE", "MALE", 96)!;
    expect(row).toEqual({ month: 96, L: -1.4629, M: 15.7368, S: 0.09526 });
    const sd = WHO_SD_COLUMNS.BMI_FOR_AGE.MALE.find((t) => t[0] === 96)!;
    // [mes, SD3neg, SD2neg, SD1neg, SD0, SD1, SD2, SD3, SD4neg, SD4]
    expect(sd[1]).toBe(12.394);
    expect(sd[2]).toBe(13.302);
    expect(sd[6]).toBe(19.675);
    expect(sd[7]).toBe(22.785);
    expect(sd[8]).toBe(11.486);
    expect(sd[9]).toBe(25.895);
  });

  it("mes 60 sale de la OMS 2006", () => {
    expect(whoLmsRow("BMI_FOR_AGE", "MALE", 60)).toEqual({ month: 60, L: -0.6892, M: 15.1916, S: 0.087 });
    expect(whoLmsRow("HEIGHT_FOR_AGE", "FEMALE", 60)).toMatchObject({ M: 109.4233, S: 0.04347 });
  });

  it("fuera de 60…228 → null", () => {
    expect(whoLmsRow("BMI_FOR_AGE", "MALE", 59)).toBeNull();
    expect(whoLmsRow("HEIGHT_FOR_AGE", "FEMALE", 229)).toBeNull();
    expect(whoLmsRow("BMI_FOR_AGE", "FEMALE", 228)).not.toBeNull();
  });
});

describe("fila ficticia de la HU", () => {
  const bmiRow: LmsRow = { month: 0, L: -1, M: 17, S: 0.12 };
  it("IMC 20 → Z 1,25, P89", () => {
    const z = r2(bmiForAgeZScore(20, bmiRow));
    expect(z).toBe(1.25);
    expect(formatPercentile(z)).toBe("P89");
  });
  it("IMC 30 → extensión 3,82 (directa ≈ 3,61)", () => {
    expect(lmsValueAtZ(bmiRow, 3)).toBeCloseTo(26.5625, 4);
    expect(lmsValueAtZ(bmiRow, 2)).toBeCloseTo(22.3684, 4);
    expect(r2(lmsZScore(30, bmiRow))).toBe(3.61);
    expect(r2(bmiForAgeZScore(30, bmiRow))).toBe(3.82);
  });
  it("IMC 12 → extensión −3,41", () => {
    expect(lmsValueAtZ(bmiRow, -3)).toBeCloseTo(12.5, 4);
    expect(lmsValueAtZ(bmiRow, -2)).toBeCloseTo(13.7097, 4);
    expect(r2(bmiForAgeZScore(12, bmiRow))).toBe(-3.41);
  });
  it("talla L 1, M 150, S 0,045: 140 → −1,48", () => {
    expect(r2(heightForAgeZScore(140, { month: 0, L: 1, M: 150, S: 0.045 }))).toBe(-1.48);
  });
});

describe("normalCdf", () => {
  const cases: Array<[number, number]> = [
    [0, 0.5],
    [1, 0.841344746],
    [-1, 0.158655254],
    [1.25, 0.894350226],
    [2, 0.977249868],
    [-1.96, 0.024997895],
    [3, 0.998650102],
    [-3, 0.001349898],
  ];
  for (const [z, p] of cases) {
    it(`Φ(${z}) = ${p}`, () => {
      expect(Math.abs(normalCdf(z) - p)).toBeLessThanOrEqual(1e-7);
    });
  }
});

describe("formatPercentile", () => {
  it.each([
    [0, "P50"],
    [2.33, "P99"],
    [2.6, "> P99"],
    [-2.33, "P1"],
    [-2.6, "< P1"],
    [-0.02, "P49"],
  ])("%s → %s", (z, text) => {
    expect(formatPercentile(z)).toBe(text);
  });
});

describe("clasificación con la Z redondeada (D4, D5)", () => {
  it.each([
    [-3.01, "SEVERE_THINNESS"],
    [-3, "THINNESS"],
    [-2.01, "THINNESS"],
    [-2, "NORMAL"],
    [1, "NORMAL"],
    [1.01, "OVERWEIGHT"],
    [2, "OVERWEIGHT"],
    [2.01, "OBESITY"],
  ])("IMC/E %s → %s", (z, k) => {
    expect(classifyBmiForAge(z)).toBe(k);
  });
  it.each([
    [-3.01, "SEVERELY_STUNTED"],
    [-3, "STUNTED"],
    [-2.01, "STUNTED"],
    [-2, "ADEQUATE"],
    [3.5, "ADEQUATE"],
  ])("T/E %s → %s", (z, k) => {
    expect(classifyHeightForAge(z)).toBe(k);
  });
  it("etiquetas exactas", () => {
    expect(BMI_FOR_AGE_CLASS_LABELS).toEqual({
      SEVERE_THINNESS: "Delgadez severa",
      THINNESS: "Delgadez",
      NORMAL: "Normal",
      OVERWEIGHT: "Sobrepeso",
      OBESITY: "Obesidad",
    });
    expect(HEIGHT_FOR_AGE_CLASS_LABELS).toEqual({
      SEVERELY_STUNTED: "Talla baja severa",
      STUNTED: "Talla baja",
      ADEQUATE: "Talla adecuada",
    });
  });
});

describe("isImplausibleZ", () => {
  it("IMC/E límite 5, T/E límite 6 (estricto)", () => {
    expect(isImplausibleZ("BMI_FOR_AGE", -5)).toBe(false);
    expect(isImplausibleZ("BMI_FOR_AGE", -5.01)).toBe(true);
    expect(isImplausibleZ("BMI_FOR_AGE", 5.01)).toBe(true);
    expect(isImplausibleZ("HEIGHT_FOR_AGE", -6)).toBe(false);
    expect(isImplausibleZ("HEIGHT_FOR_AGE", -6.01)).toBe(true);
  });
});

describe("buildBmiForAgeRow / buildHeightForAgeRow", () => {
  it("Tomás (MALE, 149 meses, 40 kg, 150 cm)", () => {
    expect(buildBmiForAgeRow({ sex: "MALE", ageMonths: 149, weightKg: 40, heightCm: 150 })).toEqual({
      status: "classified",
      value: 17.8,
      ageMonths: 149,
      z: -0.02,
      percentileText: "P49",
      classKey: "NORMAL",
      classLabel: "Normal",
    });
    expect(buildHeightForAgeRow({ sex: "MALE", ageMonths: 149, heightCm: 150 })).toEqual({
      status: "classified",
      value: 150,
      ageMonths: 149,
      z: -0.26,
      percentileText: "P40",
      classKey: "ADEQUATE",
      classLabel: "Talla adecuada",
    });
  });

  it("chico del recorrido (MALE, 96 meses, 127,3 cm)", () => {
    const bmi = (weightKg: number) => buildBmiForAgeRow({ sex: "MALE", ageMonths: 96, weightKg, heightCm: 127.3 });
    expect(bmi(30)).toMatchObject({ status: "classified", value: 18.5, z: 1.52, percentileText: "P94", classKey: "OVERWEIGHT" });
    // Extensión de la OMS: la LMS directa daría 4,05.
    expect(bmi(45)).toMatchObject({ status: "classified", value: 27.8, z: 4.6, percentileText: "> P99", classKey: "OBESITY" });
    const row = whoLmsRow("BMI_FOR_AGE", "MALE", 96)!;
    expect(r2(lmsZScore(45 / 1.273 ** 2, row))).toBe(4.05);
    expect(bmi(18)).toMatchObject({ status: "classified", z: -4.42, percentileText: "< P1", classKey: "SEVERE_THINNESS" });
    expect(bmi(15)).toEqual({
      status: "implausible",
      value: 9.3,
      ageMonths: 96,
      z: -6.46,
      note: "Valor fuera de rango: revisá la medición.",
    });
    expect(buildHeightForAgeRow({ sex: "MALE", ageMonths: 96, heightCm: 127.3 })).toMatchObject({
      status: "classified",
      z: 0.01,
      percentileText: "P50",
      classKey: "ADEQUATE",
    });
    expect(buildHeightForAgeRow({ sex: "MALE", ageMonths: 96, heightCm: 108 })).toMatchObject({
      status: "classified",
      z: -3.41,
      classKey: "SEVERELY_STUNTED",
    });
  });

  it("Sofía (FEMALE, 96 meses, 26 kg, 128 cm)", () => {
    expect(buildBmiForAgeRow({ sex: "FEMALE", ageMonths: 96, weightKg: 26, heightCm: 128 })).toMatchObject({
      status: "classified",
      z: 0.1,
      percentileText: "P54",
      classKey: "NORMAL",
    });
    expect(buildHeightForAgeRow({ sex: "FEMALE", ageMonths: 96, heightCm: 128 })).toMatchObject({
      status: "classified",
      z: 0.25,
      percentileText: "P60",
    });
  });

  it("faltantes", () => {
    expect(buildBmiForAgeRow({ sex: "MALE", ageMonths: 149, weightKg: null, heightCm: 150 })).toEqual({
      status: "missing",
      note: "Sin dato (falta peso)",
    });
    expect(buildBmiForAgeRow({ sex: "MALE", ageMonths: 149, weightKg: 40, heightCm: null })).toEqual({
      status: "missing",
      note: "Sin dato (falta talla)",
    });
    expect(buildHeightForAgeRow({ sex: "MALE", ageMonths: 149, heightCm: null })).toEqual({
      status: "missing",
      note: "Sin dato (falta talla)",
    });
    expect(buildBmiForAgeRow({ sex: null, ageMonths: 149, weightKg: 40, heightCm: 150 })).toEqual({
      status: "unclassified",
      value: 17.8,
      ageMonths: 149,
      note: "Falta sexo",
    });
    expect(buildHeightForAgeRow({ sex: null, ageMonths: 149, heightCm: 150 })).toEqual({
      status: "unclassified",
      value: 150,
      ageMonths: 149,
      note: "Falta sexo",
    });
    expect(buildBmiForAgeRow({ sex: "MALE", ageMonths: 59, weightKg: 18, heightCm: 110 })).toEqual({
      status: "unclassified",
      value: 14.9,
      ageMonths: 59,
      note: "Sin referencia OMS para la edad de esta medición",
    });
    expect(buildBmiForAgeRow({ sex: "MALE", ageMonths: null, weightKg: 40, heightCm: 150 })).toEqual({
      status: "unclassified",
      value: 17.8,
      ageMonths: null,
      note: "Falta fecha de nacimiento",
    });
  });
});

describe("pediatricFooterText", () => {
  const tomasBmi = buildBmiForAgeRow({ sex: "MALE", ageMonths: 149, weightKg: 40, heightCm: 150 });
  const tomasHeight = buildHeightForAgeRow({ sex: "MALE", ageMonths: 149, heightCm: 150 });
  it("misma edad", () => {
    expect(pediatricFooterText(tomasBmi, tomasHeight)).toBe(
      "Referencia: OMS 2007. Edad: 12 años y 5 meses (149 meses).",
    );
  });
  it("edades distintas (D8)", () => {
    const bmi150 = buildBmiForAgeRow({ sex: "MALE", ageMonths: 150, weightKg: 40, heightCm: 150 });
    expect(pediatricFooterText(bmi150, tomasHeight)).toBe(
      "Referencia: OMS 2007. Edad a cada medición: IMC/E 150 meses, T/E 149 meses.",
    );
  });
  it("las dos faltan", () => {
    const miss: GrowthRow<string> = { status: "missing", note: "Sin dato (falta talla)" };
    expect(pediatricFooterText(miss, miss)).toBe("Referencia: OMS 2007.");
  });
});

describe("growthZText / growthReportCell", () => {
  it("texto de la Z", () => {
    expect(growthZText(-0.02, "P49")).toBe(`Z ${M}0,02 · P49`);
    expect(growthZText(0, "P50")).toBe("Z 0,00 · P50");
    expect(growthZText(1.52, "P94")).toBe("Z +1,52 · P94");
    expect(growthZText(-6.46, "")).toBe(`Z ${M}6,46`);
  });
  it("celdas del informe", () => {
    const tomasBmi = buildBmiForAgeRow({ sex: "MALE", ageMonths: 149, weightKg: 40, heightCm: 150 });
    const tomasHeight = buildHeightForAgeRow({ sex: "MALE", ageMonths: 149, heightCm: 150 });
    expect(growthReportCell(tomasBmi, "", "Sin dato")).toBe(`17,8 · Normal (Z ${M}0,02, P49)`);
    expect(growthReportCell(tomasHeight, "cm", "Sin dato")).toBe(`150,0 cm · Talla adecuada (Z ${M}0,26, P40)`);
    const implausible = buildBmiForAgeRow({ sex: "MALE", ageMonths: 96, weightKg: 15, heightCm: 127.3 });
    expect(growthReportCell(implausible, "", "Sin dato")).toBe(`9,3 · Valor fuera de rango (Z ${M}6,46)`);
    const unclassified = buildBmiForAgeRow({ sex: "MALE", ageMonths: null, weightKg: 40, heightCm: 150 });
    expect(growthReportCell(unclassified, "", "Sin dato")).toBe("17,8");
    expect(growthReportCell(buildHeightForAgeRow({ sex: null, ageMonths: 149, heightCm: 150 }), "cm", "Sin dato")).toBe(
      "150,0 cm",
    );
    expect(growthReportCell({ status: "missing", note: "x" }, "", "Sin dato")).toBe("Sin dato");
  });
});
