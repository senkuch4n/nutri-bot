import { FOOD_EXTRA_NUTRIENTS, readFoodNutrients } from "./food-nutrients";
import { computeAgeYears, type Sex } from "./patient-formula-data";
import { getAdultMicronutrientReference, type ComparableMicronutrientKey, type MicronutrientReference } from "./micronutrient-recommendations";

export type PlanMicronutrientKey = ComparableMicronutrientKey | "niacina";
const KEYS: readonly PlanMicronutrientKey[] = [
  "calcio", "hierro", "magnesio", "fosforo", "zinc", "cobre", "potasio", "sodio",
  "vitaminaARae", "vitaminaC", "vitaminaD", "tiamina", "riboflavina", "niacina", "vitaminaB12", "folatoEfd",
];

export interface MicronutrientPlanItem {
  quantityGrams: number | null;
  food: { nutrients: unknown; sodiumMgPer100: number | null } | null;
  /** HU-018b: peso del ítem en el promedio diario de la semana. Default 1. 0 = no aporta. */
  weight?: number;
}

export interface PlanMicronutrientResult {
  key: PlanMicronutrientKey;
  label: string;
  unit: "mg" | "µg";
  /** null means no usable data, rather than a measured zero. */
  knownAmount: number | null;
  reference: MicronutrientReference | null;
  /** For incomplete data this describes only the known contribution. */
  adequacyPercent: number | null;
  coverage: { knownItems: number; totalItems: number; complete: boolean };
}

export interface PlanMicronutrients {
  totalItems: number;
  comparisonStatus: "AVAILABLE" | "MISSING_PATIENT_DATA" | "UNDER_19";
  nutrients: PlanMicronutrientResult[];
}

/** Pure calculation: caller supplies the reference date and clinical timezone. */
export function computePlanMicronutrients(
  items: readonly MicronutrientPlanItem[],
  patient: { birthDate: Date | null; sex: Sex | null },
  at: Date,
  timeZone: string,
): PlanMicronutrients {
  const age = patient.birthDate && Number.isFinite(patient.birthDate.getTime())
    ? computeAgeYears(patient.birthDate, at, timeZone) : null;
  const comparisonStatus = age !== null && age < 19 ? "UNDER_19"
    : age === null || patient.sex === null ? "MISSING_PATIENT_DATA" : "AVAILABLE";
  const prepared = items.map((item) => ({ ...item, nutrients: readFoodNutrients(item.food?.nutrients) }));
  const nutrients = KEYS.map((key): PlanMicronutrientResult => {
    const definition = FOOD_EXTRA_NUTRIENTS.find((d) => d.key === key);
    let amount = 0;
    let knownItems = 0;
    for (const item of prepared) {
      const grams = item.quantityGrams;
      const value = key === "sodio" ? item.food?.sodiumMgPer100 : item.nutrients?.[key];
      if (!item.food || grams === null || !Number.isFinite(grams) || grams < 0 ||
        value == null || !Number.isFinite(value) || value < 0) continue;
      amount += value * grams / 100 * (item.weight ?? 1);
      knownItems += 1;
    }
    // SARA niacin is mg of preformed niacin, not mg NE. No tryptophan
    // data exists to calculate NE, so its contribution has no DRI comparison.
    const reference = comparisonStatus === "AVAILABLE" && key !== "niacina"
      ? getAdultMicronutrientReference(key, patient.sex!, age!) : null;
    const knownAmount = knownItems > 0 ? amount : null;
    return {
      key, label: definition?.label ?? "Sodio", unit: definition?.unit === "µg" ? "µg" : "mg",
      knownAmount, reference,
      adequacyPercent: knownAmount !== null && reference ? knownAmount / reference.amount * 100 : null,
      coverage: { knownItems, totalItems: items.length, complete: items.length > 0 && knownItems === items.length },
    };
  });
  return { totalItems: items.length, comparisonStatus, nutrients };
}
