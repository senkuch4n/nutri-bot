import { describe, expect, it } from "vitest";
import { parseEsArNumber } from "./es-ar-number";

const ok = (value: number | null) => ({ ok: true, value });

describe("parseEsArNumber", () => {
  it("decimales con coma", () => {
    expect(parseEsArNumber("2,4")).toEqual(ok(2.4));
    expect(parseEsArNumber("0")).toEqual(ok(0));
    expect(parseEsArNumber("0,0")).toEqual(ok(0));
    expect(parseEsArNumber("-1,5")).toEqual(ok(-1.5));
    expect(parseEsArNumber("38758")).toEqual(ok(38758));
  });

  it("celda vacía es null, no cero", () => {
    expect(parseEsArNumber("")).toEqual(ok(null));
    expect(parseEsArNumber("   ")).toEqual(ok(null));
    expect(parseEsArNumber(null)).toEqual(ok(null));
    expect(parseEsArNumber(undefined)).toEqual(ok(null));
  });

  it("'0.121' (typo de la tabla) es inválido con y sin miles", () => {
    expect(parseEsArNumber("0.121")).toEqual({ ok: false, raw: "0.121" });
    expect(parseEsArNumber("0.121", { allowThousands: true })).toEqual({ ok: false, raw: "0.121" });
  });

  it("separador de miles solo con allowThousands", () => {
    expect(parseEsArNumber("38.758").ok).toBe(false);
    expect(parseEsArNumber("38.758", { allowThousands: true })).toEqual(ok(38758));
    expect(parseEsArNumber("1.234,5", { allowThousands: true })).toEqual(ok(1234.5));
    expect(parseEsArNumber("1.234.567", { allowThousands: true })).toEqual(ok(1234567));
    expect(parseEsArNumber("1.23", { allowThousands: true }).ok).toBe(false);
  });

  it("formatos inválidos", () => {
    for (const raw of ["3,", "1,2,3", "abc", "1 2", ",5", "1.2,3,4", "--1"]) {
      expect(parseEsArNumber(raw)).toEqual({ ok: false, raw });
    }
  });
});
