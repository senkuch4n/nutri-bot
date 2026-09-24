import { describe, expect, it } from "vitest";
import {
  CONSULTATION_TEXT,
  canDeleteConsultation,
  consultationChips,
  dayKeyToNoonUtc,
  dayRangeUtc,
  isConsultationEmpty,
  isFutureDayKey,
  isValidDayKey,
  measurementKinds,
  pickConsultationForDay,
  type MeasurementValues,
} from "./consultations";
import { computeAgeYears } from "./patient-formula-data";

const TZ = "America/Argentina/Buenos_Aires";

function m(partial: Partial<MeasurementValues>): MeasurementValues {
  return {
    weightKg: null,
    heightCm: null,
    waistCm: null,
    hipCm: null,
    armCm: null,
    thighCm: null,
    calfCm: null,
    tricepsSkinfoldMm: null,
    subscapularSkinfoldMm: null,
    abdominalSkinfoldMm: null,
    bodyFatPercent: null,
    muscleMassKg: null,
    bodyWaterPercent: null,
    visceralFatLevel: null,
    boneMassKg: null,
    basalMetabolicRateKcal: null,
    ...partial,
  };
}

const bio = m({ weightKg: 66.5, bodyFatPercent: 29.4, muscleMassKg: 45.2 });
const anthro = m({ heightCm: 165, waistCm: 80, tricepsSkinfoldMm: 18 });

describe("measurementKinds", () => {
  it("peso + grasa y músculo → solo bioimpedancia", () => {
    expect(measurementKinds(bio)).toEqual({ anthropometry: false, bioimpedance: true });
  });

  it("talla + cintura + pliegue → solo antropometría", () => {
    expect(measurementKinds(anthro)).toEqual({ anthropometry: true, bioimpedance: false });
  });

  it("solo peso → antropometría", () => {
    expect(measurementKinds(m({ weightKg: 70 }))).toEqual({ anthropometry: true, bioimpedance: false });
  });

  it("todo null (solo nota) → antropometría", () => {
    expect(measurementKinds(m({}))).toEqual({ anthropometry: true, bioimpedance: false });
  });

  it("talla + grasa → los dos grupos", () => {
    expect(measurementKinds(m({ heightCm: 165, bodyFatPercent: 30 }))).toEqual({
      anthropometry: true,
      bioimpedance: true,
    });
  });

  it("un cero cuenta como dato (no es null)", () => {
    expect(measurementKinds(m({ visceralFatLevel: 0 }))).toEqual({ anthropometry: false, bioimpedance: true });
  });
});

describe("consultationChips", () => {
  it("todo junto, en orden fijo", () => {
    expect(consultationChips({ measurements: [bio, anthro], hasPlan: true, notes: "control" })).toEqual([
      "Antropometría",
      "Bioimpedancia",
      "Plan",
      "Notas",
    ]);
  });

  it("el orden no depende del orden de las mediciones", () => {
    expect(consultationChips({ measurements: [anthro, bio], hasPlan: false, notes: null })).toEqual([
      "Antropometría",
      "Bioimpedancia",
    ]);
  });

  it("sin nada → []", () => {
    expect(consultationChips({ measurements: [], hasPlan: false, notes: null })).toEqual([]);
  });

  it("notas con solo espacios no suman 'Notas'", () => {
    expect(consultationChips({ measurements: [], hasPlan: true, notes: "   " })).toEqual(["Plan"]);
  });
});

describe("isConsultationEmpty", () => {
  it.each([
    [0, false, null, true],
    [0, false, "  ", true],
    [0, false, "x", false],
    [1, false, null, false],
    [0, true, null, false],
  ] as const)("(%s, %s, %j) → %s", (measurementCount, hasPlan, notes, expected) => {
    expect(isConsultationEmpty({ measurementCount, hasPlan, notes })).toBe(expected);
  });
});

describe("canDeleteConsultation", () => {
  it.each([
    [0, false, true],
    [1, false, false],
    [0, true, false],
  ] as const)("(%s, %s) → %s", (measurementCount, hasPlan, expected) => {
    expect(canDeleteConsultation({ measurementCount, hasPlan })).toBe(expected);
  });
});

describe("isValidDayKey", () => {
  it("acepta una fecha de calendario válida", () => {
    expect(isValidDayKey("2026-09-12")).toBe(true);
    expect(isValidDayKey("2028-02-29")).toBe(true);
  });

  it.each(["2026-02-30", "12/09/2026", "", "2026-13-01", "2026-9-12"])("rechaza %j", (key) => {
    expect(isValidDayKey(key)).toBe(false);
  });
});

