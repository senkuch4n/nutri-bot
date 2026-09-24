/**
 * Nutrientes de SARA 2 que NO van a columnas de `Food` (se guardan en `Food.nutrients`, JSON).
 * 10 componentes van a columnas (kcal, P, G, CHO disp., fibra, alcohol, sodio, azúcar agregado,
 * saturadas, colesterol) + estos 29 = los 39 de la tabla.
 */
export type FoodNutrientSection = "grasas" | "carbohidratos" | "minerales" | "vitaminas" | "otros";

export const FOOD_NUTRIENT_SECTION_LABELS: Record<FoodNutrientSection, string> = {
  grasas: "Grasas",
  carbohidratos: "Carbohidratos",
  minerales: "Minerales",
  vitaminas: "Vitaminas",
  otros: "Otros",
};

export type FoodNutrientKey =
  | "grasasMono"
  | "grasasPoli"
  | "grasasTrans"
  | "linoleico"
  | "alfaLinolenico"
  | "araquidonico"
  | "epa"
  | "dha"
  | "choTotales"
  | "azucarTotal"
  | "potasio"
  | "calcio"
  | "cobre"
  | "fosforo"
  | "hierro"
  | "magnesio"
  | "zinc"
  | "niacina"
  | "folatoEfd"
  | "acidoFolico"
  | "vitaminaARae"
  | "retinol"
  | "tiamina"
  | "riboflavina"
  | "vitaminaB12"
  | "vitaminaC"
  | "vitaminaD"
  | "agua"
  | "cenizas";

export interface FoodNutrientDefinition {
  key: FoodNutrientKey;
  label: string;
  unit: "g" | "mg" | "µg";
  section: FoodNutrientSection;
}

export const FOOD_EXTRA_NUTRIENTS: readonly FoodNutrientDefinition[] = [
  { key: "grasasMono", label: "Monoinsaturadas", unit: "g", section: "grasas" },
  { key: "grasasPoli", label: "Poliinsaturadas", unit: "g", section: "grasas" },
  { key: "grasasTrans", label: "Trans", unit: "g", section: "grasas" },
  { key: "linoleico", label: "18:2 Linoleico", unit: "g", section: "grasas" },
  { key: "alfaLinolenico", label: "18:3 Alfa-linolénico (ALA)", unit: "g", section: "grasas" },
  { key: "araquidonico", label: "20:4 Araquidónico", unit: "g", section: "grasas" },
  { key: "epa", label: "20:5 EPA", unit: "g", section: "grasas" },
  { key: "dha", label: "22:6 DHA", unit: "g", section: "grasas" },
  { key: "choTotales", label: "Carbohidratos totales", unit: "g", section: "carbohidratos" },
  { key: "azucarTotal", label: "Azúcar total", unit: "g", section: "carbohidratos" },
  { key: "potasio", label: "Potasio", unit: "mg", section: "minerales" },
  { key: "calcio", label: "Calcio", unit: "mg", section: "minerales" },
  { key: "cobre", label: "Cobre", unit: "mg", section: "minerales" },
  { key: "fosforo", label: "Fósforo", unit: "mg", section: "minerales" },
  { key: "hierro", label: "Hierro", unit: "mg", section: "minerales" },
  { key: "magnesio", label: "Magnesio", unit: "mg", section: "minerales" },
  { key: "zinc", label: "Zinc", unit: "mg", section: "minerales" },
  { key: "niacina", label: "Niacina", unit: "mg", section: "vitaminas" },
  { key: "folatoEfd", label: "Folato (EFD)", unit: "µg", section: "vitaminas" },
  { key: "acidoFolico", label: "Ácido fólico", unit: "µg", section: "vitaminas" },
  { key: "vitaminaARae", label: "Vitamina A (RAE)", unit: "µg", section: "vitaminas" },
  { key: "retinol", label: "Retinol", unit: "µg", section: "vitaminas" },
  { key: "tiamina", label: "Tiamina (B1)", unit: "mg", section: "vitaminas" },
  { key: "riboflavina", label: "Riboflavina (B2)", unit: "mg", section: "vitaminas" },
  { key: "vitaminaB12", label: "Vitamina B12", unit: "µg", section: "vitaminas" },
  { key: "vitaminaC", label: "Vitamina C", unit: "mg", section: "vitaminas" },
  { key: "vitaminaD", label: "Vitamina D", unit: "µg", section: "vitaminas" },
  { key: "agua", label: "Agua", unit: "g", section: "otros" },
  { key: "cenizas", label: "Cenizas", unit: "g", section: "otros" },
];

/** Lo que se guarda en Food.nutrients. Las 29 claves siempre presentes (null = sin dato). */
export type FoodNutrients = Record<FoodNutrientKey, number | null> & { kcalPublicada: number | null };

function toNumberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Lee Food.nutrients (Prisma.JsonValue) de forma tolerante. null si no es un objeto. */
export function readFoodNutrients(json: unknown): FoodNutrients | null {
  if (json === null || typeof json !== "object" || Array.isArray(json)) return null;
  const src = json as Record<string, unknown>;
  const out = { kcalPublicada: toNumberOrNull(src.kcalPublicada) } as FoodNutrients;
  for (const def of FOOD_EXTRA_NUTRIENTS) out[def.key] = toNumberOrNull(src[def.key]);
  return out;
}
