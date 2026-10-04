import { describe, expect, it } from "vitest";
import type { MeasurementValues } from "./consultations";
import {
  ACTIVITY_PLAIN_LABELS,
  APPOINTMENT_STATUS_TEXT,
  PATIENT_SUMMARY_TEXT,
  appointmentHistoryText,
  consultationRecordedItems,
  formatConsultationDay,
  formatShortDate,
  joinSpanish,
  missingForCaloriesText,
  recordedItemsText,
  weightTrend,
} from "./patient-summary";
import { getMissingFormulaData } from "./patient-formula-data";

const TZ = "America/Argentina/Buenos_Aires";
// Lunes 5 de octubre de 2026, 10:00 en Argentina.
const NOW = new Date("2026-10-05T13:00:00Z");

const EMPTY: MeasurementValues = {
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
  sittingHeightCm: null,
  armSpanCm: null,
  bicepsSkinfoldMm: null,
  iliacCrestSkinfoldMm: null,
  supraspinaleSkinfoldMm: null,
  thighSkinfoldMm: null,
  calfSkinfoldMm: null,
  armFlexedCm: null,
  humerusBreadthCm: null,
  bistyloidBreadthCm: null,
  femurBreadthCm: null,
  bodyFatPercent: null,
  muscleMassKg: null,
  bodyWaterPercent: null,
  visceralFatLevel: null,
  boneMassKg: null,
  basalMetabolicRateKcal: null,
};
const m = (values: Partial<MeasurementValues>): MeasurementValues => ({ ...EMPTY, ...values });
const base = { measurements: [] as MeasurementValues[], hasPrescription: false, hasPlan: false, notes: null };

describe("formatShortDate", () => {
  it("dd/MM en la zona de la profesional", () => {
    expect(formatShortDate(new Date("2026-09-24T15:00:00Z"), TZ)).toBe("24/09");
    // 25/09 02:00 UTC es todavía 24/09 a las 23:00 en Argentina.
    expect(formatShortDate(new Date("2026-09-25T02:00:00Z"), TZ)).toBe("24/09");
  });
});

describe("formatConsultationDay", () => {
  it("mismo año: día de la semana y dd/MM", () => {
    expect(formatConsultationDay(new Date("2026-09-23T15:00:00Z"), NOW, TZ)).toBe("Miércoles 23/09");
  });
  it("otro año: con el año", () => {
    expect(formatConsultationDay(new Date("2025-09-24T15:00:00Z"), NOW, TZ)).toBe("Miércoles 24/09/2025");
  });
  it("usa el día en la zona de la profesional", () => {
    // Jueves 24/09 01:00 UTC = miércoles 23/09 22:00 en Argentina.
    expect(formatConsultationDay(new Date("2026-09-24T01:00:00Z"), NOW, TZ)).toBe("Miércoles 23/09");
  });
});

describe("consultationRecordedItems", () => {
  it("solo peso", () => {
    expect(consultationRecordedItems({ ...base, measurements: [m({ weightKg: 61 })] })).toEqual(["peso"]);
  });
  it("peso y cintura", () => {
    expect(consultationRecordedItems({ ...base, measurements: [m({ weightKg: 61, waistCm: 80 })] })).toEqual([
      "peso",
      "medidas",
    ]);
  });
  it("bioimpedancia", () => {
    expect(consultationRecordedItems({ ...base, measurements: [m({ bodyFatPercent: 30 })] })).toEqual([
      "bioimpedancia",
    ]);
  });
  it("las notas con solo espacios no cuentan", () => {
    expect(consultationRecordedItems({ ...base, notes: "   \n " })).toEqual([]);
    expect(consultationRecordedItems({ ...base, notes: "Control" })).toEqual(["notas"]);
  });
  it("orden fijo, aunque las mediciones vengan separadas", () => {
    expect(
      consultationRecordedItems({
        measurements: [m({ bodyFatPercent: 30 }), m({ heightCm: 164 }), m({ weightKg: 61 })],
        hasPrescription: true,
        hasPlan: true,
        notes: "x",
      }),
    ).toEqual(["peso", "medidas", "bioimpedancia", "calorías", "plan", "notas"]);
  });
  it("sin nada → []", () => {
    expect(consultationRecordedItems(base)).toEqual([]);
  });
});

