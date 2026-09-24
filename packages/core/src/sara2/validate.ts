import { parseEsArNumber } from "../es-ar-number";
import { sara2TableGroup } from "../food-groups";
import { FOOD_EXTRA_NUTRIENTS, type FoodNutrients } from "../food-nutrients";
import { atwaterKcal } from "../nutrition";
import { SARA2_A_COLUMNS, SARA2_B_COLUMNS, sara2ColumnLabel, type SaraAField, type SaraBField } from "./columns";
import type { Sara2Food } from "./dataset";
import type { SaraRawRow } from "./layout";
import { sara2SourceKey } from "./names";

/**
 * Reglas de validación de SARA 2. Resolución del orquestador (SDD §16): Q1-b (suma de macros
 * rechaza fuera de 90–110 g y advierte fuera de 97–103) y Q2 (Atwater con máx(2 kcal, 5 %)).
 */
export const SARA2_VALIDATION = {
  macroSumReject: [90, 110],
  macroSumWarn: [97, 103],
  atwaterAbsKcal: 2,
  atwaterRel: 0.05,
  maxRejectedRatio: 0.05,
  nameCostWarnPt: 8,
} as const;

export type SaraRejectReason =
  | "SIN_PAREJA_B"
  | "SIN_PAREJA_A"
  | "NUMERO_INVALIDO"
  | "FALTA_KCAL"
  | "FALTA_MACRO"
  | "SUMA_MACROS"
  | "ATWATER"
  | "CLAVE_DUPLICADA"
  | "NOMBRE_ILEGIBLE"
  | "COLUMNAS";

export interface SaraRejection {
  table: number | null;
  page: number;
  name: string;
  reason: SaraRejectReason;
  detail: string;
  rawText: string;
}

export interface SaraWarning {
  table: number;
  page: number;
  name: string;
  code: string;
  detail: string;
}

const fmt1 = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1, useGrouping: false });
const EPS = 0.05;

type Values = Record<SaraAField | SaraBField, number | null>;

export function validateSaraPair(
  table: number,
  a: SaraRawRow,
  b: SaraRawRow,
):
  | { ok: true; food: Sara2Food; warnings: SaraWarning[] }
  | { ok: false; rejection: SaraRejection } {
  const reject = (reason: SaraRejectReason, detail: string) => ({
    ok: false as const,
    rejection: { table, page: a.page, name: a.name, reason, detail, rawText: `${a.rawText}\n${b.rawText}` },
  });

  // 1. Parsear las 39 celdas.
  const values = {} as Values;
  const cols: { field: SaraAField | SaraBField; raw: string | null }[] = [
    ...SARA2_A_COLUMNS.map((c, i) => ({ field: c.field, raw: a.cells[i] ?? null })),
    ...SARA2_B_COLUMNS.map((c, i) => ({ field: c.field, raw: b.cells[i] ?? null })),
  ];
  for (const { field, raw } of cols) {
    const parsed = parseEsArNumber(raw, { allowThousands: false });
    if (!parsed.ok) return reject("NUMERO_INVALIDO", `número inválido «${parsed.raw}» en ${sara2ColumnLabel(field)}`);
    values[field] = parsed.value;
  }

  // 2. Obligatorios.
  const kcalPublicada = values.kcalPublicada;
  if (kcalPublicada === null) return reject("FALTA_KCAL", "faltan las kcal publicadas");
  const missing = [
    values.proteinPer100 === null ? "proteínas" : null,
    values.fatPer100 === null ? "lípidos" : null,
    values.carbsPer100 === null ? "carbohidratos disponibles" : null,
  ].filter((x): x is string => x !== null);
  if (missing.length > 0) return reject("FALTA_MACRO", `falta un macro (${missing.join(", ")})`);
  const protein = values.proteinPer100!;
  const fat = values.fatPer100!;
  const carbs = values.carbsPer100!;
  const alcohol = values.alcoholPer100;

  // 3. Atwater.
  const calc = atwaterKcal({ protein, carbs, fat, alcohol });
  const diff = Math.abs(kcalPublicada - calc);
  const tolerance = Math.max(SARA2_VALIDATION.atwaterAbsKcal, SARA2_VALIDATION.atwaterRel * calc);
  if (diff > tolerance + 1e-9) {
    return reject(
      "ATWATER",
      `kcal publicadas ${fmt1.format(kcalPublicada)}, calculadas ${fmt1.format(calc)}, diferencia ${fmt1.format(diff)}`,
    );
  }

  // 4. Suma de macros.
  const warnings: SaraWarning[] = [];
  const warn = (code: string, detail: string) => warnings.push({ table, page: a.page, name: a.name, code, detail });
  const sum =
    (values.agua ?? 0) +
    protein +
    fat +
    carbs +
    (values.fiberPer100 ?? 0) +
    (values.cenizas ?? 0) +
    (alcohol ?? 0);
  const sumRounded = Math.round(sum * 10) / 10;
  const noAsh = values.cenizas === null ? " (sin cenizas)" : "";
  const [rMin, rMax] = SARA2_VALIDATION.macroSumReject;
  const [wMin, wMax] = SARA2_VALIDATION.macroSumWarn;
  if (sumRounded < rMin || sumRounded > rMax) {
    return reject("SUMA_MACROS", `suma de macros = ${fmt1.format(sumRounded)} g${noAsh}`);
  }
  if (sumRounded < wMin || sumRounded > wMax) {
    warn("SUMA_FUERA_97_103", `suma de macros = ${fmt1.format(sumRounded)} g${noAsh}`);
  }
  if (values.cenizas === null) warn("SIN_CENIZAS", "suma calculada sin cenizas");

  // 5. Advertencias de coherencia (no rechazan, D6).
  const fatParts = (values.saturatedFatPer100 ?? 0) + (values.grasasMono ?? 0) + (values.grasasPoli ?? 0);
  if (fatParts > fat + EPS) {
    warn("GRASAS_INCONSISTENTES", `saturadas + mono + poli = ${fmt1.format(fatParts)} g > lípidos ${fmt1.format(fat)} g`);
  }
  const added = values.addedSugarPer100;
  const total = values.azucarTotal;
  if ((added !== null && total !== null && added > total + EPS) || (total !== null && total > carbs + EPS)) {
    warn(
      "AZUCARES_INCONSISTENTES",
      `azúcar agregado ${added === null ? "sin dato" : fmt1.format(added)} g, azúcar total ${
        total === null ? "sin dato" : fmt1.format(total)
      } g, CHO disponibles ${fmt1.format(carbs)} g`,
    );
  }

  // 6. Alimento.
  const group = sara2TableGroup(table);
  if (group === null) return reject("COLUMNAS", `tabla ${table} sin grupo`);
  const nutrients = {} as FoodNutrients;
  for (const def of FOOD_EXTRA_NUTRIENTS) nutrients[def.key] = values[def.key];
  nutrients.kcalPublicada = kcalPublicada;

  const food: Sara2Food = {
    sourceKey: sara2SourceKey(table, a.name),
    table,
    group,
    name: a.name,
    pages: [a.page, b.page],
    kcalPer100: calc,
    proteinPer100: protein,
    carbsPer100: carbs,
    fatPer100: fat,
    fiberPer100: values.fiberPer100,
    alcoholPer100: alcohol,
    sodiumMgPer100: values.sodiumMgPer100,
    addedSugarPer100: values.addedSugarPer100,
    saturatedFatPer100: values.saturatedFatPer100,
    cholesterolMgPer100: values.cholesterolMgPer100,
    nutrients,
  };
  return { ok: true, food, warnings };
}
