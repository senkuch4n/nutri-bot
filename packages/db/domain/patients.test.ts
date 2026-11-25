// HU-019: archivar / desarchivar pacientes (prisma mockeado, sin base).
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const calls: string[] = [];
  return {
    calls,
    prisma: {
      $transaction: vi.fn(),
      $queryRaw: vi.fn(),
      agenda: { findFirst: vi.fn() },
      patient: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), upsert: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
      appointment: { findMany: vi.fn() },
    },
  };
});

vi.mock("../index", () => ({ prisma: mocks.prisma }));

import * as patients from "./patients";
import { archivePatient, findOrCreatePatient, findOrCreatePatientByJid, unarchivePatient } from "./patients";

const T = { tenantId: "legacy-tenant" };

it("reads a JID only within the verified original agenda's tenant", async () => {
  vi.resetAllMocks();
  const whatsappJid = "123@s.whatsapp.net";
  const patient = { id: "own", whatsappJid, tenantId: "legacy-tenant" };
  const notFound = new Error("Patient not found");
  mocks.prisma.agenda.findFirst.mockResolvedValue({ id: "legacy-agenda", tenantId: "legacy-tenant", professionalId: 1, professional: {} });
  mocks.prisma.patient.findUniqueOrThrow.mockResolvedValueOnce(patient).mockRejectedValueOnce(notFound);
  await expect(patients.findPatientByJidOrThrow(T, whatsappJid)).resolves.toBe(patient);
  await expect(patients.findPatientByJidOrThrow(T, whatsappJid)).rejects.toBe(notFound);
  expect(mocks.prisma.patient.findUniqueOrThrow).toHaveBeenCalledTimes(2);
  for (const args of mocks.prisma.patient.findUniqueOrThrow.mock.calls) {
    expect(args).toEqual([{ where: { tenantId_whatsappJid: { tenantId: "legacy-tenant", whatsappJid } } }]);
  }
  mocks.prisma.agenda.findFirst.mockResolvedValue(null);
  await expect(patients.findPatientByJidOrThrow(T, whatsappJid)).rejects.toThrow("tenant_scope:tenant_scope_missing");
  expect(mocks.prisma.patient.findUniqueOrThrow).toHaveBeenCalledTimes(2);
  expect(mocks.prisma.patient.upsert).not.toHaveBeenCalled();
});

it.each(["panel", "bot"])("%s keeps the global JID key but refuses to update a foreign or unowned patient", async (caller) => {
  vi.resetAllMocks();
  const whatsappJid = "123@s.whatsapp.net";
  const book = () => caller === "panel" ? findOrCreatePatient(T, { phone: "123", name: "Nueva" }) : findOrCreatePatientByJid(T, whatsappJid);
  mocks.prisma.agenda.findFirst.mockResolvedValue({ id: "legacy-agenda", tenantId: "legacy-tenant", professionalId: 1, professional: {} });
  const duplicate = new Error("Global JID already exists");
  for (const tenantId of ["other-tenant", null, "legacy-tenant"]) {
    const patient = { whatsappJid, tenantId, name: "Original" };
    mocks.prisma.patient.upsert.mockImplementation(async ({ where, update }) => {
      const identity = where.tenantId_whatsappJid ?? where;
      if (identity.tenantId !== undefined && identity.tenantId !== patient.tenantId) throw duplicate;
      return Object.assign(patient, update);
    });
    if (tenantId === "legacy-tenant") {
      await expect(book()).resolves.toBe(patient);
    } else {
      await expect(book()).rejects.toBe(duplicate);
      expect(patient).toEqual({ whatsappJid, tenantId, name: "Original" });
    }
  }
  expect(mocks.prisma.patient.upsert).toHaveBeenLastCalledWith({
    where: { tenantId_whatsappJid: { whatsappJid, tenantId: "legacy-tenant" } },
    update: caller === "panel" ? { name: "Nueva" } : {},
    create: { whatsappJid, phone: "123", tenantId: "legacy-tenant", ...(caller === "panel" ? { name: "Nueva" } : {}) },
  });
});

const NOW = new Date("2026-10-24T15:00:00Z");
const ARCHIVED_BEFORE = new Date("2026-09-01T12:00:00Z");

