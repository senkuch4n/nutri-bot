import { sara2TableGroup } from "../food-groups";
import { parseBboxXhtml } from "./bbox";
import type { Sara2Food, Sara2Summary, Sara2TableStats } from "./dataset";
import { extractSections, type SaraRawRow, type SaraSection } from "./layout";
import { isBrokenName, sara2PairKey } from "./names";
import {
  SARA2_VALIDATION,
  validateSaraPair,
  type SaraRejectReason,
  type SaraRejection,
  type SaraWarning,
} from "./validate";

export const SARA2_EXCLUDED_REASON = "excluidas: no vienen cada 100 g" as const;
/** Tabla 26 (suplementos): no viene cada 100 g (D7). */
const EXCLUDED_TABLE = 26;
const LAST_IMPORTED_TABLE = 25;

export interface Sara2ReadResult {
  status: "ok" | "fallida";
  /** Criterios L1–L6 que no se cumplen (SDD 3.5). */
  failures: string[];
  foods: Sara2Food[];
  rejected: SaraRejection[];
  excluded: { page: number; name: string; reason: typeof SARA2_EXCLUDED_REASON }[];
  warnings: SaraWarning[];
  tables: Sara2TableStats[];
  summary: Sara2Summary;
}

interface SectionPair {
  a: SaraSection;
  b: SaraSection | null;
  table: number;
}

const pct = (part: number, total: number) => (total === 0 ? 0 : Math.round((part / total) * 10000) / 100);

