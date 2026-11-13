import { foodNameCompareKey, validateRecipeForPublish, isRecipeMomentKey, isRecipeTagKey, isRecipeTypeKey } from "@nutri-bot/core";
import type { RecipeBundle, RecipeBundleIngredient, RecipeBundleRecipe } from "@nutri-bot/core/recipe-import";
import { prisma, type Prisma } from "../index";

// HU-018a-2 (SDD 5.3, 8.4, 12-D8): pase a producción de las recetas revisadas en desarrollo.
// NO se exporta desde domain/index.ts: solo lo usan los scripts recipes:export / recipes:import:prod.
// El import es idempotente por importKey, no toca recetas existentes y por defecto corre en seco.

type Dec = Prisma.Decimal | null | undefined;
const num = (d: Dec): number | null => (d === null || d === undefined ? null : Number(d.toString()));
const num0 = (d: Dec): number => num(d) ?? 0;

const EXPORT_SELECT = {
  id: true,
  importKey: true,
  name: true,
  origin: true,
  type: true,
  moments: true,
  tags: true,
  yieldPortions: true,
  portionHousehold: true,
  portionGrams: true,
  preparation: true,
  tips: true,
  sourceName: true,
  publishedPortionText: true,
  publishedKcal: true,
  publishedProteinG: true,
  publishedCarbsG: true,
  publishedFatG: true,
  publishedFiberG: true,
  importFile: true,
  importPage: true,
  ingredients: {
    orderBy: { order: "asc" },
    select: {
      order: true,
      label: true,
      grams: true,
      noQuantity: true,
      household: true,
      rawText: true,
      food: {
        select: {
          name: true,
          source: true,
          sourceKey: true,
          kcalPer100: true,
          proteinPer100: true,
          carbsPer100: true,
          fatPer100: true,
          fiberPer100: true,
        },
      },
    },
  },
  photo: { select: { data: true, thumbData: true, credit: true } },
} satisfies Prisma.RecipeSelect;

type ExportRow = Prisma.RecipeGetPayload<{ select: typeof EXPORT_SELECT }>;

function toBundleIngredient(i: ExportRow["ingredients"][number]): RecipeBundleIngredient {
  let food: RecipeBundleIngredient["food"] = null;
  if (i.food) {
    food =
      i.food.source === "SARA2" && i.food.sourceKey
        ? { sourceKey: i.food.sourceKey }
        : {
            ownName: i.food.name,
            per100: {
              kcal: num0(i.food.kcalPer100),
              protein: num0(i.food.proteinPer100),
              carbs: num0(i.food.carbsPer100),
              fat: num0(i.food.fatPer100),
              fiber: num0(i.food.fiberPer100),
            },
          };
  }
  return {
    order: i.order,
    label: i.label,
    grams: num(i.grams),
    noQuantity: i.noQuantity,
    household: i.household,
    rawText: i.rawText,
    food,
  };
}

function toBundleRecipe(r: ExportRow): RecipeBundleRecipe {
  const published = [r.publishedPortionText, r.publishedKcal, r.publishedProteinG, r.publishedCarbsG, r.publishedFatG, r.publishedFiberG].some(
    (v) => v !== null,
  )
    ? {
        portionText: r.publishedPortionText,
        kcal: num(r.publishedKcal),
        protein: num(r.publishedProteinG),
        carbs: num(r.publishedCarbsG),
        fat: num(r.publishedFatG),
        fiber: num(r.publishedFiberG),
      }
    : null;
  return {
    // Las MANUAL no tienen importKey: se exportan con una clave estable a partir del id de desarrollo.
    importKey: r.importKey ?? `manual:${r.id}`,
    name: r.name,
    origin: r.origin,
    type: r.type ?? "",
    moments: r.moments,
    tags: r.tags,
    yieldPortions: num(r.yieldPortions) ?? 0,
    portionHousehold: r.portionHousehold ?? "",
    portionGrams: num(r.portionGrams),
    preparation: r.preparation,
    tips: r.tips,
    sourceName: r.sourceName,
    published,
    importFile: r.importFile,
    importPage: r.importPage,
    ingredients: r.ingredients.map(toBundleIngredient),
    photo: r.photo
      ? {
          dataBase64: Buffer.from(r.photo.data).toString("base64"),
          thumbBase64: Buffer.from(r.photo.thumbData).toString("base64"),
          credit: r.photo.credit,
        }
      : null,
  };
}

