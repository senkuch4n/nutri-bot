// HU-018d: cuadro de medida casera. Se renderiza a HTML estático (sin DOM ni base), como los demás
// tests de componentes del repo; el contenido del Modal se prueba directo (MeasureFormBody).
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/app/(panel)/food-measure-actions", () => ({
  createFoodMeasureAction: vi.fn(),
  updateFoodMeasureAction: vi.fn(),
}));

import { MeasureFormBody } from "./measure-form-dialog";

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&nbsp;| /g, " ").replace(/\s+/g, " ").trim();
const food = { id: "f1", name: "Arroz blanco, hervido", kcalPer100: 130 };
const noop = () => {};

const render = (initial?: Parameters<typeof MeasureFormBody>[0]["initial"]) =>
  renderToStaticMarkup(
    <MeasureFormBody food={food} initial={initial} onClose={noop} onSaved={noop} savedMessage="Medida guardada" />,
  );

describe("MeasureFormBody (HU-018d)", () => {
  it("nueva: campos, los 16 chips de 44 px, enlace de plural y sin vista previa", () => {
    const html = render();
    const t = text(html);
    expect(t).toContain("Medida");
    expect(t).toContain("¿Cuántos gramos pesa 1?");
    expect(t).toContain("Para líquidos, 1 ml ≈ 1 g");
    expect(t).toContain("¿Se escribe distinto en plural?");
    expect(html).toContain('role="group" aria-label="Sugerencias de medidas"');
    const chips = [...html.matchAll(/<button type="button"[^>]*aria-pressed="(true|false)"[^>]*>/g)];
    expect(chips).toHaveLength(16);
    for (const c of chips) expect(c[0]).toMatch(/\bh-11\b/);
    expect(t).toContain("cda (cucharada)");
    expect(t).not.toContain("= ");
    expect(t).toContain("Guardar");
    expect(t).toContain("Cancelar");
  });

  it("editar: vista previa con el plural automático y la kcal de 1 medida", () => {
    const t = text(render({ id: "m1", foodId: "f1", name: "unidad mediana", plural: null, grams: 120, order: 0 }));
    expect(t).toContain("1 unidad mediana de Arroz blanco, hervido = 120 g · 156 kcal");
    expect(t).toContain("2 unidades medianas = 240 g");
  });

  it("con plural a mano, el campo arranca abierto y la vista previa lo usa", () => {
    const html = render({ id: "m1", foodId: "f1", name: "pan", plural: "panes chicos", grams: 30, order: 0 });
    expect(text(html)).toContain("Plural");
    expect(html).toContain('value="panes chicos"');
    expect(text(html)).toContain("2 panes chicos = 60 g");
    expect(text(html)).not.toContain("¿Se escribe distinto en plural?");
  });

  it("«Pasar a medida»: nombre prellenado y el chip correspondiente marcado", () => {
    const html = render({ name: "taza" });
    expect(html).toContain('value="taza"');
    expect(html).toMatch(/aria-pressed="true"[^>]*>taza</);
  });
});
