// HU-018a-2: actions de la revisión de borradores (mocks; patrón de recetas/actions.test.ts).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class RecipeNotPublishableError extends Error {
    constructor(public issues: unknown[]) {
      super("x");
    }
  }
  class RecipeNotFoundError extends Error {}
  class RecipeStatusError extends Error {}
  return {
    auth: vi.fn(),
    revalidatePath: vi.fn(),
    updateRecipe: vi.fn(),
    publishRecipe: vi.fn(),
    deleteDraftRecipe: vi.fn(),
    listDraftQueue: vi.fn(),
    chooseImportCandidateAsPhoto: vi.fn(),
    setRecipePhoto: vi.fn(),
    setRecipePhotoCredit: vi.fn(),
    removeRecipePhoto: vi.fn(),
    processRecipePhoto: vi.fn(),
    calls: [] as string[],
    RecipeNotPublishableError,
    RecipeNotFoundError,
    RecipeStatusError,
  };
});
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@nutri-bot/db/domain", () => ({
  updateRecipe: mocks.updateRecipe,
  publishRecipe: mocks.publishRecipe,
  deleteDraftRecipe: mocks.deleteDraftRecipe,
  listDraftQueue: mocks.listDraftQueue,
  chooseImportCandidateAsPhoto: mocks.chooseImportCandidateAsPhoto,
  setRecipePhoto: mocks.setRecipePhoto,
  setRecipePhotoCredit: mocks.setRecipePhotoCredit,
  removeRecipePhoto: mocks.removeRecipePhoto,
  RecipeNotPublishableError: mocks.RecipeNotPublishableError,
  RecipeNotFoundError: mocks.RecipeNotFoundError,
  RecipeStatusError: mocks.RecipeStatusError,
}));
vi.mock("@nutri-bot/db/media", () => ({ processRecipePhoto: mocks.processRecipePhoto }));

import { discardDraftAction, publishDraftAction, saveDraftAction } from "./actions";

const payload = {
  id: "d2",
  name: "Bolitas de mijo",
  type: "MAIN_DISH",
  moments: ["LUNCH"],
  tags: [],
  yieldPortions: 8,
  portionHousehold: "3 bolitas",
  portionGrams: null,
  preparation: "TEXTO-DEL-PAYLOAD",
  tips: null,
  sourceName: "Recetario inventado",
  published: null,
  ingredients: [{ foodId: "f1", label: null, grams: 200, noQuantity: false, household: null, rawText: "Mijo 200g" }],
};

function form(extra: Record<string, string> = {}, body: unknown = payload): FormData {
  const fd = new FormData();
  fd.set("payload", JSON.stringify(body));
  for (const [k, v] of Object.entries(extra)) fd.set(k, v);
  return fd;
}

const QUEUE = [
  { id: "d1", name: "A", importFile: "X.pdf", importPage: 3 },
  { id: "d2", name: "B", importFile: "X.pdf", importPage: 4 },
  { id: "d3", name: "C", importFile: "X.pdf", importPage: 5 },
];

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.resetAllMocks();
  mocks.calls = [];
  mocks.auth.mockResolvedValue({ user: { email: "pro@example.test" } });
  mocks.listDraftQueue.mockResolvedValue(QUEUE);
  mocks.updateRecipe.mockImplementation(async () => void mocks.calls.push("updateRecipe"));
  mocks.chooseImportCandidateAsPhoto.mockImplementation(async () => {
    mocks.calls.push("chooseImportCandidateAsPhoto");
    return { photoId: "ph" };
  });
  mocks.publishRecipe.mockImplementation(async () => void mocks.calls.push("publishRecipe"));
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => errorSpy.mockRestore());

describe("publishDraftAction", () => {
  it("con candidateId elige la foto ANTES de publicar y devuelve el siguiente de la cola", async () => {
    const res = await publishDraftAction(form({ candidateId: "cand1", photoCredit: "Foto: X", queueFile: "X.pdf" }));
    expect(res).toEqual({ ok: true, id: "d2", nextId: "d3" });
    expect(mocks.calls).toEqual(["updateRecipe", "chooseImportCandidateAsPhoto", "publishRecipe"]);
    expect(mocks.chooseImportCandidateAsPhoto).toHaveBeenCalledWith("d2", "cand1", "Foto: X");
    expect(mocks.listDraftQueue).toHaveBeenCalledWith({ file: "X.pdf" });
  });

  it("el último de la cola vuelve al primero que quede; sin otros, null", async () => {
    const last = await publishDraftAction(form({}, { ...payload, id: "d3" }));
    expect(last).toMatchObject({ ok: true, nextId: "d1" });
    mocks.listDraftQueue.mockResolvedValue([QUEUE[1]]);
    expect(await publishDraftAction(form())).toMatchObject({ ok: true, nextId: null });
  });

  it("si no valida para publicar devuelve las issues (el borrador queda guardado)", async () => {
    mocks.publishRecipe.mockRejectedValue(new mocks.RecipeNotPublishableError([{ field: "ingredient", index: 0, message: "x" }]));
    const res = await publishDraftAction(form());
    expect(res).toEqual({ ok: false, issues: [{ field: "ingredient", index: 0, message: "x" }], id: "d2" });
    expect(mocks.updateRecipe).toHaveBeenCalled();
  });

  it("sin sesión no guarda nada", async () => {
    mocks.auth.mockResolvedValue(null);
    expect(await publishDraftAction(form())).toEqual({ ok: false, error: "Tu sesión venció. Volvé a entrar." });
    expect(mocks.updateRecipe).not.toHaveBeenCalled();
  });

  it("sin id en el payload → error y no se guarda", async () => {
    const noId: Record<string, unknown> = { ...payload };
    delete noId.id;
    expect(await publishDraftAction(form({}, noId))).toEqual({ ok: false, error: "Revisá los datos de la receta." });
    expect(mocks.updateRecipe).not.toHaveBeenCalled();
  });

  it("los errores inesperados se loguean sin el payload", async () => {
    mocks.publishRecipe.mockRejectedValue(new Error("boom TEXTO-DEL-PAYLOAD"));
    const res = await publishDraftAction(form());
    expect(res).toMatchObject({ ok: false, error: expect.any(String) });
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain("TEXTO-DEL-PAYLOAD");
  });
});

describe("saveDraftAction", () => {
  it("guarda sin publicar", async () => {
    expect(await saveDraftAction(form())).toEqual({ ok: true, id: "d2" });
    expect(mocks.publishRecipe).not.toHaveBeenCalled();
    expect(mocks.calls).toEqual(["updateRecipe"]);
  });
});

describe("discardDraftAction", () => {
  it("borra el borrador y devuelve el siguiente", async () => {
    expect(await discardDraftAction("d1", "X.pdf")).toEqual({ ok: true, nextId: "d2" });
    expect(mocks.deleteDraftRecipe).toHaveBeenCalledWith("d1");
  });

  it("un PUBLISHED no se descarta", async () => {
    mocks.deleteDraftRecipe.mockRejectedValue(new mocks.RecipeStatusError());
    expect(await discardDraftAction("d1")).toMatchObject({ ok: false, error: "Este borrador ya no está para revisar." });
  });
});
