import { describe, expect, it } from "vitest";
import { AR_AREA_CODES_3, COUNTRY_CODES_2, formatPhone } from "./phone-format";

describe("formatPhone", () => {
  it.each([
    // Argentina, móvil
    ["5493515552345", "+54 9 351 555-2345"],
    ["+54 9 351 555-2345", "+54 9 351 555-2345"],
    ["5491123456789", "+54 9 11 2345-6789"],
    ["5492954123456", "+54 9 2954 12-3456"],
    // Argentina, fijo
    ["543515552345", "+54 351 555-2345"],
    ["541143214321", "+54 11 4321-4321"],
    // "54" con un largo o un nacional que no cierra → genérico
    ["549351555234", "+54 935 155 5234"],
    ["5490000017001", "+54 9000 001 7001"],
    // Otros países
    ["15551234567", "+1 555 123 4567"],
    ["59899123456", "+598 9912 3456"],
    ["34612345678", "+34 61 234 5678"],
    // Cortos o vacíos
    ["12345", "12345"],
    ["", ""],
  ])("%s → %s", (raw, expected) => {
    expect(formatPhone(raw)).toBe(expected);
  });

  it("el número ficticio del recorrido toma el área 351", () => {
    expect(formatPhone("5493510017001")).toBe("+54 9 351 001-7001");
  });
});

describe("tablas", () => {
  it("AR_AREA_CODES_3 tiene los códigos de 3 dígitos", () => {
    expect(AR_AREA_CODES_3.has("351")).toBe(true);
    expect(AR_AREA_CODES_3.has("295")).toBe(false);
    expect(AR_AREA_CODES_3.size).toBe(38);
  });
  it("COUNTRY_CODES_2 incluye 54 y no 59", () => {
    expect(COUNTRY_CODES_2.has("54")).toBe(true);
    expect(COUNTRY_CODES_2.has("34")).toBe(true);
    expect(COUNTRY_CODES_2.has("59")).toBe(false);
  });
});
