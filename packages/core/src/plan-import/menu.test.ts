import { describe, expect, it } from "vitest";
import { isMacroContinuation, isQualitativeMacroLine, normalizeCombo, parseWeekdayLine, splitTandas } from "./menu";

describe("parseWeekdayLine", () => {
  it("días con y sin tilde, solos o con ':'", () => {
    expect(parseWeekdayLine("LUNES")).toEqual({ day: "MON", rest: "" });
    expect(parseWeekdayLine("MIERCOLES")?.day).toBe("WED");
    expect(parseWeekdayLine("Miércoles")?.day).toBe("WED");
    expect(parseWeekdayLine("SÁBADO")?.day).toBe("SAT");
    expect(parseWeekdayLine("SABADO")?.day).toBe("SAT");
    expect(parseWeekdayLine("DOMINGO")?.day).toBe("SUN");
    expect(parseWeekdayLine("LUNES: Té + pan")).toEqual({ day: "MON", rest: "Té + pan" });
  });
  it("día seguido de texto es texto, no un día", () => {
    expect(parseWeekdayLine("Lunes a viernes tomar agua")).toBeNull();
    expect(parseWeekdayLine("Lunesito")).toBeNull();
  });
});

describe("isQualitativeMacroLine", () => {
  it("solo palabras de macros y al menos un macro", () => {
    expect(isQualitativeMacroLine("Hidratos de carbono (fibra),")).toBe(true);
    expect(isQualitativeMacroLine("proteínas y grasas saludables")).toBe(true);
    expect(isQualitativeMacroLine("Té + tostada")).toBe(false);
    expect(isQualitativeMacroLine("y")).toBe(false);
    expect(isMacroContinuation("fibra)")).toBe(true);
  });
});

describe("normalizeCombo", () => {
  it("un espacio a cada lado de '+', sin tocar paréntesis", () => {
    expect(normalizeCombo("Café + pan de centeno +ricota")).toBe("Café + pan de centeno + ricota");
    expect(normalizeCombo("ensalada ( pepino +rúcula)")).toBe("ensalada ( pepino + rúcula)");
  });
});

describe("splitTandas", () => {
  it("tanda nueva cuando el día no es posterior al último", () => {
    expect(splitTandas(["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN", "MON"])).toHaveLength(2);
    expect(splitTandas(["MON", "WED", "TUE"])).toEqual([["MON", "WED"], ["TUE"]]);
    expect(splitTandas(["MON", "MON"])).toHaveLength(2);
    expect(splitTandas([])).toEqual([]);
  });
});
