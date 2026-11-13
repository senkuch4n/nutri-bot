import { describe, expect, it } from "vitest";
import type { BboxPage, BboxWord } from "./bbox";
import { buildLines, isRotated, median, pageLines, type Word } from "./lines";

const w = (text: string, x0: number, y0: number, width: number, h = 10): Word => ({
  text,
  x0,
  y0,
  x1: x0 + width,
  y1: y0 + h,
  h,
  yc: y0 + h / 2,
});

describe("median", () => {
  it("impar, par y vacío", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBe(0);
  });
});

describe("buildLines", () => {
  it("agrupa por yc con la tolerancia y ordena por y", () => {
    const lines = buildLines([w("abajo", 0, 50, 30), w("arriba", 0, 10, 30), w("sigue", 35, 12, 30)], 5);
    expect(lines.map((l) => l.text)).toEqual(["arriba sigue", "abajo"]);
  });

  it("corta en tramos cuando el hueco supera 1,5 × h (dos columnas → 2 segs)", () => {
    const [line] = buildLines([w("izq", 0, 10, 20), w("uno", 23, 10, 20), w("der", 300, 10, 20)], 5);
    expect(line!.segs.map((s) => s.text)).toEqual(["izq uno", "der"]);
  });

  it("encabezado de letras sueltas con huecos chicos → un solo tramo", () => {
    const letters = "R E C O M E N DAC I O N E S".split(" ").map((t, i) => w(t, i * 12, 10, 10));
    const [line] = buildLines(letters, 5);
    expect(line!.segs).toHaveLength(1);
    expect(line!.segs[0]!.text).toBe("R E C O M E N DAC I O N E S");
  });
});

describe("pageLines", () => {
  it("descarta palabras rotadas y vacías", () => {
    const words: BboxWord[] = [
      { text: "Hola", x0: 10, y0: 10, x1: 40, y1: 20 },
      { text: "  ", x0: 50, y0: 10, x1: 60, y1: 20 },
      { text: "Vertical", x0: 100, y0: 100, x1: 110, y1: 200 },
    ];
    const page: BboxPage = { pageNumber: 1, width: 595, height: 842, words };
    expect(isRotated(words[2]!)).toBe(true);
    expect(pageLines(page).map((l) => l.text)).toEqual(["Hola"]);
  });
});
