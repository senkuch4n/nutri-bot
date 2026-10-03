import { describe, expect, it } from "vitest";
import { isExitCommand, isExitWord, isMenuCommand, isWakeWord, lateAttendanceAnswer, menuDigit, normalize } from "./wake";

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

describe("isExitCommand (HU-011, estricto)", () => {
  it("es true solo si el mensaje entero es un comando de salida", () => {
    for (const t of ["salir", "Salir!", " chau ", "Listo, gracias", "nada más", "terminar 👋"]) {
      expect(isExitCommand(t), t).toBe(true);
    }
  });

  it("no cierra cuando la palabra aparece dentro de una consulta", () => {
    for (const t of ["¿Puedo salir a correr?", "chau, una cosa más: ¿el yogur?", "menú", ""]) {
      expect(isExitCommand(t), t).toBe(false);
    }
  });
});

describe("isMenuCommand (HU-011, estricto)", () => {
  it("es true para menú/MENU/menu.", () => {
    for (const t of ["menú", "MENU", "menu.", "  Menú!! "]) {
      expect(isMenuCommand(t), t).toBe(true);
    }
  });

  it("no vuelve al menú si la palabra está dentro de una pregunta", () => {
    for (const t of ["¿qué menú me conviene para la cena?", "salir", "menu menu"]) {
      expect(isMenuCommand(t), t).toBe(false);
    }
  });
});

describe("menuDigit (HU-012)", () => {
  it("devuelve el dígito si el mensaje entero es un dígito dentro del rango", () => {
    expect(menuDigit("1", 5)).toBe("1");
    expect(menuDigit(" 5 ", 5)).toBe("5");
    expect(menuDigit("0", 5)).toBe("0");
  });

  it("admite el keycap", () => {
    expect(menuDigit("5️⃣", 5)).toBe("5");
    expect(menuDigit("0️⃣", 4)).toBe("0");
  });

  it("null fuera de rango o si no es un dígito suelto", () => {
    expect(menuDigit("5", 4)).toBeNull();
    for (const t of ["15", "1.", "uno", "", "  "]) {
      expect(menuDigit(t, 5), t).toBeNull();
    }
  });
});

describe("lateAttendanceAnswer", () => {
  it.each(["sí", "Sí!", "si", "SI 👍", "dale", "Ok.", "confirmo", "sí voy", "Claro!"])("%s → yes", (t) => {
    expect(lateAttendanceAnswer(t)).toBe("yes");
  });
  it.each(["no", "No.", "no puedo", "No voy", "mejor no", "no voy a poder", "no podré"])("%s → no", (t) => {
    expect(lateAttendanceAnswer(t)).toBe("no");
  });
  it.each(["no sé si llego", "no, gracias por la info", "si querés te paso el estudio", "hola", "sino", "nop", ""])(
    "%s → null (no es una respuesta clara)",
    (t) => {
      expect(lateAttendanceAnswer(t)).toBeNull();
    },
  );
});
