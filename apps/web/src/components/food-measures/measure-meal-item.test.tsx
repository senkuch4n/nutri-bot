// HU-018d: ítem en medida casera del editor. HTML estático (sin DOM ni base).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { atwaterBreakdown } from "@nutri-bot/core";
import type { MealItemView } from "@/components/meals-editor";

const mocks = vi.hoisted(() => ({
  state: null as null | { qty: number; pending: boolean },
}));

// El hook real llama a una server action; acá se controla el valor optimista para simular el "+".
vi.mock("./use-measure-item-qty", () => ({
  useMeasureItemQty: (_kind: string, _owner: string, _id: string, qty: number) => ({
    qty: mocks.state?.qty ?? qty,
    pending: mocks.state?.pending ?? false,
    change: () => {},
  }),
}));

import { MeasureMealItem } from "./measure-meal-item";

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&nbsp;| /g, " ").replace(/\s+/g, " ").trim();

const item: MealItemView = {
  id: "i1", foodId: "f1", foodName: "Arroz blanco, hervido", customLabel: null, quantityGrams: "270", notes: "sin sal",
  macros: { kcal: 351, protein: 7.3, carbs: 75.6, fat: 0.8, fiber: 1.1 }, kcalBreakdown: null, weekday: "TUE",
  measure: { qty: 1.5, name: "taza", plural: "tazas", gramsPerUnit: 180 },
};

const render = (it: MealItemView, showMacros = true) =>
  renderToStaticMarkup(
    <MeasureMealItem item={it} measure={it.measure!} kind="plan" ownerId="plan1" ownerField="planId"
      deleteItemAction={async () => {}} showMacros={showMacros} where="Almuerzo del martes" />,
  );

beforeEach(() => {
  mocks.state = null;
});

describe("MeasureMealItem (HU-018d)", () => {
  it("muestra «1½ tazas» y debajo «270 g», con la nota, los macros y «Quitar»", () => {
    const html = render(item);
    const t = text(html);
    expect(t).toContain("Arroz blanco, hervido");
    expect(t).toContain("1½ tazas");
    expect(t).toContain("270 g");
    expect(t).toContain("sin sal");
    expect(t).toContain("351");
    expect(html).toContain('aria-label="Quitar Arroz blanco, hervido de Almuerzo del martes"');
    expect(html).toContain('name="itemId" value="i1"');
  });

  it("½ taza va en singular", () => {
    const half = { ...item, quantityGrams: "90", measure: { ...item.measure!, qty: 0.5 } };
    const t = text(render(half, false));
    expect(t).toContain("½ taza");
    expect(t).toContain("90 g");
  });

  it("1b: tiene el stepper con el valor y sus aria-label de ¼", () => {
    const html = render(item);
    expect(html).toContain('aria-label="Cantidad de Arroz blanco, hervido"');
    expect(html).toContain('aria-label="Sumar ¼ a Arroz blanco, hervido"');
    expect(html).toContain('aria-label="Restar ¼ a Arroz blanco, hervido"');
    expect(html).toMatch(/aria-live="polite"[^>]*>1½</);
  });

  it("1b: después del «+» (valor optimista 2) pasa a «2 tazas · 360 g» con los macros escalados", () => {
    mocks.state = { qty: 2, pending: true };
    const t = text(render(item));
    expect(t).toContain("2 tazas");
    expect(t).toContain("360 g");
    expect(t).not.toContain("270 g");
    expect(t).toContain("468 kcal"); // 351 × 2 / 1,5
  });

  it("1b: con una transición pendiente se oculta el desglose de Atwater (sería el de la cantidad vieja)", () => {
    const withBreakdown = { ...item, kcalBreakdown: atwaterBreakdown({ protein: 2.7, carbs: 28, fat: 0.3 }, 270) };
    expect(render(withBreakdown)).toContain("aria-haspopup");
    mocks.state = { qty: 1.75, pending: true };
    const html = render(withBreakdown);
    expect(html).not.toContain("aria-haspopup");
    expect(text(html)).toContain("1¾ tazas");
    expect(text(html)).toContain("315 g");
  });

  it("1b: en ¼ el «−» está deshabilitado; en 20, el «+»", () => {
    const btn = (html: string, label: string) => new RegExp(`<button[^>]*aria-label="${label}"[^>]*>`).exec(html)?.[0] ?? "";
    mocks.state = { qty: 0.25, pending: false };
    expect(btn(render(item), "Restar ¼ a Arroz blanco, hervido")).toContain('disabled=""');
    mocks.state = { qty: 20, pending: false };
    expect(btn(render(item), "Sumar ¼ a Arroz blanco, hervido")).toContain('disabled=""');
  });
});
