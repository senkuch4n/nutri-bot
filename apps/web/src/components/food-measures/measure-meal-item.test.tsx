// HU-018d: ítem en medida casera del editor. HTML estático (sin DOM ni base).
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { MealItemView } from "@/components/meals-editor";

import { MeasureMealItem } from "./measure-meal-item";

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&nbsp;| /g, " ").replace(/\s+/g, " ").trim();

const item: MealItemView = {
  id: "i1", foodId: "f1", foodName: "Arroz blanco, hervido", customLabel: null, quantityGrams: "270", notes: "sin sal",
  macros: { kcal: 351, protein: 7.3, carbs: 75.6, fat: 0.8, fiber: 1.1 }, kcalBreakdown: null, weekday: "TUE",
  measure: { qty: 1.5, name: "taza", plural: "tazas", gramsPerUnit: 180 },
};

describe("MeasureMealItem (HU-018d, 1a)", () => {
  it("muestra «1½ tazas» y debajo «270 g», con la nota, los macros y «Quitar»", () => {
    const html = renderToStaticMarkup(
      <MeasureMealItem item={item} measure={item.measure!} ownerId="plan1" ownerField="planId"
        deleteItemAction={async () => {}} showMacros where="Almuerzo del martes" />,
    );
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
    const t = text(renderToStaticMarkup(
      <MeasureMealItem item={half} measure={half.measure} ownerId="t1" ownerField="templateId"
        deleteItemAction={async () => {}} showMacros={false} where="Colaciones" />,
    ));
    expect(t).toContain("½ taza");
    expect(t).toContain("90 g");
  });
});
