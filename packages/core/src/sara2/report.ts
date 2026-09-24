import { FOOD_GROUP_LABELS } from "../food-groups";
import type { Sara2ReadResult } from "./read";
import type { SaraRejectReason } from "./validate";

const REASON_LABELS: Record<SaraRejectReason, string> = {
  SIN_PAREJA_B: "sin fila en la parte B",
  SIN_PAREJA_A: "sin fila en la parte A",
  NUMERO_INVALIDO: "número con formato inválido",
  FALTA_KCAL: "faltan las kcal",
  FALTA_MACRO: "falta un macro",
  SUMA_MACROS: "suma de macros fuera de 90–110 g",
  ATWATER: "kcal publicadas no coinciden con Atwater",
  CLAVE_DUPLICADA: "nombre o clave repetida",
  NOMBRE_ILEGIBLE: "nombre ilegible",
  COLUMNAS: "columnas corridas",
};

const WARNING_LABELS: Record<string, string> = {
  SUMA_FUERA_97_103: "Suma de macros fuera de 97–103 g (dentro de 90–110)",
  SIN_CENIZAS: "Sin cenizas en la tabla (la suma se calculó sin ellas)",
  GRASAS_INCONSISTENTES: "Saturadas + mono + poli mayor que lípidos",
  AZUCARES_INCONSISTENTES: "Azúcar agregado > azúcar total o azúcar total > CHO disponibles",
  TITULO_B_DISTINTO: "El título de la parte B dice otro número de tabla",
  NOMBRE_DUDOSO: "El nombre quedó lejos de su fila (revisar)",
};

const num = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });
const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");

/** Reporte en Markdown de la lectura del PDF (versionado junto a alimentos.json). */
export function renderSara2Report(
  result: Sara2ReadResult,
  meta: { file: string; sha256: string; generatedAt: string },
): string {
  const out: string[] = [];
  const s = result.summary;
  out.push("# Importación SARA 2: reporte del lector", "");
  if (result.status === "fallida") {
    out.push(
      `**Importación fallida:** ${result.failures.join(" · ")}. No se generó alimentos.json; revisar el lector antes de cargar nada.`,
      "",
    );
  }
  out.push(
    "- Fuente: SARA 2: Tabla de composición química de alimentos para Argentina. Compilación para ENNyS 2. Ministerio de Salud de la Nación, 2022.",
    `- Archivo: \`${meta.file}\``,
    `- sha256: \`${meta.sha256}\``,
    `- Generado: ${meta.generatedAt}`,
    `- Estado: **${result.status}**`,
    "",
    "Este archivo lo genera `npm run sara2:read`. No se edita a mano: las filas rechazadas no se corrigen ni se inventan.",
    "",
    "## Resumen",
    "",
    "| Medida | Valor |",
    "|---|---|",
    `| Filas A de las tablas 1–25 | ${s.rowsA} |`,
    `| Importadas | ${s.imported} |`,
    `| Rechazadas | ${s.rejected} (${num.format(s.rejectedPct)} %) |`,
    `| Excluidas (tabla 26) | ${s.excluded} |`,
    `| Advertencias | ${result.warnings.length} |`,
    "",
    "## Por grupo",
    "",
    "| Tabla | Grupo | Filas A | Filas B | Emparejadas | Importadas | Rechazadas | Advertencias |",
    "|---|---|---|---|---|---|---|---|",
  );
  for (const t of result.tables) {
    const rej = Object.entries(t.rejected)
      .map(([k, v]) => `${k} ${v}`)
      .join(", ");
    out.push(
      `| ${t.table} | ${FOOD_GROUP_LABELS[t.group]} | ${t.rowsA} | ${t.rowsB} | ${t.paired} | ${t.imported} | ${rej || "0"} | ${t.warnings} |`,
    );
  }
  out.push("", `## Rechazadas (${result.rejected.length})`, "");
  if (result.rejected.length === 0) out.push("Ninguna.");
  for (const r of result.rejected) {
    out.push(
      `### ${r.name || "(sin nombre)"}`,
      "",
      `- Tabla ${r.table ?? "?"}, página ${r.page}`,
      `- Motivo: \`${r.reason}\` (${REASON_LABELS[r.reason]})`,
      `- Detalle: ${r.detail}`,
      "",
      "```",
      r.rawText,
      "```",
      "",
    );
  }
  out.push("", `## Excluidas: tabla 26 (${result.excluded.length})`, "");
  out.push("| Alimento | Página | Motivo |", "|---|---|---|");
  for (const e of result.excluded) out.push(`| ${cell(e.name)} | ${e.page} | ${e.reason} |`);
  out.push("", `## Advertencias (${result.warnings.length})`, "");
  const codes = [...new Set(result.warnings.map((w) => w.code))].sort();
  for (const code of codes) {
    const list = result.warnings.filter((w) => w.code === code);
    out.push(`### ${WARNING_LABELS[code] ?? code} (\`${code}\`, ${list.length})`, "");
    out.push("| Alimento | Tabla | Página | Detalle |", "|---|---|---|---|");
    for (const w of list) out.push(`| ${cell(w.name)} | ${w.table} | ${w.page} | ${cell(w.detail)} |`);
    out.push("");
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n") + "\n";
}
