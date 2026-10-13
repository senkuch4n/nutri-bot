// HU-018d: la parte "Cantidad" del bloque "Agregar alimento". HTML estático (sin DOM ni base): cada
// estado se prueba con las props que le pasa AddFoodForm.
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { stepMeasureQty } from "@nutri-bot/core";

vi.mock("@/app/(panel)/food-measure-actions", () => ({}));

import { QuantityFields } from "./add-food-form";
import type { FoodMeasureView } from "./types";

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&nbsp;| /g, " ").replace(/\s+/g, " ").trim();
const noop = () => {};
const arroz = { id: "f1", name: "Arroz blanco, hervido" };
const measures: FoodMeasureView[] = [
  { id: "m1", foodId: "f1", name: "taza", plural: null, grams: 180, order: 0 },
  { id: "m2", foodId: "f1", name: "cda", plural: null, grams: 15, order: 1 },
];

function render(props: Partial<Parameters<typeof QuantityFields>[0]> = {}) {
  return renderToStaticMarkup(
    <QuantityFields
      food={arroz}
      measures={measures}
      mode="household"
      measureId="m1"
      qty={1}
      onModeChange={noop}
      onMeasureChange={noop}
      onQtyChange={noop}
      onAddMeasure={noop}
      {...props}
    />,
  );
}

describe("QuantityFields (HU-018d)", () => {
  it("alimento con medidas: «Medida casera» elegida, primera medida, «= 180 g» y los hidden", () => {
    const html = render();
    const t = text(html);
    expect(html).toContain('aria-label="Cómo cargar la cantidad"');
    expect(html).toMatch(/aria-checked="true"[^>]*>(?:<[^>]+>)*Medida casera/);
    expect(t).toContain("= 180 g");
    expect(html).toContain('name="measureId" value="m1"');
    expect(html).toContain('name="measureQty" value="1"');
    expect(html).not.toContain('name="quantityGrams"');
    expect(t).toContain("taza (180 g)");
    expect(t).toContain("cda (15 g)");
    expect(html).toContain('aria-label="Cantidad de Arroz blanco, hervido"');
    expect(t).not.toContain("Agregar una medida casera a este alimento");
  });

  it("«+» suma ¼: 1¼ taza = 225 g y la cantidad viaja con coma", () => {
    const html = render({ qty: stepMeasureQty(1, 1) });
    expect(text(html)).toContain("= 225 g");
    expect(text(html)).toContain("1¼");
    expect(html).toContain('name="measureQty" value="1,25"');
  });

  it("otra medida elegida usa sus gramos", () => {
    expect(text(render({ measureId: "m2", qty: 2 }))).toContain("= 30 g");
  });

  it("«Gramos»: vuelve el campo de gramos y no viaja la medida", () => {
    const html = render({ mode: "grams" });
    expect(html).toContain('name="quantityGrams"');
    expect(html).not.toContain('name="measureId"');
    expect(html).toContain('aria-label="Cómo cargar la cantidad"');
  });

  it("alimento sin medidas: sin selector, en gramos y con el botón para crear una", () => {
    const html = render({ measures: [], mode: "grams", measureId: "" });
    expect(html).not.toContain("Cómo cargar la cantidad");
    expect(html).toContain('name="quantityGrams"');
    expect(text(html)).toContain("Agregar una medida casera a este alimento");
  });

  it("sin alimento (descripción libre): sin selector ni botón, como siempre", () => {
    const html = render({ food: null, measures: [], mode: "grams", measureId: "" });
    expect(html).not.toContain("Cómo cargar la cantidad");
    expect(html).toContain('name="quantityGrams"');
    expect(text(html)).not.toContain("Agregar una medida casera");
  });
});
