import { describe, expect, it } from "vitest";
import { isExitWord, isWakeWord, normalize } from "./wake";

describe("normalize", () => {
  it("saca acentos y pasa a minúsculas", () => {
    expect(normalize("  MENÚ ")).toBe("menu");
    expect(normalize("Água BÊ")).toBe("agua be");
  });
});

describe("isWakeWord", () => {
  it("despierta con las palabras clave, con o sin acento, en cualquier parte", () => {
    for (const t of [
      "turno",
      "Hola, quiero un TURNO para la semana que viene",
      "menú",
      "necesito reservar",
      "me das una cita?",
      "turnos disponibles?",
    ]) {
      expect(isWakeWord(t)).toBe(true);
    }
  });

  it("NO despierta con mensajes normales de contactos", () => {
    for (const t of [
      "hola",
      "feliz cumple!!",
      "me pasás la receta del budín?",
      "gracias por todo",
      "estás?",
    ]) {
      expect(isWakeWord(t)).toBe(false);
    }
  });
});

describe("isExitWord", () => {
  it("detecta el cierre de conversación", () => {
    expect(isExitWord("salir")).toBe(true);
    expect(isExitWord("listo gracias")).toBe(true);
    expect(isExitWord("chau")).toBe(true);
    expect(isExitWord("1")).toBe(false);
  });
});
