import { beforeEach, expect, it, vi } from "vitest";
import type { PrescriptionChoices } from "@nutri-bot/core";

const db = vi.hoisted(() => ({
  agenda: { findFirst: vi.fn() },
  consultation: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn() },
  evolutionEntry: { findMany: vi.fn() },
  nutritionPrescription: { findFirst: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn(), upsert: vi.fn() },
}));
vi.mock("../index", () => ({ prisma: db }));

import {
  deleteConsultationPrescription, getReferencePrescription, getRequirementContextForConsultation,
  listLatestPrescriptions, saveConsultationPrescription,
} from "./prescriptions";

const T = { tenantId: "legacy-tenant" };

const tenantId = "legacy-tenant";
const consultationId = "c1";
const patientId = "p1";
const owned = { tenantId, patient: { tenantId } };
const consultedAt = new Date("2026-09-23T01:00:00Z");
const choices: PrescriptionChoices = {
  bmrFormula: "MIFFLIN_ST_JEOR", weightBasis: "ACTUAL", bodyFatSource: "MEASURED",
  activityLevel: "LIGHT", nutritionGoal: "LOSE_WEIGHT", adjustmentRange: "MODERATE_DEFICIT",
  adjustmentPercent: -20, prescribedVctKcal: 1481,
  macros: { mode: "PERCENT_OF_VCT", proteinPercent: 20, fatPercent: 30, carbPercent: 50 },
};

beforeEach(() => {
  vi.resetAllMocks();
  db.agenda.findFirst.mockResolvedValue({ id: "legacy-agenda", tenantId: "legacy-tenant", professionalId: 1, professional: { timezone: "America/Argentina/Buenos_Aires" } });
  db.consultation.findUniqueOrThrow.mockResolvedValue({
    id: consultationId, consultedAt, patient: { id: patientId, sex: "FEMALE", birthDate: new Date("1992-03-20") },
  });
  db.evolutionEntry.findMany.mockResolvedValue([{
    consultationId, recordedAt: consultedAt, createdAt: consultedAt,
    weightKg: 66.5, heightCm: 162, waistCm: null, hipCm: null, bodyFatPercent: 29.4, basalMetabolicRateKcal: null,
  }]);
});

it("scopes calculator context and keeps the verified agenda's local-day cutoff", async () => {
  await expect(getRequirementContextForConsultation(T, consultationId)).resolves.toMatchObject({
    ageYears: 34, ctx: { actualWeightKg: 66.5, heightCm: 162 },
  });
  expect(db.consultation.findUniqueOrThrow).toHaveBeenNthCalledWith(1, expect.objectContaining({ where: { id: consultationId, ...owned } }));
  expect(db.evolutionEntry.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
    recordedAt: { lt: new Date("2026-09-23T03:00:00Z") },
  }) }));
});

it("does not look for a reference when the anchor consultation does not belong to the patient and tenant", async () => {
  db.consultation.findUnique.mockResolvedValue(null);
  db.nutritionPrescription.findFirst.mockResolvedValue({ adjustmentPercent: -10 });
  await expect(getReferencePrescription(T, { patientId, consultationId, consultedAt })).resolves.toBeNull();
  expect(db.consultation.findUnique).toHaveBeenCalledWith({ where: { id: consultationId, patientId, ...owned }, select: { consultedAt: true } });
  expect(db.nutritionPrescription.findFirst).not.toHaveBeenCalled();
});

it("uses the owned reference history and persisted date, preserving ordering and conversion", async () => {
  db.consultation.findUnique.mockResolvedValue({ consultedAt });
  db.nutritionPrescription.findFirst.mockResolvedValue({ proteinPercent: "20", proteinGPerKg: null });
  await expect(getReferencePrescription(T, { patientId, consultationId, consultedAt: new Date(0) })).resolves.toMatchObject({ proteinPercent: 20, proteinGPerKg: null });
  expect(db.nutritionPrescription.findFirst).toHaveBeenCalledWith(expect.objectContaining({
    where: { consultation: { patientId, ...owned, id: { not: consultationId }, consultedAt: { lte: consultedAt } } },
    orderBy: [{ consultation: { consultedAt: "desc" } }, { consultation: { createdAt: "desc" } }],
  }));
});

it("scopes the latest list without changing its order or limit", async () => {
  db.nutritionPrescription.findMany.mockResolvedValue([{ consultation: { id: consultationId, consultedAt } }]);
  await expect(listLatestPrescriptions(T, patientId, 2)).resolves.toEqual([{ consultation: { id: consultationId, consultedAt } }]);
  expect(db.nutritionPrescription.findMany).toHaveBeenCalledWith({
    where: { consultation: { patientId, ...owned } },
    include: { consultation: { select: { id: true, consultedAt: true } } },
    orderBy: [{ consultation: { consultedAt: "desc" } }, { consultation: { createdAt: "desc" } }], take: 2,
  });
});

it("deletes only owned prescriptions and remains idempotent", async () => {
  const ids = new Set(["foreign", consultationId]);
  db.nutritionPrescription.deleteMany.mockImplementation(async ({ where }) => {
    if (where.consultation && where.consultation.tenantId === tenantId && where.consultation.patient.tenantId === tenantId && where.consultationId === "foreign") return;
    ids.delete(where.consultationId);
  });
  for (const id of ["foreign", consultationId, consultationId]) await expect(deleteConsultationPrescription(T, id)).resolves.toBeUndefined();
  expect([...ids]).toEqual(["foreign"]);
});

it("guards both upsert branches and preserves the server-computed snapshot", async () => {
  db.nutritionPrescription.upsert.mockImplementation(async ({ update }) => update);
  await expect(saveConsultationPrescription(T, { consultationId, choices })).resolves.toMatchObject({
    prescribedVctKcal: 1481, bodyFatRecordedAt: consultedAt,
  });
  expect(db.nutritionPrescription.upsert).toHaveBeenCalledWith({
    where: { consultationId, consultation: { patientId, ...owned } },
    create: expect.objectContaining({ consultation: { connect: { id_tenantId: { id: consultationId, tenantId }, patientId, patient: { tenantId } } } }),
    update: expect.objectContaining({ prescribedVctKcal: 1481, bodyFatRecordedAt: consultedAt }),
  });
});

it("never upserts after an out-of-scope consultation lookup", async () => {
  db.consultation.findUniqueOrThrow.mockImplementation(async ({ where }) => {
    if (where.tenantId === tenantId && where.patient?.tenantId === tenantId) throw new Error("Record not found");
    return { id: consultationId, consultedAt, patient: { id: patientId, sex: "FEMALE", birthDate: new Date("1992-03-20") } };
  });
  await expect(saveConsultationPrescription(T, { consultationId, choices })).rejects.toThrow("Record not found");
  expect(db.evolutionEntry.findMany).not.toHaveBeenCalled();
  expect(db.nutritionPrescription.upsert).not.toHaveBeenCalled();
});

it("does not access prescription data without the verified original agenda", async () => {
  db.agenda.findFirst.mockResolvedValue(null);
  for (const run of [() => getRequirementContextForConsultation(T, consultationId),
    () => getReferencePrescription(T, { patientId, consultationId, consultedAt }), () => listLatestPrescriptions(T, patientId, 2),
    () => deleteConsultationPrescription(T, consultationId), () => saveConsultationPrescription(T, { consultationId, choices })]) {
    await expect(run()).rejects.toThrow("tenant_scope:tenant_scope_missing");
  }
  for (const query of [...Object.values(db.consultation), ...Object.values(db.nutritionPrescription)]) expect(query).not.toHaveBeenCalled();
});
