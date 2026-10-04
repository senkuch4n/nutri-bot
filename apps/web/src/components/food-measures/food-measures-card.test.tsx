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

import { FoodMeasuresCard } from "./food-measures-card";

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
