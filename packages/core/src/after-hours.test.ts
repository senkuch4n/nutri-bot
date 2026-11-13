import { describe, expect, it } from "vitest";
import {
  AFTER_HOURS_TEXT,
  DEFAULT_AFTER_HOURS,
  afterHoursConfigFrom,
  formatClock,
  isValidHhmm,
  isWithinAfterHours,
  validateAfterHoursConfig,
  type AfterHoursConfig,
} from "./after-hours";
import * as messages from "./messages";

const BA = "America/Argentina/Buenos_Aires"; // UTC−3, sin horario de verano
const NIGHT: AfterHoursConfig = { enabled: true, start: "22:00", end: "09:00" };

/** Instante para una hora de pared en Buenos Aires del 2026-10-02 (o del día siguiente si `nextDay`). */
function ba(hhmm: string, nextDay = false): Date {
  const [h, m] = hhmm.split(":").map(Number);
  // BA = UTC−3 → sumar 3 h para pasar a UTC.
  return new Date(Date.UTC(2026, 9, nextDay ? 3 : 2, h! + 3, m!));
}

describe("isWithinAfterHours: franja que cruza la medianoche (22:00 → 09:00)", () => {
  it.each([
    ["15:30", false, false],
    ["21:59", false, false],
    ["22:00", false, true],
    ["23:10", false, true],
    ["00:00", true, true],
    ["08:59", true, true],
    ["09:00", true, false],
  ])("a las %s → %s", (hhmm, nextDay, expected) => {
    expect(isWithinAfterHours(ba(hhmm, nextDay), NIGHT, BA)).toBe(expected);
  });

  it("el default es la misma franja 22:00 → 09:00 activada", () => {
    expect(DEFAULT_AFTER_HOURS).toEqual(NIGHT);
  });
});

describe("isWithinAfterHours: franja dentro del mismo día (13:00 → 15:00)", () => {
  const SIESTA: AfterHoursConfig = { enabled: true, start: "13:00", end: "15:00" };
  it.each([
    ["12:59", false],
    ["13:00", true],
    ["14:59", true],
    ["15:00", false],
  ])("a las %s → %s", (hhmm, expected) => {
    expect(isWithinAfterHours(ba(hhmm), SIESTA, BA)).toBe(expected);
  });
});

describe("isWithinAfterHours: configs que la apagan", () => {
  it("enabled: false → false aunque sea de noche", () => {
    expect(isWithinAfterHours(ba("23:10"), { ...NIGHT, enabled: false }, BA)).toBe(false);
  });
  it("start === end → false", () => {
    expect(isWithinAfterHours(ba("23:10"), { enabled: true, start: "09:00", end: "09:00" }, BA)).toBe(false);
  });
  it("hora inválida → false", () => {
    expect(isWithinAfterHours(ba("23:10"), { enabled: true, start: "25:00", end: "09:00" }, BA)).toBe(false);
  });
});

describe("isWithinAfterHours: zona horaria", () => {
  it("el mismo instante es de día en Buenos Aires y de noche en Tokio", () => {
    const instant = new Date("2026-10-02T13:30:00Z");
    expect(isWithinAfterHours(instant, NIGHT, BA)).toBe(false); // 10:30 en BA
    expect(isWithinAfterHours(instant, NIGHT, "Asia/Tokyo")).toBe(true); // 22:30 en Tokio
  });
});

describe("isValidHhmm", () => {
  it.each(["09:00", "00:00", "23:59"])("%s es válido", (v) => {
    expect(isValidHhmm(v)).toBe(true);
  });
  it.each(["9:00", "24:00", "12:60", "", "ab:cd", "09:00:00"])("%s es inválido", (v) => {
    expect(isValidHhmm(v)).toBe(false);
  });
});

