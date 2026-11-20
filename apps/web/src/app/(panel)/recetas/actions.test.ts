// HU-018a: guardar recetas con foto (validación en el servidor y nada del payload en los logs).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class RecipeNotPublishableError extends Error {
    constructor(public issues: unknown[]) {
      super("x");
    }
  }
  class RecipeNotFoundError extends Error {}
  return {
    auth: vi.fn(),
    findUser: vi.fn(),
    recipesForTenant: vi.fn(),
    revalidatePath: vi.fn(),
    createRecipe: vi.fn(),
    updateRecipe: vi.fn(),
    setRecipePhoto: vi.fn(),
    setRecipePhotoCredit: vi.fn(),
    removeRecipePhoto: vi.fn(),
    scopedSetPhoto: vi.fn(),
    scopedSetPhotoCredit: vi.fn(),
    scopedRemovePhoto: vi.fn(),
    archiveRecipe: vi.fn(),
    unarchiveRecipe: vi.fn(),
    processRecipePhoto: vi.fn(),
    RecipeNotPublishableError,
    RecipeNotFoundError,
  };
});
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("server-only", () => ({}));
vi.mock("@nutri-bot/db", () => ({ prisma: { user: { findFirst: mocks.findUser } } }));

const tenantId = "tenant-a";
function allowPanel() {
  mocks.auth.mockResolvedValue({ user: { email: "pro@example.test" }, privateContentUserId: "user-a" });
  mocks.findUser.mockResolvedValue({ memberships: [{ tenantId, role: "STAFF" }] });
  mocks.recipesForTenant.mockReturnValue({
    create: mocks.createRecipe, update: mocks.updateRecipe,
    archive: mocks.archiveRecipe, unarchive: mocks.unarchiveRecipe,
    setPhoto: mocks.scopedSetPhoto, setPhotoCredit: mocks.scopedSetPhotoCredit, removePhoto: mocks.scopedRemovePhoto,
  });
}
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@nutri-bot/db/domain", () => ({
  recipesForTenant: mocks.recipesForTenant,
  setRecipePhoto: mocks.setRecipePhoto,
  setRecipePhotoCredit: mocks.setRecipePhotoCredit,
  removeRecipePhoto: mocks.removeRecipePhoto,
  RecipeNotPublishableError: mocks.RecipeNotPublishableError,
  RecipeNotFoundError: mocks.RecipeNotFoundError,
}));
vi.mock("@nutri-bot/db/media", () => ({ processRecipePhoto: mocks.processRecipePhoto }));

import { archiveRecipeAction, saveRecipeAction, unarchiveRecipeAction } from "./actions";

const PHOTO_INVALID = "La foto tiene que ser JPG, PNG o WebP y pesar menos de 5 MB.";
const JPG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 7, 7]);
const GIF = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0]);

const payload = {
  name: "Albóndigas de prueba",
  type: "MAIN_DISH",
  moments: ["LUNCH"],
  tags: [],
  yieldPortions: 8,
  portionHousehold: "¾ albóndigas",
  portionGrams: null,
  preparation: "SECRETO-DEL-PAYLOAD",
  tips: null,
  sourceName: null,
  published: null,
  ingredients: [{ foodId: "f1", label: null, grams: 500, noQuantity: false, household: null, rawText: null }],
};

function form(extra: { payload?: unknown; photo?: File; removePhoto?: string; photoCredit?: string } = {}) {
  const fd = new FormData();
  fd.set("payload", typeof extra.payload === "string" ? extra.payload : JSON.stringify(extra.payload ?? payload));
  if (extra.photo) fd.set("photo", extra.photo);
  if (extra.removePhoto) fd.set("removePhoto", extra.removePhoto);
  if (extra.photoCredit !== undefined) fd.set("photoCredit", extra.photoCredit);
  return fd;
}

