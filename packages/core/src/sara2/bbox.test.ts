import { describe, expect, it } from "vitest";
import { parseBboxXhtml, toReadingFrame } from "./bbox";
import { fixture } from "./fixtures.test-helper";

describe("parseBboxXhtml / toReadingFrame", () => {
  it("lee la página 18 del PDF", () => {
    const pages = parseBboxXhtml(fixture(18), 18);
    expect(pages).toHaveLength(1);
    const page = pages[0]!;
    expect(page.pageNumber).toBe(18);
    expect(page.height).toBeCloseTo(841.89, 2);
    expect(page.words.some((w) => w.text === "Acelga,")).toBe(true);
  });

  it("el encabezado va arriba de las filas y las filas avanzan en v", () => {
    const frame = toReadingFrame(parseBboxXhtml(fixture(18))[0]!);
    const kcal = frame.find((w) => w.text === "Kcal")!;
    const acelgas = frame.filter((w) => w.text === "Acelga,").sort((a, b) => a.vc - b.vc);
    expect(acelgas.length).toBeGreaterThanOrEqual(3);
    expect(kcal.vc).toBeLessThan(acelgas[0]!.vc);
    expect(acelgas[0]!.vc).toBeLessThan(acelgas[1]!.vc);
    expect(acelgas[1]!.vc).toBeLessThan(acelgas[2]!.vc);
    // El nombre está a la izquierda (u menor) de los números.
    const n18 = frame.find((w) => w.text === "18" && Math.abs(w.vc - acelgas[0]!.vc) < 2)!;
    expect(acelgas[0]!.uc).toBeLessThan(n18.uc);
  });

  it("decodifica entidades", () => {
    const x = `<doc><page width="10" height="20"><word xMin="1" yMin="2" xMax="3" yMax="4">A&amp;B&lt;&gt;&quot;&#39;</word></page></doc>`;
    const [page] = parseBboxXhtml(x);
    expect(page!.words[0]!.text).toBe(`A&B<>"'`);
    const [w] = toReadingFrame(page!);
    expect(w).toMatchObject({ u0: 16, u1: 18, v0: 1, v1: 3, uc: 17, vc: 2 });
  });
});
