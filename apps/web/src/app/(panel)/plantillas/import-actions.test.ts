// HU-020: actions de revisión de borradores importados (domain, sesión y touchTemplate mockeados).
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class TemplateNotPublishableError extends Error {
    unplaced: number;
    constructor(n: number) {
      super("x");
      this.unplaced = n;
    }
  }
  class TemplateHintNotFoundError extends Error {}
  class RecipeNotAvailableError extends Error {}
  class PlanSectionInvalidError extends Error {
    code = "BODY_TOO_LONG";
  }
  return {
    TemplateNotPublishableError,
    TemplateHintNotFoundError,
    RecipeNotAvailableError,
    PlanSectionInvalidError,
    publishTemplate: vi.fn(),
    dismissTemplateHint: vi.fn(),
    resolveUnplacedHint: vi.fn(),
    linkHintRecipe: vi.fn(),
    hasPanelSession: vi.fn(),
    touchTemplate: vi.fn(),
  };
});

vi.mock("@nutri-bot/db/domain", () => ({
  TemplateNotPublishableError: mocks.TemplateNotPublishableError,
  TemplateHintNotFoundError: mocks.TemplateHintNotFoundError,
  RecipeNotAvailableError: mocks.RecipeNotAvailableError,
  PlanSectionInvalidError: mocks.PlanSectionInvalidError,
  publishTemplate: mocks.publishTemplate,
  dismissTemplateHint: mocks.dismissTemplateHint,
  resolveUnplacedHint: mocks.resolveUnplacedHint,
  linkHintRecipe: mocks.linkHintRecipe,
}));
vi.mock("../recetas/recipe-save", () => ({ hasPanelSession: mocks.hasPanelSession }));
vi.mock("@/lib/touch-template", () => ({ touchTemplate: mocks.touchTemplate }));

import {
  dismissTemplateHintAction,
  linkHintRecipeAction,
  publishTemplateAction,
  resolveUnplacedHintAction,
} from "./import-actions";

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.hasPanelSession.mockResolvedValue(true);
});

describe("import-actions", () => {
  it("sin sesión → error de sesión sin llamar al dominio", async () => {
    mocks.hasPanelSession.mockResolvedValue(false);
    expect(await publishTemplateAction({ templateId: "t1" })).toEqual({ ok: false, error: "Tu sesión venció. Volvé a entrar." });
    expect(mocks.publishTemplate).not.toHaveBeenCalled();
  });

  it("publicar OK → touchTemplate", async () => {
    expect(await publishTemplateAction({ templateId: "t1" })).toEqual({ ok: true });
    expect(mocks.publishTemplate).toHaveBeenCalledWith("t1");
    expect(mocks.touchTemplate).toHaveBeenCalledWith("t1");
  });

  it("publicar con 3 sin ubicar → publishBlocked(3)", async () => {
    mocks.publishTemplate.mockRejectedValue(new mocks.TemplateNotPublishableError(3));
    expect(await publishTemplateAction({ templateId: "t1" })).toEqual({ ok: false, error: "Quedan 3 líneas sin ubicar" });
  });

  it("vincular con portions 0.3 → error de validación sin llamar al dominio", async () => {
    expect((await linkHintRecipeAction({ templateId: "t1", hintId: "h1", portions: 0.3 })).ok).toBe(false);
    expect(mocks.linkHintRecipe).not.toHaveBeenCalled();
  });

  it("vincular una receta que ya no está publicada → texto del buscador de recetas", async () => {
    mocks.linkHintRecipe.mockRejectedValue(new mocks.RecipeNotAvailableError());
    expect(await linkHintRecipeAction({ templateId: "t1", hintId: "h1", portions: 1 })).toEqual({
      ok: false,
      error: "Esta receta ya no está publicada.",
    });
  });

  it("descartar un aviso que ya no estaba → ok y revalida", async () => {
    mocks.dismissTemplateHint.mockRejectedValue(new mocks.TemplateHintNotFoundError());
    expect(await dismissTemplateHintAction({ templateId: "t1", hintId: "h1" })).toEqual({ ok: true });
    expect(mocks.touchTemplate).toHaveBeenCalledWith("t1");
  });

  it("mover a comida con día inválido → error sin dominio; a sección nueva → ok", async () => {
    const bad = await resolveUnplacedHintAction({
      templateId: "t1",
      hintId: "h1",
      target: { kind: "meal", mealId: "m1", weekday: "XXX" as never },
    });
    expect(bad.ok).toBe(false);
    expect(mocks.resolveUnplacedHint).not.toHaveBeenCalled();
    const ok = await resolveUnplacedHintAction({ templateId: "t1", hintId: "h1", target: { kind: "section", sectionId: null } });
    expect(ok).toEqual({ ok: true });
    expect(mocks.resolveUnplacedHint).toHaveBeenCalledWith("t1", "h1", { kind: "section", sectionId: null });
  });

  it("texto que no entra en la sección → su texto de error", async () => {
    mocks.resolveUnplacedHint.mockRejectedValue(new mocks.PlanSectionInvalidError());
    expect(
      await resolveUnplacedHintAction({ templateId: "t1", hintId: "h1", target: { kind: "section", sectionId: "s1" } }),
    ).toEqual({ ok: false, error: "El texto puede tener hasta 20.000 caracteres." });
  });
});
