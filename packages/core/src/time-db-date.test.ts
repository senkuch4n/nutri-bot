import { describe, expect, it } from "vitest";
import { dayKeyFromDbDate, dayKeyInTz } from "./time";

describe("dayKeyFromDbDate", () => {
  it("lee una columna @db.Date como el día guardado, sin correrlo por zona horaria", () => {
    const stored = new Date("2026-03-15T00:00:00Z");
    expect(dayKeyFromDbDate(stored)).toBe("2026-03-15");
    // Lo que hacía antes el dominio de disponibilidad: en Argentina da el día anterior.
    expect(dayKeyInTz(stored, "America/Argentina/Buenos_Aires")).toBe("2026-03-14");
  });

  it("funciona en los bordes de mes y año", () => {
    expect(dayKeyFromDbDate(new Date("2026-01-01T00:00:00Z"))).toBe("2026-01-01");
    expect(dayKeyFromDbDate(new Date("2026-12-31T00:00:00Z"))).toBe("2026-12-31");
  });
});
