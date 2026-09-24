import { FOOD_EXTRA_NUTRIENTS, type FoodNutrientKey } from "../food-nutrients";

/** Campos de la parte A (macronutrientes), en el orden de las columnas del PDF. */
export type SaraAField =
  | "kcalPublicada"
  | "agua"
  | "proteinPer100"
  | "fatPer100"
  | "cholesterolMgPer100"
  | "saturatedFatPer100"
  | "grasasMono"
  | "grasasPoli"
  | "grasasTrans"
  | "linoleico"
  | "alfaLinolenico"
  | "araquidonico"
  | "epa"
  | "dha"
  | "carbsPer100"
  | "choTotales"
  | "azucarTotal"
  | "addedSugarPer100"
  | "fiberPer100"
  | "alcoholPer100";

/** Campos de la parte B (vitaminas y minerales), en el orden de las columnas del PDF. */
export type SaraBField =
  | "cenizas"
  | "sodiumMgPer100"
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
  | "vitaminaD";

export const SARA2_A_COLUMNS: readonly { field: SaraAField; unit: "Kcal" | "g" | "mg" }[] = [
  { field: "kcalPublicada", unit: "Kcal" },
  { field: "agua", unit: "g" },
  { field: "proteinPer100", unit: "g" },
  { field: "fatPer100", unit: "g" },
  { field: "cholesterolMgPer100", unit: "mg" },
  { field: "saturatedFatPer100", unit: "g" },
  { field: "grasasMono", unit: "g" },
  { field: "grasasPoli", unit: "g" },
  { field: "grasasTrans", unit: "g" },
  { field: "linoleico", unit: "g" },
  { field: "alfaLinolenico", unit: "g" },
  { field: "araquidonico", unit: "g" },
  { field: "epa", unit: "g" },
  { field: "dha", unit: "g" },
  { field: "carbsPer100", unit: "g" },
  { field: "choTotales", unit: "g" },
  { field: "azucarTotal", unit: "g" },
  { field: "addedSugarPer100", unit: "g" },
  { field: "fiberPer100", unit: "g" },
  { field: "alcoholPer100", unit: "g" },
];

export const SARA2_B_COLUMNS: readonly { field: SaraBField; unit: "g" | "mg" | "µg" }[] = [
  { field: "cenizas", unit: "g" },
  { field: "sodiumMgPer100", unit: "mg" },
  { field: "potasio", unit: "mg" },
  { field: "calcio", unit: "mg" },
  { field: "cobre", unit: "mg" },
  { field: "fosforo", unit: "mg" },
  { field: "hierro", unit: "mg" },
  { field: "magnesio", unit: "mg" },
  { field: "zinc", unit: "mg" },
  { field: "niacina", unit: "mg" },
  { field: "folatoEfd", unit: "µg" },
  { field: "acidoFolico", unit: "µg" },
  { field: "vitaminaARae", unit: "µg" },
  { field: "retinol", unit: "µg" },
  { field: "tiamina", unit: "mg" },
  { field: "riboflavina", unit: "mg" },
  { field: "vitaminaB12", unit: "µg" },
  { field: "vitaminaC", unit: "mg" },
  { field: "vitaminaD", unit: "µg" },
];

/**
 * Erratas conocidas del renglón de unidades del PDF. En 62 de las 63 partes B la columna de
 * vitamina B12 dice "mg" (los valores son µg: 2,76 en vizcacha). Se acepta cualquiera de las dos.
 */
const UNIT_ALTERNATIVES: Partial<Record<SaraAField | SaraBField, readonly string[]>> = {
  vitaminaB12: ["µg", "mg"],
};

const normUnit = (u: string) => u.replace("μ", "µ").replace(/^kcal$/i, "Kcal");

/** true si el renglón de unidades coincide con las columnas esperadas de esa parte. */
export function unitsMatch(part: "A" | "B", units: readonly string[]): boolean {
  const cols = part === "A" ? SARA2_A_COLUMNS : SARA2_B_COLUMNS;
  if (units.length !== cols.length) return false;
  return cols.every((c, i) => {
    const allowed = UNIT_ALTERNATIVES[c.field] ?? [c.unit];
    return allowed.includes(normUnit(units[i] ?? ""));
  });
}

const COLUMN_LABELS: Record<Exclude<SaraAField | SaraBField, FoodNutrientKey>, string> = {
  kcalPublicada: "Energía",
  proteinPer100: "Proteínas",
  fatPer100: "Lípidos",
  cholesterolMgPer100: "Colesterol",
  saturatedFatPer100: "Grasas saturadas",
  carbsPer100: "Carbohidratos disponibles",
  addedSugarPer100: "Azúcar agregado",
  fiberPer100: "Fibra",
  alcoholPer100: "Alcohol",
  sodiumMgPer100: "Sodio",
};

/** Etiqueta legible de una columna (para el reporte). */
export function sara2ColumnLabel(field: SaraAField | SaraBField): string {
  return (
    (COLUMN_LABELS as Record<string, string>)[field] ??
    FOOD_EXTRA_NUTRIENTS.find((n) => n.key === field)?.label ??
    field
  );
}
