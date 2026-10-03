import { notFound, redirect } from "next/navigation";
import { recipeFileTitle } from "@nutri-bot/core/recipe-import";
import { getRecipe, listDraftFiles, listDraftQueue, listFoodsForRecipes } from "@nutri-bot/db/domain";
import { ReviewScreen } from "./review-screen";
import type { RecipeReview } from "./review-parts";

export const dynamic = "force-dynamic";

const importUrl = (id: string, size: "thumb" | "full") => `/api/recetas/importacion/${id}?size=${size}`;

function hintWarnings(hints: unknown): string[] {
  if (typeof hints !== "object" || hints === null) return [];
  const w = (hints as { warnings?: unknown }).warnings;
  return Array.isArray(w) ? w.filter((x): x is string => typeof x === "string") : [];
}

export default async function RevisarBorradorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const file = typeof query.archivo === "string" && query.archivo.trim() !== "" ? query.archivo : null;
  const recipe = await getRecipe(id);
  if (!recipe) notFound();
  // Ya publicada o archivada: se edita en la ficha.
  if (recipe.status !== "DRAFT") redirect(`/recetas/${id}`);

  const foodIds = recipe.ingredients.flatMap((i) => (i.food ? [i.food.id] : []));
  const [queue, files, foods] = await Promise.all([
    listDraftQueue(file ? { file } : undefined),
    listDraftFiles(),
    listFoodsForRecipes(foodIds),
  ]);
  const index = queue.findIndex((q) => q.id === id);
  const nextId = (index >= 0 ? queue[index + 1]?.id : undefined) ?? queue.find((q) => q.id !== id)?.id ?? null;

  const imp = recipe.import;
  const label = imp?.file
    ? `${recipeFileTitle(imp.file)}${imp.page ? ` · pág. ${imp.page}` : ""}`
    : "Sin archivo de origen";
  const review: RecipeReview = {
    position: index + 1,
    total: queue.length,
    file,
    files,
    nextId,
    original: {
      pageImageUrl: imp?.pageImageId ? importUrl(imp.pageImageId, "thumb") : null,
      pageImageFullUrl: imp?.pageImageId ? importUrl(imp.pageImageId, "full") : null,
      rawText: imp?.rawText ?? null,
      warnings: hintWarnings(imp?.hints),
      label,
    },
    candidates: (imp?.candidateIds ?? []).map((cid) => ({ id: cid, thumbUrl: importUrl(cid, "thumb"), fullUrl: importUrl(cid, "full") })),
  };

  return <ReviewScreen recipe={recipe} foods={foods} review={review} />;
}
