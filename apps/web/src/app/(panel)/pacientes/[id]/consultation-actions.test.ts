// HU-017c-3 (D12a): el borrado de la consulta es diferido, así que la action ya no redirige: devuelve
// el resultado y el cliente navega al programar el borrado.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class ConsultationNotDeletableError extends Error {}
  return {
    revalidatePath: vi.fn(),
    redirect: vi.fn(),
    deleteConsultation: vi.fn(),
    belongs: vi.fn(),
    ConsultationNotDeletableError,
  };
});
// HU-025b-1: el consultorio sale del contexto de la sesión.
const TENANT_CTX = vi.hoisted(() => ({
  userId: "u", tenantId: "legacy-tenant", agendaId: "legacy-agenda", professionalId: 1,
  access: { kind: "member" as const, tenantId: "legacy-tenant", role: "OWNER" as const },
}));
vi.mock("@/lib/tenant-context", () => ({
  requireTenantContext: async () => TENANT_CTX,
  requirePageContext: async () => TENANT_CTX,
  getTenantContext: async () => TENANT_CTX,
  TenantAccessError: class TenantAccessError extends Error {},
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@nutri-bot/db", () => ({ prisma: {} }));
vi.mock("@nutri-bot/db/domain", () => ({
  AppointmentConsultationDateError: class extends Error {},
  ConsultationNotDeletableError: mocks.ConsultationNotDeletableError,
  ConsultationPlanMismatchError: class extends Error {},
  FutureConsultationDateError: class extends Error {},
  deleteConsultation: mocks.deleteConsultation,
}));
vi.mock("@/lib/consultation-guard", () => ({ belongsToPatient: mocks.belongs }));

import { CONSULTATION_TEXT } from "@nutri-bot/core";
import { deleteConsultationAction } from "./consultation-actions";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.belongs.mockResolvedValue(true);
  mocks.deleteConsultation.mockResolvedValue(undefined);
});

describe("deleteConsultationAction", () => {
  it("si sale bien, borra, revalida la ficha y devuelve { ok: true } sin redirect", async () => {
    await expect(deleteConsultationAction("p1", "c1")).resolves.toEqual({ ok: true });
    expect(mocks.deleteConsultation).toHaveBeenCalledWith(TENANT_CTX, "c1");
    expect(mocks.belongs).toHaveBeenCalledWith(TENANT_CTX, "p1", "c1");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/pacientes/p1");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("no borrable → CONSULTATION_TEXT.notDeletable", async () => {
    mocks.deleteConsultation.mockRejectedValue(new mocks.ConsultationNotDeletableError("x"));
    await expect(deleteConsultationAction("p1", "c1")).resolves.toEqual({
      ok: false,
      error: CONSULTATION_TEXT.notDeletable,
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("una consulta de otro paciente no se borra", async () => {
    mocks.belongs.mockResolvedValue(false);
    const res = await deleteConsultationAction("p1", "c-otro");
    expect(res.ok).toBe(false);
    expect(mocks.deleteConsultation).not.toHaveBeenCalled();
  });
});

describe("HU-025: consulta de otro consultorio", () => {
  it("belongsToPatient con el contexto de A da false para una consulta de B → Datos inválidos, sin borrar", async () => {
    mocks.belongs.mockImplementation(async (t: { tenantId: string }, _p: string, c: string) => t.tenantId === "legacy-tenant" && c !== "c-de-b");
    await expect(deleteConsultationAction("p1", "c-de-b")).resolves.toEqual({ ok: false, error: "Datos inválidos" });
    expect(mocks.deleteConsultation).not.toHaveBeenCalled();
  });
});
