// HU-017b-2 (SDD 9-2): horario en palabras, superposición y excepciones.
import { describe, expect, it } from "vitest";
import {
  AVAILABILITY_TEXT,
  WEEKDAY_NAMES,
  WEEKDAY_ORDER,
  dayScheduleText,
  exceptionDayLabel,
  exceptionFields,
  exceptionKindOf,
  exceptionLine,
  findOverlap,
  formatClock,
  overlappingRangeIds,
  splitExceptions,
  timeRangePhrase,
  type ExceptionKind,
} from "./availability-text";

const r = (startTime: string, endTime: string, id?: string) => ({ id, startTime, endTime });

describe("días y horas", () => {
  it("lunes primero y nombres por weekday de Date#getDay", () => {
    expect(WEEKDAY_ORDER).toEqual([1, 2, 3, 4, 5, 6, 0]);
    expect(WEEKDAY_ORDER.map((d) => WEEKDAY_NAMES[d])).toEqual([
      "Lunes",
      "Martes",
      "Miércoles",
      "Jueves",
      "Viernes",
      "Sábado",
      "Domingo",
    ]);
  });

  it("formatClock saca el cero de la hora", () => {
    expect(formatClock("09:00")).toBe("9:00");
    expect(formatClock("15:30")).toBe("15:30");
  });

  it("timeRangePhrase", () => {
    expect(timeRangePhrase(r("09:00", "13:00"))).toBe("de 9:00 a 13:00");
  });
});

describe("dayScheduleText", () => {
  it("sin horarios → No atendés", () => {
    expect(dayScheduleText([])).toBe("No atendés");
  });
  it("uno", () => {
    expect(dayScheduleText([r("09:00", "13:00")])).toBe("de 9:00 a 13:00");
  });
  it("dos, ordenados por inicio aunque vengan desordenados", () => {
    expect(dayScheduleText([r("15:00", "19:00"), r("09:00", "13:00")])).toBe("de 9:00 a 13:00 y de 15:00 a 19:00");
  });
  it("tres, con comas y la última con y", () => {
    expect(dayScheduleText([r("15:00", "19:00"), r("11:00", "13:00"), r("08:00", "10:00")])).toBe(
      "de 8:00 a 10:00, de 11:00 a 13:00 y de 15:00 a 19:00",
    );
  });
  it("no muta la lista de entrada", () => {
    const list = [r("15:00", "19:00"), r("09:00", "13:00")];
    dayScheduleText(list);
    expect(list[0]!.startTime).toBe("15:00");
  });
});

describe("findOverlap", () => {
  const monday = [r("09:00", "13:00", "a"), r("15:00", "19:00", "b")];

  it("12–16 choca con 9–13 (el primero que empieza antes)", () => {
    expect(findOverlap(r("12:00", "16:00"), monday)).toEqual(monday[0]);
  });
  it("13–15 no choca: se tocan en el borde", () => {
    expect(findOverlap(r("13:00", "15:00"), monday)).toBeNull();
  });
  it("uno contenido en otro choca", () => {
    expect(findOverlap(r("10:00", "11:00"), monday)).toEqual(monday[0]);
  });
  it("excludeId deja afuera al propio horario al editarlo", () => {
    expect(findOverlap(r("15:00", "20:00", "b"), monday, "b")).toBeNull();
    expect(findOverlap(r("12:00", "20:00", "b"), monday, "b")).toEqual(monday[0]);
  });
  it("sin otros → null", () => {
    expect(findOverlap(r("09:00", "10:00"), [])).toBeNull();
  });
});

describe("overlappingRangeIds", () => {
  it("marca los dos de cada par que se pisa y nada más", () => {
    const ids = overlappingRangeIds([
      { id: "a", startTime: "09:00", endTime: "13:00" },
      { id: "b", startTime: "12:00", endTime: "14:00" },
      { id: "c", startTime: "15:00", endTime: "19:00" },
      { id: "d", startTime: "19:00", endTime: "20:00" },
    ]);
    expect([...ids].sort()).toEqual(["a", "b"]);
  });
  it("vacío si no se pisan", () => {
    expect(overlappingRangeIds([{ id: "a", startTime: "09:00", endTime: "13:00" }]).size).toBe(0);
  });
});

