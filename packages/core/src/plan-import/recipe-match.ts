// HU-020 (SDD T8, D8): opciones de colación → receta publicada SOLO si el nombre coincide exacto
// (foodSearchText) y la cantidad está en porciones. Nunca se convierten unidades en porciones.
import { foodSearchText } from "../food-search";
import { normalizePortions } from "../recipes";
import { normalizePdfText } from "../recipe-import/text";
import type { RecipeMatchCandidate } from "./types";

/** "Budín (1 porción)" → { name: "Budín", qty: "1 porción", rest: "" }. */
export function parseOptionLine(text: string): { name: string; qty: string | null; rest: string } {
  const t = normalizePdfText(text);
  const m = /^([^()]*?)\s*\(([^()]*)\)\s*(.*)$/.exec(t);
  if (!m) return { name: t, qty: null, rest: "" };
  return { name: m[1]!.trim(), qty: m[2]!.trim(), rest: m[3]!.trim() };
}

const PORTION_RE = /^(\d+(?:[.,]\d+)?|½|\d+\s*½|\d+\/\d+)\s*porci[oó]n(?:es)?$/i;

/** "1 porción" → 1; "½ porción" → 0,5; "1,5 porciones" → 1,5; "5 porciones" → null (fuera de rango). */
export function parsePortionQty(qty: string): number | null {
  const m = PORTION_RE.exec(qty.trim());
  if (!m) return null;
  const raw = m[1]!.replace(/\s+/g, "");
  let value: number;
  if (raw === "½") value = 0.5;
  else if (raw.endsWith("½")) value = Number(raw.slice(0, -1)) + 0.5;
  else if (raw.includes("/")) {
    const [a, b] = raw.split("/").map(Number);
    value = b ? a! / b : NaN;
  } else value = Number(raw.replace(",", "."));
  return normalizePortions(value);
}

export function matchRecipeOption(
  text: string,
  recipes: readonly RecipeMatchCandidate[],
):
  | { kind: "RECIPE"; recipeId: string; portions: number }
  | { kind: "TEXT"; suggestion: RecipeMatchCandidate | null } {
  const { name, qty, rest } = parseOptionLine(text);
  const key = foodSearchText(name);
  if (key === "") return { kind: "TEXT", suggestion: null };
  const matches = recipes.filter((r) => foodSearchText(r.name) === key);
  if (matches.length === 0) return { kind: "TEXT", suggestion: null };
  const first = matches[0]!;
  // Dos recetas con el mismo nombre: no se elige sola.
  if (matches.length > 1 || rest !== "") return { kind: "TEXT", suggestion: first };
  if (qty === null) return { kind: "RECIPE", recipeId: first.id, portions: 1 };
  const portions = parsePortionQty(qty);
  if (portions === null) return { kind: "TEXT", suggestion: first };
  return { kind: "RECIPE", recipeId: first.id, portions };
}
