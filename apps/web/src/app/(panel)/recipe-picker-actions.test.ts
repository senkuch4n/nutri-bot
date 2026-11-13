// HU-018c: actions del buscador de recetas (domain y sesión mockeados, sin base).
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class RecipeNotAvailableError extends Error {
    constructor() {
      super("no publicada");
      this.name = "RecipeNotAvailableError";
    }
  }
  return {
    RecipeNotAvailableError,
    addRecipeItems: vi.fn(),
    getRecipePreview: vi.fn(),
    listRecipeCards: vi.fn(),
    removeMenuItems: vi.fn(),
    setRecipeItemPortions: vi.fn(),
    hasPanelSession: vi.fn(),
    revalidateMenuOwner: vi.fn(),
  };
});

vi.mock("@nutri-bot/db/domain", () => ({
  RecipeNotAvailableError: mocks.RecipeNotAvailableError,
  addRecipeItems: mocks.addRecipeItems,
  getRecipePreview: mocks.getRecipePreview,
  listRecipeCards: mocks.listRecipeCards,
  removeMenuItems: mocks.removeMenuItems,
  setRecipeItemPortions: mocks.setRecipeItemPortions,
}));
vi.mock("./recetas/recipe-save", () => ({ hasPanelSession: mocks.hasPanelSession }));
vi.mock("@/lib/revalidate-menu-owner", () => ({ revalidateMenuOwner: mocks.revalidateMenuOwner }));

import * as actions from "./recipe-picker-actions";
import {
  addRecipeToMealAction,
  getRecipePreviewAction,
  listPickerRecipesAction,
  removeRecipeItemsAction,
  setRecipeItemPortionsAction,
} from "./recipe-picker-actions";

const ADD_ERROR = "No se pudo agregar. Probá de nuevo.";
const PORTIONS_ERROR = "No se pudo cambiar la porción. Probá de nuevo.";
const REMOVE_ERROR = "No se pudo quitar. Probá de nuevo.";
const NOT_PUBLISHED = "Esta receta ya no está publicada.";
const SESSION = "Tu sesión venció. Volvé a entrar.";

const add = { kind: "plan" as const, ownerId: "plan1", mealId: "meal1", recipeId: "rec1", weekdays: ["TUE" as const, "THU" as const] };

let errorLog: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.clearAllMocks();
  errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.hasPanelSession.mockResolvedValue(true);
});

