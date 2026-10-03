/**
 * HU-018a-2 (SDD 8.1): carga asistida de recetas. Lee los PDF de docs/recetarios/ con poppler
 * (pdftotext -bbox) y arma BORRADORES. Sin IA y sin inventar gramos.
 *
 * Por defecto corre EN SECO: no se conecta a la base. Escribe el reporte en
 * docs/recetarios/_extraccion/reporte.md (ignorado por git) y por consola imprime SOLO contadores,
 * nunca texto de los recetarios (D3).
 *
 * Uso (desde la raíz):
 *   npm run recipes:extract --workspace packages/db                              # en seco
 *   npm run recipes:extract --workspace packages/db -- --file "Colaciones_compressed.pdf"
 *   npm run recipes:extract --workspace packages/db -- --write [--images] [--file …] [--limit N] [--yes]
 *
 * --write: upsertImportedDraft por cada borrador (no pisa recetas publicadas ni borradores ya
 * revisados) y guarda la corrida en docs/recetarios/_extraccion/corrida-<ISO>.json para poder
 * deshacerla con `recipes:undo`. --limit N: solo los primeros N borradores (muestra chica).
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { foodSearchText } from "@nutri-bot/core";
import {
  extractRecipesFromPages,
  pickRecipeFiles,
  suggestFood,
  type RecipeImportDraft,
  type SkippedPageReason,
  type SuggestableFood,
} from "@nutri-bot/core/recipe-import";
import { parseBboxXhtml } from "@nutri-bot/core/sara2";

const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const recipesDir = resolve(repoRoot, "docs/recetarios");
const outDir = resolve(recipesDir, "_extraccion");
const sara2File = new URL("../../data/sara2/alimentos.json", import.meta.url);

function argValues(flag: string): string[] {
  const out: string[] = [];
  process.argv.forEach((a, i) => {
    if (a === flag && process.argv[i + 1]) out.push(process.argv[i + 1]!);
  });
  return out;
}
const hasFlag = (flag: string) => process.argv.includes(flag);

function run(cmd: string, args: string[], encoding: "utf8" | "buffer" = "utf8"): string {
  try {
    return execFileSync(cmd, args, {
      maxBuffer: 256 * 1024 * 1024,
      encoding: encoding === "utf8" ? "utf8" : undefined,
      stdio: ["ignore", "pipe", "ignore"],
    }) as unknown as string;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      console.error(`Falta ${cmd} (poppler). En macOS: brew install poppler`);
      process.exit(1);
    }
    throw err;
  }
}

// ── Garantía D5: ningún gramo sin un token en el texto ────────────────────────────────────────

/** Regex propia del script (no la del parser): números seguidos de g/kg en el texto original. */
function gramTokens(text: string): number[] {
  return [...text.matchAll(/(\d+(?:[.,]\d+)?)\s*(kgs?|kilos?|gramos|grs?|g)(?![a-zA-ZñÑáéíóú])/gi)].map((m) => {
    const raw = m[1]!;
    const v = /^\d{1,3}\.\d{3}$/.test(raw) ? Number(raw.replace(".", "")) : Number(raw.replace(",", "."));
    return m[2]!.toLowerCase().startsWith("k") ? Math.round(v * 1000 * 100) / 100 : v;
  });
}

function assertNoInventedGrams(drafts: readonly RecipeImportDraft[]): void {
  for (const d of drafts) {
    d.ingredients.forEach((i, n) => {
      if (i.grams === null) return;
      if (!gramTokens(i.rawText).includes(i.grams)) {
        // No se imprime el texto (es de terceros): solo dónde está.
        throw new Error(`Gramos sin token en el texto: ${d.file} p${d.page}, ingrediente ${n + 1}. Se corta la corrida.`);
      }
    });
  }
}

// ── Imágenes (solo con --images) ──────────────────────────────────────────────────────────────

interface ImageRow {
  page: number;
  type: string;
  width: number;
  height: number;
  objectId: string;
}

function listImages(pdf: string): ImageRow[] {
  return run("pdfimages", ["-list", pdf])
    .split("\n")
    .slice(2)
    .map((l) => l.trim().split(/\s+/))
    .filter((p) => p.length >= 12 && /^\d+$/.test(p[0]!))
    .map((p) => ({ page: Number(p[0]), type: p[2]!, width: Number(p[3]), height: Number(p[4]), objectId: p[10]! }));
}

