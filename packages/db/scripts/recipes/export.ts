/**
 * HU-018a-2 (SDD 8.4): exporta las recetas PUBLICADAS de la base de desarrollo a un bundle JSON,
 * con las fotos en base64, para pasarlas a producción con `recipes:import:prod`.
 * Sale a docs/recetarios/_exportacion/ (ignorado por git: tiene datos de terceros, D3).
 *
 * Uso: npm run recipes:export --workspace packages/db -- [--ids id1,id2] [--origin IMPORT|MANUAL]
 *      Sin --ids ni --origin: todas las PUBLISHED de origen IMPORT.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateRecipeBundle } from "@nutri-bot/core/recipe-import";
import { prisma } from "../../index";
import { exportPublishedRecipes } from "../../domain/recipeTransfer";

const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const outDir = resolve(repoRoot, "docs/recetarios/_exportacion");

function argValue(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

async function main() {
  const ids = (argValue("--ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const originArg = argValue("--origin");
  if (originArg && originArg !== "IMPORT" && originArg !== "MANUAL") {
    console.error("--origin tiene que ser IMPORT o MANUAL.");
    process.exit(1);
  }
  const bundle = await exportPublishedRecipes({
    ...(ids.length > 0 ? { ids } : {}),
    ...(originArg ? { origin: originArg as "IMPORT" | "MANUAL" } : {}),
  });
  const valid = validateRecipeBundle(JSON.parse(JSON.stringify(bundle)));
  if (!valid.ok) {
    console.error("El bundle no es válido (no se escribió):");
    for (const e of valid.errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  if (ids.length > 0 && bundle.recipes.length !== ids.length) {
    console.warn(`Aviso: pediste ${ids.length} ids y se exportaron ${bundle.recipes.length} (solo salen las PUBLISHED).`);
  }
  mkdirSync(outDir, { recursive: true });
  const stamp = bundle.exportedAt.replace(/[:.]/g, "-");
  const file = resolve(outDir, `recetas-${stamp}.json`);
  writeFileSync(file, JSON.stringify(bundle));
  const photos = bundle.recipes.filter((r) => r.photo).length;
  console.log(`Exportadas: ${bundle.recipes.length} recetas (${photos} con foto).`);
  console.log(`Bundle: docs/recetarios/_exportacion/recetas-${stamp}.json`);
}

main()
  .catch((err) => {
    console.error((err as Error).message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