describe("recipe-picker-actions", () => {
  it("el archivo 'use server' solo exporta funciones async", () => {
    const values = Object.values(actions);
    expect(values.length).toBeGreaterThan(0);
    for (const value of values) {
      expect(typeof value).toBe("function");
      expect((value as () => unknown).constructor.name).toBe("AsyncFunction");
    }
  });

  it("sin sesión → sessionExpired y no toca el dominio", async () => {
    mocks.hasPanelSession.mockResolvedValue(false);
    const results = await Promise.all([
      listPickerRecipesAction(),
      addRecipeToMealAction(add),
      setRecipeItemPortionsAction({ kind: "plan", ownerId: "plan1", itemId: "i1", portions: 1.5 }),
      removeRecipeItemsAction({ kind: "plan", ownerId: "plan1", itemIds: ["i1"] }),
    ]);
    for (const r of results) expect(r).toEqual({ ok: false, error: SESSION });
    expect(mocks.listRecipeCards).not.toHaveBeenCalled();
    expect(mocks.addRecipeItems).not.toHaveBeenCalled();
  });

  it("listPickerRecipesAction trae solo las publicadas, con la URL de la foto del panel", async () => {
    mocks.listRecipeCards.mockResolvedValue([{ id: "r1", photoId: "ph1", draftThumbId: null, name: "Budín" }]);
    const result = await listPickerRecipesAction();
    expect(mocks.listRecipeCards).toHaveBeenCalledWith({ status: "PUBLISHED" });
    expect(result).toEqual({ ok: true, cards: [expect.objectContaining({ id: "r1", photoUrl: "/api/recetas/fotos/ph1?size=thumb" })] });
  });

  it("addRecipeToMealAction agrega 1 porción, devuelve los ids y revalida", async () => {
    mocks.addRecipeItems.mockResolvedValue({ itemIds: ["a", "b"] });
    expect(await addRecipeToMealAction(add)).toEqual({ ok: true, itemIds: ["a", "b"] });
    expect(mocks.addRecipeItems).toHaveBeenCalledWith("plan", "plan1", { mealId: "meal1", recipeId: "rec1", portions: 1, weekdays: ["TUE", "THU"] });
    expect(mocks.revalidateMenuOwner).toHaveBeenCalledWith("plan", "plan1");

    await addRecipeToMealAction({ ...add, kind: "template", ownerId: "t1", weekdays: null });
    expect(mocks.addRecipeItems).toHaveBeenLastCalledWith("template", "t1", { mealId: "meal1", recipeId: "rec1", portions: 1, weekdays: null });
  });

  it("zod: días repetidos o inválidos → addError; porciones 0,7 → portionsError; 51 ids → removeError", async () => {
    expect(await addRecipeToMealAction({ ...add, weekdays: ["TUE", "TUE"] })).toEqual({ ok: false, error: ADD_ERROR });
    expect(await addRecipeToMealAction({ ...add, weekdays: ["XXX" as never] })).toEqual({ ok: false, error: ADD_ERROR });
    expect(await addRecipeToMealAction({ ...add, weekdays: [] })).toEqual({ ok: false, error: ADD_ERROR });
    expect(await setRecipeItemPortionsAction({ kind: "plan", ownerId: "plan1", itemId: "i1", portions: 0.7 })).toEqual({ ok: false, error: PORTIONS_ERROR });
    expect(await setRecipeItemPortionsAction({ kind: "plan", ownerId: "plan1", itemId: "i1", portions: 4.5 })).toEqual({ ok: false, error: PORTIONS_ERROR });
    const many = Array.from({ length: 51 }, (_, i) => `i${i}`);
    expect(await removeRecipeItemsAction({ kind: "plan", ownerId: "plan1", itemIds: many })).toEqual({ ok: false, error: REMOVE_ERROR });
    expect(mocks.addRecipeItems).not.toHaveBeenCalled();
    expect(mocks.setRecipeItemPortions).not.toHaveBeenCalled();
    expect(mocks.removeMenuItems).not.toHaveBeenCalled();
  });

  it("RecipeNotAvailableError → notPublished; otro error → addError; el log no lleva el payload", async () => {
    mocks.addRecipeItems.mockRejectedValueOnce(new mocks.RecipeNotAvailableError());
    expect(await addRecipeToMealAction(add)).toEqual({ ok: false, error: NOT_PUBLISHED });
    mocks.addRecipeItems.mockRejectedValueOnce(Object.assign(new Error("fallo con meal1 y rec1"), { code: "P2003" }));
    expect(await addRecipeToMealAction(add)).toEqual({ ok: false, error: ADD_ERROR });
    expect(mocks.revalidateMenuOwner).not.toHaveBeenCalled();
    expect(errorLog.mock.calls).toEqual([["[recipe-picker]", "RecipeNotAvailableError"], ["[recipe-picker]", "P2003"]]);
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain("rec1");
  });

  it("setRecipeItemPortionsAction y removeRecipeItemsAction llaman al dominio y revalidan", async () => {
    mocks.setRecipeItemPortions.mockResolvedValue(undefined);
    expect(await setRecipeItemPortionsAction({ kind: "plan", ownerId: "plan1", itemId: "i1", portions: 1.5 })).toEqual({ ok: true });
    expect(mocks.setRecipeItemPortions).toHaveBeenCalledWith("plan", "plan1", "i1", 1.5);
    mocks.removeMenuItems.mockResolvedValue(2);
    expect(await removeRecipeItemsAction({ kind: "template", ownerId: "t1", itemIds: ["a", "b"] })).toEqual({ ok: true });
    expect(mocks.removeMenuItems).toHaveBeenCalledWith("template", "t1", ["a", "b"]);
    expect(mocks.revalidateMenuOwner.mock.calls).toEqual([["plan", "plan1"], ["template", "t1"]]);

    mocks.removeMenuItems.mockRejectedValueOnce(new RangeError("x"));
    expect(await removeRecipeItemsAction({ kind: "plan", ownerId: "plan1", itemIds: ["a"] })).toEqual({ ok: false, error: REMOVE_ERROR });
  });
});

describe("getRecipePreviewAction (018c-2)", () => {
  it("sin sesión → sessionExpired y no lee la receta", async () => {
    mocks.hasPanelSession.mockResolvedValue(false);
    expect(await getRecipePreviewAction("r1")).toEqual({ ok: false, error: SESSION });
    expect(mocks.getRecipePreview).not.toHaveBeenCalled();
  });
  it("devuelve el detalle", async () => {
    const recipe = { id: "r1", name: "Budín" };
    mocks.getRecipePreview.mockResolvedValue(recipe);
    expect(await getRecipePreviewAction("r1")).toEqual({ ok: true, recipe });
    expect(mocks.getRecipePreview).toHaveBeenCalledWith("r1");
  });
  it("borrador o inexistente (null) o id inválido → notPublished", async () => {
    mocks.getRecipePreview.mockResolvedValue(null);
    expect(await getRecipePreviewAction("r1")).toEqual({ ok: false, error: NOT_PUBLISHED });
    expect(await getRecipePreviewAction("")).toEqual({ ok: false, error: NOT_PUBLISHED });
  });
  it("si la base falla → loadError, y el log lleva solo el código", async () => {
    mocks.getRecipePreview.mockRejectedValue(new Error("secreto del payload"));
    expect(await getRecipePreviewAction("r1")).toEqual({ ok: false, error: "No se pudieron cargar las recetas." });
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain("secreto");
  });
});
