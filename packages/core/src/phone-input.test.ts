import { describe, expect, it } from "vitest";
import { formatPhone } from "./phone-format";
import { PHONE_INPUT_TEXT, parsePhoneInput } from "./phone-input";

const ok = (digits: string) => ({ ok: true, digits });

describe("parsePhoneInput", () => {
  it.each([
    "351 555 2345",
    "3515552345",
    "0351 555-2345",
    "0351 15 555 2345",
    "351 15 555 2345",
    "(351) 555-2345",
  ])("Córdoba escrito a mano: %s", (raw) => {
    expect(parsePhoneInput(raw)).toEqual(ok("5493515552345"));
  });

  it.each(["11 2345 6789", "011 15 2345 6789", "11 15 2345-6789"])("CABA: %s", (raw) => {
    expect(parsePhoneInput(raw)).toEqual(ok("5491123456789"));
  });

  it.each(["2954 12 3456", "02954 15 12 3456"])("código de área de 4 dígitos: %s", (raw) => {
    expect(parsePhoneInput(raw)).toEqual(ok("5492954123456"));
  });

  it.each([
    "5493515552345",
    "+54 9 351 555-2345",
    "+54 351 555 2345",
    "543515552345",
    "0054 9 351 555 2345",
    "+54 0351 15 555 2345",
    // HU-017b-2 (R3): sin "+", con el 9 y con el 15.
    "54 9 351 15 555 2345",
    "54 351 15 555 2345",
  ])("con código de país: %s", (raw) => {
    expect(parsePhoneInput(raw)).toEqual(ok("5493515552345"));
  });

  it("respeta otros países escritos con +", () => {
    expect(parsePhoneInput("+598 99 123 456")).toEqual(ok("59899123456"));
    expect(parsePhoneInput("+1 555 123 4567")).toEqual(ok("15551234567"));
    expect(parsePhoneInput("+34 612 34 56 78")).toEqual(ok("34612345678"));
  });

  it.each([
    "59899123456",
    "555 2345",
    "351 555 234",
    "+54 9 935 155 5234",
    "+12",
    "+1234567890123456",
  ])("inválido: %s", (raw) => {
    expect(parsePhoneInput(raw)).toEqual({ ok: false, error: "invalid" });
  });

  it.each(["", "   ", "abc"])("vacío: %j", (raw) => {
    expect(parsePhoneInput(raw)).toEqual({ ok: false, error: "empty" });
  });

  it("la vista previa usa formatPhone sobre los dígitos normalizados", () => {
    const r = parsePhoneInput("351 555 2345");
    if (!r.ok) throw new Error("debería ser válido");
    expect(formatPhone(r.digits)).toBe("+54 9 351 555-2345");
    expect(PHONE_INPUT_TEXT.confirmationPreview(formatPhone(r.digits))).toBe(
      "La confirmación le llega al +54 9 351 555-2345",
    );
  });
});
