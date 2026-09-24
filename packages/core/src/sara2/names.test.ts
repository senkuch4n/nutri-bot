import { describe, expect, it } from "vitest";
import { isBrokenName, joinNameLines, sara2PairKey, sara2SourceKey } from "./names";

describe("nombres de SARA 2", () => {
  it("une renglones con guion en minúscula y en mayúscula", () => {
    expect(
      joinNameLines([
        "Bebida láctea parcialmente des-",
        "cremada fluida, baja en lactosa,",
        "fortificada con vitaminas A, D, B2,",
        "B9 y Zinc",
      ]),
    ).toBe("Bebida láctea parcialmente descremada fluida, baja en lactosa, fortificada con vitaminas A, D, B2, B9 y Zinc");
    expect(joinNameLines(["Sal dietética o modificada, PRO-", "MEDIO"])).toBe("Sal dietética o modificada, PROMEDIO");
    expect(joinNameLines(["Yogur descremado con frutas y ce-", "reales"])).toBe("Yogur descremado con frutas y cereales");
    expect(joinNameLines(["Flan envasado listo para consu-", "mir light"])).toBe("Flan envasado listo para consumir light");
  });

  it("saca las marcas de nota al pie", () => {
    expect(joinNameLines(["Vacuno, cortes semigrasos***,", "PROMEDIO, crudo"])).toBe(
      "Vacuno, cortes semigrasos, PROMEDIO, crudo",
    );
  });

  it("un guion que no está entre letras no se pega", () => {
    expect(joinNameLines(["Leche 3-", "4 %"])).toBe("Leche 3- 4 %");
  });

  it("isBrokenName detecta pedazos de nombre", () => {
    expect(isBrokenName("ce-")).toBe(true);
    expect(isBrokenName("reales")).toBe(true);
    expect(isBrokenName("Queso*")).toBe(true);
    expect(isBrokenName("A")).toBe(true);
    expect(isBrokenName("Uva")).toBe(false);
    expect(isBrokenName("Sal")).toBe(false);
  });

  it("clave de origen", () => {
    expect(sara2SourceKey(3, "Arroz blanco, hervido")).toBe("sara2:t03:arroz-blanco-hervido");
    expect(sara2SourceKey(12, "Azúcar")).toBe("sara2:t12:azucar");
    expect(sara2SourceKey(4, "Leche descremada fluida, con 50% más de proteínas")).toBe(
      "sara2:t04:leche-descremada-fluida-con-50-mas-de-proteinas",
    );
  });

  it("clave de emparejamiento ignora saltos de renglón, tildes y guiones de corte", () => {
    expect(sara2PairKey("Ají verde o amarillo / morrón verde o amarillo, crudo")).toBe(
      sara2PairKey("Ají verde o amarillo / morrón verde o\namarillo, crudo"),
    );
    expect(sara2PairKey("Yogur des- cremado")).toBe(sara2PairKey("Yogur descremado"));
    expect(sara2PairKey("Leche 50%")).toBe("leche50%");
  });
});
