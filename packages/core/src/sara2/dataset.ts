import { FOOD_GROUP_VALUES, sara2TableGroup, type FoodGroupKey } from "../food-groups";
import { FOOD_EXTRA_NUTRIENTS, type FoodNutrients } from "../food-nutrients";
import type { SaraRejectReason } from "./validate";
import { SARA2_VALIDATION } from "./validate";

export interface Sara2Food {
  sourceKey: string;
  table: number;
  group: FoodGroupKey;
  name: string;
  pages: [number, number];
  kcalPer100: number;
  proteinPer100: number;
  carbsPer100: number;
  fatPer100: number;
  fiberPer100: number | null;
  alcoholPer100: number | null;
  sodiumMgPer100: number | null;
  addedSugarPer100: number | null;
  saturatedFatPer100: number | null;
  cholesterolMgPer100: number | null;
  nutrients: FoodNutrients;
}

export interface Sara2TableStats {
  table: number;
  group: FoodGroupKey;
  rowsA: number;
  rowsB: number;
  paired: number;
  imported: number;
  rejected: Partial<Record<SaraRejectReason, number>>;
  warnings: number;
}

export interface Sara2Summary {
  rowsA: number;
  imported: number;
  rejected: number;
  excluded: number;
  rejectedPct: number;
}

export interface Sara2Dataset {
  format: 1;
  source: { title: string; publisher: string; year: 2022; file: string; sha256: string };
  status: "ok";
  summary: Sara2Summary;
  tables: Sara2TableStats[];
  foods: Sara2Food[];
}

const REQUIRED_NUMBER_FIELDS = ["kcalPer100", "proteinPer100", "carbsPer100", "fatPer100"] as const;
const NULLABLE_NUMBER_FIELDS = [
  "fiberPer100",
  "alcoholPer100",
  "sodiumMgPer100",
  "addedSugarPer100",
  "saturatedFatPer100",
  "cholesterolMgPer100",
] as const;

/** Copia con el orden de claves fijo (así el JSON serializado es estable). */
function canonicalFood(f: Sara2Food): Sara2Food {
  const nutrients = {} as FoodNutrients;
  for (const def of FOOD_EXTRA_NUTRIENTS) nutrients[def.key] = f.nutrients[def.key] ?? null;
  nutrients.kcalPublicada = f.nutrients.kcalPublicada ?? null;
  return {
    sourceKey: f.sourceKey,
    table: f.table,
    group: f.group,
    name: f.name,
    pages: [f.pages[0], f.pages[1]],
    kcalPer100: f.kcalPer100,
    proteinPer100: f.proteinPer100,
    carbsPer100: f.carbsPer100,
    fatPer100: f.fatPer100,
    fiberPer100: f.fiberPer100,
    alcoholPer100: f.alcoholPer100,
    sodiumMgPer100: f.sodiumMgPer100,
    addedSugarPer100: f.addedSugarPer100,
    saturatedFatPer100: f.saturatedFatPer100,
    cholesterolMgPer100: f.cholesterolMgPer100,
    nutrients,
  };
}

function canonicalTable(t: Sara2TableStats): Sara2TableStats {
  const rejected: Partial<Record<SaraRejectReason, number>> = {};
  for (const k of Object.keys(t.rejected).sort() as SaraRejectReason[]) rejected[k] = t.rejected[k];
  return {
    table: t.table,
    group: t.group,
    rowsA: t.rowsA,
    rowsB: t.rowsB,
    paired: t.paired,
    imported: t.imported,
    rejected,
    warnings: t.warnings,
  };
}

/** JSON estable para el diff: metadatos indentados y UN alimento por línea, ordenados por sourceKey. Sin fecha. */
export function serializeSara2Dataset(ds: Sara2Dataset): string {
  const foods = [...ds.foods]
    .sort((x, y) => (x.sourceKey < y.sourceKey ? -1 : x.sourceKey > y.sourceKey ? 1 : 0))
    .map(canonicalFood);
  const tables = [...ds.tables].sort((x, y) => x.table - y.table).map(canonicalTable);
  const s = ds.summary;
  const summary = {
    rowsA: s.rowsA,
    imported: s.imported,
    rejected: s.rejected,
    excluded: s.excluded,
    rejectedPct: s.rejectedPct,
  };
  const source = {
    title: ds.source.title,
    publisher: ds.source.publisher,
    year: ds.source.year,
    file: ds.source.file,
    sha256: ds.source.sha256,
  };
  const list = (items: unknown[]) =>
    items.length === 0 ? "[]" : `[\n${items.map((x) => `    ${JSON.stringify(x)}`).join(",\n")}\n  ]`;
  return [
    "{",
    `  "format": ${JSON.stringify(ds.format)},`,
    `  "source": ${JSON.stringify(source)},`,
    `  "status": ${JSON.stringify(ds.status)},`,
    `  "summary": ${JSON.stringify(summary)},`,
    `  "tables": ${list(tables)},`,
    `  "foods": ${list(foods)}`,
    "}",
    "",
  ].join("\n");
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const isNonNegNumber = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x) && x >= 0;

