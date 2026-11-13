import { describe, expect, it } from "vitest";
import { calendarDaysBetween, capitalizeFirst, formatAppointmentWhen, formatTimeAgo } from "./relative-date";

const TZ = "America/Argentina/Buenos_Aires";
// Lunes 5 de octubre de 2026, 10:00 en Argentina.
const NOW = new Date("2026-10-05T13:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);

describe("calendarDaysBetween", () => {
  it("cuenta días calendario", () => {
    expect(calendarDaysBetween("2026-10-05", "2026-10-08")).toBe(3);
    expect(calendarDaysBetween("2026-10-05", "2026-10-05")).toBe(0);
  });
  it("cruza fin de mes y de año", () => {
    expect(calendarDaysBetween("2026-10-31", "2026-11-01")).toBe(1);
    expect(calendarDaysBetween("2026-12-31", "2027-01-01")).toBe(1);
    expect(calendarDaysBetween("2026-02-28", "2026-03-01")).toBe(1);
  });
  it("es negativo si to < from", () => {
    expect(calendarDaysBetween("2026-10-08", "2026-10-05")).toBe(-3);
  });
});

describe("capitalizeFirst", () => {
  it("pone en mayúscula la primera letra", () => {
    expect(capitalizeFirst("jueves")).toBe("Jueves");
    expect(capitalizeFirst("ñandú")).toBe("Ñandú");
    expect(capitalizeFirst("")).toBe("");
  });
});

describe("formatAppointmentWhen", () => {
  it.each([
    ["2026-10-05T19:30:00Z", "Hoy, 16:30"],
    ["2026-10-06T02:30:00Z", "Hoy, 23:30"], // ya es 6/10 en UTC, sigue siendo hoy en Argentina
    ["2026-10-06T13:00:00Z", "Mañana, 10:00"],
    ["2026-10-08T13:00:00Z", "Jueves 8 de octubre, 10:00"],
    ["2026-11-09T12:00:00Z", "Lunes 9 de noviembre, 9:00"],
    ["2027-01-04T12:00:00Z", "Lunes 4 de enero de 2027, 9:00"],
    ["2026-10-05T11:00:00Z", "Hoy, 8:00"], // pasado del mismo día
  ])("%s → %s", (iso, expected) => {
    expect(formatAppointmentWhen(new Date(iso), NOW, TZ)).toBe(expected);
  });

  it("usa la zona de la profesional, no UTC (lunes 22:00 → el turno del martes es mañana)", () => {
    expect(formatAppointmentWhen(new Date("2026-10-06T13:00:00Z"), new Date("2026-10-06T01:00:00Z"), TZ)).toBe(
      "Mañana, 10:00",
    );
  });
});

describe("formatTimeAgo", () => {
  it.each([
    [0, "hoy"],
    [3, "hace 3 días"],
    [6, "hace 6 días"],
    [7, "hace 1 semana"],
    [13, "hace 1 semana"],
    [14, "hace 2 semanas"],
    [21, "hace 3 semanas"],
    [29, "hace 4 semanas"],
    [30, "hace 1 mes"],
    [59, "hace 1 mes"],
    [60, "hace 2 meses"],
    [364, "hace 11 meses"],
    [365, "hace 1 año"],
    [800, "hace 2 años"],
  ])("%i días → %s", (d, expected) => {
    expect(formatTimeAgo(daysAgo(d), NOW, TZ)).toBe(expected);
  });

  it("domingo 23:00 en Argentina es ayer (aunque en UTC sea lunes)", () => {
    expect(formatTimeAgo(new Date("2026-10-05T02:00:00Z"), NOW, TZ)).toBe("ayer");
  });

  it("una fecha futura es hoy", () => {
    expect(formatTimeAgo(new Date("2026-10-20T13:00:00Z"), NOW, TZ)).toBe("hoy");
  });
});