describe("joinSpanish y recordedItemsText", () => {
  it("une en es-AR", () => {
    expect(joinSpanish([])).toBe("");
    expect(joinSpanish(["a"])).toBe("a");
    expect(joinSpanish(["a", "b"])).toBe("a y b");
    expect(joinSpanish(["a", "b", "c"])).toBe("a, b y c");
  });
  it.each([
    [[], "Sin registros", "Sin registros"],
    [["peso"], "Peso", "Se registró: peso"],
    [["peso", "notas"], "Peso y notas", "Se registró: peso y notas"],
    [["peso", "calorías", "notas"], "Peso, calorías y notas", "Se registró: peso, calorías y notas"],
  ] as const)("%j", (items, short, sentence) => {
    expect(recordedItemsText(items, "short")).toBe(short);
    expect(recordedItemsText(items, "sentence")).toBe(sentence);
  });
});

describe("weightTrend", () => {
  const p = (weightKg: number | null, iso: string) => ({ weightKg, recordedAt: new Date(iso) });

  it("bajó", () => {
    const trend = weightTrend([p(61, "2026-09-24T15:00:00Z"), p(67.8, "2026-05-11T15:00:00Z")], TZ);
    expect(trend).toEqual({
      latestKg: 61,
      latestDateLabel: "24/09",
      deltaKg: -6.8,
      text: "Bajó 6,8 kg desde el 11/05",
      series: [67.8, 61],
    });
  });
  it("subió", () => {
    const trend = weightTrend([p(60, "2026-05-11T15:00:00Z"), p(61.2, "2026-09-24T15:00:00Z")], TZ);
    expect(trend?.deltaKg).toBe(1.2);
    expect(trend?.text).toBe("Subió 1,2 kg desde el 11/05");
  });
  it("igual (también si la diferencia redondea a 0)", () => {
    expect(weightTrend([p(61, "2026-05-11T15:00:00Z"), p(61.04, "2026-09-24T15:00:00Z")], TZ)?.text).toBe(
      "Igual que el 11/05",
    );
    expect(weightTrend([p(61, "2026-05-11T15:00:00Z"), p(61, "2026-09-24T15:00:00Z")], TZ)?.deltaKg).toBe(0);
  });
  it("un solo punto → sin texto ni delta", () => {
    const trend = weightTrend([p(61, "2026-09-24T15:00:00Z")], TZ);
    expect(trend).toMatchObject({ latestKg: 61, deltaKg: null, text: null, series: [61] });
  });
  it("ignora puntos sin peso", () => {
    const trend = weightTrend(
      [p(70, "2026-04-01T15:00:00Z"), p(null, "2026-05-01T15:00:00Z"), p(68, "2026-06-01T15:00:00Z"), p(null, "2026-07-01T15:00:00Z")],
      TZ,
    );
    expect(trend).toMatchObject({ latestKg: 68, latestDateLabel: "01/06", deltaKg: -2, text: "Bajó 2 kg desde el 01/04" });
  });
  it("10 puntos → serie de los últimos 8 en orden cronológico", () => {
    // Del 1/1 al 1/10 de 2026, 60 a 69 kg.
    const points = Array.from({ length: 10 }, (_, i) => p(60 + i, `2026-${String(i + 1).padStart(2, "0")}-01T15:00:00Z`));
    const trend = weightTrend([...points].reverse(), TZ);
    expect(trend?.series).toEqual([62, 63, 64, 65, 66, 67, 68, 69]);
  });
  it("sin pesos → null", () => {
    expect(weightTrend([], TZ)).toBeNull();
    expect(weightTrend([p(null, "2026-09-24T15:00:00Z")], TZ)).toBeNull();
  });
});

