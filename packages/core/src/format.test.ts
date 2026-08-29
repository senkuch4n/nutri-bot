import { describe, expect, it } from "vitest";
import { formatDateTime, formatPrice, formatServiceList } from "./format";
import { wallTimeToUtc } from "./time";

const TZ = "America/Argentina/Buenos_Aires";

describe("formatPrice", () => {
  it("formatea ARS sin decimales para enteros", () => {
    expect(formatPrice(25000, "ARS")).toMatch(/25\.000/);
  });

  it("acepta string", () => {
    expect(formatPrice("15000.00", "ARS")).toMatch(/15\.000/);
  });
});

describe("formatServiceList", () => {
  it("numera y muestra precio y duración", () => {
    const out = formatServiceList(
      [
        { name: "Primera consulta", price: 25000, durationMin: 60 },
        { name: "Seguimiento", price: 15000, durationMin: 30, description: "Control" },
      ],
      "ARS",
    );
    expect(out).toContain("1. *Primera consulta*");
    expect(out).toContain("2. *Seguimiento*");
    expect(out).toContain("(30 min)");
    expect(out).toContain("_Control_");
  });

  it("mensaje por defecto sin servicios", () => {
    expect(formatServiceList([], "ARS")).toMatch(/no hay servicios/i);
  });
});

describe("formatDateTime", () => {
  it("usa la zona horaria de la profesional", () => {
    const instant = wallTimeToUtc("2026-08-31", "09:00", TZ);
    expect(formatDateTime(instant, TZ)).toBe("lunes 31 de agosto, 09:00");
  });
});