async function pageImages(
  pdf: string,
  page: number,
  rows: readonly ImageRow[],
  totalPages: number,
): Promise<import("../../domain/recipeImport").ImportImageInput[]> {
  const { processImportPage, processRecipePhoto } = await import("../../media/recipe-photo");
  const tmp = mkdtempSync(join(tmpdir(), "recetas-"));
  try {
    const out: import("../../domain/recipeImport").ImportImageInput[] = [];
    // Página renderizada (columna "Original" de la revisión).
    run("pdftoppm", ["-r", "80", "-png", "-f", String(page), "-l", String(page), "-singlefile", pdf, join(tmp, "page")]);
    const pageImg = await processImportPage(readFileSync(join(tmp, "page.png")));
    out.push({ kind: "PAGE", order: 0, data: pageImg.data, thumbData: null, width: pageImg.width, height: pageImg.height });

    // Candidatas: fotos grandes que no son decoración. La SDD dice "no se repite en 3 páginas o más",
    // pero estos PDF reusan el mismo objeto de foto en 3–4 páginas (recetas vecinas e intro): se
    // toma como decoración solo si aparece en al menos 3 páginas Y en el 30 % del archivo (un logo).
    const decorationPages = Math.max(3, Math.ceil(totalPages * 0.3));
    const pagesByObject = new Map<string, Set<number>>();
    for (const r of rows) pagesByObject.set(r.objectId, (pagesByObject.get(r.objectId) ?? new Set()).add(r.page));
    const onPage = rows.filter((r) => r.page === page);
    const picked = onPage
      .map((r, index) => ({ r, index }))
      .filter(({ r }) => {
        const ratio = r.width / r.height;
        return (
          r.type === "image" && r.width >= 300 && r.height >= 200 && ratio >= 0.6 && ratio <= 2.2 &&
          (pagesByObject.get(r.objectId)?.size ?? 0) < decorationPages
        );
      })
      .sort((a, b) => b.r.width * b.r.height - a.r.width * a.r.height)
      .slice(0, 3);
    if (picked.length > 0) {
      // -png: poppler pasa los JPEG CMYK a RGB (el JPEG crudo sale con los colores invertidos).
      run("pdfimages", ["-png", "-f", String(page), "-l", String(page), pdf, join(tmp, "img")]);
      const files = readdirSync(tmp).filter((f) => f.startsWith("img-")).sort();
      let order = 0;
      for (const { index } of picked) {
        const f = files[index];
        if (!f) continue;
        try {
          const p = await processRecipePhoto(readFileSync(join(tmp, f)));
          out.push({ kind: "CANDIDATE", order: order++, data: p.data, thumbData: p.thumbData, width: p.width, height: p.height });
        } catch {
          // Imagen ilegible: se saltea (la revisión permite subir otra).
        }
      }
    }
    return out;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// ── Catálogo para contar sugerencias (en seco: alimentos.json de SARA 2, sin base) ─────────────

function offlineCatalog(): SuggestableFood[] {
  const json = JSON.parse(readFileSync(sara2File, "utf8")) as { foods: { sourceKey: string; name: string }[] };
  return json.foods.map((f) => ({ id: f.sourceKey, name: f.name, searchText: foodSearchText(f.name), source: "SARA2", active: true }));
}

// ── Reporte (docs/recetarios/_extraccion/reporte.md, ignorado) ─────────────────────────────────

interface FileResult {
  file: string;
  pages: number;
  drafts: RecipeImportDraft[];
  skipped: { page: number; reason: SkippedPageReason }[];
  error: string | null;
}

interface Totals {
  files: number;
  errors: number;
  drafts: number;
  f12: number;
  f12Ok: number;
  ingredients: number;
  withGrams: number;
  noGrams: number;
  noQuantity: number;
  noSuggestion: number;
  withTable: number;
  draftsWithoutIngredients: number;
}

function computeTotals(results: readonly FileResult[], catalog: readonly SuggestableFood[]): Totals {
  const drafts = results.flatMap((r) => r.drafts);
  const ings = drafts.flatMap((d) => d.ingredients);
  const f12 = drafts.filter((d) => d.hints.format !== "F4");
  return {
    files: results.length,
    errors: results.filter((r) => r.error).length,
    drafts: drafts.length,
    f12: f12.length,
    f12Ok: f12.filter((d) => d.name.trim() !== "" && d.ingredients.length > 0).length,
    ingredients: ings.length,
    withGrams: ings.filter((i) => i.grams !== null).length,
    noGrams: ings.filter((i) => i.grams === null && !i.noQuantity).length,
    noQuantity: ings.filter((i) => i.noQuantity).length,
    noSuggestion: ings.filter((i) => suggestFood(i.label, catalog) === null).length,
    withTable: drafts.filter((d) => d.published !== null).length,
    draftsWithoutIngredients: drafts.filter((d) => d.ingredients.length === 0).length,
  };
}

const pct = (a: number, b: number) => (b === 0 ? "—" : `${Math.round((a / b) * 1000) / 10} %`);
const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");

function renderReport(results: readonly FileResult[], skippedFiles: { file: string; reason: string }[], t: Totals): string {
  const lines: string[] = [];
  lines.push("# Carga asistida de recetas: extracción en seco", "");
  lines.push(`Generado: ${new Date().toISOString()}. Archivo local (docs/recetarios/ está en .gitignore): no se commitea.`, "");
  lines.push("## Totales", "");
  lines.push("| Dato | Valor |", "|---|---|");
  lines.push(`| Archivos leídos | ${t.files} (con error: ${t.errors}) |`);
  lines.push(`| Borradores | ${t.drafts} |`);
  lines.push(`| F1/F2 con nombre y ≥ 1 ingrediente | ${t.f12Ok} de ${t.f12} (${pct(t.f12Ok, t.f12)}) |`);
  lines.push(`| Borradores sin ingredientes (F4 y otros) | ${t.draftsWithoutIngredients} |`);
  lines.push(`| Con tabla nutricional | ${t.withTable} |`);
  lines.push(`| Ingredientes | ${t.ingredients} |`);
  lines.push(`| … con gramos del texto | ${t.withGrams} |`);
  lines.push(`| … sin gramos (hay que completarlos) | ${t.noGrams} |`);
  lines.push(`| … sin cantidad (c.n.) | ${t.noQuantity} |`);
  lines.push(`| … sin alimento sugerido (catálogo SARA 2 de alimentos.json) | ${t.noSuggestion} |`);
  lines.push(`| Gramos sin token en el texto | 0 (aserción del script) |`, "");

  if (skippedFiles.length > 0) {
    lines.push("## Archivos excluidos", "", "| Archivo | Motivo |", "|---|---|");
    for (const s of skippedFiles) lines.push(`| ${cell(s.file)} | ${cell(s.reason)} |`);
    lines.push("");
  }

  lines.push("## Por archivo", "", "| Archivo | Páginas | Borradores | Salteadas (motivo) | Error |", "|---|---|---|---|---|");
  for (const r of results) {
    const reasons = new Map<string, number>();
    for (const s of r.skipped) reasons.set(s.reason, (reasons.get(s.reason) ?? 0) + 1);
    const sk = [...reasons].map(([k, v]) => `${k}: ${v}`).join(", ") || "—";
    lines.push(`| ${cell(r.file)} | ${r.pages} | ${r.drafts.length} | ${sk} | ${r.error ? cell(r.error) : ""} |`);
  }
  lines.push("");

  lines.push(
    "## Por borrador",
    "",
    "| Archivo | Pág. | Formato | Nombre | Ingredientes | Con gramos | Con avisos | Tabla |",
    "|---|---|---|---|---|---|---|---|",
  );
  for (const r of results) {
    for (const d of r.drafts) {
      const flagged = d.ingredients.filter((i) => i.flags.length > 0).length;
      lines.push(
        `| ${cell(r.file)} | ${d.page} | ${d.hints.format} | ${cell(d.name)} | ${d.ingredients.length} | ${d.ingredients.filter((i) => i.grams !== null).length} | ${flagged} | ${d.published ? "sí" : "no"} |`,
      );
    }
  }
  lines.push("");
  return lines.join("\n");
}

// ── Main ──────────────────────────────────────────────────────────────────────────────────────

async function confirmWrite(): Promise<boolean> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("--write necesita DATABASE_URL.");
    process.exit(1);
  }
  let target = "(no se pudo leer la URL)";
  try {
    const u = new URL(url);
    target = `${u.hostname}:${u.port || "5432"}${u.pathname}`;
  } catch {
    // se muestra el texto genérico
  }
  console.log(`Base: ${target}`);
  if (hasFlag("--yes")) return true;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question("Se van a crear o actualizar borradores en esa base. Escribí SI para seguir: ");
  rl.close();
  return answer.trim() === "SI";
}

