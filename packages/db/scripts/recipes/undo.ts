/**
 * HU-018a-2 (SDD 8.1): deshace una corrida de `recipes:extract --write`. Borra SOLO los borradores
 * que creó esa corrida (ids del archivo) y que siguen en DRAFT sin revisar. No toca nada más.
 *
 * Uso: npm run recipes:undo --workspace packages/db -- docs/recetarios/_extraccion/corrida-<…>.json
 */
import { readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { prisma } from "../../index";
import { deleteUnreviewedDrafts } from "../../domain/recipeImport";

const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));

async function main() {
  const arg = process.argv.slice(2).find((a) => !a.startsWith("--"));
  if (!arg) {
    console.error("Falta el archivo de la corrida: recipes:undo -- docs/recetarios/_extraccion/corrida-<…>.json");
    process.exit(1);
  }
  const file = isAbsolute(arg) ? arg : resolve(repoRoot, arg);
  const json = JSON.parse(readFileSync(file, "utf8")) as { createdIds?: unknown };
  const ids = Array.isArray(json.createdIds) ? json.createdIds.filter((x): x is string => typeof x === "string") : [];
  const deleted = await deleteUnreviewedDrafts(ids);
  console.log(
    `Corrida con ${ids.length} borradores creados: ${deleted} borrados. ${ids.length - deleted} quedan (ya revisados, publicados o borrados antes).`,
  );
}

main()
  .catch((err) => {
    console.error((err as Error).message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
