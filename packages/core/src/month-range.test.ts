import { describe, expect, it } from "vitest";
import {
  isValidMonthKey,
  monthCalendarWeeks,
  monthKeyInTz,
  monthName,
  monthRangeInTz,
  monthTitle,
  shiftMonthKey,
} from "./month-range";

const AR = "America/Argentina/Buenos_Aires";

describe("isValidMonthKey", () => {
  it.each(["2026-10", "2027-01", "2026-12"])("%s es válido", (k) => expect(isValidMonthKey(k)).toBe(true));
  it.each(["2026-13", "2026-00", "2026-1", "26-10", "octubre", "", "2026-10-01"])("%j no es válido", (k) =>
    expect(isValidMonthKey(k)).toBe(false),
  );
});

describe("monthRangeInTz", () => {
  it("octubre en Buenos Aires: del 1/10 03:00Z al 1/11 03:00Z", () => {
    const { from, to } = monthRangeInTz("2026-10", AR);
    expect(from.toISOString()).toBe("2026-10-01T03:00:00.000Z");
    expect(to.toISOString()).toBe("2026-11-01T03:00:00.000Z");
  });

  it("diciembre termina el 1° de enero del año siguiente", () => {
    const { from, to } = monthRangeInTz("2026-12", AR);
    expect(from.toISOString()).toBe("2026-12-01T03:00:00.000Z");
    expect(to.toISOString()).toBe("2027-01-01T03:00:00.000Z");
  });

  it("en UTC los límites son la medianoche UTC", () => {
    const { from, to } = monthRangeInTz("2026-02", "UTC");
    expect(from.toISOString()).toBe("2026-02-01T00:00:00.000Z");
    expect(to.toISOString()).toBe("2026-03-01T00:00:00.000Z");
  });

  it("una key inválida tira", () => {
    expect(() => monthRangeInTz("2026-13", AR)).toThrow();
  });
});

describe("shiftMonthKey", () => {
  it("cruza el año hacia adelante y hacia atrás", () => {
    expect(shiftMonthKey("2026-12", 1)).toBe("2027-01");
    expect(shiftMonthKey("2027-01", -1)).toBe("2026-12");
    expect(shiftMonthKey("2026-10", -1)).toBe("2026-09");
    expect(shiftMonthKey("2026-10", 0)).toBe("2026-10");
    expect(shiftMonthKey("2026-10", -22)).toBe("2024-12");
    expect(shiftMonthKey("2026-10", 15)).toBe("2028-01");
  });
});

describe("monthKeyInTz", () => {
  it("a las 23:30 del 31/10 en Argentina (ya noviembre en UTC) sigue siendo octubre", () => {
    const now = new Date("2026-11-01T02:30:00.000Z");
    expect(monthKeyInTz(now, AR)).toBe("2026-10");
    expect(monthKeyInTz(now, "UTC")).toBe("2026-11");
  });
});

describe("monthTitle / monthName", () => {
  it("en castellano", () => {
    expect(monthTitle("2026-10")).toBe("Octubre 2026");
    expect(monthTitle("2027-01")).toBe("Enero 2027");
    expect(monthName("2026-10")).toBe("octubre");
    expect(monthName("2026-09")).toBe("septiembre");
  });
});

describe("monthCalendarWeeks", () => {
  it("semanas de lunes a domingo, con los días del mes anterior y del siguiente", () => {
    // 1 de octubre de 2026 es jueves; el 31, sábado.
    const weeks = monthCalendarWeeks("2026-10");
    expect(weeks).toHaveLength(5);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(weeks[0]).toEqual(["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"]);
    expect(weeks[4]![6]).toBe("2026-11-01");
  });
  it("mes que empieza en domingo y cruza de año", () => {
    // 1 de febrero de 2026 es domingo: la primera semana arranca el lunes 26 de enero.
    expect(monthCalendarWeeks("2026-02")[0]![0]).toBe("2026-01-26");
    expect(monthCalendarWeeks("2026-02")[0]![6]).toBe("2026-02-01");
    // Diciembre de 2026 termina jueves 31: la última semana llega al domingo 3 de enero.
    expect(monthCalendarWeeks("2026-12").at(-1)![6]).toBe("2027-01-03");
  });
  it("tira con una key inválida", () => {
    expect(() => monthCalendarWeeks("2026-13")).toThrow();
  });
});
