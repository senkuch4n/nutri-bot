// HU-019: archivar / desarchivar pacientes (prisma mockeado, sin base).
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const calls: string[] = [];
  return {
    calls,
    prisma: {
      $transaction: vi.fn(),
      $queryRaw: vi.fn(),
      patient: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
      appointment: { findMany: vi.fn() },
    },
  };
});

vi.mock("../index", () => ({ prisma: mocks.prisma }));

import { archivePatient, unarchivePatient } from "./patients";

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
    const r = await archivePatient("p1", NOW);
    expect(r).toEqual({ ok: true, archivedAt: NOW });
    expect(mocks.prisma.patient.update).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { archivedAt: NOW },
    });
    expect(mocks.calls).toEqual(["lock", "findMany"]);
    const sql = (mocks.prisma.$queryRaw.mock.calls[0]![0] as TemplateStringsArray).join("");
    expect(sql).toContain('FROM "Professional" WHERE id = 1 FOR UPDATE');
  });

  it("filtra CONFIRMED/AWAITING_PAYMENT desde now, ordenado por startsAt", async () => {
    await archivePatient("p1", NOW);
    expect(mocks.prisma.appointment.findMany).toHaveBeenCalledWith({
      where: { patientId: "p1", status: { in: ["CONFIRMED", "AWAITING_PAYMENT"] }, startsAt: { gte: NOW } },
      orderBy: { startsAt: "asc" },
      select: { startsAt: true, status: true },
    });
  });

  it("con un CONFIRMED futuro: pending_appointments con moreCount 0 y sin escribir", async () => {
    const startsAt = new Date("2026-10-30T13:00:00Z");
    mocks.prisma.appointment.findMany.mockResolvedValue([{ startsAt, status: "CONFIRMED" }]);
    const r = await archivePatient("p1", NOW);
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
    const r = await archivePatient("p1", NOW);
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
    const r = await archivePatient("p1", NOW);
    expect(r).toEqual({ ok: true, archivedAt: ARCHIVED_BEFORE });
    expect(mocks.prisma.patient.update).not.toHaveBeenCalled();
  });

  it("paciente inexistente: not_found, sin buscar turnos ni escribir", async () => {
    mocks.prisma.patient.findUnique.mockResolvedValue(null);
    const r = await archivePatient("nope", NOW);
    expect(r).toEqual({ ok: false, reason: "not_found" });
    expect(mocks.prisma.appointment.findMany).not.toHaveBeenCalled();
    expect(mocks.prisma.patient.update).not.toHaveBeenCalled();
  });
});

describe("unarchivePatient", () => {
  beforeEach(() => vi.resetAllMocks());

  it("pone archivedAt en null", async () => {
    mocks.prisma.patient.updateMany.mockResolvedValue({ count: 1 });
    await expect(unarchivePatient("p1")).resolves.toEqual({ ok: true });
    expect(mocks.prisma.patient.updateMany).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { archivedAt: null },
    });
  });

  it("count 0 → not_found", async () => {
    mocks.prisma.patient.updateMany.mockResolvedValue({ count: 0 });
    await expect(unarchivePatient("nope")).resolves.toEqual({ ok: false, reason: "not_found" });
  });
});
