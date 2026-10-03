// HU-018c: control de porciones. Se renderiza a HTML estático (sin DOM ni base).
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PortionStepper } from "./portion-stepper";

const render = (value: number) =>
  renderToStaticMarkup(<PortionStepper value={value} onChange={() => {}} recipeName="Budín de banana" />);

/** Los botones en orden: [−, +], con su aria-label y si están deshabilitados. */
function buttons(html: string) {
  return [...html.matchAll(/<button([^>]*)>/g)].map((m) => ({
    attrs: m[1]!,
    label: /aria-label="([^"]+)"/.exec(m[1]!)?.[1],
    disabled: /\sdisabled=""/.test(m[1]!),
  }));
}

describe("PortionStepper", () => {
  it("en ½: '−' deshabilitado y '+' habilitado", () => {
    const html = render(0.5);
    const [minus, plus] = buttons(html);
    expect(minus?.disabled).toBe(true);
    expect(plus?.disabled).toBe(false);
    expect(html).toContain("½ porción");
  });

  it("en 4: '+' deshabilitado", () => {
    const [minus, plus] = buttons(render(4));
    expect(minus?.disabled).toBe(false);
    expect(plus?.disabled).toBe(true);
  });

  it("muestra '1½ porciones' y los botones miden 44 px con sus aria-label", () => {
    const html = render(1.5);
    expect(html).toContain("1½ porciones");
    const [minus, plus] = buttons(html);
    expect(minus?.label).toBe("Restar media porción de Budín de banana");
    expect(plus?.label).toBe("Sumar media porción de Budín de banana");
    for (const b of [minus, plus]) expect(b?.attrs).toMatch(/\bsize-11\b/);
    expect(html).toContain('aria-label="Porciones de Budín de banana"');
  });
});
