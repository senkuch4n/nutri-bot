import { describe, expect, it } from "vitest";
import { parseBboxXhtml } from "./bbox";
import { fixture } from "./fixtures.test-helper";
import { assignNameLines, extractSections } from "./layout";

const sectionsOf = (page: number) => extractSections(parseBboxXhtml(fixture(page), page)[0]!);
const rowNamed = (page: number, part: "A" | "B", name: string) =>
  sectionsOf(page)
    .find((s) => s.part === part)!
    .rows.find((r) => r.name === name);

describe("assignNameLines (partición óptima)", () => {
  it("p. 92: 5 renglones centrados en la fila 1 y 1 renglón alineado con la fila 2", () => {
    const lines = [225.675, 235.386, 245.097, 254.808, 264.519, 279.774];
    const rows = [245.097, 279.774];
    expect(assignNameLines(lines, rows)).toEqual([[0, 1, 2, 3, 4], [5]]);
  });

  it("nombre de 2 renglones con los números en el segundo", () => {
    expect(assignNameLines([300, 310.8, 326], [310.8, 326])).toEqual([[0, 1], [2]]);
  });

  it("fila sin nombre queda con el grupo vacío", () => {
    expect(assignNameLines([100], [100, 200])).toEqual([[0], []]);
    expect(assignNameLines([], [])).toEqual([]);
  });

  it("no junta renglones separados por más de 14 pt", () => {
    expect(assignNameLines([100, 130], [115])).toEqual([[]]);
  });
});

describe("extractSections con páginas reales", () => {
  it("p. 18 (1.A): 20 columnas y nombres de dos renglones", () => {
    const sections = sectionsOf(18);
    expect(sections).toHaveLength(1);
    const a = sections[0]!;
    expect(a.part).toBe("A");
    expect(a.titleTable).toBe(1);
    expect(a.errors).toEqual([]);
    expect(a.rows[0]!.name).toBe("Acelga, cruda");
    expect(a.rows[0]!.cells).toHaveLength(20);
    expect(a.rows[0]!.cells.slice(0, 3)).toEqual(["18", "92,7", "1,8"]);
    const aji = a.rows.find((r) => r.name === "Ají verde o amarillo / morrón verde o amarillo, crudo");
    expect(aji?.cells[0]).toBe("17");
  });

  it("p. 19 (1.B): 19 columnas, números entre los dos renglones del nombre", () => {
    const [b] = sectionsOf(19);
    expect(b!.part).toBe("B");
    expect(b!.errors).toEqual([]);
    expect(b!.rows[0]!.cells).toHaveLength(19);
    const aji = b!.rows.find((r) => r.name === "Ají verde o amarillo / morrón verde o amarillo, crudo");
    expect(aji?.cells[0]).toBe("0,43");
  });

  it("p. 62 (4.A): nombre de 4 renglones con guion de corte", () => {
    expect(
      rowNamed(62, "A", "Bebida láctea parcialmente descremada fluida, baja en lactosa, fortificada con vitaminas A, D, B2, B9 y Zinc")
        ?.cells[0],
    ).toBe("44");
    expect(rowNamed(62, "A", "Flan envasado listo para consumir")?.cells[0]).toBe("129");
  });

  it("p. 90 (7.A): 'PROME-'/'DIO' y marcas '*'; las notas al pie no son filas", () => {
    const a = sectionsOf(90).find((s) => s.part === "A")!;
    expect(a.rows.some((r) => r.name === "Vacuno, cortes grasos, PROMEDIO, horno/parrilla")).toBe(true);
    expect(a.rows.every((r) => !r.name.includes("*") && !/asado, vac/i.test(r.name))).toBe(true);
  });

  it("p. 92: dos secciones (A y B) en la misma página", () => {
    const sections = sectionsOf(92);
    expect(sections.map((s) => s.part)).toEqual(["A", "B"]);
    expect(sections[0]!.titleTable).toBe(7);
    const long =
      "Vacuno, cortes semigrasos, (ej: lomo, carne picada especial, roast beef, paleta, bife angosto, tortuguita, palomita), PROMEDIO, horno/parrilla";
    expect(sections[0]!.rows.map((r) => [r.name, r.cells[0]])).toEqual([
      [long, "225"],
      ["Vizcacha, cruda", "160"],
    ]);
    expect(sections[1]!.rows.map((r) => [r.name, r.cells[0]])).toEqual([
      [long, "1,12"],
      ["Vizcacha, cruda", "3,61"],
    ]);
  });

  it("p. 74 y 75: las dos dicen '5A' pero la segunda es parte B", () => {
    const [a] = sectionsOf(74);
    const [b] = sectionsOf(75);
    expect(a!.titleTable).toBe(5);
    expect(b!.titleTable).toBe(5);
    expect(a!.part).toBe("A");
    expect(b!.part).toBe("B");
    expect(b!.rows[0]!.cells).toHaveLength(19);
    // Celda de cenizas vacía (real) → null, no "0".
    expect(b!.rows.find((r) => r.name === "Yogur descremado bebible")?.cells[0]).toBeNull();
  });
});
