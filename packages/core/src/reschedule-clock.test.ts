import { describe, expect, it } from "vitest";
import {
  RESCHEDULE_TEXT,
  clockHourLabel,
  clockHourPosition,
  clockMinuteAngle,
  clockPoint,
  groupRescheduleSlots,
  initialRescheduleSelection,
  minuteForHour,
  rescheduleDayLabel,
  rescheduleMinuteMarks,
  rescheduleSlotIso,
  shiftDayKey,
} from "./reschedule-clock";

const tz = "America/Argentina/Buenos_Aires"; // UTC-3, sin horario de verano.

// Jueves 5 de noviembre de 2026 en Argentina: 9:00, 9:30, 10:00 y 14:45 (desordenados y uno repetido).
const SLOTS = [
  "2026-11-05T13:00:00.000Z", // 10:00
  "2026-11-05T12:00:00.000Z", // 9:00
  "2026-11-05T17:45:00.000Z", // 14:45
  "2026-11-05T12:30:00.000Z", // 9:30
  "2026-11-05T12:00:00.000Z", // 9:00 repetido
];

describe("groupRescheduleSlots", () => {
  it("agrupa los inicios por hora de pared en la zona, ordenados y sin repetidos", () => {
    expect(groupRescheduleSlots(SLOTS, tz)).toEqual([
      {
        hour: 9,
        minutes: [
          { minute: 0, iso: "2026-11-05T12:00:00.000Z" },
          { minute: 30, iso: "2026-11-05T12:30:00.000Z" },
        ],
      },
      { hour: 10, minutes: [{ minute: 0, iso: "2026-11-05T13:00:00.000Z" }] },
      { hour: 14, minutes: [{ minute: 45, iso: "2026-11-05T17:45:00.000Z" }] },
    ]);
  });

  it("sin horarios devuelve una lista vacía", () => {
    expect(groupRescheduleSlots([], tz)).toEqual([]);
  });
});

describe("rescheduleSlotIso", () => {
  it("devuelve el ISO de hora y minuto elegidos, o null si ese horario no está libre", () => {
    const groups = groupRescheduleSlots(SLOTS, tz);
    expect(rescheduleSlotIso(groups, 9, 30)).toBe("2026-11-05T12:30:00.000Z");
    expect(rescheduleSlotIso(groups, 9, 15)).toBeNull();
    expect(rescheduleSlotIso(groups, 11, 0)).toBeNull();
  });
});

describe("minuteForHour", () => {
  const groups = groupRescheduleSlots(SLOTS, tz);
  it("conserva el minuto elegido si está libre en la hora nueva", () => {
    expect(minuteForHour(groups, 9, 30)).toBe(30);
  });
  it("si no está libre, toma el primer minuto libre de esa hora", () => {
    expect(minuteForHour(groups, 14, 0)).toBe(45);
  });
  it("una hora sin horarios libres no tiene minuto", () => {
    expect(minuteForHour(groups, 11, 0)).toBeNull();
  });
});

describe("initialRescheduleSelection", () => {
  const groups = groupRescheduleSlots(SLOTS, tz);
  it("arranca en el horario actual del turno si está libre", () => {
    expect(initialRescheduleSelection(groups, "2026-11-05T12:30:00.000Z", tz)).toEqual({ hour: 9, minute: 30 });
  });
  it("si la hora actual está libre pero el minuto no, usa el primer minuto libre de esa hora", () => {
    expect(initialRescheduleSelection(groups, "2026-11-05T17:00:00.000Z", tz)).toEqual({ hour: 14, minute: 45 });
  });
  it("si la hora actual no está libre, arranca en el primer horario libre del día", () => {
    expect(initialRescheduleSelection(groups, "2026-11-05T20:00:00.000Z", tz)).toEqual({ hour: 9, minute: 0 });
  });
  it("sin horarios libres no hay selección", () => {
    expect(initialRescheduleSelection([], "2026-11-05T12:00:00.000Z", tz)).toBeNull();
  });
});

