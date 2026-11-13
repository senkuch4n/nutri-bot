// HU-020: actions de "Textos del plan" (domain, sesión y revalidación mockeados, sin base).
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class PlanSectionInvalidError extends Error {
    code: string;
    constructor(code: string) {
      super(code);
      this.code = code;
    }
  }
  class PlanSectionLimitError extends Error {}
  class PlanSectionNotFoundError extends Error {}
  return {
    PlanSectionInvalidError,
    PlanSectionLimitError,
    PlanSectionNotFoundError,
    addSection: vi.fn(),
    updateSection: vi.fn(),
    deleteSection: vi.fn(),
    moveSection: vi.fn(),
    hasPanelSession: vi.fn(),
    revalidateMenuOwner: vi.fn(),
    revalidatePath: vi.fn(),
  };
});

vi.mock("@nutri-bot/db/domain", () => ({
  PlanSectionInvalidError: mocks.PlanSectionInvalidError,
  PlanSectionLimitError: mocks.PlanSectionLimitError,
  PlanSectionNotFoundError: mocks.PlanSectionNotFoundError,
  addSection: mocks.addSection,
  updateSection: mocks.updateSection,
  deleteSection: mocks.deleteSection,
  moveSection: mocks.moveSection,
}));
vi.mock("./recetas/recipe-save", () => ({ hasPanelSession: mocks.hasPanelSession }));
vi.mock("@/lib/revalidate-menu-owner", () => ({ revalidateMenuOwner: mocks.revalidateMenuOwner }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import {
  addPlanSectionAction,
  deletePlanSectionAction,
  movePlanSectionAction,
  updatePlanSectionAction,
} from "./plan-section-actions";

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.hasPanelSession.mockResolvedValue(true);
});

describe("plan-section-actions", () => {
  it("sin sesión → error de sesión sin llamar al dominio", async () => {
    mocks.hasPanelSession.mockResolvedValue(false);
    const r = await addPlanSectionAction({ kind: "plan", ownerId: "p1", title: "T", body: "b" });
    expect(r).toEqual({ ok: false, error: "Tu sesión venció. Volvé a entrar." });
    expect(mocks.addSection).not.toHaveBeenCalled();
  });

  it("kind inválido → error genérico sin llamar al dominio", async () => {
    const r = await addPlanSectionAction({ kind: "otro" as never, ownerId: "p1", title: "T", body: "b" });
    expect(r).toEqual({ ok: false, error: "No se pudo guardar. Probá de nuevo." });
    expect(mocks.addSection).not.toHaveBeenCalled();
  });

  it("título largo → error en el campo título con el texto de core", async () => {
    mocks.updateSection.mockRejectedValue(new mocks.PlanSectionInvalidError("TITLE_TOO_LONG"));
    const r = await updatePlanSectionAction({ kind: "template", ownerId: "t1", sectionId: "s1", title: "x", body: "b" });
    expect(r).toEqual({ ok: false, field: "title", error: "El título puede tener hasta 80 caracteres." });
  });

  it("cuerpo vacío → error en el campo texto; 30 textos → tooMany", async () => {
    mocks.addSection.mockRejectedValueOnce(new mocks.PlanSectionInvalidError("BODY_REQUIRED"));
    expect(await addPlanSectionAction({ kind: "plan", ownerId: "p1", title: "T", body: "" })).toEqual({
      ok: false,
      field: "body",
      error: "Escribí el texto.",
    });
    mocks.addSection.mockRejectedValueOnce(new mocks.PlanSectionLimitError());
    expect(await addPlanSectionAction({ kind: "plan", ownerId: "p1", title: "T", body: "b" })).toEqual({
      ok: false,
      error: "Llegaste al máximo de 30 textos.",
    });
  });

  it("plan: revalida el dueño y también /portal/plan; devuelve el id creado", async () => {
    mocks.addSection.mockResolvedValue({ id: "s9" });
    const r = await addPlanSectionAction({ kind: "plan", ownerId: "p1", title: "T", body: "b" });
    expect(r).toEqual({ ok: true, id: "s9" });
    expect(mocks.addSection).toHaveBeenCalledWith("plan", "p1", { title: "T", body: "b" });
    expect(mocks.revalidateMenuOwner).toHaveBeenCalledWith("plan", "p1");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/portal/plan");
  });

  it("plantilla: revalida el dueño (que la marca revisada) y no el portal", async () => {
    mocks.deleteSection.mockResolvedValue(undefined);
    expect(await deletePlanSectionAction({ kind: "template", ownerId: "t1", sectionId: "s1" })).toEqual({ ok: true });
    expect(mocks.revalidateMenuOwner).toHaveBeenCalledWith("template", "t1");
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("mover: dirección inválida → genérico; válida → llama al dominio", async () => {
    expect((await movePlanSectionAction({ kind: "plan", ownerId: "p1", sectionId: "s1", direction: 2 as never })).ok).toBe(false);
    await movePlanSectionAction({ kind: "plan", ownerId: "p1", sectionId: "s1", direction: -1 });
    expect(mocks.moveSection).toHaveBeenCalledWith("plan", "p1", "s1", -1);
  });
});
