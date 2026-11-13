/**
 * HU-020 (SDD 5.8): importa los planes alimentarios en PDF de docs/planes-alimentacion/ como
 * BORRADORES de plantilla. Sin IA: pdftotext -bbox + parser puro de @nutri-bot/core/plan-import.
 *
 * Por defecto corre EN SECO: no se conecta a la base (recetas: se resuelven con --write). Escribe el
 * reporte en docs/planes-alimentacion/_importacion/reporte.md (ignorado por git, ya filtrado por
 * personal-data.ts) y por consola imprime SOLO contadores: nunca nombres de archivo, títulos ni texto
 * del plan (D12, T16).
 *
 * Uso (desde la raíz):
 *   npm run plans:import --workspace packages/db                         # en seco
 *   npm run plans:import --workspace packages/db -- --file <nombre.pdf>  # repetible
 *   npm run plans:import --workspace packages/db -- --write [--yes]      # base de DATABASE_URL (.env)
 *   DATABASE_URL=… npm run plans:import:prod --workspace packages/db -- --write   # producción
 *
 * --write: upsertImportedTemplate por PDF (no pisa plantillas publicadas ni borradores revisados) y
 * guarda la corrida en _importacion/corrida-<ISO>.json para deshacerla con `plans:undo`.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PLAN_IMPORT_TEXT, WEEKDAY_LABELS, templateHintText } from "@nutri-bot/core";
import { parsePlanPdf, planImportKey, type PlanImportDraft, type RecipeMatchCandidate } from "@nutri-bot/core/plan-import";
import { parseBboxXhtml } from "@nutri-bot/core/sara2";
import { argValues, confirmWrite, describeDbTarget, hasFlag, run } from "../lib/cli";

const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const plansDir = resolve(repoRoot, "docs/planes-alimentacion");
const outDir = resolve(plansDir, "_importacion");

type Parsed = { n: number; importKey: string; result: ReturnType<typeof parsePlanPdf> };

function readPdfs(): { n: number; importKey: string; xhtml: string }[] {
  if (!existsSync(plansDir)) {
    console.error("No existe docs/planes-alimentacion/.");
    process.exit(1);
  }
  const requested = argValues("--file");
  const all = readdirSync(plansDir)
    .filter((f) => !f.startsWith(".") && !f.startsWith("_") && f.toLowerCase().endsWith(".pdf"))
    .sort();
  const files = requested.length > 0 ? all.filter((f) => requested.includes(f)) : all;
  if (requested.length > 0 && files.length === 0) {
    // Sin el nombre: puede traer el de la paciente.
    console.error("Ningún PDF pedido con --file existe en docs/planes-alimentacion/.");
    process.exit(1);
  }
  return files.map((f, i) => {
    const pdf = resolve(plansDir, f);
    const sha = createHash("sha256").update(readFileSync(pdf)).digest("hex");
    return { n: i + 1, importKey: planImportKey(sha), xhtml: run("pdftotext", ["-bbox", pdf, "-"]) };
  });
}

function parseAll(pdfs: ReturnType<typeof readPdfs>, recipes: readonly RecipeMatchCandidate[]): Parsed[] {
  return pdfs.map((p) => ({
    n: p.n,
    importKey: p.importKey,
    result: parsePlanPdf(parseBboxXhtml(p.xhtml), { importKey: p.importKey, recipes }),
  }));
}

const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");

function renderReport(parsed: readonly Parsed[], write: boolean): string {
  const out: string[] = [
    "# Importación de planes alimentarios",
    "",
    `Generado: ${new Date().toISOString()} · ${write ? "con --write" : "en seco (recetas: se resuelven con --write)"}`,
    "",
    "Archivo local (ignorado por git). Ya pasó por el filtro de datos personales. No compartirlo.",
    "",
  ];
  const total = parsed.length;
  for (const p of parsed) {
    out.push(`## PDF ${p.n} de ${total}`, "");
    if (!p.result.ok) {
      out.push(`${PLAN_IMPORT_TEXT.notReadable} (${p.result.reason})`, "");
      continue;
    }
    const d: PlanImportDraft = p.result.draft;
    out.push(`- Título: ${d.title}`, `- importKey: \`${d.importKey}\``, "", "### Comidas", "");
    for (const m of d.meals) {
      out.push(`#### ${m.name} (${m.mode === "PER_DAY" ? "cambia cada día" : "igual todos los días"}${m.isOptions ? ", opciones" : ""})`, "");
      out.push("| Día | Ítem | Nota |", "|---|---|---|");
      for (const i of m.items) {
        const day = i.weekday ? WEEKDAY_LABELS[i.weekday].long : "—";
        const label = i.kind === "TEXT" ? i.label : `Receta ${i.recipeId} × ${i.portions}`;
        out.push(`| ${day} | ${cell(label)} | ${cell(i.kind === "TEXT" ? (i.notes ?? "") : "")} |`);
      }
      out.push("");
    }
    out.push("### Textos del plan", "");
    for (const s of d.sections) out.push(`- ${s.title}: ${s.body.length} caracteres`);
    out.push("", "### Avisos", "");
    for (const h of d.hints) {
      out.push(h.kind === "UNPLACED" ? `- Texto sin ubicar (pág. ${h.page}): ${cell(h.text)}` : `- ${templateHintText(h)}`);
    }
    out.push("");
  }
  return out.join("\n");
}

function printCounters(parsed: readonly Parsed[]): void {
  const drafts = parsed.flatMap((p) => (p.result.ok ? [p.result.draft] : []));
  const sum = (k: keyof PlanImportDraft["stats"]) => drafts.reduce((a, d) => a + d.stats[k], 0);
  console.log(
    [
      `PDF: ${parsed.length} leídos · ${parsed.length - drafts.length} sin formato reconocible`,
      `Comidas: ${sum("meals")} · ítems de texto ${sum("textItems")} · recetas ${sum("recipeItems")} · sugerencias ${sum("recipeSuggestions")}`,
      `Secciones: ${sum("sections")} · texto sin ubicar: ${sum("unplaced")} · nombres reemplazados: ${sum("redactions")} · líneas de portada descartadas: ${sum("coverLinesDropped")}`,
      "Reporte: docs/planes-alimentacion/_importacion/reporte.md",
    ].join("\n"),
  );
}

async function main() {
  const write = hasFlag("--write");
  const pdfs = readPdfs();
  mkdirSync(outDir, { recursive: true });

  if (!write) {
    const parsed = parseAll(pdfs, []);
    writeFileSync(resolve(outDir, "reporte.md"), renderReport(parsed, false));
    printCounters(parsed);
    console.log("En seco: no se tocó la base.");
    return;
  }

  if (!(await confirmWrite("Se van a crear o actualizar borradores de plantilla en esa base. Escribí SI para seguir: "))) {
    console.log("Cancelado: no se escribió nada.");
    return;
  }
  // Recién acá se carga el cliente de la base (en seco no se importa).
  const { listRecipesForPlanMatching, upsertImportedTemplate } = await import("../../domain/planTemplateImport");
  const { prisma } = await import("../../index");
  const startedAt = new Date().toISOString();
  const outcomes: { importKey: string; id: string | null; outcome: string }[] = [];
  const target = describeDbTarget(process.env.DATABASE_URL ?? "");
  try {
    const parsed = parseAll(pdfs, await listRecipesForPlanMatching());
    writeFileSync(resolve(outDir, "reporte.md"), renderReport(parsed, true));
    const total = parsed.length;
    for (const p of parsed) {
      const prefix = `PDF ${p.n} de ${total}:`;
      if (!p.result.ok) {
        outcomes.push({ importKey: p.importKey, id: null, outcome: "not-readable" });
        console.log(`${prefix} sin formato reconocible: no se creó nada`);
        continue;
      }
      const res = await upsertImportedTemplate(p.result.draft);
      outcomes.push({ importKey: p.importKey, id: res.id, outcome: res.outcome });
      const text = {
        created: "creado",
        updated: "actualizado",
        "skipped-published": "ya importado",
        "skipped-reviewed": "ya revisado: no se pisa",
      }[res.outcome];
      console.log(`${prefix} ${text} (plantilla ${res.id})`);
    }
    printCounters(parsed);
  } finally {
    const createdIds = outcomes.filter((o) => o.outcome === "created").map((o) => o.id);
    const runFile = resolve(outDir, `corrida-${startedAt.replace(/[:.]/g, "-")}.json`);
    writeFileSync(runFile, JSON.stringify({ startedAt, target, createdIds, outcomes }, null, 2));
    console.log(`Corrida: docs/planes-alimentacion/_importacion/${runFile.split("/").pop()} (para deshacer: plans:undo)`);
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  // Solo el mensaje: no hay texto del plan en los errores del parser ni del dominio.
  console.error((err as Error).message.split("\n")[0]);
  process.exit(1);
});
