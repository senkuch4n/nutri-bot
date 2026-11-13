// HU-018b (SDD 10.5): franja del día. Se renderiza a HTML estático (sin DOM ni base).
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DayTargetStrip, type PlanTargetView } from "./day-target-strip";

const target: PlanTargetView = { kcal: 1800, protein: 110, carbs: 200, fat: 60, sourceLabel: "Objetivo: consulta del 12/09/2026" };
const day = { kcal: 1240, protein: 70, carbs: 200, fat: 72, fiber: 18.5 };

/** Texto visible (sin etiquetas), con los espacios normalizados. */
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&nbsp;| /g, " ").replace(/\s+/g, " ");

describe("DayTargetStrip", () => {
  it("con objetivo muestra lleva / objetivo, el estado en texto y de dónde sale el objetivo", () => {
    const html = renderToStaticMarkup(
      <DayTargetStrip title="Martes" totals={day} target={target} targetMissingHref={null} weeklyAverageKcal={1690} />,
    );
    const t = text(html);
    expect(t).toContain("Martes");
    expect(t).toContain("1.240");
    expect(t).toContain("de 1.800 kcal");
    expect(t).toContain("Faltan 560 kcal");
    expect(t).toContain("Faltan 40 g");
    expect(t).toContain("En objetivo"); // carbohidratos 200 de 200
    expect(t).toContain("Se pasa 12 g"); // grasas 72 de 60
    expect(t).toContain("Objetivo: consulta del 12/09/2026 · Promedio semanal: 1.690 kcal");
    // Barra accesible con el valor en texto.
    expect(html).toContain('role="meter"');
    expect(html).toContain('aria-valuetext="1.240 de 1.800 kcal, faltan 560 kcal"');
    expect(html).not.toContain("Calculá el requerimiento");
  });

  it("sin objetivo en un plan muestra los totales y el aviso con el link a la consulta", () => {
    const html = renderToStaticMarkup(
      <DayTargetStrip
        title="Martes"
        totals={day}
        target={null}
        targetMissingHref="/pacientes/p1/consultas/c1"
        weeklyAverageKcal={null}
      />,
    );
    expect(text(html)).toContain("Calculá el requerimiento para ver cuánto falta.");
    expect(html).toContain('href="/pacientes/p1/consultas/c1"');
    expect(text(html)).toContain("Ir a la consulta");
    expect(html).not.toContain('role="meter"');
    expect(text(html)).not.toContain("Promedio semanal");
  });

  it("en una plantilla (sin objetivo ni link) muestra totales y promedio semanal, sin aviso", () => {
    const html = renderToStaticMarkup(
      <DayTargetStrip title="Lunes" totals={day} target={null} targetMissingHref={null} weeklyAverageKcal={1500} />,
    );
    expect(text(html)).toContain("Promedio semanal: 1.500 kcal");
    expect(text(html)).not.toContain("Calculá el requerimiento");
  });
});
