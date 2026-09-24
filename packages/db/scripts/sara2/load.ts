/**
 * Cargador de SARA 2 (HU-005, D14 paso 2). Lee packages/db/data/sara2/alimentos.json y hace upsert
 * por sourceKey, todo en una transacción. Idempotente: se puede correr en cada deploy.
 * Solo toca alimentos con fuente SARA 2; nunca borra (desactiva los que salieron del archivo).
 *
 * Uso: npm run sara2:load [-- --dry-run] [-- --allow-mass-deactivation]
 *      Producción: npm run sara2:load:prod --workspace packages/db (con DATABASE_URL en el entorno)
 */
import { readFileSync } from "node:fs";
import { validateSara2Dataset } from "@nutri-bot/core/sara2";
import { prisma } from "../../index";
import { loadSara2Dataset, type LoadSara2Result } from "../../domain/foodImport";

const dataFile = new URL("../../data/sara2/alimentos.json", import.meta.url);

class DryRunRollback extends Error {
  constructor(public readonly result: LoadSara2Result) {
    super("dry-run");
  }
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const allowMassDeactivation = process.argv.includes("--allow-mass-deactivation");

  let json: unknown;
  try {
    json = JSON.parse(readFileSync(dataFile, "utf8"));
  } catch (err) {
    console.error(`No se pudo leer alimentos.json: ${(err as Error).message}`);
    process.exit(1);
  }
  const valid = validateSara2Dataset(json);
  if (!valid.ok) {
    console.error("alimentos.json no es válido:");
    for (const e of valid.errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  let result: LoadSara2Result;
  try {
    result = await prisma.$transaction(
      async (tx) => {
        const r = await loadSara2Dataset(tx, valid.dataset, { allowMassDeactivation });
        if (dryRun) throw new DryRunRollback(r);
        return r;
      },
      { timeout: 300_000, maxWait: 10_000 },
    );
  } catch (err) {
    if (err instanceof DryRunRollback) result = err.result;
    else throw err;
  }
  const prefix = dryRun ? "SARA 2 (dry-run, no se escribió nada)" : "SARA 2";
  console.log(
    `${prefix}: ${result.total} en el archivo · ${result.created} creados · ${result.updated} actualizados · ${result.unchanged} sin cambios · ${result.deactivated} desactivados`,
  );
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