describe("archivePatient", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.calls.length = 0;
    mocks.prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(mocks.prisma));
    mocks.prisma.$queryRaw.mockImplementation(async () => {
      mocks.calls.push("lock");
      return [];
    });
    mocks.prisma.patient.findUnique.mockResolvedValue({ id: "p1", archivedAt: null });
    mocks.prisma.appointment.findMany.mockImplementation(async () => {
      mocks.calls.push("findMany");
      return [];
    });
    mocks.prisma.patient.update.mockResolvedValue({});
  });

  it("sin pendientes: archiva con now, toma el lock antes de buscar turnos", async () => {
    const r = await archivePatient(T, "p1", NOW);
    expect(r).toEqual({ ok: true, archivedAt: NOW });
    expect(mocks.prisma.patient.update).toHaveBeenCalledWith({
      where: { id_tenantId: { id: "p1", tenantId: "legacy-tenant" } },
      data: { archivedAt: NOW },
    });
    expect(mocks.calls).toEqual(["lock", "findMany"]);
    const sql = (mocks.prisma.$queryRaw.mock.calls[0]![0] as TemplateStringsArray).join("");
    expect(sql).toContain("FOR UPDATE OF p");
    expect(mocks.prisma.$queryRaw.mock.calls[0]!.slice(1)).toEqual(["legacy-tenant"]);
    expect(mocks.prisma.patient.findUnique.mock.calls[0]![0].where).toEqual({ id_tenantId: { id: "p1", tenantId: "legacy-tenant" } });
  });

  it("filtra CONFIRMED/AWAITING_PAYMENT desde now, ordenado por startsAt", async () => {
    await archivePatient(T, "p1", NOW);
    expect(mocks.prisma.appointment.findMany).toHaveBeenCalledWith({
      where: { patientId: "p1", tenantId: "legacy-tenant", status: { in: ["CONFIRMED", "AWAITING_PAYMENT"] }, startsAt: { gte: NOW } },
      orderBy: { startsAt: "asc" },
      select: { startsAt: true, status: true },
    });
  });

  it("con un CONFIRMED futuro: pending_appointments con moreCount 0 y sin escribir", async () => {
    const startsAt = new Date("2026-10-30T13:00:00Z");
    mocks.prisma.appointment.findMany.mockResolvedValue([{ startsAt, status: "CONFIRMED" }]);
    const r = await archivePatient(T, "p1", NOW);
    expect(r).toEqual({
      ok: false,
      reason: "pending_appointments",
      next: { startsAt, status: "CONFIRMED" },
      moreCount: 0,
    });
    expect(mocks.prisma.patient.update).not.toHaveBeenCalled();
  });

  it("con 3 pendientes (incluye AWAITING_PAYMENT): next = el más cercano, moreCount 2", async () => {
    const a = new Date("2026-10-26T13:00:00Z");
    mocks.prisma.appointment.findMany.mockResolvedValue([
      { startsAt: a, status: "AWAITING_PAYMENT" },
      { startsAt: new Date("2026-11-02T13:00:00Z"), status: "CONFIRMED" },
      { startsAt: new Date("2026-11-09T13:00:00Z"), status: "CONFIRMED" },
    ]);
    const r = await archivePatient(T, "p1", NOW);
    expect(r).toEqual({
      ok: false,
      reason: "pending_appointments",
      next: { startsAt: a, status: "AWAITING_PAYMENT" },
      moreCount: 2,
    });
    expect(mocks.prisma.patient.update).not.toHaveBeenCalled();
  });

  it("ya archivada: ok con la fecha original, sin escribir", async () => {
    mocks.prisma.patient.findUnique.mockResolvedValue({ id: "p1", archivedAt: ARCHIVED_BEFORE });
    const r = await archivePatient(T, "p1", NOW);
    expect(r).toEqual({ ok: true, archivedAt: ARCHIVED_BEFORE });
    expect(mocks.prisma.patient.update).not.toHaveBeenCalled();
  });

  it("paciente inexistente: not_found, sin buscar turnos ni escribir", async () => {
    mocks.prisma.patient.findUnique.mockResolvedValue(null);
    const r = await archivePatient(T, "nope", NOW);
    expect(r).toEqual({ ok: false, reason: "not_found" });
    expect(mocks.prisma.appointment.findMany).not.toHaveBeenCalled();
    expect(mocks.prisma.patient.update).not.toHaveBeenCalled();
  });
});

describe("unarchivePatient", () => {
  beforeEach(() => vi.resetAllMocks());

  it("pone archivedAt en null", async () => {
    mocks.prisma.patient.updateMany.mockResolvedValue({ count: 1 });
    await expect(unarchivePatient(T, "p1")).resolves.toEqual({ ok: true });
    expect(mocks.prisma.patient.updateMany).toHaveBeenCalledWith({
      where: { id: "p1", tenantId: "legacy-tenant" },
      data: { archivedAt: null },
    });
  });

  it("count 0 → not_found", async () => {
    mocks.prisma.patient.updateMany.mockResolvedValue({ count: 0 });
    await expect(unarchivePatient(T, "nope")).resolves.toEqual({ ok: false, reason: "not_found" });
  });
});

describe("HU-025: paciente de otro consultorio = inexistente", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(mocks.prisma));
    mocks.prisma.$queryRaw.mockResolvedValue([{ id: 1 }]);
  });

  it("archivar con el contexto de A un paciente de B → not_found sin escribir", async () => {
    // La clave compuesta (id, tenantId) de A no encuentra al paciente de B.
    mocks.prisma.patient.findUnique.mockImplementation(async ({ where }) =>
      where.id_tenantId?.tenantId === "tenant-b" ? { id: "pb", archivedAt: null } : null);
    await expect(archivePatient({ tenantId: "tenant-a" }, "pb", NOW)).resolves.toEqual({ ok: false, reason: "not_found" });
    expect(mocks.prisma.appointment.findMany).not.toHaveBeenCalled();
    expect(mocks.prisma.patient.update).not.toHaveBeenCalled();
  });

  it("desarchivar con el contexto de A un paciente de B → not_found", async () => {
    mocks.prisma.patient.updateMany.mockResolvedValue({ count: 0 });
    await expect(unarchivePatient({ tenantId: "tenant-a" }, "pb")).resolves.toEqual({ ok: false, reason: "not_found" });
    expect(mocks.prisma.patient.updateMany.mock.calls[0]![0].where).toEqual({ id: "pb", tenantId: "tenant-a" });
  });
});
