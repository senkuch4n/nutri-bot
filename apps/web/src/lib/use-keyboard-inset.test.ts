import { describe, expect, it } from "vitest";
import { keyboardInsetFrom } from "./use-keyboard-inset";

describe("keyboardInsetFrom", () => {
  it("da el alto del teclado", () => {
    expect(keyboardInsetFrom(844, { height: 500, offsetTop: 0 })).toBe(344);
  });
  it("descuenta el desplazamiento del viewport visual", () => {
    expect(keyboardInsetFrom(844, { height: 500, offsetTop: 44 })).toBe(300);
  });
  it("sin visualViewport da 0", () => {
    expect(keyboardInsetFrom(844, null)).toBe(0);
  });
  it("un valor negativo da 0", () => {
    expect(keyboardInsetFrom(800, { height: 844, offsetTop: 0 })).toBe(0);
  });
});
