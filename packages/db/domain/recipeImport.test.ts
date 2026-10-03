// HU-018a-2: borradores de la carga asistida (prisma mockeado, patrón de recipes.test.ts). Draft
// SINTÉTICO armado con el parser de core sobre una página inventada.
import { extractRecipesFromPages } from "@nutri-bot/core/recipe-import";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { F1_PAGE } from "../../core/src/recipe-import/__fixtures__/synthetic";

const delegate = () => ({
  findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn(), create: vi.fn(),
  createMany: vi.fn(), count: vi.fn(), delete: vi.fn(), deleteMany: vi.fn(), groupBy: vi.fn(),
});

const mocks = vi.hoisted(() => ({ prisma: {} as Record<string, any> }));
vi.mock("../index", () => ({ prisma: mocks.prisma }));

import {
  chooseImportCandidateAsPhoto,
  deleteUnreviewedDrafts,
  getImportImageBytes,
  listDraftFiles,
  listDraftQueue,
  upsertImportedDraft,
  type ImportImageInput,
} from "./recipeImport";

const p = () => mocks.prisma;

beforeEach(() => {
  vi.resetAllMocks();
  for (const key of ["recipe", "recipeIngredient", "recipePhoto", "recipeImportImage", "nutritionPlan", "planTemplate"]) {
    mocks.prisma[key] = delegate();
  }
  mocks.prisma.$transaction = vi.fn((fn: (tx: unknown) => unknown) => fn(mocks.prisma));
});

const draft = extractRecipesFromPages([F1_PAGE], { file: "Almuerzos y cenas inventados 1.pdf" }).drafts[0]!;
const images: ImportImageInput[] = [
  { kind: "PAGE", order: 0, data: Buffer.from("page"), thumbData: null, width: 1000, height: 1400 },
  { kind: "CANDIDATE", order: 0, data: Buffer.from("full"), thumbData: Buffer.from("thumb"), width: 1200, height: 900 },
];

/** Ids sobre los que se escribió o borró algo (para comprobar que nunca se toca otra receta). */
function touchedIds(): string[] {
  const ids: string[] = [];
  for (const call of p().recipe.updateMany.mock.calls) ids.push(call[0].where.id);
  for (const call of p().recipe.update.mock.calls) ids.push(call[0].where.id);
  for (const call of p().recipe.delete.mock.calls) ids.push(call[0].where.id);
  for (const call of p().recipeIngredient.deleteMany.mock.calls) ids.push(call[0].where.recipeId);
  for (const call of p().recipeImportImage.deleteMany.mock.calls) ids.push(call[0].where.recipeId);
  return ids;
}

describe("upsertImportedDraft", () => {
  it("created: DRAFT/IMPORT con sugerencias, ingredientes sin alimento y los gramos del texto", async () => {
    p().recipe.findUnique.mockResolvedValue(null);
    p().recipe.create.mockResolvedValue({ id: "new1" });
    await expect(upsertImportedDraft(draft, images)).resolves.toEqual({ id: "new1", outcome: "created" });

    const data = p().recipe.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      name: "Bolitas de mijo",
      status: "DRAFT",
      origin: "IMPORT",
      importKey: draft.importKey,
      type: "MAIN_DISH",
      moments: ["LUNCH", "DINNER"],
      yieldPortions: 8,
      publishedKcal: 210,
      importFile: "Almuerzos y cenas inventados 1.pdf",
      importPage: 7,
    });
    expect(data).not.toHaveProperty("reviewedAt");
    const rows = p().recipeIngredient.createMany.mock.calls[0][0].data;
    expect(rows.every((r: any) => r.foodId === null && r.recipeId === "new1")).toBe(true);
    expect(rows.map((r: any) => r.grams)).toEqual([200, 150, null, null, null, null]);
    expect(rows.find((r: any) => r.label === "Orégano")).toMatchObject({ noQuantity: true, grams: null });
    // Cada gramo guardado está escrito en su línea original (no se inventan gramos, D5).
    for (const r of rows) if (r.grams !== null) expect(r.rawText).toContain(`${r.grams}g`);
    const imgs = p().recipeImportImage.createMany.mock.calls[0][0].data;
    expect(imgs.map((i: any) => [i.recipeId, i.kind])).toEqual([["new1", "PAGE"], ["new1", "CANDIDATE"]]);
  });

  it("updated: DRAFT sin revisar → reemplaza datos, ingredientes e imágenes SOLO de esa receta", async () => {
    p().recipe.findUnique.mockResolvedValue({ id: "d1", status: "DRAFT", reviewedAt: null });
    p().recipe.updateMany.mockResolvedValue({ count: 1 });
    await expect(upsertImportedDraft(draft, images)).resolves.toEqual({ id: "d1", outcome: "updated" });
    expect(p().recipe.updateMany.mock.calls[0][0].where).toEqual({ id: "d1", status: "DRAFT", reviewedAt: null });
    expect(p().recipeIngredient.deleteMany).toHaveBeenCalledWith({ where: { recipeId: "d1" } });
    expect(p().recipeImportImage.deleteMany).toHaveBeenCalledWith({ where: { recipeId: "d1" } });
    expect(new Set(touchedIds())).toEqual(new Set(["d1"]));
    expect(p().recipe.create).not.toHaveBeenCalled();
  });

  it("updated sin imágenes (null) conserva las que tenía", async () => {
    p().recipe.findUnique.mockResolvedValue({ id: "d1", status: "DRAFT", reviewedAt: null });
    p().recipe.updateMany.mockResolvedValue({ count: 1 });
    await upsertImportedDraft(draft, null);
    expect(p().recipeImportImage.deleteMany).not.toHaveBeenCalled();
    expect(p().recipeImportImage.createMany).not.toHaveBeenCalled();
  });

  it("skipped-reviewed: un DRAFT revisado no se pisa", async () => {
    p().recipe.findUnique.mockResolvedValue({ id: "d2", status: "DRAFT", reviewedAt: new Date() });
    await expect(upsertImportedDraft(draft, images)).resolves.toEqual({ id: "d2", outcome: "skipped-reviewed" });
    expect(touchedIds()).toEqual([]);
    expect(p().$transaction).not.toHaveBeenCalled();
  });

  it("skipped-reviewed también si lo revisaron entre la lectura y la escritura", async () => {
    p().recipe.findUnique.mockResolvedValue({ id: "d3", status: "DRAFT", reviewedAt: null });
    p().recipe.updateMany.mockResolvedValue({ count: 0 });
    await expect(upsertImportedDraft(draft, images)).resolves.toEqual({ id: "d3", outcome: "skipped-reviewed" });
    expect(p().recipeIngredient.deleteMany).not.toHaveBeenCalled();
  });

  it("skipped-not-draft: PUBLISHED o ARCHIVED no se tocan", async () => {
    for (const status of ["PUBLISHED", "ARCHIVED"]) {
      p().recipe.findUnique.mockResolvedValue({ id: "pub", status, reviewedAt: new Date() });
      await expect(upsertImportedDraft(draft, images)).resolves.toEqual({ id: "pub", outcome: "skipped-not-draft" });
    }
    expect(touchedIds()).toEqual([]);
  });
});

