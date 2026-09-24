import { describe, expect, it } from "vitest";
import { parseBboxXhtml } from "./bbox";
import { fixture } from "./fixtures.test-helper";
import { extractSections, type SaraRawRow } from "./layout";
import { SARA2_VALIDATION, validateSaraPair } from "./validate";

const row = (part: "A" | "B", name: string, cells: (string | null)[], page = 1): SaraRawRow => ({
  page,
  part,
  name,
  cells,
  rawText: `${name} | ${cells.join(" ")}`,
  nameCost: 0,
});

// Celdas reales del PDF (pdftotext -bbox), copiadas tal cual.
const ARROZ_A = ["126", "68,6", "2,4", "0,2", "0", "0,06", "0,07", "0,06", "0", "0,05", "0,010", "0", "0", "0", "28,6", "28,6", "0,1", "0", "0,6", "0"];
const ARROZ_B = ["0,21", "0", "29", "3", "0,038", "37", "0,20", "13", "0,42", "0,40", "2", "0", "0", "0", "0,020", "0,016", "0", "0", "0"];
const BANANA_A = ["92", "74,8", "1,2", "0,2", "0", "0,112", "0,032", "0,073", "0", "0,046", "0,027", "0", "0", "0", "20,4", "23,0", "12,23", "0", "2,6", "0"];
const BANANA_B = ["0,8", "1", "348", "7", "0,078", "28", "0,41", "27", "0,15", "1,20", "20", "0", "3", "0", "0,061", "0,087", "0", "6,1", "0"];
const HARINA_A = ["108", "71,2", "3,0", "0,4", "0", "0,06", "0,09", "0,23", "0", "0,00", "0", "0", "0", "0", "21,5", "24,6", "0,2", "0", "3,0", "0"];
const HARINA_B = ["0,28", "6", "67", "3", "0,04", "22", "0,65", "5", "0,09", "0,60", "12", "0", "3", "0", "0,047", "0,033", "0", "0", "0"];

function pairFromPages(pageA: number, pageB: number, name: string) {
  const a = extractSections(parseBboxXhtml(fixture(pageA), pageA)[0]!).flatMap((s) => s.rows).find((r) => r.name === name)!;
  const b = extractSections(parseBboxXhtml(fixture(pageB), pageB)[0]!).flatMap((s) => s.rows).find((r) => r.name === name)!;
  return { a, b };
}

