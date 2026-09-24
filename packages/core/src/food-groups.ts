/**
 * Grupos de alimentos de SARA 2 (tablas 1 a 26) + OTROS (solo para alimentos propios).
 * El orden es el de la tabla: la tabla N es el valor N-ésimo.
 * Tiene que coincidir con el enum `FoodGroup` de Prisma (lo chequea `packages/db/domain/foods.ts`).
 */
export const FOOD_GROUP_VALUES = [
  "VERDURAS",
  "FRUTAS",
  "LEGUMBRES_CEREALES",
  "LECHE_Y_POSTRES",
  "YOGURES",
  "QUESOS",
  "CARNES",
  "HUEVOS",
  "PESCADOS_Y_MARISCOS",
  "ACEITES",
  "FRUTAS_SECAS_Y_SEMILLAS",
  "AZUCARES_MERMELADAS_Y_DULCES",
  "GOLOSINAS_Y_CHOCOLATES",
  "GRASAS",
  "SNACKS_SALADOS",
  "ADEREZOS",
  "CALDOS_Y_SOPAS",
  "POSTRES_Y_HELADOS",
  "SALES",
  "BEBIDAS_CON_AZUCAR",
  "BEBIDAS_SIN_AZUCAR",
  "BEBIDAS_ALCOHOLICAS_Y_ENERGIZANTES",
  "BEBIDAS_DE_FRUTAS",
  "INFUSIONES",
  "COMIDAS_RAPIDAS",
  "SUPLEMENTOS",
  "OTROS",
] as const;
export type FoodGroupKey = (typeof FOOD_GROUP_VALUES)[number];

/** Etiqueta completa (tooltip, ficha, selector del formulario). */
export const FOOD_GROUP_LABELS: Record<FoodGroupKey, string> = {
  VERDURAS: "Verduras",
  FRUTAS: "Frutas",
  LEGUMBRES_CEREALES: "Legumbres, cereales, papa, choclo, batata, pan y pastas",
  LECHE_Y_POSTRES: "Leche y postres de leche",
  YOGURES: "Yogures",
  QUESOS: "Quesos",
  CARNES: "Carnes",
  HUEVOS: "Huevos",
  PESCADOS_Y_MARISCOS: "Pescados y mariscos",
  ACEITES: "Aceites",
  FRUTAS_SECAS_Y_SEMILLAS: "Frutas secas y semillas",
  AZUCARES_MERMELADAS_Y_DULCES: "Azúcares, mermeladas y dulces",
  GOLOSINAS_Y_CHOCOLATES: "Golosinas y chocolates",
  GRASAS: "Grasas",
  SNACKS_SALADOS: "Snacks salados",
  ADEREZOS: "Aderezos",
  CALDOS_Y_SOPAS: "Caldos y sopas industriales",
  POSTRES_Y_HELADOS: "Postres industriales y helados",
  SALES: "Sales",
  BEBIDAS_CON_AZUCAR: "Bebidas con azúcar",
  BEBIDAS_SIN_AZUCAR: "Bebidas sin azúcar",
  BEBIDAS_ALCOHOLICAS_Y_ENERGIZANTES: "Bebidas alcohólicas y energizantes",
  BEBIDAS_DE_FRUTAS: "Bebidas de frutas naturales sin azúcar agregada",
  INFUSIONES: "Infusiones",
  COMIDAS_RAPIDAS: "Comidas rápidas",
  SUPLEMENTOS: "Suplementos nutricionales",
  OTROS: "Otros",
};

/** Etiqueta corta (tabla, combobox, catálogo de la IA). */
export const FOOD_GROUP_SHORT_LABELS: Record<FoodGroupKey, string> = {
  VERDURAS: "Verduras",
  FRUTAS: "Frutas",
  LEGUMBRES_CEREALES: "Cereales, papa, pan y pastas",
  LECHE_Y_POSTRES: "Leche y postres",
  YOGURES: "Yogures",
  QUESOS: "Quesos",
  CARNES: "Carnes",
  HUEVOS: "Huevos",
  PESCADOS_Y_MARISCOS: "Pescados y mariscos",
  ACEITES: "Aceites",
  FRUTAS_SECAS_Y_SEMILLAS: "Frutas secas y semillas",
  AZUCARES_MERMELADAS_Y_DULCES: "Azúcares y dulces",
  GOLOSINAS_Y_CHOCOLATES: "Golosinas",
  GRASAS: "Grasas",
  SNACKS_SALADOS: "Snacks",
  ADEREZOS: "Aderezos",
  CALDOS_Y_SOPAS: "Caldos y sopas",
  POSTRES_Y_HELADOS: "Postres y helados",
  SALES: "Sales",
  BEBIDAS_CON_AZUCAR: "Bebidas con azúcar",
  BEBIDAS_SIN_AZUCAR: "Bebidas sin azúcar",
  BEBIDAS_ALCOHOLICAS_Y_ENERGIZANTES: "Bebidas alcohólicas",
  BEBIDAS_DE_FRUTAS: "Jugos naturales",
  INFUSIONES: "Infusiones",
  COMIDAS_RAPIDAS: "Comidas rápidas",
  SUPLEMENTOS: "Suplementos",
  OTROS: "Otros",
};

/** Tabla SARA 2 (1..26) → grupo. OTROS no tiene tabla. */
export const SARA2_TABLE_GROUPS: Readonly<Record<number, FoodGroupKey>> = Object.freeze(
  Object.fromEntries(
    FOOD_GROUP_VALUES.filter((g) => g !== "OTROS").map((g, i) => [i + 1, g]),
  ) as Record<number, FoodGroupKey>,
);

export function sara2TableGroup(table: number): FoodGroupKey | null {
  return SARA2_TABLE_GROUPS[table] ?? null;
}

export const FOOD_SOURCE_VALUES = ["SARA2", "PROPIO"] as const;
export type FoodSourceKey = (typeof FOOD_SOURCE_VALUES)[number];
export const FOOD_SOURCE_LABELS: Record<FoodSourceKey, string> = {
  SARA2: "SARA 2",
  PROPIO: "Propio",
};
