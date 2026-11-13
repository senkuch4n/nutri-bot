// HU-020 (SDD 5.2): tipos del importador de planes alimentarios en PDF. Puro: sin base, sin red, sin fs.
import type { MealMode, Weekday } from "../weekly-menu";
import type { TemplateImportHint } from "../plan-templates";
import type { PlanSectionKey } from "./sections";

export interface RecipeMatchCandidate {
  id: string;
  name: string;
}

export type PlanImportItem =
  | { kind: "TEXT"; ref: string; weekday: Weekday | null; label: string; notes: string | null }
  | { kind: "RECIPE"; ref: string; weekday: null; recipeId: string; portions: number };

export interface PlanImportMeal {
  /** "BREAKFAST:1", "SNACK:1", "LUNCH:2", "OPTIONS" (estable para tests). */
  key: string;
  name: string;
  mode: MealMode;
  isOptions: boolean;
  /** order dentro de (meal, weekday) = índice en este array filtrado por weekday. */
  items: PlanImportItem[];
}

export interface PlanImportStats {
  pages: number;
  meals: number;
  textItems: number;
  recipeItems: number;
  recipeSuggestions: number;
  sections: number;
  unplaced: number;
  redactions: number;
  coverLinesDropped: number;
  footerSegments: number;
}

export interface PlanImportDraft {
  importKey: string;
  /** Objetivo de la portada, o PLAN_IMPORT_TEXT.defaultTitle; máx. 140. */
  title: string;
  meals: PlanImportMeal[];
  sections: { title: string; body: string }[];
  hints: TemplateImportHint[];
  stats: PlanImportStats;
}

export type PlanImportResult = { ok: true; draft: PlanImportDraft } | { ok: false; reason: "NO_TEXT" | "NO_MENU" };

/** Un tramo de renglón (Seg de sara2/lines) con su página y la sección asignada. */
export interface ImportLine {
  page: number;
  section: PlanSectionKey | "UNKNOWN" | null;
  text: string;
  x0: number;
  y0: number;
  h: number;
  column: 0 | 1;
  isPageTopHeading: boolean;
}