describe("validateSaraPair", () => {
  it("usa la tolerancia resuelta por el orquestador (máx(2 kcal, 5 %), suma 90–110)", () => {
    expect(SARA2_VALIDATION.atwaterRel).toBe(0.05);
    expect(SARA2_VALIDATION.macroSumReject).toEqual([90, 110]);
    expect(SARA2_VALIDATION.macroSumWarn).toEqual([97, 103]);
  });

  it("Arroz blanco, hervido: ok, kcal por Atwater y las publicadas en nutrients", () => {
    const r = validateSaraPair(3, row("A", "Arroz blanco, hervido", ARROZ_A, 34), row("B", "Arroz blanco, hervido", ARROZ_B, 35));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.food).toMatchObject({
      sourceKey: "sara2:t03:arroz-blanco-hervido",
      group: "LEGUMBRES_CEREALES",
      pages: [34, 35],
      kcalPer100: 125.8,
      proteinPer100: 2.4,
      carbsPer100: 28.6,
      fatPer100: 0.2,
      fiberPer100: 0.6,
      alcoholPer100: 0,
      saturatedFatPer100: 0.06,
    });
    expect(r.food.nutrients.kcalPublicada).toBe(126);
    expect(r.food.nutrients.cenizas).toBe(0.21);
    expect(r.food.nutrients.cobre).toBe(0.038);
    expect(r.warnings).toEqual([]);
  });

  it("Banana (92 publicadas, 88,2 calculadas, 4,3 %) entra con la tolerancia del 5 %", () => {
    const r = validateSaraPair(2, row("A", "Banana", BANANA_A), row("B", "Banana", BANANA_B));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.food.kcalPer100).toBe(88.2);
  });

  it("Harina de maíz, hervida → ATWATER", () => {
    const r = validateSaraPair(3, row("A", "Harina de maíz, hervida", HARINA_A), row("B", "Harina de maíz, hervida", HARINA_B));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.rejection.reason).toBe("ATWATER");
    expect(r.rejection.detail).toBe("kcal publicadas 108, calculadas 101,6, diferencia 6,4");
  });

  it("Salvado de avena (p. 58/59) → NUMERO_INVALIDO por «0.121»", () => {
    const { a, b } = pairFromPages(58, 59, "Salvado de avena");
    const r = validateSaraPair(3, a, b);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.rejection.reason).toBe("NUMERO_INVALIDO");
    expect(r.rejection.detail).toContain("«0.121»");
  });

  it("Yogur descremado (p. 74/75) → SUMA_MACROS 88,9 g", () => {
    const { a, b } = pairFromPages(74, 75, "Yogur descremado");
    const r = validateSaraPair(5, a, b);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.rejection.reason).toBe("SUMA_MACROS");
    expect(r.rejection.detail).toBe("suma de macros = 88,9 g");
  });

  it("cenizas vacía y suma 98 sin ellas → ok con advertencia SIN_CENIZAS", () => {
    // agua 90 + P 3 + G 1 + CHO 4 = 98; kcal = 12 + 16 + 9 = 37
    const a = ["37", "90,0", "3,0", "1,0", "0", "0,2", "0,3", "0,4", "0", "0", "0", "0", "0", "0", "4,0", "4,0", "1,0", "0", "", "0"];
    const b = [null, "5", "100", "10", "0,01", "20", "0,3", "10", "0,2", "0,1", "5", "0", "0", "0", "0,01", "0,02", "0", "1", "0"];
    const r = validateSaraPair(1, row("A", "Prueba", a), row("B", "Prueba", b));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.warnings.map((w) => w.code)).toEqual(["SIN_CENIZAS"]);
    expect(r.food.nutrients.cenizas).toBeNull();
    // Fibra vacía → null (sin dato), no 0.
    expect(r.food.fiberPer100).toBeNull();
    expect(r.food.alcoholPer100).toBe(0);
  });

  it("suma fuera de 97–103 pero dentro de 90–110 → advertencia", () => {
    const a = [...ARROZ_A];
    a[1] = "72,6"; // agua +4 → suma 104,6
    const r = validateSaraPair(3, row("A", "Arroz", a), row("B", "Arroz", ARROZ_B));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.warnings.map((w) => w.code)).toContain("SUMA_FUERA_97_103");
  });

  it("proteínas vacía → FALTA_MACRO; kcal vacía → FALTA_KCAL", () => {
    const a = [...ARROZ_A];
    a[2] = null as unknown as string;
    const r = validateSaraPair(3, row("A", "Arroz", a), row("B", "Arroz", ARROZ_B));
    expect(!r.ok && r.rejection.reason).toBe("FALTA_MACRO");
    expect(!r.ok && r.rejection.detail).toBe("falta un macro (proteínas)");
    const k = [...ARROZ_A];
    k[0] = "";
    const r2 = validateSaraPair(3, row("A", "Arroz", k), row("B", "Arroz", ARROZ_B));
    expect(!r2.ok && r2.rejection.reason).toBe("FALTA_KCAL");
  });

  it("advertencias de coherencia de grasas y azúcares", () => {
    const a = [...ARROZ_A];
    a[5] = "0,5"; // saturadas 0,5 > lípidos 0,2
    a[17] = "1,0"; // azúcar agregado 1,0 > azúcar total 0,1
    const r = validateSaraPair(3, row("A", "Arroz", a), row("B", "Arroz", ARROZ_B));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.warnings.map((w) => w.code).sort()).toEqual(["AZUCARES_INCONSISTENTES", "GRASAS_INCONSISTENTES"]);
  });
});
