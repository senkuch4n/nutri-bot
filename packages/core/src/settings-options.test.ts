import { describe, expect, it } from "vitest";
import {
  CURRENCY_OPTIONS,
  OTHER_OPTION_VALUE,
  SETTINGS_TEXT,
  TIMEZONE_OPTIONS,
  currencyLabel,
  isCurrencyCode,
  otherTimezoneLabel,
  timezoneLabel,
} from "./settings-options";

describe("TIMEZONE_OPTIONS", () => {
  it("la zona por defecto va primero y tiene etiqueta en palabras", () => {
    expect(TIMEZONE_OPTIONS[0]).toEqual({
      value: "America/Argentina/Buenos_Aires",
      label: "Argentina (Buenos Aires, Córdoba, Rosario…)",
    });
    expect(timezoneLabel("America/Argentina/Buenos_Aires")).toBe("Argentina (Buenos Aires, Córdoba, Rosario…)");
  });

  it("primero todas las de Argentina; después Uruguay, Chile, Paraguay y España", () => {
    const values = TIMEZONE_OPTIONS.map((o) => o.value);
    const firstOther = values.findIndex((v) => !v.startsWith("America/Argentina/"));
    expect(values.slice(firstOther)).toEqual(["America/Montevideo", "America/Santiago", "America/Asuncion", "Europe/Madrid"]);
    expect(values.slice(0, firstOther).every((v) => v.startsWith("America/Argentina/"))).toBe(true);
    expect(timezoneLabel("America/Montevideo")).toBe("Uruguay");
  });

  it("todas son zonas válidas y sin repetir; ninguna etiqueta muestra el valor técnico", () => {
    const values = TIMEZONE_OPTIONS.map((o) => o.value);
    expect(new Set(values).size).toBe(values.length);
    for (const { value, label } of TIMEZONE_OPTIONS) {
      expect(() => new Intl.DateTimeFormat("es-AR", { timeZone: value })).not.toThrow();
      expect(label).not.toContain("/");
      expect(label).not.toContain("_");
    }
  });

  it("timezoneLabel de una zona fuera de la lista devuelve el valor tal cual", () => {
    expect(timezoneLabel("America/Bogota")).toBe("America/Bogota");
    expect(timezoneLabel("")).toBe("");
  });

  it("otherTimezoneLabel arma un nombre legible para la lista completa", () => {
    expect(otherTimezoneLabel("America/Bogota")).toBe("Bogota (America)");
    expect(otherTimezoneLabel("America/Indiana/Knox")).toBe("Knox (America, Indiana)");
    expect(otherTimezoneLabel("America/Argentina/Buenos_Aires")).toBe("Buenos Aires (America, Argentina)");
    expect(otherTimezoneLabel("UTC")).toBe("UTC");
  });
});

describe("CURRENCY_OPTIONS", () => {
  it("las cinco monedas, en orden y con nombre", () => {
    expect(CURRENCY_OPTIONS.map((o) => o.label)).toEqual([
      "Pesos argentinos (ARS)",
      "Dólares (USD)",
      "Euros (EUR)",
      "Pesos uruguayos (UYU)",
      "Pesos chilenos (CLP)",
    ]);
    expect(CURRENCY_OPTIONS.map((o) => o.value)).toEqual(["ARS", "USD", "EUR", "UYU", "CLP"]);
  });

  it("currencyLabel: la de la lista o el código tal cual", () => {
    expect(currencyLabel("ARS")).toBe("Pesos argentinos (ARS)");
    expect(currencyLabel("BRL")).toBe("BRL");
  });

  it("isCurrencyCode: tres letras", () => {
    expect(isCurrencyCode("ARS")).toBe(true);
    expect(isCurrencyCode("brl")).toBe(true);
    expect(isCurrencyCode("AR")).toBe(false);
    expect(isCurrencyCode("AR5")).toBe(false);
    expect(isCurrencyCode("PESO")).toBe(false);
  });
});

describe("SETTINGS_TEXT", () => {
  it("vista previa del teléfono y sección de PDF", () => {
    expect(SETTINGS_TEXT.phonePreview("+54 9 351 555-2345")).toBe("Te avisamos al +54 9 351 555-2345");
    expect(SETTINGS_TEXT.sections.pdf).toBe("Informes en PDF");
    expect(SETTINGS_TEXT.unsaved).toBe("Cambios sin guardar");
  });

  it("sin jerga a la vista: ni IANA, ni ISO, ni variables de entorno fuera del detalle técnico", () => {
    const { aiKeyDetail, botNotRunningDetail, ...visible } = SETTINGS_TEXT;
    const flat = JSON.stringify(visible, (_k, v) => (typeof v === "function" ? v("X") : v));
    expect(flat).not.toMatch(/IANA|ISO|DEEPSEEK|npm run|primary/);
    expect(aiKeyDetail("API_KEY_IA_DEEPSEEK")).toContain("API_KEY_IA_DEEPSEEK");
    expect(botNotRunningDetail).toContain("npm run dev:bot");
  });

  it("el valor de 'Otra…' no es una zona ni una moneda", () => {
    expect(TIMEZONE_OPTIONS.some((o) => o.value === OTHER_OPTION_VALUE)).toBe(false);
    expect(isCurrencyCode(OTHER_OPTION_VALUE)).toBe(false);
  });
});
