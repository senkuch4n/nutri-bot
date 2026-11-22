import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  agenda: { findFirst: vi.fn() },
  clinicalRecord: { findUnique: vi.fn(), upsert: vi.fn() },
  consultation: { findUniqueOrThrow: vi.fn() },
  evolutionEntry: { findMany: vi.fn(), delete: vi.fn() },
}));
vi.mock("../index", () => ({ prisma: db }));

import { deleteEvolutionEntry, getClinicalRecord, getFormulaMeasurementsAsOf, getLatestFormulaMeasurements, listEvolutionEntries, upsertClinicalRecord } from "./clinical";

const T = { tenantId: "legacy-tenant" };

const tenantId = "legacy-tenant";
const patientId = "p1";
const patient = { tenantId };
const data = { background: "updated", goals: null, riskFlag: true };

beforeEach(() => {
  vi.resetAllMocks();
  db.agenda.findFirst.mockResolvedValue({ id: "legacy-agenda", tenantId: "legacy-tenant", professionalId: 1, professional: { timezone: "America/Argentina/Buenos_Aires" } });
});

describe("private clinical records", () => {
  it.each(["other-tenant", null])("does not read or update a record of patient owner %s", async (owner) => {
    const record = { patientId, background: "original" };
    db.clinicalRecord.findUnique.mockImplementation(async ({ where }) => !where.patient || where.patient.tenantId === owner ? record : null);
    db.clinicalRecord.upsert.mockImplementation(async ({ where, update, create }) => {
      if (where.patient && where.patient.tenantId !== owner) {
        expect(create.patient.connect.id_tenantId).toEqual({ id: patientId, tenantId });
        throw new Error("Record not found");
      }
      return Object.assign(record, update);
    });
    await expect(getClinicalRecord(T, patientId)).resolves.toBeNull();
    await expect(upsertClinicalRecord(T, patientId, data)).rejects.toThrow("Record not found");
    expect(record).toEqual({ patientId, background: "original" });
  });

  it("preserves null when missing and uses the owned patient for creation and updates", async () => {
    const record = { id: "r1", patientId, ...data };
    db.clinicalRecord.findUnique.mockResolvedValueOnce(null).mockResolvedValue(record);
    db.clinicalRecord.upsert.mockResolvedValue(record);
    await expect(getClinicalRecord(T, patientId)).resolves.toBeNull();
    await expect(upsertClinicalRecord(T, patientId, data)).resolves.toEqual(record);
    await expect(getClinicalRecord(T, patientId)).resolves.toEqual(record);
    expect(db.clinicalRecord.findUnique).toHaveBeenCalledWith({ where: { patientId, patient } });
    expect(db.clinicalRecord.upsert).toHaveBeenCalledWith({
      where: { patientId, patient }, update: data,
      create: { ...data, patient: { connect: { id_tenantId: { id: patientId, tenantId } } } },
    });
  });
});

describe("private evolution entries", () => {
  it("lists only owned entries and deletes only an entry whose patient also belongs to the original installation", async () => {
    const own = { id: "e1", patientId, tenantId, patient };
    const rows = [own, { ...own, id: "e2", tenantId: "other-tenant" }, { ...own, id: "e3", tenantId: null },
      { ...own, id: "e4", patient: { tenantId: "other-tenant" } }];
    const matches = (row: typeof rows[number], where: { id?: string; patientId?: string; tenantId?: string; patient?: typeof patient }) =>
      (!where.id || where.id === row.id) && (!where.patientId || where.patientId === row.patientId) &&
      (!where.tenantId || where.tenantId === row.tenantId) && (!where.patient || where.patient.tenantId === row.patient.tenantId);
    db.evolutionEntry.findMany.mockImplementation(async ({ where }) => rows.filter((row) => matches(row, where)));
    db.evolutionEntry.delete.mockImplementation(async ({ where }) => {
      const index = rows.findIndex((row) => matches(row, where));
      if (index < 0) throw new Error("Record not found");
      return rows.splice(index, 1)[0];
    });
    await expect(listEvolutionEntries(T, patientId)).resolves.toEqual([own]);
    expect(db.evolutionEntry.findMany).toHaveBeenCalledWith({ where: { patientId, tenantId, patient }, orderBy: { recordedAt: "desc" } });
    for (const id of ["e2", "e3", "e4", "missing"]) await expect(deleteEvolutionEntry(T, id)).rejects.toThrow("Record not found");
    expect(rows).toHaveLength(4);
    await expect(deleteEvolutionEntry(T, own.id)).resolves.toEqual(own);
    await expect(listEvolutionEntries(T, patientId)).resolves.toEqual([]);
    expect(rows.map(({ id }) => id)).toEqual(["e2", "e3", "e4"]);
  });
});

