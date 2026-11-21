// HU-020/HU-024: revisión de borradores importados con dominio y pertenencia mockeados.
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PLAN_SECTION_TEXT, RECIPE_TEXT } from "@nutri-bot/core";

const mocks = vi.hoisted(() => ({
  access: vi.fn(), touch: vi.fn(), publishTemplate: vi.fn(), dismissTemplateHint: vi.fn(),
  resolveUnplacedHint: vi.fn(), linkHintRecipe: vi.fn(),
  TemplateHintNotFoundError: class extends Error {},
  TemplateNotPublishableError: class extends Error {
    constructor(readonly unplaced: number) { super("x"); }
  },
  RecipeNotAvailableError: class extends Error {},
  PlanSectionInvalidError: class extends Error { code = "BODY_TOO_LONG"; },
}));
vi.mock("@nutri-bot/db/domain", () => mocks);
vi.mock("@/lib/private-content-access", () => ({ resolvePrivateContentAccess: mocks.access }));
vi.mock("@/lib/touch-template", () => ({ touchTemplate: mocks.touch }));
vi.mock("../recetas/recipe-save", () => ({ hasPanelSession: async () => true }));

import * as actions from "./import-actions";

const hint = { templateId: "template", hintId: "hint", tenantId: "foreign" };
const target = { kind: "section" as const, sectionId: null };
const cases = [
  ["publishTemplate", () => actions.publishTemplateAction(hint), ["template"]],
  ["dismissTemplateHint", () => actions.dismissTemplateHintAction(hint), ["template", "hint"]],
  ["resolveUnplacedHint", () => actions.resolveUnplacedHintAction({ ...hint, target }), ["template", "hint", target]],
  ["linkHintRecipe", () => actions.linkHintRecipeAction({ ...hint, portions: 1 }), ["template", "hint", 1]],
] as const;

beforeEach(() => {
  vi.resetAllMocks();
  mocks.access.mockResolvedValue({ tenantId: "mine" });
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

it.each(cases)("%s denies a signed-in user without membership", async (method, invoke) => {
  mocks.access.mockResolvedValue(null);
  expect(await invoke()).toEqual({ ok: false, error: RECIPE_TEXT.sessionExpired });
  expect(mocks[method]).not.toHaveBeenCalled();
  expect(mocks.touch).not.toHaveBeenCalled();
});

it.each(cases)("%s forwards only trusted tenant authority", async (method, invoke, args) => {
  mocks.access.mockResolvedValue({ tenantId: "mine" });
  expect(await invoke()).toEqual({ ok: true });
  expect(mocks[method].mock.calls).toEqual([[...args, "mine"]]);
  expect(mocks.touch.mock.calls).toEqual([["template", "mine"]]);
});

it("keeps dismiss idempotent for an authorized stale hint", async () => {
  mocks.access.mockResolvedValue({ tenantId: "mine" });
  mocks.dismissTemplateHint.mockRejectedValue(new mocks.TemplateHintNotFoundError());
  expect(await actions.dismissTemplateHintAction(hint)).toEqual({ ok: true });
  expect(mocks.touch).toHaveBeenCalledWith("template", "mine");
});

it("returns the generic error and does not touch an inaccessible template", async () => {
  mocks.access.mockResolvedValue({ tenantId: "mine" });
  mocks.dismissTemplateHint.mockRejectedValue(new Error("La plantilla no existe."));
  expect(await actions.dismissTemplateHintAction(hint)).toEqual({ ok: false, error: PLAN_SECTION_TEXT.errors.generic });
  expect(mocks.touch).not.toHaveBeenCalled();
});

it("publicar con 3 sin ubicar → publishBlocked(3)", async () => {
  mocks.publishTemplate.mockRejectedValue(new mocks.TemplateNotPublishableError(3));
  expect(await actions.publishTemplateAction(hint)).toEqual({ ok: false, error: "Quedan 3 líneas sin ubicar" });
  expect(mocks.touch).not.toHaveBeenCalled();
});

it("vincular con portions 0.3 → error de validación sin llamar al dominio", async () => {
  expect(await actions.linkHintRecipeAction({ ...hint, portions: 0.3 })).toEqual({ ok: false, error: PLAN_SECTION_TEXT.errors.generic });
  expect(mocks.linkHintRecipe).not.toHaveBeenCalled();
  expect(mocks.touch).not.toHaveBeenCalled();
});

it("vincular una receta que ya no está publicada → texto del buscador de recetas", async () => {
  mocks.linkHintRecipe.mockRejectedValue(new mocks.RecipeNotAvailableError());
  expect(await actions.linkHintRecipeAction({ ...hint, portions: 1 })).toEqual({ ok: false, error: "Esta receta ya no está publicada." });
  expect(mocks.touch).not.toHaveBeenCalled();
});

it("mover a comida con día inválido → error sin dominio", async () => {
  expect(await actions.resolveUnplacedHintAction({ ...hint, target: { kind: "meal", mealId: "m1", weekday: "XXX" as never } }))
    .toEqual({ ok: false, error: PLAN_SECTION_TEXT.errors.generic });
  expect(mocks.resolveUnplacedHint).not.toHaveBeenCalled();
  expect(mocks.touch).not.toHaveBeenCalled();
});

it("texto que no entra en la sección → su texto de error", async () => {
  mocks.resolveUnplacedHint.mockRejectedValue(new mocks.PlanSectionInvalidError());
  expect(await actions.resolveUnplacedHintAction({ ...hint, target: { kind: "section", sectionId: "s1" } }))
    .toEqual({ ok: false, error: "El texto puede tener hasta 20.000 caracteres." });
  expect(mocks.touch).not.toHaveBeenCalled();
});
