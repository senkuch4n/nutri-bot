// HU-020 (T13): no se aplica un borrador importado (domain mockeado, sin base).
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class TemplateNotPublishedError extends Error {}
  class TemplateApplicationUnavailableError extends Error {}
  return {
    TemplateNotPublishedError,
    TemplateApplicationUnavailableError,
    access: vi.fn(),
    createPlan: vi.fn(),
    applyTemplateToPatient: vi.fn(),
    getTemplate: vi.fn(),
    revalidatePath: vi.fn(),
    redirect: vi.fn(),
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
vi.mock("@nutri-bot/db/domain", () => ({
  TemplateNotPublishedError: mocks.TemplateNotPublishedError,
  TemplateApplicationUnavailableError: mocks.TemplateApplicationUnavailableError,
  createPlan: mocks.createPlan,
  applyTemplateToPatient: mocks.applyTemplateToPatient,
  getTemplate: mocks.getTemplate,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

vi.mock("@/lib/private-content-access", () => ({ resolvePrivateContentAccess: mocks.access }));

import { applyTemplateAction, createPlanAction } from "./actions";

const DRAFT_ERROR = "Esta plantilla es un borrador: publicala antes de aplicarla.";

function form(): FormData {
  const fd = new FormData();
  fd.set("patientId", "pat1");
  fd.set("templateId", "t1");
  return fd;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.access.mockResolvedValue({ tenantId: "tenantA", role: "STAFF" });
});

describe("applyTemplateAction", () => {
  it("denies missing membership without reads, writes or navigation", async () => {
    mocks.access.mockResolvedValue(null);
    expect(await applyTemplateAction({ ok: false }, form())).toEqual({ ok: false, error: "Plantilla no encontrada" });
    expect(mocks.getTemplate).not.toHaveBeenCalled();
    expect(mocks.applyTemplateToPatient).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("gives the same error for unavailable source, destination or recipe", async () => {
    mocks.applyTemplateToPatient.mockRejectedValue(new mocks.TemplateApplicationUnavailableError());
    expect(await applyTemplateAction({ ok: false }, form())).toEqual({ ok: false, error: "Plantilla no encontrada" });
    expect(mocks.getTemplate).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("preserves the draft error from the effective read", async () => {
    mocks.getTemplate.mockResolvedValue({ id: "t1", status: "PUBLISHED", meals: [] });
    mocks.applyTemplateToPatient.mockRejectedValue(new mocks.TemplateNotPublishedError());
    expect(await applyTemplateAction({ ok: false }, form())).toEqual({ ok: false, error: DRAFT_ERROR });
  });

  it("publicada → aplica y redirige al plan", async () => {
    mocks.getTemplate.mockResolvedValue({ id: "t1", status: "PUBLISHED", meals: [] });
    mocks.applyTemplateToPatient.mockResolvedValue({ id: "plan1" });
    const data = form();
    data.set("tenantId", "tenantB");
    await applyTemplateAction({ ok: false }, data);
    expect(mocks.getTemplate).not.toHaveBeenCalled();
    expect(mocks.applyTemplateToPatient).toHaveBeenCalledWith("t1", "pat1", "tenantA");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/pacientes/pat1");
    expect(mocks.redirect).toHaveBeenCalledWith("/pacientes/pat1/planes/plan1");
  });
});

it("preserves manual plan creation without private-content membership", async () => {
  mocks.access.mockResolvedValue(null);
  mocks.createPlan.mockResolvedValue({ id: "plan1" });
  const data = form();
  data.set("title", "Manual plan");
  await createPlanAction({ ok: false }, data);
  expect(mocks.access).not.toHaveBeenCalled();
  expect(mocks.createPlan).toHaveBeenCalledWith(TENANT_CTX, "pat1", { title: "Manual plan" });
  expect(mocks.revalidatePath).toHaveBeenCalledWith("/pacientes/pat1");
  expect(mocks.redirect).toHaveBeenCalledWith("/pacientes/pat1/planes/plan1");
});