describe("tipos de excepción", () => {
  it.each<[ExceptionKind, string | null, string | null]>([
    ["closed_day", null, null],
    ["closed_range", "14:00", "16:00"],
    ["custom_hours", "14:00", "18:00"],
  ])("ida y vuelta: %s", (kind, start, end) => {
    const fields = exceptionFields(kind, start, end);
    expect(exceptionKindOf(fields)).toBe(kind);
  });

  it("columnas de cada tipo", () => {
    expect(exceptionFields("closed_day", "10:00", "12:00")).toEqual({ type: "BLOCKED", startTime: null, endTime: null });
    expect(exceptionFields("closed_range", "14:00", "16:00")).toEqual({
      type: "BLOCKED",
      startTime: "14:00",
      endTime: "16:00",
    });
    expect(exceptionFields("custom_hours", "14:00", "18:00")).toEqual({
      type: "CUSTOM_HOURS",
      startTime: "14:00",
      endTime: "18:00",
    });
  });
});

describe("exceptionLine", () => {
  const today = "2026-10-04";

  it("día entero con motivo", () => {
    expect(
      exceptionLine({ dayKey: "2026-10-12", type: "BLOCKED", startTime: null, endTime: null, reason: "Feriado" }, today),
    ).toBe("Lunes 12 de octubre · No atendés · Feriado");
  });
  it("un rato, sin motivo (sin el último tramo)", () => {
    expect(
      exceptionLine({ dayKey: "2026-10-12", type: "BLOCKED", startTime: "14:00", endTime: "16:00", reason: null }, today),
    ).toBe("Lunes 12 de octubre · No atendés de 14:00 a 16:00");
  });
  it("otro horario; motivo en blanco cuenta como sin motivo", () => {
    expect(
      exceptionLine(
        { dayKey: "2026-10-16", type: "CUSTOM_HOURS", startTime: "14:00", endTime: "18:00", reason: "  " },
        today,
      ),
    ).toBe("Viernes 16 de octubre · Atendés de 14:00 a 18:00");
  });
  it("otro año lleva el año", () => {
    expect(
      exceptionLine({ dayKey: "2027-01-04", type: "BLOCKED", startTime: null, endTime: null, reason: "Vacaciones" }, today),
    ).toBe("Lunes 4 de enero de 2027 · No atendés · Vacaciones");
    expect(exceptionDayLabel("2027-01-04", today)).toBe("Lunes 4 de enero de 2027");
  });
});

describe("splitExceptions", () => {
  it("hoy cuenta como próxima; próximas ascendentes y pasadas descendentes", () => {
    const list = [
      { id: "1", dayKey: "2026-09-01" },
      { id: "2", dayKey: "2026-10-20" },
      { id: "3", dayKey: "2026-10-04" },
      { id: "4", dayKey: "2026-09-30" },
      { id: "5", dayKey: "2026-08-15" },
    ];
    const { upcoming, past } = splitExceptions(list, "2026-10-04");
    expect(upcoming.map((e) => e.id)).toEqual(["3", "2"]);
    expect(past.map((e) => e.id)).toEqual(["4", "1", "5"]);
  });
});

describe("AVAILABILITY_TEXT", () => {
  it("textos con datos", () => {
    expect(AVAILABILITY_TEXT.overlap(r("09:00", "13:00"))).toBe(
      "Se superpone con el horario de 9:00 a 13:00. Cambiá las horas o editá ese horario.",
    );
    expect(AVAILABILITY_TEXT.saved("Martes", r("09:00", "13:00"))).toBe("Listo, el martes atendés de 9:00 a 13:00");
    expect(AVAILABILITY_TEXT.deleteTitle("Lunes", r("15:00", "19:00"))).toBe(
      "¿Borrar el horario del lunes de 15:00 a 19:00?",
    );
    expect(AVAILABILITY_TEXT.exceptionDeleteTitle("lunes 12 de octubre")).toBe(
      "¿Borrar el día especial del lunes 12 de octubre?",
    );
    expect(AVAILABILITY_TEXT.past(3)).toBe("Pasadas (3)");
    expect(AVAILABILITY_TEXT.exceptionKinds).toEqual({
      closed_day: "No atiendo todo el día",
      closed_range: "No atiendo un rato",
      custom_hours: "Atiendo en otro horario",
    });
  });
});