describe("cola y archivos", () => {
  it("listDraftQueue ordena por archivo, página y nombre, y filtra por archivo", async () => {
    p().recipe.findMany.mockResolvedValue([]);
    await listDraftQueue({ file: "A.pdf" });
    expect(p().recipe.findMany).toHaveBeenCalledWith({
      where: { status: "DRAFT", importFile: "A.pdf" },
      orderBy: [{ importFile: "asc" }, { importPage: "asc" }, { name: "asc" }],
      select: { id: true, name: true, importFile: true, importPage: true },
    });
    await listDraftQueue();
    expect(p().recipe.findMany.mock.calls[1][0].where).toEqual({ status: "DRAFT" });
  });

  it("listDraftFiles agrupa los borradores por archivo", async () => {
    p().recipe.groupBy.mockResolvedValue([
      { importFile: "A.pdf", _count: { _all: 3 } },
      { importFile: null, _count: { _all: 1 } },
    ]);
    await expect(listDraftFiles()).resolves.toEqual([{ file: "A.pdf", count: 3 }]);
  });
});

describe("imágenes", () => {
  it("getImportImageBytes: thumb de una candidata; PAGE sin thumb devuelve la imagen; null si no existe", async () => {
    p().recipeImportImage.findUnique.mockResolvedValueOnce({ thumbData: Buffer.from("t"), data: Buffer.from("f") });
    expect((await getImportImageBytes("c1", "thumb"))?.data.toString()).toBe("t");
    p().recipeImportImage.findUnique.mockResolvedValueOnce({ thumbData: null, data: Buffer.from("page") });
    expect(await getImportImageBytes("pg", "thumb")).toEqual({ data: Buffer.from("page"), mimeType: "image/webp" });
    p().recipeImportImage.findUnique.mockResolvedValueOnce(null);
    expect(await getImportImageBytes("x", "full")).toBeNull();
  });

  it("chooseImportCandidateAsPhoto copia la candidata DE ESA receta a RecipePhoto", async () => {
    p().recipeImportImage.findFirst.mockResolvedValue({ data: Buffer.from("full!"), thumbData: Buffer.from("th") });
    p().recipePhoto.create.mockResolvedValue({ id: "ph1" });
    await expect(chooseImportCandidateAsPhoto("r1", "c1", " Foto: X ")).resolves.toEqual({ photoId: "ph1" });
    expect(p().recipeImportImage.findFirst.mock.calls[0][0].where).toEqual({ id: "c1", recipeId: "r1", kind: "CANDIDATE" });
    expect(p().recipePhoto.deleteMany).toHaveBeenCalledWith({ where: { recipeId: "r1" } });
    expect(p().recipePhoto.create.mock.calls[0][0].data).toMatchObject({ recipeId: "r1", byteSize: 5, credit: "Foto: X" });
  });

  it("chooseImportCandidateAsPhoto con una imagen de otra receta no escribe nada", async () => {
    p().recipeImportImage.findFirst.mockResolvedValue(null);
    await expect(chooseImportCandidateAsPhoto("r1", "ajena", null)).rejects.toThrow();
    expect(p().recipePhoto.create).not.toHaveBeenCalled();
  });
});

describe("deleteUnreviewedDrafts", () => {
  it("filtra por id in ids, status DRAFT y reviewedAt null", async () => {
    p().recipe.deleteMany.mockResolvedValue({ count: 2 });
    await expect(deleteUnreviewedDrafts(["a", "b", "a"])).resolves.toBe(2);
    expect(p().recipe.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["a", "b"] }, status: "DRAFT", reviewedAt: null },
    });
  });

  it("sin ids no borra nada", async () => {
    await expect(deleteUnreviewedDrafts([])).resolves.toBe(0);
    expect(p().recipe.deleteMany).not.toHaveBeenCalled();
  });
});