describe("formula measurements", () => {
  const consultationId = "c1";
  const until = new Date("2026-09-23T03:00:00Z");
  const params = { patientId, consultationId, until };

  it("rejects a mismatched consultation before reading measurements", async () => {
    db.consultation.findUniqueOrThrow.mockRejectedValue(new Error("Record not found"));
    await expect(getFormulaMeasurementsAsOf(T, params)).rejects.toThrow("Record not found");
    expect(db.consultation.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: consultationId, patientId, tenantId, patient }, select: { id: true },
    });
    expect(db.evolutionEntry.findMany).not.toHaveBeenCalled();
  });

  it("scopes the as-of selection and keeps consultation priority and independent fallback", async () => {
    const recordedAt = new Date("2026-09-22T15:00:00Z");
    const earlier = new Date("2026-09-20T15:00:00Z");
    const row = { createdAt: recordedAt, waistCm: null, hipCm: null, bodyFatPercent: null, basalMetabolicRateKcal: null };
    db.consultation.findUniqueOrThrow.mockResolvedValue({ id: consultationId });
    db.evolutionEntry.findMany.mockResolvedValue([
      { ...row, consultationId, recordedAt: earlier, weightKg: 60, heightCm: null },
      { ...row, consultationId: null, recordedAt, weightKg: 70, heightCm: 162 },
    ]);
    const result = await getFormulaMeasurementsAsOf(T, params);
    expect(result.weightKg).toMatchObject({ value: 60, recordedAt: earlier, consultationId });
    expect(result.heightCm).toMatchObject({ value: 162, recordedAt, consultationId: null });
    expect(db.evolutionEntry.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {
      patientId, tenantId, patient, recordedAt: { lt: until },
      OR: [{ consultationId: null }, { consultation: { patientId, tenantId } }],
    } }));
  });

  it("scopes the latest measurement without requiring a consultation or adding a cutoff", async () => {
    db.evolutionEntry.findMany.mockResolvedValue([]);
    await expect(getLatestFormulaMeasurements(T, patientId)).resolves.toEqual({ weightKg: null, heightCm: null, bodyFatPercent: null });
    expect(db.evolutionEntry.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {
      patientId, tenantId, patient, OR: [{ consultationId: null }, { consultation: { patientId, tenantId } }],
    } }));
    expect(db.consultation.findUniqueOrThrow).not.toHaveBeenCalled();
  });
});

it("does not touch clinical data without the verified original agenda", async () => {
  db.agenda.findFirst.mockResolvedValue(null);
  for (const run of [() => getClinicalRecord(T, patientId), () => upsertClinicalRecord(T, patientId, data),
    () => listEvolutionEntries(T, patientId), () => deleteEvolutionEntry(T, "e1"), () => getLatestFormulaMeasurements(T, patientId)]) {
    await expect(run()).rejects.toThrow("tenant_scope:tenant_scope_missing");
  }
  for (const query of [...Object.values(db.clinicalRecord), ...Object.values(db.evolutionEntry)]) expect(query).not.toHaveBeenCalled();
});