describe("isFutureDayKey", () => {
  // 2026-09-24 23:30 en ART = 2026-09-25 02:30 UTC.
  const now = new Date("2026-09-25T02:30:00Z");

  it("mañana en ART es futuro", () => {
    expect(isFutureDayKey("2026-09-25", now, TZ)).toBe(true);
  });

  it("hoy en ART no es futuro aunque en UTC ya sea mañana", () => {
    expect(isFutureDayKey("2026-09-24", now, TZ)).toBe(false);
  });

  it("ayer no es futuro", () => {
    expect(isFutureDayKey("2026-09-23", now, TZ)).toBe(false);
  });
});

describe("fechas de la consulta", () => {
  it("dayKeyToNoonUtc: mediodía en ART = 15:00 UTC", () => {
    expect(dayKeyToNoonUtc("2026-09-12", TZ).toISOString()).toBe("2026-09-12T15:00:00.000Z");
  });

  it("dayRangeUtc: [00:00, 00:00 del día siguiente) en ART", () => {
    const { start, end } = dayRangeUtc("2026-09-12", TZ);
    expect(start.toISOString()).toBe("2026-09-12T03:00:00.000Z");
    expect(end.toISOString()).toBe("2026-09-13T03:00:00.000Z");
  });

  it("dayRangeUtc cruza fin de mes", () => {
    const { start, end } = dayRangeUtc("2026-09-30", TZ);
    expect(start.toISOString()).toBe("2026-09-30T03:00:00.000Z");
    expect(end.toISOString()).toBe("2026-10-01T03:00:00.000Z");
  });
});

describe("pickConsultationForDay", () => {
  const d = (iso: string) => new Date(iso);

  it("[] → null", () => {
    expect(pickConsultationForDay([])).toBeNull();
  });

  it("prefiere la de turno aunque la sin turno sea más reciente", () => {
    const manual = { id: "m", appointmentId: null, consultedAt: d("2026-09-12T15:00:00Z"), createdAt: d("2026-09-12T20:00:00Z") };
    const turno = { id: "t", appointmentId: "a1", consultedAt: d("2026-09-12T13:00:00Z"), createdAt: d("2026-09-12T13:30:00Z") };
    expect(pickConsultationForDay([manual, turno])?.id).toBe("t");
    expect(pickConsultationForDay([turno, manual])?.id).toBe("t");
  });

  it("dos sin turno → la de createdAt mayor", () => {
    const a = { id: "a", appointmentId: null, consultedAt: d("2026-09-12T15:00:00Z"), createdAt: d("2026-09-12T16:00:00Z") };
    const b = { id: "b", appointmentId: null, consultedAt: d("2026-09-12T15:00:00Z"), createdAt: d("2026-09-12T18:00:00Z") };
    expect(pickConsultationForDay([a, b])?.id).toBe("b");
    expect(pickConsultationForDay([b, a])?.id).toBe("b");
  });

  it("dos con turno → la de consultedAt mayor", () => {
    const a = { id: "a", appointmentId: "x", consultedAt: d("2026-09-12T17:00:00Z"), createdAt: d("2026-09-12T10:00:00Z") };
    const b = { id: "b", appointmentId: "y", consultedAt: d("2026-09-12T13:00:00Z"), createdAt: d("2026-09-12T20:00:00Z") };
    expect(pickConsultationForDay([a, b])?.id).toBe("a");
    expect(pickConsultationForDay([b, a])?.id).toBe("a");
  });
});

describe("edad a la fecha de la consulta (HU-008)", () => {
  it("11 años el 12/09/2026 y 12 el día del cumpleaños", () => {
    const birth = new Date("2014-09-20");
    expect(computeAgeYears(birth, new Date("2026-09-12T13:00:00Z"), TZ)).toBe(11);
    expect(computeAgeYears(birth, new Date("2026-09-20T13:00:00Z"), TZ)).toBe(12);
  });
});

describe("CONSULTATION_TEXT", () => {
  it("textos exactos compartidos con web y domain", () => {
    expect(CONSULTATION_TEXT.futureDate).toBe("La fecha de la consulta no puede ser futura");
    expect(CONSULTATION_TEXT.notDeletable).toBe(
      "Para eliminar la consulta primero borrá sus mediciones y quitá el plan indicado",
    );
  });
});
