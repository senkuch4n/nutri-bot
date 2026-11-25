// HU-025 (025b-2 M8): cada herramienta del asistente consulta solo el consultorio del contexto.
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  patient: { findMany: vi.fn(), findUnique: vi.fn() },
  clinicalRecord: { findUnique: vi.fn() },
  evolutionEntry: { findFirst: vi.fn() },
  nutritionPlan: { count: vi.fn(), findFirst: vi.fn() },
  appointment: { findFirst: vi.fn(), findMany: vi.fn() },
}));
const domain = vi.hoisted(() => ({
  getLatestFormulaMeasurements: vi.fn(),
  getTenantProfessional: vi.fn(),
  listApprovedPaymentsInRange: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@nutri-bot/db", () => ({ prisma: db }));
vi.mock("@nutri-bot/db/domain", () => domain);

import { buscarPaciente, resumenFacturacion, resumenPaciente, turnosAgenda } from "./assistant-tools";

const A = { tenantId: "tenant-a" };

/** Junta todos los `where` que recibió Prisma en esta prueba. */
function allWheres(): unknown[] {
  return Object.values(db).flatMap((model) =>
    Object.values(model).flatMap((fn) => (fn as ReturnType<typeof vi.fn>).mock.calls.map((c) => (c[0] as { where?: unknown })?.where)));
}

beforeEach(() => {
  vi.resetAllMocks();
  domain.getTenantProfessional.mockResolvedValue({ timezone: "UTC", currency: "ARS" });
  domain.getLatestFormulaMeasurements.mockResolvedValue({ weightKg: null, heightCm: null, bodyFatPercent: null });
  domain.listApprovedPaymentsInRange.mockResolvedValue([{ amount: 100 }, { amount: 50 }]);
  db.patient.findMany.mockResolvedValue([]);
  db.appointment.findMany.mockResolvedValue([]);
});

describe("assistant-tools", () => {
  it("buscar_paciente filtra por el tenant del contexto", async () => {
    db.patient.findMany.mockResolvedValue([{ id: "p1", name: "Ana", phone: "351", archivedAt: null }]);
    await expect(buscarPaciente(A, "ana")).resolves.toEqual([{ id: "p1", nombre: "Ana", telefono: "351", archivada: false }]);
    expect(db.patient.findMany).toHaveBeenCalledWith({ where: { tenantId: "tenant-a" }, take: 300 });
  });

  it("resumen_paciente con un id de otro consultorio: no encontrado y no lee nada más", async () => {
    db.patient.findUnique.mockResolvedValue(null);
    await expect(resumenPaciente(A, "paciente-de-b")).resolves.toEqual({ error: "Paciente no encontrado" });
    expect(db.patient.findUnique).toHaveBeenCalledWith({ where: { id_tenantId: { id: "paciente-de-b", tenantId: "tenant-a" } } });
    expect(db.clinicalRecord.findUnique).not.toHaveBeenCalled();
    expect(db.evolutionEntry.findFirst).not.toHaveBeenCalled();
    expect(db.nutritionPlan.count).not.toHaveBeenCalled();
    expect(db.appointment.findFirst).not.toHaveBeenCalled();
    expect(domain.getLatestFormulaMeasurements).not.toHaveBeenCalled();
  });

  it("resumen_paciente: todas las lecturas llevan el tenant del contexto", async () => {
    db.patient.findUnique.mockResolvedValue({ id: "p1", name: "Ana", phone: "351", archivedAt: null, activityLevel: null, sex: null, birthDate: null, nutritionGoal: null });
    db.nutritionPlan.count.mockResolvedValue(0);
    await resumenPaciente(A, "p1");
    expect(domain.getLatestFormulaMeasurements).toHaveBeenCalledWith(A, "p1");
    expect(domain.getTenantProfessional).toHaveBeenCalledWith("tenant-a");
    const wheres = allWheres();
    expect(wheres).toHaveLength(6);
    for (const where of wheres) expect(JSON.stringify(where)).toContain('"tenantId":"tenant-a"');
  });

  it("turnos_agenda y resumen_facturacion: solo el consultorio del contexto", async () => {
    await turnosAgenda(A, "2026-11-01T00:00:00Z", "2026-11-30T00:00:00Z");
    expect(db.appointment.findMany.mock.calls[0]![0].where.tenantId).toBe("tenant-a");
    await expect(resumenFacturacion(A, "2026-11-01T00:00:00Z", "2026-11-30T00:00:00Z")).resolves.toMatchObject({ cantidad_pagos: 2 });
    expect(domain.listApprovedPaymentsInRange.mock.calls[0]![0]).toBe(A);
  });

  it("fechas inválidas: no consulta", async () => {
    await expect(turnosAgenda(A, "x", "y")).resolves.toEqual({ error: "Fechas inválidas, usá formato ISO 8601" });
    expect(db.appointment.findMany).not.toHaveBeenCalled();
  });
});
