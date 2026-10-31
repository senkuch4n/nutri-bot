// HU-020 (T13): no se aplica un borrador importado (domain mockeado, sin base).
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class TemplateNotPublishedError extends Error {}
  return {
    TemplateNotPublishedError,
    createPlan: vi.fn(),
    applyTemplateToPatient: vi.fn(),
    getTemplate: vi.fn(),
    revalidatePath: vi.fn(),
    redirect: vi.fn(),
  };
});

vi.mock("@nutri-bot/db/domain", () => ({
  TemplateNotPublishedError: mocks.TemplateNotPublishedError,
  createPlan: mocks.createPlan,
  applyTemplateToPatient: mocks.applyTemplateToPatient,
  getTemplate: mocks.getTemplate,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import { applyTemplateAction } from "./actions";

const DRAFT_ERROR = "Esta plantilla es un borrador: publicala antes de aplicarla.";

function form(): FormData {
  const fd = new FormData();
  fd.set("patientId", "pat1");
  fd.set("templateId", "t1");
  return fd;
}

beforeEach(() => vi.clearAllMocks());

describe("applyTemplateAction", () => {
  it("plantilla DRAFT → draftNotApplicable sin aplicar", async () => {
    mocks.getTemplate.mockResolvedValue({ id: "t1", status: "DRAFT", meals: [] });
    expect(await applyTemplateAction({ ok: false }, form())).toEqual({ ok: false, error: DRAFT_ERROR });
    expect(mocks.applyTemplateToPatient).not.toHaveBeenCalled();
  });

  it("si el dominio la rechaza igual (carrera) → mismo texto", async () => {
    mocks.getTemplate.mockResolvedValue({ id: "t1", status: "PUBLISHED", meals: [] });
    mocks.applyTemplateToPatient.mockRejectedValue(new mocks.TemplateNotPublishedError());
    expect(await applyTemplateAction({ ok: false }, form())).toEqual({ ok: false, error: DRAFT_ERROR });
  });

  it("publicada → aplica y redirige al plan", async () => {
    mocks.getTemplate.mockResolvedValue({ id: "t1", status: "PUBLISHED", meals: [] });
    mocks.applyTemplateToPatient.mockResolvedValue({ id: "plan1" });
    await applyTemplateAction({ ok: false }, form());
    expect(mocks.applyTemplateToPatient).toHaveBeenCalledWith("t1", "pat1");
    expect(mocks.redirect).toHaveBeenCalledWith("/pacientes/pat1/planes/plan1");
  });
});
