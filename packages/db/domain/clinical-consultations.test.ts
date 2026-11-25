import { CONSULTATION_TEXT } from "@nutri-bot/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  agenda: { findFirst: vi.fn() },
  professional: { findUnique: vi.fn() },
  patient: { findUniqueOrThrow: vi.fn() },
  consultation: { findMany: vi.fn(), findUniqueOrThrow: vi.fn(), create: vi.fn() },
  evolutionEntry: { create: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock("../index", () => ({ prisma: db }));

import { addEvolutionEntryOnDay, addEvolutionEntryToConsultation } from "./clinical";
import { createManualConsultation, FutureConsultationDateError, listConsultationsOnDay } from "./consultations";

const T = { tenantId: "legacy-tenant" };

const tenantId = "legacy-tenant";
const patientId = "p1";
const dayKey = "2020-09-12";
const noon = new Date("2020-09-12T15:00:00Z");
const consultation = { id: "c1", tenantId, patientId, consultedAt: noon, createdAt: noon, appointmentId: null };
const measures = { weightKg: 70 };
const professional = { timezone: "America/Argentina/Buenos_Aires" };
const manual = (day = dayKey) => createManualConsultation(T, { patientId, dayKey: day });
const onDay = (day = dayKey) => addEvolutionEntryOnDay(T, patientId, day, measures);
const inConsultation = () => addEvolutionEntryToConsultation(T, consultation.id, measures);
const entry = { id: "e1", tenantId, patientId, recordedAt: noon, consultationId: consultation.id, ...measures };

beforeEach(() => {
  vi.resetAllMocks();
  db.$transaction.mockImplementation((run) => run(db));
  db.agenda.findFirst.mockResolvedValue({ id: "legacy-agenda", tenantId: "legacy-tenant", professionalId: 1, professional });
  db.professional.findUnique.mockResolvedValue(professional);
  db.patient.findUniqueOrThrow.mockResolvedValue({ id: patientId });
  db.consultation.findMany.mockResolvedValue([]);
  db.consultation.findUniqueOrThrow.mockResolvedValue({ ...consultation, consultedAt: new Date("2020-09-13T01:00:00Z") });
  db.consultation.create.mockResolvedValue(consultation);
  db.evolutionEntry.create.mockResolvedValue(entry);
});

function expectNoWrites() {
  expect(db.consultation.create).not.toHaveBeenCalled();
  expect(db.evolutionEntry.create).not.toHaveBeenCalled();
}

function expectOwnedEntry() {
  const { id, ...data } = entry;
  expect(db.evolutionEntry.create.mock.calls).toEqual([[{ data }]]);
}

function expectOwnedConsultation() {
  expect(db.consultation.create.mock.calls).toEqual([[{ data: { patientId, tenantId, consultedAt: noon } }]]);
}

describe("clinical consultation writes in the original installation", () => {
  it.each([manual, onDay, inConsultation])("fails closed without the verified agenda (%#)", async (run) => {
    db.agenda.findFirst.mockResolvedValue(null);
    await expect(run()).rejects.toThrow("tenant_scope:tenant_scope_missing");
    expectNoWrites();
  });

  it.each(["other-tenant", null])("rejects patients and consultations owned by %s without writes", async (owner) => {
    db.patient.findUniqueOrThrow.mockImplementation(async ({ where }) => {
      if (where.id_tenantId?.tenantId !== owner) throw new Error("Record not found");
      return { id: patientId };
    });
    db.consultation.findUniqueOrThrow.mockImplementation(async ({ where }) => {
      if (where.id_tenantId && where.id_tenantId.tenantId !== owner) throw new Error("Record not found");
      return { ...consultation, tenantId: owner };
    });
    await expect(manual()).rejects.toThrow("Record not found");
    await expect(onDay()).rejects.toThrow("Record not found");
    await expect(inConsultation()).rejects.toThrow("Record not found");
    expect(db.consultation.findMany).not.toHaveBeenCalled();
    expectNoWrites();
  });

  it("only returns owned consultations for the duplicate warning, with the original local date range and ordering", async () => {
    const rows = [consultation, { ...consultation, id: "foreign", tenantId: "other-tenant" },
      { ...consultation, id: "unowned", tenantId: null }];
    db.consultation.findMany.mockImplementation(async ({ where }) =>
      rows.filter((row) => !where.tenantId || row.tenantId === where.tenantId));
    await expect(listConsultationsOnDay(T, patientId, dayKey)).resolves.toEqual([consultation]);
    expect(db.consultation.findMany).toHaveBeenCalledWith({
      where: { patientId, tenantId, consultedAt: { gte: new Date("2020-09-12T03:00:00Z"), lt: new Date("2020-09-13T03:00:00Z") } },
      orderBy: [{ consultedAt: "desc" }, { createdAt: "desc" }],
    });
    db.consultation.findMany.mockClear();
    db.agenda.findFirst.mockResolvedValue(null);
    await expect(listConsultationsOnDay(T, patientId, dayKey)).rejects.toThrow("tenant_scope:tenant_scope_missing");
    expect(db.consultation.findMany).not.toHaveBeenCalled();
    expectNoWrites();
  });

  it("creates an owned manual consultation at local noon even when that day has another one", async () => {
    db.consultation.findMany.mockResolvedValue([consultation]);
    await expect(manual()).resolves.toEqual(consultation);
    expectOwnedConsultation();
    expect(db.consultation.findMany).not.toHaveBeenCalled();
  });

  it("creates both roots for a new day in one transaction", async () => {
    await expect(onDay()).resolves.toEqual({ entry, consultation, consultationCreated: true });
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expectOwnedConsultation();
    expectOwnedEntry();
  });

  it("reuses the preferred owned consultation within the local day, ignoring a foreign or unowned consultation", async () => {
    const rows = [
      { ...consultation, id: "foreign", tenantId: "other-tenant", appointmentId: "a2" },
      { ...consultation, id: "unowned", tenantId: null, appointmentId: "a3" },
      { ...consultation, id: "manual" },
      { ...consultation, appointmentId: "a1" },
    ];
    db.consultation.findMany.mockImplementation(async ({ where }) =>
      rows.filter((row) => !where.tenantId || row.tenantId === where.tenantId));
    await expect(onDay()).resolves.toEqual({ entry, consultation: rows[3], consultationCreated: false });
    expect(db.consultation.findMany.mock.calls).toEqual([[{ where: {
      patientId, tenantId, consultedAt: { gte: new Date("2020-09-12T03:00:00Z"), lt: new Date("2020-09-13T03:00:00Z") },
    } }]]);
    expect(db.consultation.create).not.toHaveBeenCalled();
    expectOwnedEntry();
  });

  it("derives the detail entry's patient and local noon from the owned consultation", async () => {
    await expect(inConsultation()).resolves.toEqual(entry);
    expect(db.consultation.findUniqueOrThrow).toHaveBeenCalledWith(expect.objectContaining({
      where: { id_tenantId: { id: consultation.id, tenantId } },
    }));
    expectOwnedEntry();
  });

  it("preserves invalid and future date errors without writes", async () => {
    await expect(manual("2020-02-30")).rejects.toThrow("Fecha inválida");
    await expect(onDay("2020-02-30")).rejects.toThrow("Fecha inválida");
    expect(db.agenda.findFirst).not.toHaveBeenCalled();
    await expect(manual("2099-01-01")).rejects.toThrow(new FutureConsultationDateError(CONSULTATION_TEXT.futureDate));
    await expect(onDay("2099-01-01")).rejects.toThrow(new FutureConsultationDateError(CONSULTATION_TEXT.futureMeasurementDate));
    expectNoWrites();
  });
});
