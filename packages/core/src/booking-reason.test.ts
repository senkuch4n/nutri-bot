import { describe, expect, it } from "vitest";
import {
  BOOKING_REASON_ALERT_MAX,
  BOOKING_REASON_MAX,
  BOOKING_REASON_SKIP_WORDS,
  isBookingReasonSkip,
  normalizeBookingReason,
  parseBookingReason,
  reasonForAlert,
  validateBookingReasonInput,
} from "./booking-reason";

describe("normalizeBookingReason", () => {
  it("hace trim", () => {
    expect(normalizeBookingReason("  hola  ")).toBe("hola");
  });

  it.each(["", "   ", "\n\n", null, undefined])("vacío (%j) → null", (v) => {
    expect(normalizeBookingReason(v)).toBeNull();
  });

  it("normaliza saltos de línea", () => {
    expect(normalizeBookingReason("a\r\nb")).toBe("a\nb");
    expect(normalizeBookingReason("a\n\n\n\nb")).toBe("a\n\nb");
    expect(normalizeBookingReason("a\n\nb")).toBe("a\n\nb");
  });
});

describe("salteo", () => {
  const skips = [
    // Gherkin
    "saltear",
    "Saltear.",
    "omitir",
    "no",
    "-",
    "prefiero no",
    // SDD 10.1
    "SALTEO",
    "Ninguno",
    "nada",
    "paso",
    "No!",
    " - ",
    "--",
    "—",
    "  saltear  ",
    // Resolución P2
    "saltar",
    "Saltar.",
    "no gracias",
    "No, gracias!",
    "prefiero no decirlo",
    "Prefiero no decirlo 🙏",
    "no quiero",
    "No quiero.",
    "después",
    "Despues",
    "DESPUÉS!",
  ];

  it.each(skips)("%j es salteo", (text) => {
    expect(isBookingReasonSkip(text)).toBe(true);
    expect(parseBookingReason(text)).toEqual({ kind: "skip" });
  });

  it.each(["no quiero dieta estricta", "después de las fiestas engordé", "saltar comidas", ".", "?", "👍", "nop"])(
    "%j no es salteo",
    (text) => {
      expect(isBookingReasonSkip(text)).toBe(false);
    },
  );

  it("la lista incluye las palabras de la resolución P2", () => {
    for (const w of ["saltar", "no gracias", "prefiero no decirlo", "no quiero", "despues"]) {
      expect(BOOKING_REASON_SKIP_WORDS).toContain(w);
    }
  });
});

describe("parseBookingReason", () => {
  it.each(["ok", "1", "a b", "?", ".", "👍", "", "   ", "si", "sí"])("%j es tooShort", (text) => {
    expect(parseBookingReason(text)).toEqual({ kind: "tooShort" });
  });

  it.each([
    "Quiero bajar de peso, tengo hipotiroidismo",
    "Necesito un menú para la semana, chau harinas",
    "menú para la semana",
    "no quiero dieta estricta",
    "abc",
    "Me pidieron un plan para la diabetes",
  ])("%j es ok (idéntico)", (text) => {
    expect(parseBookingReason(text)).toEqual({ kind: "ok", reason: text });
  });

  it("guarda el motivo normalizado", () => {
    expect(parseBookingReason("  control  ")).toEqual({ kind: "ok", reason: "control" });
  });

  it("límite de largo", () => {
    expect(parseBookingReason("a".repeat(BOOKING_REASON_MAX))).toEqual({
      kind: "ok",
      reason: "a".repeat(500),
    });
    expect(parseBookingReason("a".repeat(501))).toEqual({ kind: "tooLong", length: 501 });
    expect(parseBookingReason(`   ${"a".repeat(500)}   `)).toEqual({
      kind: "ok",
      reason: "a".repeat(500),
    });
  });
});

describe("validateBookingReasonInput", () => {
  it.each([undefined, null, "", "  "])("vacío (%j) → null", (v) => {
    expect(validateBookingReasonInput(v)).toEqual({ ok: true, reason: null });
  });

  it("sin mínimo en el panel", () => {
    expect(validateBookingReasonInput("ok")).toEqual({ ok: true, reason: "ok" });
  });

  it("normaliza", () => {
    expect(validateBookingReasonInput(" Control mensual ")).toEqual({
      ok: true,
      reason: "Control mensual",
    });
  });

  it("más de 500 → error con el largo", () => {
    expect(validateBookingReasonInput("a".repeat(501))).toEqual({
      ok: false,
      error: "El motivo puede tener hasta 500 caracteres (tenés 501).",
    });
    expect(validateBookingReasonInput("a".repeat(500))).toEqual({ ok: true, reason: "a".repeat(500) });
  });
});

describe("reasonForAlert", () => {
  it("hasta 200 queda igual", () => {
    const r = "b".repeat(BOOKING_REASON_ALERT_MAX);
    expect(reasonForAlert(r)).toBe(r);
  });

  it("201 se recorta con el sufijo", () => {
    const r = "c".repeat(201);
    const out = reasonForAlert(r);
    expect(out).toBe(`${"c".repeat(200)}… (completo en el panel)`);
  });

  it("no deja espacios antes de …", () => {
    const r = `${"d".repeat(195)}${" ".repeat(10)}xyz`;
    const out = reasonForAlert(r);
    expect(out).toBe(`${"d".repeat(195)}… (completo en el panel)`);
  });

  it("no parte un emoji", () => {
    const r = `${"e".repeat(199)}😀😀😀`;
    const out = reasonForAlert(r);
    expect(out).toBe(`${"e".repeat(199)}😀… (completo en el panel)`);
    expect(out).not.toContain("�");
    // UTF-16 bien formado: sin surrogates sueltos.
    expect(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(out)).toBe(false);
  });
});
