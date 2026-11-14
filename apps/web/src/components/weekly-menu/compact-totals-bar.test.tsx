// Barra compacta de totales (se pega arriba al scrollear el editor de comidas).
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CompactTotalsBar } from "./compact-totals-bar";

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&nbsp;| /g, " ").replace(/\s+/g, " ").trim();
const totals = { kcal: 881, protein: 75.4, carbs: 75.8, fat: 31.6, fiber: 0 };

describe("CompactTotalsBar", () => {
  it("una línea: el título y los totales con fibra", () => {
    const t = text(renderToStaticMarkup(<CompactTotalsBar visible title="Total del día" totals={totals} targetKcal={null} />));
    expect(t).toContain("Total del día");
    expect(t).toContain("881 kcal · P 75,4 g · C 75,8 g · G 31,6 g · Fibra 0 g");
    expect(t).not.toContain("de ");
  });

  it("con objetivo, suma «de X kcal»", () => {
    const t = text(renderToStaticMarkup(<CompactTotalsBar visible title="Total del día" totals={totals} targetKcal={2000} />));
    expect(t).toContain("de 2.000 kcal");
  });

  it("es un duplicado visual del bloque completo: oculta para lectores de pantalla y, oculta, sin punteros", () => {
    const hidden = renderToStaticMarkup(<CompactTotalsBar visible={false} title="Total del día" totals={totals} targetKcal={null} />);
    expect(hidden).toContain('aria-hidden="true"');
    expect(hidden).toContain("pointer-events-none");
  });
});
