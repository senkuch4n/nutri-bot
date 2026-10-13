// HU-018c: pie de la tarjeta del buscador. Se renderiza a HTML estático (sin DOM ni base); cada
// estado se prueba con las props que le pasa el sheet.
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { addButtonLabel } from "@nutri-bot/core";
import { PickerCardFooter } from "./picker-card-footer";

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&nbsp;| /g, " ").replace(/\s+/g, " ").trim();
const noop = () => {};

function render(props: Partial<Parameters<typeof PickerCardFooter>[0]> = {}) {
  return renderToStaticMarkup(
    <PickerCardFooter
      recipeName="Panqueques de avena"
      impact={null}
      addLabel="Agregar"
      addAriaLabel="Agregar Panqueques de avena a desayuno del martes"
      pending={false}
      error={null}
      added={null}
      onAdd={noop}
      onPortionsChange={noop}
      onRemove={noop}
      {...props}
    />,
  );
}

describe("PickerCardFooter", () => {
  it("sin objetivo: no hay líneas de impacto, solo el botón", () => {
    const t = text(render());
    expect(t).toBe("Agregar");
  });

  it("con objetivo muestra el porcentaje y el encaje (con ícono, no solo color)", () => {
    const html = render({
      impact: { percentText: "Suma 14 % de las kcal del martes", fitText: "Entra en lo que falta", fits: true },
    });
    expect(text(html)).toContain("Suma 14 % de las kcal del martes");
    expect(text(html)).toContain("Entra en lo que falta");
    expect(html).toContain("text-success");
    expect(html).toContain("<svg");

    const over = render({
      impact: { percentText: "Suma 20 % de las kcal del martes", fitText: "Se pasa en grasas el jueves (+8 g)", fits: false },
    });
    expect(text(over)).toContain("Se pasa en grasas el jueves (+8 g)");
    expect(over).toContain("text-warning");
  });

  it("con 3 días marcados el botón dice 'Agregar en 3 días'", () => {
    const html = render({ addLabel: addButtonLabel(3) });
    expect(text(html)).toContain("Agregar en 3 días");
    expect(html).toMatch(/class="[^"]*\bh-11\b[^"]*\bw-full\b/);
  });

  it("pendiente: spinner, deshabilitado y aria-busy", () => {
    const html = render({ pending: true });
    expect(html).toContain('aria-busy="true"');
    expect(html).toMatch(/<button[^>]*disabled=""/);
    expect(html).toContain("animate-spin");
  });

  it("con la receta ya en el día: 'Agregada', el control de porciones y 'Quitar'", () => {
    const html = render({ added: { portions: 1.5 }, impact: { percentText: "Suma 14 %", fitText: "Entra", fits: true } });
    const t = text(html);
    expect(t).toContain("Agregada");
    expect(t).toContain("1½ porciones");
    expect(t).toContain("Quitar");
    expect(t).not.toContain("Suma 14 %");
    expect(html).toContain('aria-label="Sumar media porción de Panqueques de avena"');
  });

  it("si falla: el error con role=alert y el botón vuelve a 'Agregar'", () => {
    const html = render({ error: "No se pudo agregar. Probá de nuevo." });
    expect(html).toContain('role="alert"');
    expect(text(html)).toContain("No se pudo agregar. Probá de nuevo.");
    expect(text(html).startsWith("Agregar")).toBe(true);
    expect(html).not.toContain('aria-busy="true"');
  });
});