describe("validateAfterHoursConfig", () => {
  it("cruzar la medianoche es válido", () => {
    expect(validateAfterHoursConfig({ start: "22:00", end: "09:00" })).toBeNull();
  });
  it("horarios iguales", () => {
    expect(validateAfterHoursConfig({ start: "09:00", end: "09:00" })).toBe("Elegí dos horarios distintos.");
  });
  it("hora inválida", () => {
    expect(validateAfterHoursConfig({ start: "25:00", end: "09:00" })).toBe(AFTER_HOURS_TEXT.invalidTime);
    expect(validateAfterHoursConfig({ start: "22:00", end: "9:00" })).toBe(AFTER_HOURS_TEXT.invalidTime);
  });
});

describe("afterHoursConfigFrom", () => {
  it("una fila válida se pasa tal cual", () => {
    expect(
      afterHoursConfigFrom({ afterHoursEnabled: true, afterHoursStart: "22:00", afterHoursEnd: "09:00" }),
    ).toEqual({ enabled: true, start: "22:00", end: "09:00" });
    expect(
      afterHoursConfigFrom({ afterHoursEnabled: false, afterHoursStart: "21:30", afterHoursEnd: "08:30" }),
    ).toEqual({ enabled: false, start: "21:30", end: "08:30" });
  });
  it("una fila con horas inválidas o iguales queda apagada", () => {
    expect(
      afterHoursConfigFrom({ afterHoursEnabled: true, afterHoursStart: "xx", afterHoursEnd: "09:00" }).enabled,
    ).toBe(false);
    expect(
      afterHoursConfigFrom({ afterHoursEnabled: true, afterHoursStart: "09:00", afterHoursEnd: "09:00" }).enabled,
    ).toBe(false);
  });
});

describe("formatClock", () => {
  it.each([
    ["09:00", "9:00"],
    ["22:00", "22:00"],
    ["00:30", "0:30"],
  ])("%s → %s", (input, expected) => {
    expect(formatClock(input)).toBe(expected);
  });
});

describe("textos del bot (HU-011)", () => {
  it("afterHoursHandoff muestra el horario y ofrece volver al menú", () => {
    const t = messages.afterHoursHandoff({ attendFrom: "9:00", attendTo: "22:00" });
    expect(t).toContain("*9:00 a 22:00*");
    expect(t).toContain("escribí *menú*");
  });

  it("inquirySavedAfterHours usa la hora de inicio de atención", () => {
    expect(messages.inquirySavedAfterHours({ attendFrom: "8:30" })).toContain("*8:30*");
  });

  it("afterHoursDigest en singular", () => {
    const t = messages.afterHoursDigest({
      items: [{ patientName: "Ana", patientPhone: "5491111111111", receivedAt: ba("23:10") }],
      tz: BA,
    });
    expect(t).toContain("1 consulta fuera de horario:");
    expect(t).not.toContain("1 consultas");
  });

  it("afterHoursDigest en plural, respeta el orden, usa el teléfono si no hay nombre y la hora en la tz", () => {
    const items = [
      { patientName: "Ana", patientPhone: "5491111111111", receivedAt: new Date("2026-10-03T02:10:00Z") },
      { patientName: null, patientPhone: "5492222222222", receivedAt: ba("01:05", true) },
      { patientName: "Carla", patientPhone: "5493333333333", receivedAt: ba("07:45", true) },
    ];
    const t = messages.afterHoursDigest({ items, tz: BA });
    expect(t).toContain("3 consultas fuera de horario:");
    expect(t).toContain("• Ana (23:10)");
    expect(t).toContain("• 5492222222222 (01:05)");
    expect(t).toContain("• Carla (07:45)");
    expect(t.indexOf("Ana")).toBeLessThan(t.indexOf("5492222222222"));
    expect(t.indexOf("5492222222222")).toBeLessThan(t.indexOf("Carla"));
    expect(t.endsWith("Las ves completas en el panel → Mensajes.")).toBe(true);
    // Sin texto de la consulta: exactamente una línea "•" por ítem.
    expect(t.split("\n").filter((l) => l.startsWith("•"))).toHaveLength(items.length);
  });
});