async function main() {
  const write = hasFlag("--write");
  const withImages = hasFlag("--images");
  const limitArg = argValues("--limit")[0];
  const limit = limitArg ? Number(limitArg) : null;
  if (withImages && !write) {
    console.error("--images va con --write (en seco no se procesan imágenes).");
    process.exit(1);
  }
  if (!existsSync(recipesDir)) {
    console.error("No existe docs/recetarios/.");
    process.exit(1);
  }

  const requested = argValues("--file");
  const all = readdirSync(recipesDir).filter((f) => !f.startsWith(".") && !f.startsWith("_"));
  const picked = pickRecipeFiles(requested.length > 0 ? all.filter((f) => requested.includes(f)) : all);
  if (requested.length > 0 && picked.use.length === 0) {
    console.error("Ningún archivo pedido con --file se puede leer (no existe o está excluido).");
    process.exit(1);
  }

  const results: FileResult[] = [];
  for (const file of picked.use) {
    const pdf = resolve(recipesDir, file);
    try {
      const pages = parseBboxXhtml(run("pdftotext", ["-bbox", pdf, "-"]));
      const r = extractRecipesFromPages(pages, { file });
      results.push({ file, pages: pages.length, drafts: r.drafts, skipped: r.skippedPages, error: null });
    } catch (err) {
      results.push({ file, pages: 0, drafts: [], skipped: [], error: (err as Error).message.split("\n")[0] ?? "error" });
    }
  }

  const drafts = results.flatMap((r) => r.drafts);
  assertNoInventedGrams(drafts);

  const totals = computeTotals(results, offlineCatalog());
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, "reporte.md"), renderReport(results, picked.skipped, totals));

  console.log(
    [
      `Archivos: ${totals.files} leídos (${totals.errors} con error), ${picked.skipped.length} excluidos`,
      `Borradores: ${totals.drafts} (F1/F2 con nombre e ingredientes: ${totals.f12Ok} de ${totals.f12})`,
      `Ingredientes: ${totals.ingredients} · con gramos ${totals.withGrams} · sin gramos ${totals.noGrams} · c.n. ${totals.noQuantity} · sin alimento sugerido ${totals.noSuggestion}`,
      `Con tabla nutricional: ${totals.withTable}`,
      "Gramos sin token en el texto: 0",
      "Reporte: docs/recetarios/_extraccion/reporte.md",
    ].join("\n"),
  );
  if (!write) {
    console.log("En seco: no se tocó la base.");
    return;
  }

  if (!(await confirmWrite())) {
    console.log("Cancelado: no se escribió nada.");
    return;
  }
  // Recién acá se carga el cliente de la base (en seco no se importa).
  const { upsertImportedDraft } = await import("../../domain/recipeImport");
  const { prisma } = await import("../../index");
  const toWrite = limit !== null && limit > 0 ? drafts.slice(0, limit) : drafts;
  const imageRowsByFile = new Map<string, ImageRow[]>();
  const imagesByPage = new Map<string, Awaited<ReturnType<typeof pageImages>>>();
  const outcomes: { importKey: string; id: string; outcome: string }[] = [];
  const startedAt = new Date().toISOString();
  try {
    for (const d of toWrite) {
      let images: Awaited<ReturnType<typeof pageImages>> | null = null;
      if (withImages) {
        const pdf = resolve(recipesDir, d.file);
        if (!imageRowsByFile.has(d.file)) imageRowsByFile.set(d.file, listImages(pdf));
        const key = `${d.file}#${d.page}`;
        const totalPages = results.find((r) => r.file === d.file)?.pages ?? 0;
        if (!imagesByPage.has(key)) imagesByPage.set(key, await pageImages(pdf, d.page, imageRowsByFile.get(d.file)!, totalPages));
        images = imagesByPage.get(key)!;
      }
      const res = await upsertImportedDraft(d, images);
      outcomes.push({ importKey: d.importKey, id: res.id, outcome: res.outcome });
    }
  } finally {
    const created = outcomes.filter((o) => o.outcome === "created").map((o) => o.id);
    const runFile = resolve(outDir, `corrida-${startedAt.replace(/[:.]/g, "-")}.json`);
    writeFileSync(runFile, JSON.stringify({ startedAt, createdIds: created, outcomes }, null, 2));
    const count = (o: string) => outcomes.filter((x) => x.outcome === o).length;
    console.log(
      `Escritos: ${count("created")} creados · ${count("updated")} actualizados · ${count("skipped-reviewed")} ya revisados · ${count("skipped-not-draft")} publicados/archivados (no se tocan)`,
    );
    console.log(`Corrida: docs/recetarios/_extraccion/${runFile.split("/").pop()} (para deshacer: recipes:undo)`);
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error((err as Error).message);
  process.exit(1);
});