export function readSara2(xhtml: string): Sara2ReadResult {
  const pages = parseBboxXhtml(xhtml);
  const sections = pages.flatMap(extractSections);
  const readerErrors: string[] = [];
  const warnings: SaraWarning[] = [];

  // Número de tabla: el del título de la A. Cada B va con la A inmediatamente anterior.
  const pairs: SectionPair[] = [];
  const orphanB: SaraSection[] = [];
  let lastTable = 0;
  let pending: SectionPair | null = null;
  for (const s of sections) {
    for (const e of s.errors) readerErrors.push(`p. ${s.page} (${s.part}): ${e}`);
    if (s.part === "A") {
      let table = s.titleTable;
      if (table === null) {
        readerErrors.push(`p. ${s.page}: sección A sin título con número de tabla`);
        table = lastTable;
      }
      if (table < lastTable) readerErrors.push(`p. ${s.page}: tabla ${table} después de la ${lastTable}`);
      lastTable = Math.max(lastTable, table);
      pending = { a: s, b: null, table };
      pairs.push(pending);
    } else if (pending && pending.b === null) {
      pending.b = s;
      if (s.titleTable !== null && s.titleTable !== pending.table) {
        warnings.push({
          table: pending.table,
          page: s.page,
          name: s.titleText,
          code: "TITULO_B_DISTINTO",
          detail: `el título de la parte B dice tabla ${s.titleTable}; se usa la ${pending.table} de su parte A (p. ${pending.a.page})`,
        });
      }
    } else {
      orphanB.push(s);
    }
  }

  const foods: Sara2Food[] = [];
  const rejected: SaraRejection[] = [];
  const excluded: Sara2ReadResult["excluded"] = [];
  const stats = new Map<number, Sara2TableStats>();
  const statFor = (table: number): Sara2TableStats => {
    let s = stats.get(table);
    if (!s) {
      s = {
        table,
        group: sara2TableGroup(table) ?? "OTROS",
        rowsA: 0,
        rowsB: 0,
        paired: 0,
        imported: 0,
        rejected: {},
        warnings: 0,
      };
      stats.set(table, s);
    }
    return s;
  };
  let bOnlyRejections = 0;
  let rowsAImportable = 0;
  let pairedTotal = 0;

  const rejectRow = (table: number | null, row: SaraRawRow, reason: SaraRejectReason, detail: string, bOnly = false) => {
    rejected.push({ table, page: row.page, name: row.name, reason, detail, rawText: row.rawText });
    if (table !== null) {
      const st = statFor(table);
      st.rejected[reason] = (st.rejected[reason] ?? 0) + 1;
    }
    if (bOnly) bOnlyRejections++;
  };

  for (const pair of pairs) {
    const { a, b, table } = pair;
    if (table === EXCLUDED_TABLE) {
      for (const row of a.rows) excluded.push({ page: row.page, name: row.name, reason: SARA2_EXCLUDED_REASON });
      continue;
    }
    if (table < 1 || table > LAST_IMPORTED_TABLE) {
      readerErrors.push(`p. ${a.page}: tabla ${table} fuera de 1–26`);
      continue;
    }
    const st = statFor(table);
    st.rowsA += a.rows.length;
    st.rowsB += b?.rows.length ?? 0;
    rowsAImportable += a.rows.length;
    const sectionBroken = a.errors.length > 0 || (b?.errors.length ?? 0) > 0;

    // Filas A con nombre legible, por clave.
    const aByKey = new Map<string, SaraRawRow[]>();
    for (const row of a.rows) {
      if (!row.name || isBrokenName(row.name)) {
        rejectRow(table, row, "NOMBRE_ILEGIBLE", row.name ? `nombre partido «${row.name}»` : "fila sin nombre");
        continue;
      }
      const k = sara2PairKey(row.name);
      aByKey.set(k, [...(aByKey.get(k) ?? []), row]);
    }
    const bByKey = new Map<string, SaraRawRow[]>();
    for (const row of b?.rows ?? []) {
      if (!row.name || isBrokenName(row.name)) {
        rejectRow(table, row, "NOMBRE_ILEGIBLE", row.name ? `nombre partido «${row.name}» (parte B)` : "fila sin nombre (parte B)", true);
        continue;
      }
      const k = sara2PairKey(row.name);
      bByKey.set(k, [...(bByKey.get(k) ?? []), row]);
    }

    for (const [k, aRows] of aByKey) {
      const bRows = bByKey.get(k) ?? [];
      const aRow = aRows[0];
      if (!aRow) continue;
      if (aRows.length > 1 || bRows.length > 1) {
        for (const row of aRows) rejectRow(table, row, "CLAVE_DUPLICADA", `nombre repetido en la tabla ${table}`);
        continue;
      }
      if (!b) {
        rejectRow(table, aRow, "SIN_PAREJA_B", "la tabla no tiene parte B");
        continue;
      }
      const bRow = bRows[0];
      if (!bRow) {
        rejectRow(table, aRow, "SIN_PAREJA_B", "la fila no está en la parte B");
        continue;
      }
      st.paired++;
      pairedTotal++;
      if (sectionBroken || aRow.columnError || bRow.columnError) {
        rejectRow(
          table,
          { ...aRow, rawText: `${aRow.rawText}\n${bRow.rawText}` },
          "COLUMNAS",
          aRow.columnError ?? bRow.columnError ?? "el renglón de unidades de la sección no coincide",
        );
        continue;
      }
      const res = validateSaraPair(table, aRow, bRow);
      if (!res.ok) {
        rejected.push(res.rejection);
        st.rejected[res.rejection.reason] = (st.rejected[res.rejection.reason] ?? 0) + 1;
        continue;
      }
      if (aRow.nameCost > SARA2_VALIDATION.nameCostWarnPt || bRow.nameCost > SARA2_VALIDATION.nameCostWarnPt) {
        res.warnings.push({
          table,
          page: aRow.page,
          name: aRow.name,
          code: "NOMBRE_DUDOSO",
          detail: `el nombre quedó a ${Math.max(aRow.nameCost, bRow.nameCost)} pt de su fila`,
        });
      }
      foods.push(res.food);
      warnings.push(...res.warnings);
    }
    for (const [k, bRows] of bByKey) {
      if (aByKey.has(k)) continue;
      for (const row of bRows) rejectRow(table, row, "SIN_PAREJA_A", "la fila no está en la parte A", true);
    }
  }

  // sourceKey único en todo el dataset.
  const byKey = new Map<string, Sara2Food[]>();
  for (const f of foods) byKey.set(f.sourceKey, [...(byKey.get(f.sourceKey) ?? []), f]);
  const finalFoods: Sara2Food[] = [];
  for (const [key, list] of byKey) {
    const only = list[0];
    if (list.length === 1 && only) {
      finalFoods.push(only);
      continue;
    }
    for (const f of list) {
      rejected.push({
        table: f.table,
        page: f.pages[0],
        name: f.name,
        reason: "CLAVE_DUPLICADA",
        detail: `clave de origen repetida ${key}`,
        rawText: f.name,
      });
      const st = statFor(f.table);
      st.rejected.CLAVE_DUPLICADA = (st.rejected.CLAVE_DUPLICADA ?? 0) + 1;
    }
  }
  finalFoods.sort((x, y) => (x.sourceKey < y.sourceKey ? -1 : x.sourceKey > y.sourceKey ? 1 : 0));
  for (const f of finalFoods) statFor(f.table).imported++;
  for (const w of warnings) if (stats.has(w.table)) statFor(w.table).warnings++;

  const rowsA = rowsAImportable + bOnlyRejections;
  const summary: Sara2Summary = {
    rowsA,
    imported: finalFoods.length,
    rejected: rejected.length,
    excluded: excluded.length,
    rejectedPct: pct(rejected.length, rowsA),
  };

  // Criterios de éxito (SDD 3.5).
  const failures: string[] = [];
  const unpairedA = pairs.filter((p) => p.b === null);
  const tablesPresent = new Set(pairs.map((p) => p.table));
  const missingTables = Array.from({ length: EXCLUDED_TABLE }, (_, i) => i + 1).filter((t) => !tablesPresent.has(t));
  const l1: string[] = [];
  if (unpairedA.length > 0) l1.push(`${unpairedA.length} secciones A sin su B (p. ${unpairedA.map((p) => p.a.page).join(", ")})`);
  if (orphanB.length > 0) l1.push(`${orphanB.length} secciones B sin su A (p. ${orphanB.map((s) => s.page).join(", ")})`);
  if (missingTables.length > 0) l1.push(`faltan las tablas ${missingTables.join(", ")}`);
  if (readerErrors.length > 0) l1.push(readerErrors.join("; "));
  if (l1.length > 0) failures.push(`L1: secciones (${pairs.length} A, ${pairs.filter((p) => p.b).length + orphanB.length} B): ${l1.join("; ")}`);
  if (pct(pairedTotal, rowsAImportable) < 99) {
    failures.push(`L2: solo ${pairedTotal} de ${rowsAImportable} filas A emparejadas con su B (< 99 %)`);
  }
  if (pct(finalFoods.length, rowsA) < 95) {
    failures.push(`L3: solo ${finalFoods.length} de ${rowsA} filas importadas (< 95 %)`);
  }
  const broken = finalFoods.filter((f) => isBrokenName(f.name));
  if (broken.length > 0) failures.push(`L4: ${broken.length} nombres rotos (${broken.slice(0, 5).map((f) => f.name).join(", ")})`);
  if (excluded.length === 0) failures.push("L5: no se encontraron las filas de la tabla 26 para excluir");
  if (summary.rejectedPct > SARA2_VALIDATION.maxRejectedRatio * 100) {
    failures.push(`L6: se rechaza el ${summary.rejectedPct} % de las filas (máximo ${SARA2_VALIDATION.maxRejectedRatio * 100} %)`);
  }

  return {
    status: failures.length === 0 ? "ok" : "fallida",
    failures,
    foods: finalFoods,
    rejected,
    excluded,
    warnings,
    tables: [...stats.values()].sort((x, y) => x.table - y.table),
    summary,
  };
}
