// HU-020: tipos de las actions de revisión de borradores importados (import-actions.ts es "use server").
import type { MealMode, TemplateImportHint } from "@nutri-bot/core";

export type TemplateImportActionResult = { ok: true } | { ok: false; error: string };

/** Comidas de la plantilla para "Mover a… → A una comida". */
export interface ReviewMealOption {
  id: string;
  name: string;
  mode: MealMode;
}

export interface TemplateReviewProps {
  templateId: string;
  hints: TemplateImportHint[];
  meals: ReviewMealOption[];
  sections: { id: string; title: string }[];
}
