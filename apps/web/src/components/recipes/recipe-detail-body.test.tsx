// HU-018c-2 (SDD 11.3): cuerpo del detalle de la receta. Se renderiza a HTML estático (sin DOM ni base).
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { RecipePreview } from "@nutri-bot/db/domain";
import { toPortalRecipeView } from "@/lib/portal-recipe";
import { RecipeDetailBody } from "./recipe-detail-body";

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&nbsp;| /g, " ").replace(/\s+/g, " ").trim();

const recipe: RecipePreview = {
  id: "r1",
  name: "Panqueques de avena",
  status: "PUBLISHED",
  type: "BREAKFAST",
  portionHousehold: "2 panqueques",
  yieldPortions: 4,
  perPortion: { kcal: 255, protein: 12, carbs: 30, fat: 8, fiber: 3 },
  macrosIncomplete: false,
  photo: { id: "ph1", credit: "Ana Pérez" },
  sourceName: "Nutriarte",
  preparation: "Mezclar todo.\nCocinar en sartén.",
  tips: "Se pueden freezar.",
  ingredients: [
    { name: "Avena", household: "1 taza", grams: 80, noQuantity: false },
    { name: "Banana", household: "1 unidad", grams: null, noQuantity: false },
    { name: "Canela", household: null, grams: null, noQuantity: true },
  ],
};

describe("RecipeDetailBody", () => {
  it("portal: sin macros, con fuente, crédito, ingredientes con su medida y la preparación abierta", () => {
    const html = renderToStaticMarkup(
      <RecipeDetailBody recipe={toPortalRecipeView(recipe)} photoScope="portal" showMacros={false} preparationOpen />,
    );
    const t = text(html);
    expect(t).not.toMatch(/kcal/);
    expect(t).toContain("Fuente: Nutriarte");
    expect(t).toContain("Foto: Ana Pérez");
    expect(t).toContain("Rinde 4 porciones · 1 porción: 2 panqueques");
    expect(t).toContain("Avena 1 taza (80 g)");
    expect(t).toContain("Banana 1 unidad");
    expect(t).toContain("Canela c.n.");
    expect(t).toContain("Ingredientes");
    expect(t).toContain("Preparación");
    expect(t).toContain("Tips y conservación");
    expect(t).toContain("Se pueden freezar.");
    expect(html).toMatch(/<details[^>]*open/);
    expect(html).toContain("/portal/recetas/fotos/ph1?size=full");
  });

  it("showMacros=false no muestra kcal aunque el dato venga", () => {
    const html = renderToStaticMarkup(
      <RecipeDetailBody recipe={recipe} photoScope="portal" showMacros={false} preparationOpen />,
    );
    expect(text(html)).not.toMatch(/kcal/);
  });

  it("panel: kcal y P/C/G de 1 porción, preparación plegada y la foto del panel", () => {
    const html = renderToStaticMarkup(
      <RecipeDetailBody recipe={recipe} photoScope="panel" showMacros preparationOpen={false} />,
    );
    expect(text(html)).toContain("255 kcal por porción");
    expect(text(html)).toMatch(/P\s*Proteínas\s*12 g/);
    expect(html).not.toMatch(/<details[^>]*open/);
    expect(html).toContain("/api/recetas/fotos/ph1?size=full");
  });

  it("sin fuente, sin foto, sin tips ni preparación: no aparecen esas partes", () => {
    const html = renderToStaticMarkup(
      <RecipeDetailBody
        recipe={{ ...toPortalRecipeView(recipe), sourceName: null, photo: null, tips: null, preparation: "  " }}
        photoScope="portal"
        showMacros={false}
        preparationOpen
      />,
    );
    const t = text(html);
    expect(t).not.toContain("Fuente");
    expect(t).not.toContain("Foto:");
    expect(t).not.toContain("Tips");
    expect(t).not.toContain("Preparación");
    expect(html).not.toContain("<img");
  });
});
