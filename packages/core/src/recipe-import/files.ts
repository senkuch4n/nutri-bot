import type { RecipeMomentKey, RecipeTypeKey } from "../recipes";
import { plainText } from "./text";

// HU-018a-2: qué archivos de docs/recetarios/ se leen y qué se sugiere por el nombre (SDD 8.1, D20).

/**
 * Nombre de archivo normalizado, sin extensión ni sufijos de copia: " (1)", "_compressed", " byn",
 * "último". "almuerzos y cenas 3_compressed (1).pdf" → "almuerzos y cenas 3".
 */
export function recipeFileBase(fileName: string): string {
  const noExt = fileName.replace(/\.[a-z0-9]{2,4}$/i, "");
  return plainText(
    noExt
      .replace(/\(\d+\)/g, " ")
      .replace(/_compressed/gi, " ")
      .replace(/_/g, " "),
  )
    .replace(/\b(?:byn|ultimo)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const isBlackAndWhite = (fileName: string) => /\bbyn\b/.test(plainText(fileName.replace(/_/g, " ")));

/** D20: "reemplazos", "conservacion" (sin tildes ni mayúsculas) → excluido. PPTX → excluido (bancos de imágenes). */
export function isExcludedRecipeFile(fileName: string): { excluded: boolean; reason: string | null } {
  if (/\.pptx?$/i.test(fileName)) return { excluded: true, reason: "PPTX: banco de imágenes, se sube a mano" };
  if (!/\.pdf$/i.test(fileName)) return { excluded: true, reason: "No es un PDF" };
  const base = recipeFileBase(fileName);
  if (/\breemplazos?\b/.test(base)) return { excluded: true, reason: "Guía de reemplazos (D20)" };
  if (/\bconservacion\b/.test(base)) return { excluded: true, reason: "Guía de conservación (D20)" };
  return { excluded: false, reason: null };
}

/**
 * Aplica isExcludedRecipeFile y saca los "byn" que tienen versión a color (mismo nombre
 * normalizado); un "byn" sin versión a color se queda. Orden alfabético (es).
 */
export function pickRecipeFiles(fileNames: readonly string[]): { use: string[]; skipped: { file: string; reason: string }[] } {
  const skipped: { file: string; reason: string }[] = [];
  const candidates: string[] = [];
  for (const f of fileNames) {
    const ex = isExcludedRecipeFile(f);
    if (ex.excluded) skipped.push({ file: f, reason: ex.reason ?? "Excluido" });
    else candidates.push(f);
  }
  const colorBases = new Set(candidates.filter((f) => !isBlackAndWhite(f)).map(recipeFileBase));
  const use: string[] = [];
  for (const f of candidates) {
    if (isBlackAndWhite(f) && colorBases.has(recipeFileBase(f))) {
      skipped.push({ file: f, reason: "Copia en blanco y negro de un archivo a color" });
    } else {
      use.push(f);
    }
  }
  const collator = new Intl.Collator("es", { sensitivity: "base", numeric: true });
  use.sort(collator.compare);
  return { use, skipped };
}

const SUGGESTIONS: { re: RegExp; type: RecipeTypeKey | null; moments: RecipeMomentKey[] }[] = [
  { re: /\balmuerzos y cenas\b/, type: "MAIN_DISH", moments: ["LUNCH", "DINNER"] },
  { re: /\bensaladas?\b/, type: "SALAD", moments: ["LUNCH", "DINNER"] },
  { re: /\bguarni/, type: "SIDE_DISH", moments: ["LUNCH", "DINNER"] },
  { re: /\bdesayunos?\b/, type: "BREAKFAST", moments: ["BREAKFAST", "AFTERNOON_SNACK"] },
  { re: /\b(?:mate|galletitas|crumble|cookies)\b/, type: "DESSERT", moments: ["BREAKFAST", "AFTERNOON_SNACK"] },
  { re: /\b(?:colaciones|picoteo)\b/, type: "SNACK", moments: ["SNACK"] },
  { re: /\b(?:panes|pizzas)\b/, type: "BREAD_DOUGH", moments: ["BREAKFAST", "AFTERNOON_SNACK", "DINNER"] },
  { re: /\bfiestas\b/, type: null, moments: [] },
];

/** Tipo y momentos sugeridos por el nombre del archivo (tabla de 8.1) y el título legible. */
export function suggestFromFileName(fileName: string): { type: string | null; moments: string[]; title: string } {
  const base = recipeFileBase(fileName);
  const hit = SUGGESTIONS.find((s) => s.re.test(base));
  return { type: hit?.type ?? null, moments: hit ? [...hit.moments] : [], title: recipeFileTitle(fileName) };
}

/** Título legible, con tildes: "almuerzos y cenas 3_compressed (1).pdf" → "Almuerzos y cenas 3". */
export function recipeFileTitle(fileName: string): string {
  const t = fileName
    .replace(/\.[a-z0-9]{2,4}$/i, "")
    .replace(/\(\d+\)/g, " ")
    .replace(/_compressed/gi, " ")
    .replace(/_/g, " ")
    .replace(/(^|\s)(?:byn|[uú]ltimo)(?=\s|$)/gi, " ")
    .replace(/\s+\.(\d)/g, ".$1")
    .replace(/\s+/g, " ")
    .trim();
  if (t === "") return "";
  const body = t === t.toUpperCase() ? t.toLowerCase() : t;
  return body.charAt(0).toUpperCase() + body.slice(1);
}
