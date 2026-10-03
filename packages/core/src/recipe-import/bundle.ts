import { isRecipeMomentKey, isRecipeTagKey, isRecipeTypeKey } from "../recipes";
import type { RecipeImportDraft } from "./extract";

// HU-018a-2 (SDD 8.4, 12-D8): bundle de exportación de recetas revisadas en desarrollo, para
// importarlas en producción. Va a docs/recetarios/_exportacion/ (ignorado): nunca entra al repo.

export const RECIPE_BUNDLE_FORMAT = 1;

export interface RecipeBundleIngredient {
  order: number;
  label: string | null;
  grams: number | null;
  noQuantity: boolean;
  household: string | null;
  rawText: string | null;
  food:
    | { sourceKey: string }
    | { ownName: string; per100: { kcal: number; protein: number; carbs: number; fat: number; fiber: number } }
    | null;
}

export interface RecipeBundleRecipe {
  importKey: string;
  name: string;
  origin: "IMPORT" | "MANUAL";
  type: string;
  moments: string[];
  tags: string[];
  yieldPortions: number;
  portionHousehold: string;
  portionGrams: number | null;
  preparation: string | null;
  tips: string | null;
  sourceName: string | null;
  published: RecipeImportDraft["published"];
  importFile: string | null;
  importPage: number | null;
  ingredients: RecipeBundleIngredient[];
  photo: { dataBase64: string; thumbBase64: string; credit: string | null } | null;
}

export interface RecipeBundle {
  format: 1;
  exportedAt: string;
  recipes: RecipeBundleRecipe[];
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const isStrOrNull = (v: unknown) => v === null || typeof v === "string";
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isNumOrNull = (v: unknown) => v === null || isNum(v);
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const isBase64 = (v: unknown) => typeof v === "string" && v.length > 0 && v.length % 4 === 0 && BASE64.test(v);

function checkFood(food: unknown, at: string, errors: string[]): void {
  if (food === null) return;
  if (!isObj(food)) {
    errors.push(`${at}.food: tiene que ser null, { sourceKey } o { ownName, per100 }`);
    return;
  }
  if ("sourceKey" in food) {
    if (typeof food.sourceKey !== "string" || food.sourceKey.trim() === "") errors.push(`${at}.food.sourceKey: vacío`);
    return;
  }
  if ("ownName" in food) {
    if (typeof food.ownName !== "string" || food.ownName.trim() === "") errors.push(`${at}.food.ownName: vacío`);
    const per100 = food.per100;
    if (!isObj(per100) || !["kcal", "protein", "carbs", "fat", "fiber"].every((k) => isNum(per100[k]) && (per100[k] as number) >= 0)) {
      errors.push(`${at}.food.per100: faltan los macros cada 100 g`);
    }
    return;
  }
  errors.push(`${at}.food: tiene que ser null, { sourceKey } o { ownName, per100 }`);
}

function checkRecipe(r: unknown, at: string, errors: string[]): void {
  if (!isObj(r)) {
    errors.push(`${at}: no es un objeto`);
    return;
  }
  if (typeof r.importKey !== "string" || r.importKey.trim() === "") errors.push(`${at}.importKey: falta`);
  if (typeof r.name !== "string" || r.name.trim() === "") errors.push(`${at}.name: falta`);
  if (r.origin !== "IMPORT" && r.origin !== "MANUAL") errors.push(`${at}.origin: IMPORT o MANUAL`);
  if (!isRecipeTypeKey(r.type)) errors.push(`${at}.type: inválido`);
  if (!Array.isArray(r.moments) || !r.moments.every(isRecipeMomentKey)) errors.push(`${at}.moments: inválido`);
  if (!Array.isArray(r.tags) || !r.tags.every(isRecipeTagKey)) errors.push(`${at}.tags: inválido`);
  if (!isNum(r.yieldPortions) || r.yieldPortions <= 0) errors.push(`${at}.yieldPortions: tiene que ser > 0`);
  if (typeof r.portionHousehold !== "string" || r.portionHousehold.trim() === "") errors.push(`${at}.portionHousehold: falta`);
  if (!isNumOrNull(r.portionGrams)) errors.push(`${at}.portionGrams: número o null`);
  for (const k of ["preparation", "tips", "sourceName", "importFile"] as const) {
    if (!isStrOrNull(r[k])) errors.push(`${at}.${k}: texto o null`);
  }
  if (!(r.importPage === null || (Number.isInteger(r.importPage) && (r.importPage as number) > 0))) {
    errors.push(`${at}.importPage: entero o null`);
  }
  if (r.published !== null) {
    const p = r.published;
    if (!isObj(p) || !isStrOrNull(p.portionText) || !["kcal", "protein", "carbs", "fat", "fiber"].every((k) => isNumOrNull(p[k]))) {
      errors.push(`${at}.published: inválido`);
    }
  }
  if (!Array.isArray(r.ingredients)) {
    errors.push(`${at}.ingredients: falta`);
  } else {
    r.ingredients.forEach((i, n) => {
      const ia = `${at}.ingredients[${n}]`;
      if (!isObj(i)) {
        errors.push(`${ia}: no es un objeto`);
        return;
      }
      if (!Number.isInteger(i.order)) errors.push(`${ia}.order: entero`);
      if (!isStrOrNull(i.label) || !isStrOrNull(i.household) || !isStrOrNull(i.rawText)) errors.push(`${ia}: textos inválidos`);
      if (!(i.grams === null || (isNum(i.grams) && i.grams > 0))) errors.push(`${ia}.grams: > 0 o null`);
      if (typeof i.noQuantity !== "boolean") errors.push(`${ia}.noQuantity: booleano`);
      checkFood(i.food, ia, errors);
    });
  }
  if (r.photo !== null) {
    const ph = r.photo;
    if (!isObj(ph) || !isBase64(ph.dataBase64) || !isBase64(ph.thumbBase64) || !isStrOrNull(ph.credit)) {
      errors.push(`${at}.photo: base64 inválido`);
    }
  }
}

export function validateRecipeBundle(json: unknown): { ok: true; bundle: RecipeBundle } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (!isObj(json)) return { ok: false, errors: ["El bundle no es un objeto JSON."] };
  if (json.format !== RECIPE_BUNDLE_FORMAT) errors.push(`format: se esperaba ${RECIPE_BUNDLE_FORMAT}`);
  if (typeof json.exportedAt !== "string") errors.push("exportedAt: falta");
  if (!Array.isArray(json.recipes)) {
    errors.push("recipes: falta la lista");
  } else {
    const seen = new Set<string>();
    json.recipes.forEach((r, n) => {
      checkRecipe(r, `recipes[${n}]`, errors);
      if (isObj(r) && typeof r.importKey === "string") {
        if (seen.has(r.importKey)) errors.push(`recipes[${n}].importKey: repetida`);
        seen.add(r.importKey);
      }
    });
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, bundle: json as unknown as RecipeBundle };
}