/** Recetas PUBLISHED (por defecto origin = IMPORT; con ids, esas). Con fotos en base64. */
export async function exportPublishedRecipes(params: { ids?: string[]; origin?: "IMPORT" | "MANUAL" }): Promise<RecipeBundle> {
  const ids = params.ids?.filter(Boolean) ?? [];
  const where: Prisma.RecipeWhereInput = {
    status: "PUBLISHED",
    ...(ids.length > 0 ? { id: { in: ids } } : {}),
    ...(params.origin ? { origin: params.origin } : ids.length > 0 ? {} : { origin: "IMPORT" }),
  };
  const rows = await prisma.recipe.findMany({ where, select: EXPORT_SELECT, orderBy: [{ importFile: "asc" }, { importPage: "asc" }, { name: "asc" }] });
  return { format: 1, exportedAt: new Date().toISOString(), recipes: rows.map(toBundleRecipe) };
}

export type ImportOutcome =
  | { importKey: string; result: "created"; id: string }
  | { importKey: string; result: "skipped-exists" }
  | { importKey: string; result: "skipped-food"; detail: string }
  | { importKey: string; result: "skipped-invalid"; issues: string[] };

/** Id que devuelve "created" en seco (no se escribió nada). */
export const DRY_RUN_ID = "(en seco)";

const MACRO_TOLERANCE = 0.01;

interface OwnFood {
  id: string;
  key: string;
  per100: { kcal: number; protein: number; carbs: number; fat: number; fiber: number };
}

function sameMacros(a: OwnFood["per100"], b: OwnFood["per100"]): boolean {
  return (["kcal", "protein", "carbs", "fat", "fiber"] as const).every((k) => Math.abs(a[k] - b[k]) <= MACRO_TOLERANCE);
}

/**
 * Mapea alimentos: SARA2 por sourceKey; PROPIO por foodNameCompareKey(nombre) entre propios activos,
 * con UNA sola coincidencia y los mismos macros cada 100 g (±0,01); si no → skipped-food. Crea
 * PUBLISHED (valida). dryRun no escribe. No toca recetas que ya existen (skipped-exists).
 */
