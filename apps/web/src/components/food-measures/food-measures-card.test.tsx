// HU-018d (1b): aviso "Tenías anotado" en la tarjeta de la ficha. HTML estático (sin DOM ni base).
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/app/(panel)/food-measure-actions", () => ({
  createFoodMeasureAction: vi.fn(),
  updateFoodMeasureAction: vi.fn(),
  deleteFoodMeasureAction: vi.fn(),
  moveFoodMeasureAction: vi.fn(),
}));
vi.mock("@/components/confirm", () => ({ useConfirm: () => async () => true }));

import { FoodMeasuresCard, legacyMeasurePrefill } from "./food-measures-card";
import { MeasureFormBody } from "./measure-form-dialog";

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&nbsp;| /g, " ").replace(/\s+/g, " ").trim();
const food = { id: "f1", name: "Yogur casero", kcalPer100: 62 };
const taza = { id: "m1", foodId: "f1", name: "taza", plural: null, grams: 180, order: 0 };

const render = (props: { measures?: (typeof taza)[]; unitHint?: string | null }) =>
  text(renderToStaticMarkup(
    <FoodMeasuresCard food={food} measures={props.measures ?? []} isSara={false} unitHint={props.unitHint} />,
  ));

describe("FoodMeasuresCard: aviso de unitHint (D9, T5)", () => {
  it("sin medidas y con unitHint: «Tenías anotado: «…»» y «Pasar a medida», sin el texto de vacío", () => {
    const t = render({ unitHint: "  porción   chica " });
    expect(t).toContain("Tenías anotado: «porción chica». Pasalo a una medida para usarlo en los planes.");
    expect(t).toContain("Pasar a medida");
    expect(t).toContain("Agregar medida");
    expect(t).not.toContain("Todavía no tiene medidas caseras.");
  });

  it("con alguna medida, el aviso no aparece aunque haya unitHint", () => {
    const t = render({ measures: [taza], unitHint: "porción chica" });
    expect(t).not.toContain("Tenías anotado");
    expect(t).not.toContain("Pasar a medida");
    expect(t).toContain("1 taza = 180 g");
  });

  it("sin unitHint (o vacío): vacío de siempre", () => {
    for (const unitHint of [null, undefined, "   "]) {
      const t = render({ unitHint });
      expect(t).not.toContain("Tenías anotado");
      expect(t).toContain("Todavía no tiene medidas caseras.");
    }
  });
});

describe("«Pasar a medida»: prellenado (recorrido de 018d-1b)", () => {
  it("unitHint legible → nombre y gramos de parseUnitHint (con la división de T3 si N ≠ 1)", () => {
    expect(legacyMeasurePrefill("1 taza ≈ 180 g")).toEqual({ name: "taza", grams: 180 });
    expect(legacyMeasurePrefill("1 vaso ≈ 200 ml")).toEqual({ name: "vaso", grams: 200 });
    expect(legacyMeasurePrefill("4 unidades ≈ 25 g")).toEqual({ name: "unidad", grams: 6.3 });
    expect(legacyMeasurePrefill("1/2 taza ≈ 125 g")).toEqual({ name: "taza", grams: 250 });
  });

  it("ilegible → el texto limpio en el nombre, sin gramos (como antes)", () => {
    expect(legacyMeasurePrefill("  porción   chica ")).toEqual({ name: "porción chica" });
    expect(legacyMeasurePrefill("1 lata ≈  lata 473 ml")).toEqual({ name: "1 lata ≈ lata 473 ml" });
    expect(legacyMeasurePrefill("x".repeat(60)).name).toHaveLength(40);
  });

  it("el cuadro arranca con el nombre y los gramos prellenados y la vista previa armada", () => {
    const html = renderToStaticMarkup(
      <MeasureFormBody food={food} initial={legacyMeasurePrefill("1 taza ≈ 180 g")} onClose={() => {}} onSaved={() => {}}
        savedMessage="Medida guardada" />,
    );
    expect(html).toMatch(/value="taza"/);
    expect(html).toMatch(/value="180"/);
    expect(text(html)).toContain("2 tazas = 360 g");
  });
});
