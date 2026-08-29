import { describe, expect, it } from "vitest";
import { getAvailableSlots, isSlotAvailable, type Rule } from "./slots";
import { wallTimeToUtc } from "./time";

const TZ = "America/Argentina/Buenos_Aires"; // UTC-3, sin DST

// Lunes a viernes 09:00–12:00.
const rules: Rule[] = [1, 2, 3, 4, 5].map((weekday) => ({
  weekday,
  startTime: "09:00",
  endTime: "12:00",
}));

const service = { durationMin: 60 };

// 2026-08-31 es lunes.
const MONDAY = "2026-08-31";
const from = wallTimeToUtc(MONDAY, "00:00", TZ);
const to = wallTimeToUtc("2026-09-01", "00:00", TZ);

describe("getAvailableSlots", () => {
  it("genera slots en la grilla de la duración del servicio", () => {
    const now = wallTimeToUtc("2026-08-30", "10:00", TZ);
    const slots = getAvailableSlots({
      service,
      rules,
      exceptions: [],
      busy: [],
      from,
      to,
      now,
      tz: TZ,
      minLeadMinutes: 120,
    });
    expect(slots.map((s) => s.toISOString())).toEqual([
      wallTimeToUtc(MONDAY, "09:00", TZ).toISOString(),
      wallTimeToUtc(MONDAY, "10:00", TZ).toISOString(),
      wallTimeToUtc(MONDAY, "11:00", TZ).toISOString(),
    ]);
  });

  it("respeta la zona horaria: 09:00 local = 12:00 UTC", () => {
    const now = wallTimeToUtc("2026-08-30", "10:00", TZ);
    const [first] = getAvailableSlots({
      service,
      rules,
      exceptions: [],
      busy: [],
      from,
      to,
      now,
      tz: TZ,
      minLeadMinutes: 120,
    });
    expect(first!.getUTCHours()).toBe(12);
  });

  it("descarta slots pasados y dentro del lead mínimo", () => {
    const now = wallTimeToUtc(MONDAY, "09:30", TZ); // lead 120min -> corte 11:30
    const slots = getAvailableSlots({
      service,
      rules,
      exceptions: [],
      busy: [],
      from,
      to,
      now,
      tz: TZ,
      minLeadMinutes: 120,
    });
    expect(slots).toHaveLength(0); // 09:00,10:00,11:00 quedan antes de las 11:30
  });

  it("resta turnos ocupados que solapan", () => {
    const now = wallTimeToUtc("2026-08-30", "10:00", TZ);
    const busyStart = wallTimeToUtc(MONDAY, "10:00", TZ);
    const slots = getAvailableSlots({
      service,
      rules,
      exceptions: [],
      busy: [{ start: busyStart, end: new Date(busyStart.getTime() + 3_600_000) }],
      from,
      to,
      now,
      tz: TZ,
      minLeadMinutes: 120,
    });
    expect(slots.map((s) => s.toISOString())).toEqual([
      wallTimeToUtc(MONDAY, "09:00", TZ).toISOString(),
      wallTimeToUtc(MONDAY, "11:00", TZ).toISOString(),
    ]);
  });

  it("aplica excepción BLOCKED de día completo", () => {
    const now = wallTimeToUtc("2026-08-30", "10:00", TZ);
    const slots = getAvailableSlots({
      service,
      rules,
      exceptions: [{ dayKey: MONDAY, type: "BLOCKED" }],
      busy: [],
      from,
      to,
      now,
      tz: TZ,
      minLeadMinutes: 120,
    });
    expect(slots).toHaveLength(0);
  });

  it("aplica excepción CUSTOM_HOURS que reemplaza la regla del día", () => {
    const now = wallTimeToUtc("2026-08-30", "10:00", TZ);
    const slots = getAvailableSlots({
      service,
      rules,
      exceptions: [{ dayKey: MONDAY, type: "CUSTOM_HOURS", startTime: "14:00", endTime: "16:00" }],
      busy: [],
      from,
      to,
      now,
      tz: TZ,
      minLeadMinutes: 120,
    });
    expect(slots.map((s) => s.toISOString())).toEqual([
      wallTimeToUtc(MONDAY, "14:00", TZ).toISOString(),
      wallTimeToUtc(MONDAY, "15:00", TZ).toISOString(),
    ]);
  });

  it("recorta con un BLOCKED parcial", () => {
    const now = wallTimeToUtc("2026-08-30", "10:00", TZ);
    const slots = getAvailableSlots({
      service,
      rules,
      exceptions: [{ dayKey: MONDAY, type: "BLOCKED", startTime: "10:00", endTime: "11:00" }],
      busy: [],
      from,
      to,
      now,
      tz: TZ,
      minLeadMinutes: 120,
    });
    expect(slots.map((s) => s.toISOString())).toEqual([
      wallTimeToUtc(MONDAY, "09:00", TZ).toISOString(),
      wallTimeToUtc(MONDAY, "11:00", TZ).toISOString(),
    ]);
  });
});

describe("isSlotAvailable", () => {
  const now = wallTimeToUtc("2026-08-30", "10:00", TZ);

  it("acepta un inicio válido en grilla", () => {
    expect(
      isSlotAvailable({
        startsAt: wallTimeToUtc(MONDAY, "10:00", TZ),
        service,
        rules,
        exceptions: [],
        busy: [],
        now,
        tz: TZ,
        minLeadMinutes: 120,
      }),
    ).toBe(true);
  });

  it("rechaza un inicio fuera del horario", () => {
    expect(
      isSlotAvailable({
        startsAt: wallTimeToUtc(MONDAY, "13:00", TZ),
        service,
        rules,
        exceptions: [],
        busy: [],
        now,
        tz: TZ,
        minLeadMinutes: 120,
      }),
    ).toBe(false);
  });

  it("rechaza un inicio que solapa con un turno ocupado", () => {
    const busyStart = wallTimeToUtc(MONDAY, "10:00", TZ);
    expect(
      isSlotAvailable({
        startsAt: busyStart,
        service,
        rules,
        exceptions: [],
        busy: [{ start: busyStart, end: new Date(busyStart.getTime() + 3_600_000) }],
        now,
        tz: TZ,
        minLeadMinutes: 120,
      }),
    ).toBe(false);
  });
});