/**
 * Lo usa el cargador: forma, format === 1, status "ok", rejectedPct ≤ 5, sourceKey únicos con
 * prefijo "sara2:", grupos válidos (nunca SUPLEMENTOS ni OTROS), números finitos ≥ 0.
 */
export function validateSara2Dataset(
  json: unknown,
): { ok: true; dataset: Sara2Dataset } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (!isObj(json)) return { ok: false, errors: ["el archivo no es un objeto JSON"] };
  if (json.format !== 1) errors.push(`format tiene que ser 1 (es ${JSON.stringify(json.format)})`);
  if (json.status !== "ok") errors.push(`status tiene que ser "ok" (es ${JSON.stringify(json.status)})`);
  if (!isObj(json.source) || typeof json.source.sha256 !== "string") errors.push("falta source.sha256");
  const summary = json.summary;
  if (!isObj(summary) || !isNonNegNumber(summary.rejectedPct)) errors.push("falta summary.rejectedPct");
  else if (summary.rejectedPct > SARA2_VALIDATION.maxRejectedRatio * 100) {
    errors.push(`summary.rejectedPct = ${summary.rejectedPct} supera el ${SARA2_VALIDATION.maxRejectedRatio * 100} %`);
  }
  if (!Array.isArray(json.tables)) errors.push("falta tables");
  if (!Array.isArray(json.foods)) {
    errors.push("falta foods");
    return { ok: false, errors };
  }
  if (json.foods.length === 0) errors.push("foods está vacío");

  const seen = new Set<string>();
  json.foods.forEach((raw, i) => {
    const where = `foods[${i}]`;
    if (!isObj(raw)) {
      errors.push(`${where}: no es un objeto`);
      return;
    }
    const key = raw.sourceKey;
    if (typeof key !== "string" || !key.startsWith("sara2:")) errors.push(`${where}: sourceKey inválido`);
    else if (seen.has(key)) errors.push(`${where}: sourceKey repetido ${key}`);
    else seen.add(key);
    if (typeof raw.name !== "string" || raw.name.trim().length < 2) errors.push(`${where}: nombre inválido`);
    const group = raw.group;
    if (
      typeof group !== "string" ||
      !(FOOD_GROUP_VALUES as readonly string[]).includes(group) ||
      group === "SUPLEMENTOS" ||
      group === "OTROS"
    ) {
      errors.push(`${where}: grupo inválido ${JSON.stringify(group)}`);
    } else if (typeof raw.table !== "number" || sara2TableGroup(raw.table) !== group) {
      errors.push(`${where}: el grupo no corresponde a la tabla ${JSON.stringify(raw.table)}`);
    }
    if (!Array.isArray(raw.pages) || raw.pages.length !== 2) errors.push(`${where}: pages inválido`);
    for (const f of REQUIRED_NUMBER_FIELDS) {
      if (!isNonNegNumber(raw[f])) errors.push(`${where}: ${f} tiene que ser un número ≥ 0`);
    }
    for (const f of NULLABLE_NUMBER_FIELDS) {
      if (raw[f] !== null && !isNonNegNumber(raw[f])) errors.push(`${where}: ${f} tiene que ser null o un número ≥ 0`);
    }
    const n = raw.nutrients;
    if (!isObj(n)) errors.push(`${where}: nutrients no es un objeto`);
    else {
      for (const k of [...FOOD_EXTRA_NUTRIENTS.map((d) => d.key), "kcalPublicada"]) {
        if (!(k in n)) errors.push(`${where}: falta nutrients.${k}`);
        else if (n[k] !== null && !isNonNegNumber(n[k])) errors.push(`${where}: nutrients.${k} inválido`);
      }
    }
  });

  if (errors.length > 0) return { ok: false, errors: errors.slice(0, 50) };
  return { ok: true, dataset: json as unknown as Sara2Dataset };
}
