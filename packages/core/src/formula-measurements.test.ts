import { describe, expect, it } from "vitest";
import { pickFormulaMeasurements, type FormulaMeasurementEntry } from "./formula-measurements";

function entry(
  partial: Partial<FormulaMeasurementEntry> & Pick<FormulaMeasurementEntry, "recordedAt" | "createdAt">,
): FormulaMeasurementEntry {
  return {
    consultationId: null,
    weightKg: null,
    heightCm: null,
    waistCm: null,
    hipCm: null,
    bodyFatPercent: null,
    basalMetabolicRateKcal: null,
    ...partial,
  };
}

const d = (iso: string) => new Date(iso);

describe("pickFormulaMeasurements", () => {
  it("la de la consulta gana aunque haya otra más nueva de otra consulta del mismo día", () => {
    const own = entry({
      consultationId: "c1",
      weightKg: 66.5,
      recordedAt: d("2026-09-12T15:00:00Z"),
      createdAt: d("2026-09-12T15:00:00Z"),
    });
    const otherSameDay = entry({
      consultationId: "c2",
      weightKg: 70,
      recordedAt: d("2026-09-12T15:00:00Z"),
      createdAt: d("2026-09-12T18:00:00Z"),
    });
    const r = pickFormulaMeasurements([otherSameDay, own], "c1");
    expect(r.weightKg).toEqual({ value: 66.5, recordedAt: own.recordedAt, consultationId: "c1" });
  });

  it("sin valor en la consulta → la más reciente por recordedAt", () => {
    const older = entry({ consultationId: "a", weightKg: 60, recordedAt: d("2026-08-01T15:00:00Z"), createdAt: d("2026-09-20T00:00:00Z") });
    const newer = entry({ consultationId: "b", weightKg: 62, recordedAt: d("2026-09-01T15:00:00Z"), createdAt: d("2026-09-01T15:00:00Z") });
    const ownNoWeight = entry({ consultationId: "c", heightCm: 162, recordedAt: d("2026-09-12T15:00:00Z"), createdAt: d("2026-09-12T15:00:00Z") });
    const r = pickFormulaMeasurements([older, ownNoWeight, newer], "c");
    expect(r.weightKg?.value).toBe(62);
    expect(r.weightKg?.consultationId).toBe("b");
    expect(r.heightCm?.value).toBe(162);
  });

  it("empate de recordedAt → createdAt desc", () => {
    const same = d("2026-09-01T15:00:00Z");
    const first = entry({ consultationId: "a", weightKg: 60, recordedAt: same, createdAt: d("2026-09-01T10:00:00Z") });
    const second = entry({ consultationId: "a", weightKg: 61, recordedAt: same, createdAt: d("2026-09-01T11:00:00Z") });
    expect(pickFormulaMeasurements([first, second], "zzz").weightKg?.value).toBe(61);
  });

  it("dentro de la consulta, la cargada última gana", () => {
    const first = entry({ consultationId: "c", weightKg: 60, recordedAt: d("2026-09-01T15:00:00Z"), createdAt: d("2026-09-01T10:00:00Z") });
    const second = entry({ consultationId: "c", weightKg: 61, recordedAt: d("2026-09-01T15:00:00Z"), createdAt: d("2026-09-01T11:00:00Z") });
    expect(pickFormulaMeasurements([second, first], "c").weightKg?.value).toBe(61);
  });

  it("cada clave elige por separado", () => {
    const weightOnly = entry({ consultationId: "a", weightKg: 71.5, recordedAt: d("2026-09-09T15:00:00Z"), createdAt: d("2026-09-09T15:00:00Z") });
    const heightOnly = entry({ consultationId: "b", heightCm: 178, bodyFatPercent: 20, recordedAt: d("2026-08-01T15:00:00Z"), createdAt: d("2026-08-01T15:00:00Z") });
    const r = pickFormulaMeasurements([heightOnly, weightOnly], "otra");
    expect(r.weightKg?.value).toBe(71.5);
    expect(r.heightCm?.value).toBe(178);
    expect(r.heightCm?.recordedAt).toEqual(heightOnly.recordedAt);
    expect(r.bodyFatPercent?.value).toBe(20);
    expect(r.waistCm).toBeNull();
    expect(r.hipCm).toBeNull();
    expect(r.basalMetabolicRateKcal).toBeNull();
  });

  it("consultationId null → orden puro por recordedAt", () => {
    const a = entry({ consultationId: "x", weightKg: 60, recordedAt: d("2026-09-10T15:00:00Z"), createdAt: d("2026-09-10T15:00:00Z") });
    const b = entry({ consultationId: "y", weightKg: 65, recordedAt: d("2026-09-11T15:00:00Z"), createdAt: d("2026-09-01T15:00:00Z") });
    expect(pickFormulaMeasurements([a, b], null).weightKg?.value).toBe(65);
  });

  it("un 0 cuenta como dato", () => {
    const a = entry({ consultationId: "x", basalMetabolicRateKcal: 0, recordedAt: d("2026-09-10T15:00:00Z"), createdAt: d("2026-09-10T15:00:00Z") });
    expect(pickFormulaMeasurements([a], null).basalMetabolicRateKcal?.value).toBe(0);
  });

  it("sin entradas → todo null", () => {
    const r = pickFormulaMeasurements([], "c");
    expect(Object.values(r).every((v) => v === null)).toBe(true);
  });
});
