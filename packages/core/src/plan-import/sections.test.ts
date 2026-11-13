import { describe, expect, it } from "vitest";
import { isDecorativeLabel, isHeadingLike, matchSectionHeading } from "./sections";

describe("matchSectionHeading", () => {
  it("reconoce encabezados con letras espaciadas y normales", () => {
    expect(matchSectionHeading("D E S AY U N O Y M E R I E N DA")).toBe("BREAKFAST_SNACK");
    expect(matchSectionHeading("R E C O M E N DAC I O N E S")).toBe("RECOMMENDATIONS");
    expect(matchSectionHeading("ALIMENTOS DE CONSUMO OCASIONAL")).toBe("OCCASIONAL_FOODS");
    expect(matchSectionHeading("A L I M E N TO S D E C O N S U M O D I A R I O")).toBe("DAILY_FOODS");
    expect(matchSectionHeading("ALMUERZO Y CENA")).toBe("LUNCH_DINNER");
    expect(matchSectionHeading("COLACIONES OPCIONALES")).toBe("SNACKS");
    expect(matchSectionHeading("REEMPLAZO (Alimentos ricos en proteínas)")).toBe("REPLACEMENTS");
    expect(matchSectionHeading("Plan nutricional")).toBe("COVER");
  });

  it("un renglón de contenido no es encabezado", () => {
    expect(matchSectionHeading("Almuerzo: Bife + arroz")).toBeNull();
    expect(matchSectionHeading("Reemplazo de la carne por legumbres en la cena de los martes y jueves")).toBeNull();
    expect(matchSectionHeading("")).toBeNull();
  });
});

describe("isHeadingLike", () => {
  it("mayúsculas cortas o letras espaciadas", () => {
    expect(isHeadingLike("L I S TA D E C O M P R A S")).toBe(true);
    expect(isHeadingLike("VEGETALES A")).toBe(true);
    expect(isHeadingLike("Té + tostada integral")).toBe(false);
    expect(isHeadingLike("+")).toBe(false);
    expect(isHeadingLike("UNO DOS TRES CUATRO CINCO SEIS SIETE OCHO NUEVE")).toBe(false);
  });
});

describe("isDecorativeLabel", () => {
  it("rótulos de adorno de colaciones", () => {
    expect(isDecorativeLabel("OPCIONES")).toBe(true);
    expect(isDecorativeLabel("DE COLACIONES")).toBe(true);
    expect(isDecorativeLabel("Frutas")).toBe(false);
  });
});
