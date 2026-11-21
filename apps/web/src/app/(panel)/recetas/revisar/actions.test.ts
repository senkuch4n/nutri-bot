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
    access: vi.fn(),
    recipesForTenant: vi.fn(),
    recipeReviewForTenant: vi.fn(),
    revalidatePath: vi.fn(),
    updateRecipe: vi.fn(),
    publishRecipe: vi.fn(),
    deleteDraftRecipe: vi.fn(),
    listDraftQueue: vi.fn(),
    listDraftFiles: vi.fn(),
    getRecipe: vi.fn(),
    listFoodsForRecipes: vi.fn(),
    notFound: vi.fn(() => { throw new Error("notFound"); }),
    redirect: vi.fn((url: string) => { throw new Error(url); }),
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
vi.mock("@/lib/private-content-access", () => ({ resolvePrivateContentAccess: mocks.access }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound, redirect: mocks.redirect }));
vi.mock("@/components/ui", () => ({ ButtonLink: () => null, EmptyState: () => null, PageHeader: () => null }));
vi.mock("./[id]/review-screen", () => ({ ReviewScreen: () => null }));
vi.mock("@nutri-bot/db/domain", () => ({
  recipesForTenant: mocks.recipesForTenant,
  recipeReviewForTenant: mocks.recipeReviewForTenant,
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
import ReviewQueuePage from "./page";
import ReviewDraftPage from "./[id]/page";

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
  mocks.access.mockResolvedValue({ tenantId: "tenant-a" });
  mocks.recipesForTenant.mockReturnValue({
    updateDraft: mocks.updateRecipe, publishDraft: mocks.publishRecipe, discardDraft: mocks.deleteDraftRecipe,
    setPhoto: mocks.setRecipePhoto, removePhoto: mocks.removeRecipePhoto, setPhotoCredit: mocks.setRecipePhotoCredit,
    get: mocks.getRecipe, foods: mocks.listFoodsForRecipes,
  });
  mocks.recipeReviewForTenant.mockReturnValue({
    queue: mocks.listDraftQueue, files: mocks.listDraftFiles, chooseCandidate: mocks.chooseImportCandidateAsPhoto,
  });
  mocks.notFound.mockImplementation(() => { throw new Error("notFound"); });
  mocks.redirect.mockImplementation((url: string) => { throw new Error(url); });
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

describe("páginas de revisión", () => {
  const searchParams = Promise.resolve({ archivo: "X.pdf", tenantId: "tenant-b" });
  const detail = (id: string) => ReviewDraftPage({ params: Promise.resolve({ id }), searchParams });

  it("sin pertenencia oculta ambas páginas antes de consultar datos", async () => {
    mocks.access.mockResolvedValue(null);
    await expect(ReviewQueuePage({ searchParams })).rejects.toThrow("notFound");
    await expect(detail("foreign")).rejects.toThrow("notFound");
    expect(mocks.recipeReviewForTenant).not.toHaveBeenCalled();
    expect(mocks.recipesForTenant).not.toHaveBeenCalled();
    expect(mocks.listDraftQueue).not.toHaveBeenCalled();
    expect(mocks.getRecipe).not.toHaveBeenCalled();
  });

  it("conserva el filtro y comprueba el dueño antes de abrir o redirigir un detalle", async () => {
    await expect(ReviewQueuePage({ searchParams })).rejects.toThrow("/recetas/revisar/d1?archivo=X.pdf");
    expect(mocks.recipeReviewForTenant).toHaveBeenCalledWith("tenant-a");
    expect(mocks.listDraftQueue).toHaveBeenCalledWith({ file: "X.pdf" });
    mocks.getRecipe.mockResolvedValueOnce(null).mockResolvedValueOnce({ status: "PUBLISHED" });
    await expect(detail("foreign")).rejects.toThrow("notFound");
    await expect(detail("own")).rejects.toThrow("/recetas/own");
    expect(mocks.recipesForTenant).toHaveBeenCalledWith("tenant-a");
    expect(mocks.getRecipe.mock.calls).toEqual([["foreign"], ["own"]]);
    expect(mocks.listDraftQueue).toHaveBeenCalledTimes(1);
    expect(mocks.listDraftFiles).not.toHaveBeenCalled();
    expect(mocks.listFoodsForRecipes).not.toHaveBeenCalled();
  });
});

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
    mocks.access.mockResolvedValue(null);
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

describe("autorización de revisión", () => {
  it("sin pertenencia no usa el tenant del formulario ni lee o escribe borradores", async () => {
    mocks.access.mockResolvedValue(null);
    const fd = form({ tenantId: "tenant-b", candidateId: "c2", queueFile: "X.pdf" });
    const error = "Tu sesión venció. Volvé a entrar.";
    expect(await saveDraftAction(fd)).toEqual({ ok: false, error });
    expect(await publishDraftAction(fd)).toEqual({ ok: false, error });
    expect(await discardDraftAction("d2", "X.pdf")).toEqual({ ok: false, nextId: null, error });
    for (const fn of [mocks.updateRecipe, mocks.publishRecipe, mocks.deleteDraftRecipe, mocks.listDraftQueue,
      mocks.chooseImportCandidateAsPhoto, mocks.revalidatePath]) expect(fn).not.toHaveBeenCalled();
  });

  it("usa el consultorio autenticado para edición, cola, candidata y crédito", async () => {
    expect(await publishDraftAction(form({ tenantId: "tenant-b", candidateId: "c1" })))
      .toEqual({ ok: true, id: "d2", nextId: "d3" });
    expect(mocks.recipesForTenant).toHaveBeenCalledWith("tenant-a");
    expect(mocks.recipeReviewForTenant).toHaveBeenCalledWith("tenant-a");
    expect(await saveDraftAction(form({ photoCredit: " Foto: X " }))).toEqual({ ok: true, id: "d2" });
    expect(mocks.setRecipePhotoCredit).toHaveBeenCalledWith("d2", "Foto: X");
  });

  it("un id ajeno o inexistente no devuelve siguiente id, ni toca fotos ni invalida caché", async () => {
    mocks.updateRecipe.mockRejectedValue(new mocks.RecipeNotFoundError());
    mocks.deleteDraftRecipe.mockRejectedValue(new mocks.RecipeNotFoundError());
    const error = "La receta ya no existe.";
    const fd = form({ candidateId: "c1" });
    expect(await saveDraftAction(fd)).toEqual({ ok: false, error });
    expect(await publishDraftAction(fd)).toEqual({ ok: false, error });
    expect(await discardDraftAction("foreign")).toEqual({ ok: false, nextId: null, error });
    for (const fn of [mocks.chooseImportCandidateAsPhoto, mocks.publishRecipe, mocks.revalidatePath]) {
      expect(fn).not.toHaveBeenCalled();
    }
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
