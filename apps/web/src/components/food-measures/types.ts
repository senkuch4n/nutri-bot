import type { MeasureField } from "@nutri-bot/core";

// HU-018d: tipos de las medidas caseras. Viven acá (y no en `food-measure-actions.ts`) porque un
// archivo "use server" solo puede exportar funciones async (Turbopack rechaza tipos re-exportados).

/** Una medida de un alimento, como la usan la ficha y el editor (grams ya como number). */
export interface FoodMeasureView {
  id: string;
  foodId: string;
  name: string;
  plural: string | null;
  grams: number;
  order: number;
}

export type MeasureFieldErrors = Partial<Record<MeasureField, string>>;
export type FoodMeasureResult =
  | { ok: true; measure: FoodMeasureView }
  | { ok: false; error?: string; fieldErrors?: MeasureFieldErrors };
export type MeasureMutationResult = { ok: true } | { ok: false; error: string };

/** La medida casera de un ítem del plan (copia guardada en el ítem, D4). */
export interface MeasureItemView {
  qty: number;
  name: string;
  plural: string;
  gramsPerUnit: number;
}
