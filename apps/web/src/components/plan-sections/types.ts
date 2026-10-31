// HU-020: tipos de las actions de "Textos del plan" (plan-section-actions.ts es "use server" y solo
// puede exportar funciones async).
export type PlanSectionActionResult =
  | { ok: true; id?: string }
  | { ok: false; error: string; field?: "title" | "body" };

export interface PlanSectionView {
  id: string;
  title: string;
  body: string;
}
