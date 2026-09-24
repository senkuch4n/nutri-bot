/**
 * Lector de SARA 2 (HU-005, D14 paso 1). Solo para desarrollo: lee el PDF con `pdftotext -bbox`
 * (poppler), valida cada fila y escribe:
 *   - packages/db/data/sara2/reporte.md    (siempre)
 *   - packages/db/data/sara2/alimentos.json (solo si la lectura cumple los criterios L1–L6)
 * No toca la base. Producción no lo necesita: carga el JSON con `sara2:load`.
 *
 * Uso (desde la raíz): npm run sara2:read [-- --pdf <ruta>]
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readSara2, renderSara2Report, serializeSara2Dataset, type Sara2Dataset } from "@nutri-bot/core/sara2";

const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const outDir = resolve(repoRoot, "packages/db/data/sara2");
const DEFAULT_PDF = "docs/tabla-composicion-quimica-alimentos-argentina_ennys2__.pdf";

function argValue(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

function main() {
  const pdfPath = resolve(repoRoot, argValue("--pdf") ?? DEFAULT_PDF);
  const pdfRel = relative(repoRoot, pdfPath);
  let xhtml: string;
  try {
    xhtml = execFileSync("pdftotext", ["-bbox", pdfPath, "-"], {
      maxBuffer: 64 * 1024 * 1024,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      console.error("Falta pdftotext (poppler). En macOS: brew install poppler");
    } else {
      console.error(`No se pudo leer ${pdfRel}: ${(err as Error).message}`);
    }
    process.exit(1);
  }
  const sha256 = createHash("sha256").update(readFileSync(pdfPath)).digest("hex");
  const result = readSara2(xhtml);

  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    resolve(outDir, "reporte.md"),
    renderSara2Report(result, { file: pdfRel, sha256, generatedAt: new Date().toISOString() }),
  );

  const s = result.summary;
  const pct = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(s.rejectedPct);
  if (result.status !== "ok") {
    console.error(`SARA 2: importación FALLIDA (${result.failures.join(" · ")}). Ver packages/db/data/sara2/reporte.md`);
    process.exit(1);
  }
  const dataset: Sara2Dataset = {
    format: 1,
    source: {
      title: "SARA 2: Tabla de composición química de alimentos para Argentina. Compilación para ENNyS 2",
      publisher: "Ministerio de Salud de la Nación",
      year: 2022,
      file: pdfRel,
      sha256,
    },
    status: "ok",
    summary: s,
    tables: result.tables,
    foods: result.foods,
  };
  writeFileSync(resolve(outDir, "alimentos.json"), serializeSara2Dataset(dataset));
  console.log(
    `SARA 2: ${s.imported} importadas de ${s.rowsA} (${s.rejected} rechazadas, ${pct} %), ${s.excluded} excluidas → packages/db/data/sara2/`,
  );
}

main();
