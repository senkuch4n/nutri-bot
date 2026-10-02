import { describe, expect, it } from "vitest";
import { computePlanMicronutrients, type MicronutrientPlanItem } from "./plan-micronutrients";
import { getAdultMicronutrientReference } from "./micronutrient-recommendations";
import type { Sex } from "./patient-formula-data";

const at = new Date("2026-10-02T15:00:00Z");
const adult = { birthDate: new Date("1990-10-02"), sex: "FEMALE" as const };
const item = (calcio: number | null, quantityGrams = 100): MicronutrientPlanItem => ({
  quantityGrams, food: { nutrients: { calcio }, sodiumMgPer100: null },
});
const calculate = (items: MicronutrientPlanItem[], patient: { birthDate: Date | null; sex: Sex | null } = adult) =>
  computePlanMicronutrients(items, patient, at, "America/Argentina/Buenos_Aires");
const calcium = (items: MicronutrientPlanItem[]) => calculate(items).nutrients.find((n) => n.key === "calcio")!;

describe("plan micronutrients", () => {
  it("scales a portion without intermediate rounding", () => {
    expect(calcium([item(123.456, 37)]).knownAmount).toBeCloseTo(45.67872, 10);
  });
  it("sums portions and calculates the real percentage above 100", () => {
    const result = calcium([item(800, 150), item(200, 50)]);
    expect(result.knownAmount).toBe(1300);
    expect(result.adequacyPercent).toBe(130);
    expect(result.coverage).toEqual({ knownItems: 2, totalItems: 2, complete: true });
  });
  it("distinguishes null from measured zero and reports partial coverage", () => {
    expect(calcium([item(null)]).knownAmount).toBeNull();
    expect(calcium([item(null)]).adequacyPercent).toBeNull();
    expect(calcium([item(0)]).knownAmount).toBe(0);
    const partial = calcium([item(800), item(null)]);
    expect(partial.knownAmount).toBe(800);
    expect(partial.adequacyPercent).toBe(80);
    expect(partial.coverage).toEqual({ knownItems: 1, totalItems: 2, complete: false });
  });
  it("counts custom items, foods without data and missing quantities as unknown", () => {
    const result = calcium([
      item(100), { quantityGrams: 100, food: null },
      { quantityGrams: 100, food: { nutrients: null, sodiumMgPer100: null } },
      { ...item(500), quantityGrams: null },
    ]);
    expect(result.knownAmount).toBe(100);
    expect(result.coverage).toEqual({ knownItems: 1, totalItems: 4, complete: false });
  });
  it("does not coerce absent, invalid or negative quantities and values to zero", () => {
    expect(calcium([item(NaN), item(-1), item(1, Infinity), item(1, -1)]).knownAmount).toBeNull();
  });
  it("has no known total for an empty plan", () => {
    expect(calcium([]).knownAmount).toBeNull();
    expect(calcium([]).coverage.complete).toBe(false);
  });
  it("reads sodium from its direct column, and keeps nutrient coverage independent", () => {
    const results = calculate([{ quantityGrams: 50, food: { nutrients: null, sodiumMgPer100: 300 } }]).nutrients;
    expect(results.find((n) => n.key === "sodio")).toMatchObject({ knownAmount: 150, adequacyPercent: 10, reference: { kind: "AI", amount: 1500 } });
    expect(results.find((n) => n.key === "calcio")?.knownAmount).toBeNull();
  });
  it("shows niacin contribution without treating mg as niacin equivalents", () => {
    const result = calculate([{ quantityGrams: 50, food: { nutrients: { niacina: 10 }, sodiumMgPer100: null } }]).nutrients.find((n) => n.key === "niacina");
    expect(result).toMatchObject({ knownAmount: 5, reference: null, adequacyPercent: null });
  });
  it.each([
    { birthDate: null, sex: "FEMALE" as const },
    { birthDate: adult.birthDate, sex: null },
    { birthDate: new Date("invalid"), sex: "MALE" as const },
  ])("retains totals without comparable patient data: %o", (patient) => {
    const result = computePlanMicronutrients([item(500)], patient, at, "UTC");
    expect(result.comparisonStatus).toBe("MISSING_PATIENT_DATA");
    expect(result.nutrients[0]).toMatchObject({ knownAmount: 500, reference: null, adequacyPercent: null });
  });
  it("only enables adult DRI on the nineteenth birthday in the clinical timezone", () => {
    const patient = { birthDate: new Date("2007-10-02"), sex: "MALE" as const };
    expect(computePlanMicronutrients([item(500)], patient, new Date("2026-10-02T02:00:00Z"), "America/Argentina/Buenos_Aires").comparisonStatus).toBe("UNDER_19");
    expect(calculate([item(500)], patient).comparisonStatus).toBe("AVAILABLE");
    const minor = computePlanMicronutrients([item(500)], { ...patient, birthDate: new Date("2008-10-02") }, at, "UTC");
    expect(minor.comparisonStatus).toBe("UNDER_19");
    expect(minor.nutrients.every((n) => n.reference === null)).toBe(true);
  });
});

describe("official adult DRI selection", () => {
  it.each([
    [19, 1000, 18, 310, 15], [30, 1000, 18, 310, 15],
    [31, 1000, 18, 320, 15], [50, 1000, 18, 320, 15],
    [51, 1200, 8, 320, 15], [70, 1200, 8, 320, 15],
    [71, 1200, 8, 320, 20], [95, 1200, 8, 320, 20],
  ])("female age %i: calcium, iron, magnesium and vitamin D", (age, ca, fe, mg, d) => {
    for (const [key, amount] of [["calcio", ca], ["hierro", fe], ["magnesio", mg], ["vitaminaD", d]] as const) {
      expect(getAdultMicronutrientReference(key, "FEMALE", age)).toEqual({ amount, kind: "RDA" });
    }
  });
  it.each([19, 30, 31, 50, 51, 70, 71, 95])("male age %i", (age) => {
    expect(getAdultMicronutrientReference("calcio", "MALE", age)?.amount).toBe(age > 70 ? 1200 : 1000);
    expect(getAdultMicronutrientReference("magnesio", "MALE", age)?.amount).toBe(age <= 30 ? 400 : 420);
    expect(getAdultMicronutrientReference("hierro", "MALE", age)?.amount).toBe(8);
    expect(getAdultMicronutrientReference("vitaminaD", "MALE", age)?.amount).toBe(age > 70 ? 20 : 15);
  });
  it("uses 2019 potassium/sodium AI and exact copper units", () => {
    expect(getAdultMicronutrientReference("potasio", "MALE", 70)).toEqual({ amount: 3400, kind: "AI" });
    expect(getAdultMicronutrientReference("potasio", "FEMALE", 70)).toEqual({ amount: 2600, kind: "AI" });
    expect(getAdultMicronutrientReference("sodio", "FEMALE", 80)).toEqual({ amount: 1500, kind: "AI" });
    expect(getAdultMicronutrientReference("cobre", "MALE", 19)).toEqual({ amount: 0.9, kind: "RDA" });
  });
  it.each([18, -1, NaN, Infinity, 30.5])("rejects unsupported age %s", (age) => {
    expect(getAdultMicronutrientReference("calcio", "MALE", age)).toBeNull();
  });
});