export async function importRecipeBundle(bundle: RecipeBundle, opts: { dryRun: boolean }): Promise<ImportOutcome[]> {
  const sourceKeys = [
    ...new Set(
      bundle.recipes.flatMap((r) => r.ingredients.flatMap((i) => (i.food && "sourceKey" in i.food ? [i.food.sourceKey] : []))),
    ),
  ];
  const [saraRows, ownRows] = await Promise.all([
    sourceKeys.length > 0
      ? prisma.food.findMany({ where: { source: "SARA2", sourceKey: { in: sourceKeys } }, select: { id: true, sourceKey: true, active: true } })
      : Promise.resolve([]),
    prisma.food.findMany({
      where: { source: "PROPIO", active: true },
      select: { id: true, name: true, kcalPer100: true, proteinPer100: true, carbsPer100: true, fatPer100: true, fiberPer100: true },
    }),
  ]);
  const saraByKey = new Map(saraRows.map((f) => [f.sourceKey!, f.id]));
  const own: OwnFood[] = ownRows.map((f) => ({
    id: f.id,
    key: foodNameCompareKey(f.name),
    per100: {
      kcal: num0(f.kcalPer100),
      protein: num0(f.proteinPer100),
      carbs: num0(f.carbsPer100),
      fat: num0(f.fatPer100),
      fiber: num0(f.fiberPer100),
    },
  }));

  const out: ImportOutcome[] = [];
  for (const r of bundle.recipes) {
    const exists = await prisma.recipe.findUnique({ where: { importKey: r.importKey }, select: { id: true } });
    if (exists) {
      out.push({ importKey: r.importKey, result: "skipped-exists" });
      continue;
    }

    // Alimentos.
    const foodIds: (string | null)[] = [];
    let foodProblem: string | null = null;
    for (const i of r.ingredients) {
      if (!i.food) {
        foodIds.push(null);
      } else if ("sourceKey" in i.food) {
        const id = saraByKey.get(i.food.sourceKey);
        if (!id) {
          foodProblem = `SARA2 sourceKey no encontrado: ${i.food.sourceKey}`;
          break;
        }
        foodIds.push(id);
      } else {
        const key = foodNameCompareKey(i.food.ownName);
        const matches = own.filter((f) => f.key === key);
        if (matches.length !== 1) {
          foodProblem =
            matches.length === 0
              ? `Falta el alimento propio «${i.food.ownName}»`
              : `Hay ${matches.length} alimentos propios «${i.food.ownName}»`;
          break;
        }
        if (!sameMacros(matches[0]!.per100, i.food.per100)) {
          foodProblem = `El alimento propio «${i.food.ownName}» tiene otros valores cada 100 g`;
          break;
        }
        foodIds.push(matches[0]!.id);
      }
    }
    if (foodProblem) {
      out.push({ importKey: r.importKey, result: "skipped-food", detail: foodProblem });
      continue;
    }

    // Validación para publicar (igual que en el panel).
    const type = isRecipeTypeKey(r.type) ? r.type : null;
    const moments = r.moments.filter(isRecipeMomentKey);
    const tags = r.tags.filter(isRecipeTagKey);
    const ingredients = r.ingredients.map((i, n) => ({
      foodId: foodIds[n] ?? null,
      label: i.label,
      grams: i.noQuantity ? null : i.grams,
      noQuantity: i.noQuantity,
      household: i.household,
      rawText: i.rawText,
    }));
    const issues = validateRecipeForPublish({
      name: r.name,
      type,
      moments,
      yieldPortions: r.yieldPortions,
      portionHousehold: r.portionHousehold,
      origin: r.origin,
      sourceName: r.sourceName,
      ingredients,
    });
    if (issues.length > 0) {
      out.push({ importKey: r.importKey, result: "skipped-invalid", issues: issues.map((x) => x.message) });
      continue;
    }

    if (opts.dryRun) {
      out.push({ importKey: r.importKey, result: "created", id: DRY_RUN_ID });
      continue;
    }

    try {
      const id = await prisma.$transaction(async (tx) => {
        const created = await tx.recipe.create({
          data: {
            importKey: r.importKey,
            name: r.name.trim(),
            status: "PUBLISHED",
            origin: r.origin,
            type,
            moments,
            tags,
            yieldPortions: r.yieldPortions,
            portionHousehold: r.portionHousehold.trim(),
            portionGrams: r.portionGrams,
            preparation: r.preparation,
            tips: r.tips,
            sourceName: r.sourceName,
            ...(r.origin === "IMPORT" && r.published
              ? {
                  publishedPortionText: r.published.portionText,
                  publishedKcal: r.published.kcal,
                  publishedProteinG: r.published.protein,
                  publishedCarbsG: r.published.carbs,
                  publishedFatG: r.published.fat,
                  publishedFiberG: r.published.fiber,
                }
              : {}),
            importFile: r.importFile,
            importPage: r.importPage,
            publishedAt: new Date(),
          },
          select: { id: true },
        });
        if (ingredients.length > 0) {
          await tx.recipeIngredient.createMany({
            data: ingredients.map((i, order) => ({ recipeId: created.id, order, ...i })),
          });
        }
        if (r.photo) {
          const data = Buffer.from(r.photo.dataBase64, "base64");
          await tx.recipePhoto.create({
            data: {
              recipeId: created.id,
              data,
              thumbData: Buffer.from(r.photo.thumbBase64, "base64"),
              byteSize: data.length,
              mimeType: "image/webp",
              credit: r.photo.credit,
            },
          });
        }
        return created.id;
      });
      out.push({ importKey: r.importKey, result: "created", id });
    } catch (err) {
      // Otra corrida la creó en el medio (importKey único): no se duplica.
      if ((err as { code?: string }).code === "P2002") out.push({ importKey: r.importKey, result: "skipped-exists" });
      else throw err;
    }
  }
  return out;
}
