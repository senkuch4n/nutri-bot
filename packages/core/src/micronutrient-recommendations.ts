import type { Sex } from "./patient-formula-data";

// Official Health Canada DRI tables, verified 2026-10-02. Calcium/D: 2011;
// potassium/sodium: 2019. References are daily RDA/AI, never UL or CDRR.
export const DRI_SOURCES = {
  elements: "https://www.canada.ca/en/health-canada/services/food-nutrition/healthy-eating/dietary-reference-intakes/tables/reference-values-elements.html",
  vitamins: "https://www.canada.ca/en/health-canada/services/food-nutrition/healthy-eating/dietary-reference-intakes/tables/reference-values-vitamins.html",
} as const;

export type ComparableMicronutrientKey =
  | "calcio" | "hierro" | "magnesio" | "fosforo" | "zinc" | "cobre"
  | "potasio" | "sodio" | "vitaminaARae" | "vitaminaC" | "vitaminaD"
  | "tiamina" | "riboflavina" | "vitaminaB12" | "folatoEfd";

export interface MicronutrientReference {
  amount: number;
  kind: "RDA" | "AI";
}

export const ADULT_DRI_AGE_RANGES = [
  { min: 19, max: 30 }, { min: 31, max: 50 },
  { min: 51, max: 70 }, { min: 71, max: Infinity },
] as const;

// Values follow the age ranges above. Copper is converted exactly from
// 900 µg to 0.9 mg to match Food.nutrients; folatoEfd already uses DFE.
type AgeValues = readonly [number, number, number, number];
interface ReferenceRow {
  kind: MicronutrientReference["kind"];
  MALE: AgeValues;
  FEMALE: AgeValues;
}
const DRI: Record<ComparableMicronutrientKey, ReferenceRow> = {
  calcio: { kind: "RDA", MALE: [1000, 1000, 1000, 1200], FEMALE: [1000, 1000, 1200, 1200] },
  hierro: { kind: "RDA", MALE: [8, 8, 8, 8], FEMALE: [18, 18, 8, 8] },
  magnesio: { kind: "RDA", MALE: [400, 420, 420, 420], FEMALE: [310, 320, 320, 320] },
  fosforo: { kind: "RDA", MALE: [700, 700, 700, 700], FEMALE: [700, 700, 700, 700] },
  zinc: { kind: "RDA", MALE: [11, 11, 11, 11], FEMALE: [8, 8, 8, 8] },
  cobre: { kind: "RDA", MALE: [0.9, 0.9, 0.9, 0.9], FEMALE: [0.9, 0.9, 0.9, 0.9] },
  potasio: { kind: "AI", MALE: [3400, 3400, 3400, 3400], FEMALE: [2600, 2600, 2600, 2600] },
  sodio: { kind: "AI", MALE: [1500, 1500, 1500, 1500], FEMALE: [1500, 1500, 1500, 1500] },
  vitaminaARae: { kind: "RDA", MALE: [900, 900, 900, 900], FEMALE: [700, 700, 700, 700] },
  vitaminaC: { kind: "RDA", MALE: [90, 90, 90, 90], FEMALE: [75, 75, 75, 75] },
  vitaminaD: { kind: "RDA", MALE: [15, 15, 15, 20], FEMALE: [15, 15, 15, 20] },
  tiamina: { kind: "RDA", MALE: [1.2, 1.2, 1.2, 1.2], FEMALE: [1.1, 1.1, 1.1, 1.1] },
  riboflavina: { kind: "RDA", MALE: [1.3, 1.3, 1.3, 1.3], FEMALE: [1.1, 1.1, 1.1, 1.1] },
  vitaminaB12: { kind: "RDA", MALE: [2.4, 2.4, 2.4, 2.4], FEMALE: [2.4, 2.4, 2.4, 2.4] },
  folatoEfd: { kind: "RDA", MALE: [400, 400, 400, 400], FEMALE: [400, 400, 400, 400] },
};

export function getAdultMicronutrientReference(
  key: ComparableMicronutrientKey, sex: Sex, ageYears: number,
): MicronutrientReference | null {
  if (!Number.isInteger(ageYears)) return null;
  const index = ADULT_DRI_AGE_RANGES.findIndex((r) => ageYears >= r.min && ageYears <= r.max);
  if (index < 0) return null;
  const row = DRI[key];
  return { amount: row[sex][index]!, kind: row.kind };
}
