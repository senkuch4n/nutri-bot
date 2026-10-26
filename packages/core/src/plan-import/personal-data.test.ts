import { describe, expect, it } from "vitest";
import { isProfessionalFooter, redactCoverName, stripPersonalData } from "./personal-data";
import type { ImportLine } from "./types";

let y = 0;
const line = (text: string, section: ImportLine["section"] = "COVER", page = 1): ImportLine => ({
  page,
  section,
  text,
  x0: 30,
  y0: (y += 20),
  h: 14,
  column: 0,
  isPageTopHeading: false,
});

describe("stripPersonalData", () => {
  it("descarta el tramo nombre + fecha de la portada y guarda las palabras del nombre", () => {
    const r = stripPersonalData([line("Marta, Ejemplar 03/04/25"), line("Para comer más verduras")]);
    expect(r.coverName).toEqual(["Marta", "Ejemplar"]);
    expect(r.lines.map((l) => l.text)).toEqual(["Para comer más verduras"]);
    expect(r.coverLinesDropped).toBe(0);
  });

  it("descarta peso, edad y otras líneas de portada y las cuenta", () => {
    const r = stripPersonalData([line("Peso: 70 kg"), line("Edad: 34"), line("Algo que no sé qué es")]);
    expect(r.lines).toEqual([]);
    expect(r.coverLinesDropped).toBe(3);
  });

  it("el objetivo de la portada (y su segundo renglón en minúscula) se conserva", () => {
    y = 0;
    const r = stripPersonalData([line("Para comer más verduras"), line("y moverse más")]);
    expect(r.lines.map((l) => l.text)).toEqual(["Para comer más verduras", "y moverse más"]);
  });

  it("descarta el pie de la profesional en cualquier página", () => {
    const r = stripPersonalData([
      line("Lic. Profesional Inventada M.P 0000", "RECOMMENDATIONS", 3),
      line("Matrícula M.N 1234", "SNACKS", 4),
      line("Tomar agua", "RECOMMENDATIONS", 3),
    ]);
    expect(r.footerSegments).toBe(2);
    expect(r.lines.map((l) => l.text)).toEqual(["Tomar agua"]);
    expect(isProfessionalFooter("Lic. Profesional Inventada M.P 0000")).toBe(true);
    expect(isProfessionalFooter("M.N 1234")).toBe(true);
    expect(isProfessionalFooter("Licuado de banana")).toBe(false);
  });

  it("reemplaza el nombre fuera de la portada solo con mayúscula inicial", () => {
    const r = stripPersonalData([
      line("Marta, Ejemplar 03/04/25"),
      line("Marta puede incorporar colaciones", "RECOMMENDATIONS", 2),
    ]);
    expect(r.lines.map((l) => l.text)).toEqual(["[paciente] puede incorporar colaciones"]);
    expect(r.redactions).toBe(1);
  });
});

describe("redactCoverName", () => {
  it("'claras de huevo' con nombre Clara no se pisa; 'Clara' sí", () => {
    expect(redactCoverName("Comer claras de huevo", ["Clara"])).toEqual({ text: "Comer claras de huevo", count: 0 });
    expect(redactCoverName("clara de huevo", ["Clara"])).toEqual({ text: "clara de huevo", count: 0 });
    expect(redactCoverName("Clara come bien. CLARA también", ["Clara"])).toEqual({
      text: "[paciente] come bien. [paciente] también",
      count: 2,
    });
  });
  it("palabras de menos de 3 letras no se reemplazan", () => {
    expect(redactCoverName("Lo de Ana", ["Lo"])).toEqual({ text: "Lo de Ana", count: 0 });
  });
});