describe("appointmentHistoryText", () => {
  const a = (status: "CONFIRMED" | "AWAITING_PAYMENT" | "COMPLETED" | "CANCELLED" | "NO_SHOW", iso = "2026-09-01T13:00:00Z") => ({
    status,
    startsAt: new Date(iso),
  });
  it("6 vino, 1 canceló, 1 no vino", () => {
    const appts = [...Array.from({ length: 6 }, () => a("COMPLETED")), a("CANCELLED"), a("NO_SHOW")];
    expect(appointmentHistoryText(appts, NOW)).toBe("8 turnos: 6 vino, 1 canceló, 1 no vino");
  });
  it("singular", () => {
    expect(appointmentHistoryText([a("COMPLETED")], NOW)).toBe("1 turno: 1 vino");
  });
  it("futuros por venir y pasados sin marcar, en ese orden", () => {
    const appts = [
      a("CONFIRMED", "2026-10-08T13:00:00Z"),
      a("AWAITING_PAYMENT", "2026-10-09T13:00:00Z"),
      a("CONFIRMED", "2026-09-01T13:00:00Z"),
      a("COMPLETED"),
    ];
    expect(appointmentHistoryText(appts, NOW)).toBe("4 turnos: 1 vino, 2 por venir, 1 sin marcar");
  });
  it("vacío", () => {
    expect(appointmentHistoryText([], NOW)).toBe("Todavía no tuvo turnos");
  });
});

describe("textos", () => {
  it("estados de turno en palabras", () => {
    expect(APPOINTMENT_STATUS_TEXT).toEqual({
      CONFIRMED: "Confirmado",
      AWAITING_PAYMENT: "Falta la seña",
      COMPLETED: "Vino",
      CANCELLED: "Canceló",
      NO_SHOW: "No vino",
    });
  });
  it("actividad sin factor", () => {
    expect(Object.values(ACTIVITY_PLAIN_LABELS)).toEqual(["Sedentaria", "Ligera", "Moderada", "Intensa", "Muy intensa"]);
    expect(Object.values(ACTIVITY_PLAIN_LABELS).some((l) => l.includes("×"))).toBe(false);
  });
  it("glosario", () => {
    expect(PATIENT_SUMMARY_TEXT.dataTitle).toBe("Datos de la paciente");
    expect(PATIENT_SUMMARY_TEXT.activityFactor("1,55")).toBe("Factor de actividad: 1,55");
    expect(PATIENT_SUMMARY_TEXT.caloriesPerDay("1.698 kcal", "24/09")).toBe("1.698 kcal por día · 24/09");
    expect(PATIENT_SUMMARY_TEXT.caloriesEmpty).toBe("Todavía no indicaste calorías. Se calculan dentro de una consulta.");
    expect(PATIENT_SUMMARY_TEXT.ageYears(1)).toBe("1 año");
    expect(PATIENT_SUMMARY_TEXT.ageYears(34)).toBe("34 años");
  });
});

describe("missingForCaloriesText", () => {
  const complete = {
    sex: "FEMALE" as const,
    activityLevel: "MODERATE" as const,
    nutritionGoal: "MAINTAIN" as const,
    hasBirthDate: true,
    weightKg: 61,
    heightCm: 164,
  };
  it("sexo y actividad física", () => {
    const items = getMissingFormulaData({ ...complete, sex: null, activityLevel: null });
    expect(missingForCaloriesText(items)).toBe("Para calcular calorías falta: sexo y actividad física");
  });
  it("tres ítems con coma", () => {
    const items = getMissingFormulaData({ ...complete, sex: null, weightKg: null, heightCm: null });
    expect(missingForCaloriesText(items)).toBe("Para calcular calorías falta: sexo, peso y talla");
  });
  it("vacío → null", () => {
    expect(missingForCaloriesText([])).toBeNull();
  });
});
