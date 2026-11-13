/**
 * HU-020 (SDD 5.8): deshace una corrida de `plans:import --write`. Borra SOLO las plantillas que creó
 * esa corrida (ids del archivo) y que siguen en DRAFT + IMPORT sin revisar. No toca nada más.
 *
 * Uso: npm run plans:undo --workspace packages/db -- docs/planes-alimentacion/_importacion/corrida-<…>.json
 *      DATABASE_URL=… npm run plans:undo:prod --workspace packages/db -- <corrida.json>
 */
import { readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { prisma } from "../../index";
import { deleteUnreviewedTemplateDrafts } from "../../domain/planTemplateImport";
import { describeDbTarget } from "../lib/cli";

const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));

async function main() {
  const arg = process.argv.slice(2).find((a) => !a.startsWith("--"));
  if (!arg) {
    console.error("Falta el archivo de la corrida: plans:undo -- docs/planes-alimentacion/_importacion/corrida-<…>.json");
    process.exit(1);
  }
  const file = isAbsolute(arg) ? arg : resolve(repoRoot, arg);
  const json = JSON.parse(readFileSync(file, "utf8")) as { createdIds?: unknown };
  const ids = Array.isArray(json.createdIds) ? json.createdIds.filter((x): x is string => typeof x === "string") : [];
  console.log(`Base: ${describeDbTarget(process.env.DATABASE_URL ?? "")}`);
  const deleted = await deleteUnreviewedTemplateDrafts(ids);
  console.log(
    `Corrida con ${ids.length} plantillas creadas: ${deleted} borradas. ${ids.length - deleted} quedan (revisadas, publicadas o borradas antes).`,
  );
}

main()
  .catch((err) => {
    console.error((err as Error).message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