describe("saveRecipeAction", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    vi.resetAllMocks();
    allowPanel();
    mocks.createRecipe.mockResolvedValue({ id: "r-new" });
    mocks.scopedSetPhoto.mockResolvedValue({ photoId: "ph1" });
    mocks.processRecipePhoto.mockResolvedValue({ data: Buffer.from("w"), thumbData: Buffer.from("t"), byteSize: 1, width: 1200, height: 900 });
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("sin sesión → sesión vencida, sin guardar", async () => {
    mocks.auth.mockResolvedValue(null);
    expect(await saveRecipeAction(form())).toEqual({ ok: false, error: "Tu sesión venció. Volvé a entrar." });
    expect(mocks.createRecipe).not.toHaveBeenCalled();
  });

  it.each([{ memberships: [] }, { memberships: [{ tenantId, role: "OWNER" }, { tenantId: "tenant-b", role: "STAFF" }] }])(
    "denies authenticated sessions with missing or ambiguous membership (%j)", async (user) => {
      mocks.findUser.mockResolvedValue(user);
      const denied = { ok: false, error: "Tu sesión venció. Volvé a entrar." };
      expect(await Promise.all([
        saveRecipeAction(form()), saveRecipeAction(form({ payload: { ...payload, id: "r1" } })),
        archiveRecipeAction("r1"), unarchiveRecipeAction("r1"),
      ])).toEqual([denied, denied, denied, denied]);
      for (const fn of [mocks.createRecipe, mocks.updateRecipe, mocks.archiveRecipe, mocks.unarchiveRecipe, mocks.revalidatePath]) {
        expect(fn).not.toHaveBeenCalled();
      }
    },
  );

  it("payload inválido para zod (o JSON roto) → error, sin guardar", async () => {
    expect((await saveRecipeAction(form({ payload: { ...payload, type: "PIZZA" } }))).ok).toBe(false);
    expect((await saveRecipeAction(form({ payload: "{no es json" }))).ok).toBe(false);
    expect(mocks.createRecipe).not.toHaveBeenCalled();
  });

  it("crea sin id y actualiza con id", async () => {
    expect(await saveRecipeAction(form({ payload: { ...payload, tenantId: "tenant-b" } }))).toEqual({ ok: true, id: "r-new" });
    expect(mocks.recipesForTenant).toHaveBeenCalledWith("tenant-a");
    expect(mocks.createRecipe).toHaveBeenCalledWith(payload);
    expect(await saveRecipeAction(form({ payload: { ...payload, id: "r1" } }))).toEqual({ ok: true, id: "r1" });
    expect(mocks.updateRecipe).toHaveBeenCalledWith("r1", expect.objectContaining({ name: "Albóndigas de prueba" }));
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/recetas");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/recetas/r1");
  });

  it("foreign or absent recipe does not apply photo intent or invalidate cache", async () => {
    mocks.updateRecipe.mockRejectedValue(new mocks.RecipeNotFoundError());
    expect(await saveRecipeAction(form({ payload: { ...payload, id: "foreign" }, removePhoto: "1" })))
      .toEqual({ ok: false, error: "La receta ya no existe." });
    expect(mocks.removeRecipePhoto).not.toHaveBeenCalled();
    expect(mocks.scopedRemovePhoto).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("receta incompleta → issues del dominio", async () => {
    const issues = [{ field: "name", message: "Poné el nombre de la receta." }];
    mocks.createRecipe.mockRejectedValue(new mocks.RecipeNotPublishableError(issues));
    expect(await saveRecipeAction(form())).toEqual({ ok: false, issues });
  });

  it("una foto de 6 MB → photoInvalid sin procesarla ni guardar", async () => {
    const big = new File([new Uint8Array(6 * 1024 * 1024)], "foto.jpg", { type: "image/jpeg" });
    expect(await saveRecipeAction(form({ photo: big }))).toEqual({ ok: false, photoError: PHOTO_INVALID });
    expect(mocks.processRecipePhoto).not.toHaveBeenCalled();
    expect(mocks.createRecipe).not.toHaveBeenCalled();
  });

  it("MIME image/jpeg del navegador pero bytes de GIF → photoInvalid", async () => {
    const fake = new File([GIF], "foto.jpg", { type: "image/jpeg" });
    expect(await saveRecipeAction(form({ photo: fake }))).toEqual({ ok: false, photoError: PHOTO_INVALID });
    expect(mocks.processRecipePhoto).not.toHaveBeenCalled();
  });

  it("foto válida → se procesa y se guarda con el crédito", async () => {
    const r = await saveRecipeAction(form({ photo: new File([JPG], "f.jpg", { type: "image/jpeg" }), photoCredit: " Foto: Prueba " }));
    expect(r).toEqual({ ok: true, id: "r-new" });
    expect(mocks.scopedSetPhoto).toHaveBeenCalledWith("r-new", { data: Buffer.from("w"), thumbData: Buffer.from("t"), byteSize: 1, credit: "Foto: Prueba" });
    expect(mocks.setRecipePhoto).not.toHaveBeenCalled();
  });

  it("si la receta se guarda y falla processRecipePhoto → { ok:false, photoError } con el id", async () => {
    mocks.processRecipePhoto.mockRejectedValue(Object.assign(new Error("boom con bytes"), { name: "InvalidRecipeImageError" }));
    const r = await saveRecipeAction(form({ photo: new File([JPG], "f.jpg", { type: "image/jpeg" }) }));
    expect(r).toEqual({ ok: false, photoError: "No se pudo guardar la foto. Probá de nuevo.", id: "r-new" });
    expect(mocks.createRecipe).toHaveBeenCalledTimes(1);
  });

  it("quitar foto y cambiar solo el crédito", async () => {
    await saveRecipeAction(form({ payload: { ...payload, id: "r1" }, removePhoto: "1" }));
    expect(mocks.scopedRemovePhoto).toHaveBeenCalledWith("r1");
    expect(mocks.removeRecipePhoto).not.toHaveBeenCalled();
    await saveRecipeAction(form({ payload: { ...payload, id: "r1" }, photoCredit: "" }));
    expect(mocks.scopedSetPhotoCredit).toHaveBeenCalledWith("r1", null);
    expect(mocks.setRecipePhotoCredit).not.toHaveBeenCalled();
  });

  it("los console.error no incluyen el payload", async () => {
    mocks.createRecipe.mockRejectedValue(Object.assign(new Error("fallo SECRETO-DEL-PAYLOAD"), { code: "P2000" }));
    expect(await saveRecipeAction(form())).toEqual({ ok: false, error: "No se pudo guardar la receta. Probá de nuevo." });
    expect(errorSpy).toHaveBeenCalled();
    const logged = JSON.stringify(errorSpy.mock.calls);
    expect(logged).not.toContain("SECRETO-DEL-PAYLOAD");
    expect(logged).toContain("P2000");
  });
});

describe("archivar y volver a publicar", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    allowPanel();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("sin sesión no toca nada", async () => {
    mocks.auth.mockResolvedValue(null);
    expect((await archiveRecipeAction("r1")).ok).toBe(false);
    expect(mocks.archiveRecipe).not.toHaveBeenCalled();
  });

  it("llama al dominio y revalida", async () => {
    expect(await archiveRecipeAction("r1")).toEqual({ ok: true });
    expect(mocks.archiveRecipe).toHaveBeenCalledWith("r1");
    expect(await unarchiveRecipeAction("r1")).toEqual({ ok: true });
    expect(mocks.unarchiveRecipe).toHaveBeenCalledWith("r1");
    mocks.archiveRecipe.mockRejectedValue(new Error("x"));
    expect((await archiveRecipeAction("r1")).ok).toBe(false);
  });
});