describe("clockHourPosition (esfera de 24 h)", () => {
  it("1 a 12 van en el anillo de afuera, con el 12 arriba", () => {
    expect(clockHourPosition(12)).toEqual({ angle: 0, ring: "outer" });
    expect(clockHourPosition(3)).toEqual({ angle: 90, ring: "outer" });
    expect(clockHourPosition(9)).toEqual({ angle: 270, ring: "outer" });
  });
  it("13 a 23 y el 00 van en el anillo de adentro, con el 00 arriba", () => {
    expect(clockHourPosition(0)).toEqual({ angle: 0, ring: "inner" });
    expect(clockHourPosition(15)).toEqual({ angle: 90, ring: "inner" });
    expect(clockHourPosition(23)).toEqual({ angle: 330, ring: "inner" });
  });
});

describe("clockHourLabel", () => {
  it("la medianoche se escribe 00; el resto, el número", () => {
    expect(clockHourLabel(0)).toBe("00");
    expect(clockHourLabel(9)).toBe("9");
    expect(clockHourLabel(18)).toBe("18");
  });
});

describe("clockMinuteAngle", () => {
  it("cada minuto son 6 grados, con el 00 arriba", () => {
    expect(clockMinuteAngle(0)).toBe(0);
    expect(clockMinuteAngle(15)).toBe(90);
    expect(clockMinuteAngle(45)).toBe(270);
  });
});

describe("clockPoint", () => {
  it("convierte ángulo (horario, desde arriba) y radio en x/y desde el centro, con y hacia abajo", () => {
    const top = clockPoint(0, 10);
    expect(top.x).toBeCloseTo(0);
    expect(top.y).toBeCloseTo(-10);
    const right = clockPoint(90, 10);
    expect(right.x).toBeCloseTo(10);
    expect(right.y).toBeCloseTo(0);
    const bottom = clockPoint(180, 10);
    expect(bottom.x).toBeCloseTo(0);
    expect(bottom.y).toBeCloseTo(10);
  });
});

describe("rescheduleMinuteMarks", () => {
  it("muestra los 12 minutos de a 5 con número", () => {
    const marks = rescheduleMinuteMarks([]);
    expect(marks).toHaveLength(12);
    expect(marks.map((m) => m.minute)).toEqual([0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]);
    expect(marks.every((m) => m.labeled)).toBe(true);
  });
  it("suma, sin número y en orden, los minutos libres que no caen de a 5", () => {
    const marks = rescheduleMinuteMarks([0, 7, 30]);
    expect(marks).toHaveLength(13);
    expect(marks[2]).toEqual({ minute: 7, labeled: false });
  });
});

describe("shiftDayKey", () => {
  it("mueve el día calendario, cruzando mes y año", () => {
    expect(shiftDayKey("2026-11-05", 1)).toBe("2026-11-06");
    expect(shiftDayKey("2026-11-30", 1)).toBe("2026-12-01");
    expect(shiftDayKey("2027-01-01", -1)).toBe("2026-12-31");
  });
});

describe("rescheduleDayLabel", () => {
  it("hoy y mañana se dicen así; otro día, con el día de la semana y el mes", () => {
    expect(rescheduleDayLabel("2026-11-05", "2026-11-05")).toBe("Hoy");
    expect(rescheduleDayLabel("2026-11-06", "2026-11-05")).toBe("Mañana");
    expect(rescheduleDayLabel("2026-11-09", "2026-11-05")).toBe("Lunes 9 de noviembre");
  });
  it("en otro año suma el año", () => {
    expect(rescheduleDayLabel("2027-01-04", "2026-11-05")).toBe("Lunes 4 de enero de 2027");
  });
});

describe("RESCHEDULE_TEXT", () => {
  it("tiene los textos del modal", () => {
    expect(RESCHEDULE_TEXT.title).toBe("Cambiar horario");
    expect(RESCHEDULE_TEXT.save).toBe("Guardar");
    expect(RESCHEDULE_TEXT.cancel).toBe("Cancelar");
    expect(RESCHEDULE_TEXT.noSlots).toBe("Sin horarios libres este día");
    expect(RESCHEDULE_TEXT.prevDay).toBe("Día anterior");
    expect(RESCHEDULE_TEXT.nextDay).toBe("Día siguiente");
    expect(RESCHEDULE_TEXT.hourLabel(9)).toBe("9 horas");
    expect(RESCHEDULE_TEXT.minuteLabel(5)).toBe("Minuto 05");
  });
});
