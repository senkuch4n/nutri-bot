// HU-008: convierte las tablas LMS de la OMS (.xlsx bajados con download-who-lms.sh) a los dos
// módulos TypeScript versionados en packages/core/src/who/.
//
// Uso (desde la raíz):  npx tsx packages/core/scripts/who/build-who-lms.ts <carpeta>
//
// - Verifica el SHA-256 de cada archivo contra la constante de abajo (SDD 4.1).
// - Lee el xlsx con `unzip -p` y lo parsea con regex (sin dependencias nuevas).
// - Autoverifica que las columnas de DE publicadas cierren con la fórmula LMS.
// - Escribe con formato determinista: correrlo dos veces da archivos idénticos.
// Si algo falla, termina con código 1 y no escribe nada. Nunca inventa valores.

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type Indicator = "BMI_FOR_AGE" | "HEIGHT_FOR_AGE";
type SexKey = "MALE" | "FEMALE";
type Reference = "OMS 2007" | "OMS 2006";

interface Source {
  indicator: Indicator;
  sex: SexKey;
  reference: Reference;
  months: string;
  url: string;
  file: string;
  sha256: string;
}

const DOWNLOADED_AT = "2026-09-24";
const FIRST_MONTH = 60;
const LAST_MONTH = 228;

const SOURCES: Source[] = [
  {
    indicator: "BMI_FOR_AGE",
    sex: "MALE",
    reference: "OMS 2007",
    months: "61–228",
    url: "https://cdn.who.int/media/docs/default-source/child-growth/growth-reference-5-19-years/bmi-for-age-(5-19-years)/bmi-boys-z-who-2007-exp.xlsx?sfvrsn=a84bca93_2",
    file: "bmi-boys-z-who-2007-exp.xlsx",
    sha256: "0a60849673f34a06b8e2fe4defe5d00348de687b6c9fce0278f1525fff89eb6d",
  },
  {
    indicator: "BMI_FOR_AGE",
    sex: "FEMALE",
    reference: "OMS 2007",
    months: "61–228",
    url: "https://cdn.who.int/media/docs/default-source/child-growth/growth-reference-5-19-years/bmi-for-age-(5-19-years)/bmi-girls-z-who-2007-exp.xlsx?sfvrsn=79222875_2",
    file: "bmi-girls-z-who-2007-exp.xlsx",
    sha256: "66f5c6284b44579ad6135fc639f22c09e36fe5a695b04390377113f6a00deb72",
  },
  {
    indicator: "HEIGHT_FOR_AGE",
    sex: "MALE",
    reference: "OMS 2007",
    months: "61–228",
    url: "https://cdn.who.int/media/docs/default-source/child-growth/growth-reference-5-19-years/height-for-age-(5-19-years)/hfa-boys-z-who-2007-exp.xlsx?sfvrsn=7fa263d_2",
    file: "hfa-boys-z-who-2007-exp.xlsx",
    sha256: "d78fa8cafcab77dcb5f03d71506d92bdcb28f89c642816b6bb0eef466b007466",
  },
  {
    indicator: "HEIGHT_FOR_AGE",
    sex: "FEMALE",
    reference: "OMS 2007",
    months: "61–228",
    url: "https://cdn.who.int/media/docs/default-source/child-growth/growth-reference-5-19-years/height-for-age-(5-19-years)/hfa-girls-z-who-2007-exp.xlsx?sfvrsn=79d310ee_2",
    file: "hfa-girls-z-who-2007-exp.xlsx",
    sha256: "df07ee16d3d2916569f1d869b7c874d7b880a41321d871215ed0254cb16679b3",
  },
  {
    indicator: "BMI_FOR_AGE",
    sex: "MALE",
    reference: "OMS 2006",
    months: "60",
    url: "https://cdn.who.int/media/docs/default-source/child-growth/child-growth-standards/indicators/body-mass-index-for-age/bmi_boys_2-to-5-years_zscores.xlsx?sfvrsn=73010c9b_5",
    file: "bmi_boys_2-to-5-years_zscores.xlsx",
    sha256: "874063e82b4592e4d2dc8b7534861d759541548abe38269fba50ba3861e9aff1",
  },
  {
    indicator: "BMI_FOR_AGE",
    sex: "FEMALE",
    reference: "OMS 2006",
    months: "60",
    url: "https://cdn.who.int/media/docs/default-source/child-growth/child-growth-standards/indicators/body-mass-index-for-age/bmi_girls_2-to-5-years_zscores.xlsx?sfvrsn=452aca36_7",
    file: "bmi_girls_2-to-5-years_zscores.xlsx",
    sha256: "9e27264b319e9290fc32b7896894da6c5b41b4f471695f2e13016cae8f329973",
  },
  {
    indicator: "HEIGHT_FOR_AGE",
    sex: "MALE",
    reference: "OMS 2006",
    months: "60",
    url: "https://cdn.who.int/media/docs/default-source/child-growth/child-growth-standards/indicators/length-height-for-age/lhfa_boys_2-to-5-years_zscores.xlsx?sfvrsn=17e5ad91_9",
    file: "lhfa_boys_2-to-5-years_zscores.xlsx",
    sha256: "a44ed06039e0a9dd6920e4a4d928395c541c9732662e49eacd489d2194ccc80d",
  },
  {
    indicator: "HEIGHT_FOR_AGE",
    sex: "FEMALE",
    reference: "OMS 2006",
    months: "60",
    url: "https://cdn.who.int/media/docs/default-source/child-growth/child-growth-standards/indicators/length-height-for-age/lhfa_girls_2-to-5-years_zscores.xlsx?sfvrsn=2ec187b9_11",
    file: "lhfa_girls_2-to-5-years_zscores.xlsx",
    sha256: "a976c56a6d36885cc32bf77c5539ca066e396ef2adad06011cd71d9eb0f0eb5c",
  },
];

const SD_KEYS = ["SD3neg", "SD2neg", "SD1neg", "SD0", "SD1", "SD2", "SD3"] as const;
const SD_Z = [-3, -2, -1, 0, 1, 2, 3] as const;
const TOL_2007 = 0.0006;
const TOL_2006 = 0.051;
const TOL_SD4 = 0.0011;

function fail(message: string): never {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

/** Copia mínima de lmsValueAtZ (no se importa src/ a propósito). */
function lmsValueAtZ(L: number, M: number, S: number, z: number): number {
  if (L === 0) return M * Math.exp(S * z);
  return M * Math.pow(1 + L * S * z, 1 / L);
}

/** String(Number(texto)): normaliza la representación del xlsx. */
function num(text: string): number {
  const n = Number(text);
  if (!Number.isFinite(n)) fail(`Número inválido en el xlsx: "${text}"`);
  return Number(String(n));
}

function readXlsxSheet(file: string): Array<Record<string, number>> {
  const shared = execFileSync("unzip", ["-p", file, "xl/sharedStrings.xml"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const sheet = execFileSync("unzip", ["-p", file, "xl/worksheets/sheet1.xml"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const strings: string[] = [];
  for (const m of shared.matchAll(/<si>\s*<t(?:\s[^>]*)?>([\s\S]*?)<\/t>\s*<\/si>/g)) {
    strings.push(m[1]!.trim());
  }
  const rows: Array<Array<{ col: string; value: string; shared: boolean }>> = [];
  for (const r of sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: Array<{ col: string; value: string; shared: boolean }> = [];
    for (const c of r[1]!.matchAll(/<c\s+r="([A-Z]+)\d+"([^>]*)>\s*<v>([^<]*)<\/v>\s*<\/c>/g)) {
      cells.push({ col: c[1]!, value: c[3]!, shared: /\bt="s"/.test(c[2]!) });
    }
    rows.push(cells);
  }
  if (rows.length < 2) fail(`${file}: la hoja no tiene filas de datos`);
  const header = new Map<string, string>();
  for (const cell of rows[0]!) {
    if (!cell.shared) fail(`${file}: el encabezado ${cell.col} no es texto`);
    const name = strings[Number(cell.value)];
    if (name === undefined) fail(`${file}: encabezado sin sharedString`);
    header.set(cell.col, name);
  }
  return rows.slice(1).map((cells) => {
    const out: Record<string, number> = {};
    for (const cell of cells) {
      const name = header.get(cell.col);
      if (!name) continue;
      if (cell.shared) fail(`${file}: celda de texto en una fila de datos (${cell.col})`);
      out[name] = num(cell.value);
    }
    return out;
  });
}

function sha256(file: string): string {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

type LmsTuple = [number, number, number, number];
type SdTuple = [number, number, number, number, number, number, number, number, number | null, number | null];

interface TableOut {
  lms: LmsTuple[];
  sd: SdTuple[];
  maxError: number;
  maxErrorSd4: number | null;
}

function processSource(folder: string, src: Source): { lms: LmsTuple[]; sd: SdTuple[]; maxError: number; maxErrorSd4: number | null } {
  const file = join(folder, src.file);
  if (!existsSync(file)) fail(`No existe ${file}. Correr antes download-who-lms.sh`);
  const hash = sha256(file);
  if (hash !== src.sha256) {
    fail(
      `El archivo de la OMS cambió: revisar el origen y actualizar el hash a conciencia (${src.file}: ${hash} ≠ ${src.sha256})`,
    );
  }
  const all = readXlsxSheet(file);
  const is2007 = src.reference === "OMS 2007";
  const rows = all.filter((r) =>
    is2007 ? r.Month! >= 61 && r.Month! <= LAST_MONTH : r.Month === FIRST_MONTH,
  );
  if (is2007) {
    if (rows.length !== 168) fail(`${src.file}: se esperaban 168 filas (61–228), hay ${rows.length}`);
    rows.forEach((r, i) => {
      if (r.Month !== 61 + i) fail(`${src.file}: meses no contiguos en la fila ${i}`);
    });
  } else if (rows.length !== 1) {
    fail(`${src.file}: se esperaba exactamente la fila del mes 60, hay ${rows.length}`);
  }
  const tol = is2007 ? TOL_2007 : TOL_2006;
  let maxError = 0;
  let maxErrorSd4: number | null = null;
  const lms: LmsTuple[] = [];
  const sd: SdTuple[] = [];
  for (const r of rows) {
    const { Month, L, M, S } = r;
    if ([Month, L, M, S].some((v) => v === undefined || !Number.isFinite(v))) {
      fail(`${src.file}: fila sin Month/L/M/S`);
    }
    if (src.indicator === "HEIGHT_FOR_AGE" && L !== 1) fail(`${src.file}: L ≠ 1 en el mes ${Month}`);
    const sdValues: number[] = [];
    SD_KEYS.forEach((key, i) => {
      const published = r[key];
      if (published === undefined) fail(`${src.file}: falta la columna ${key}`);
      const err = Math.abs(lmsValueAtZ(L!, M!, S!, SD_Z[i]!) - published);
      if (err > tol) fail(`${src.file}: mes ${Month}, ${key}: error ${err} > ${tol}`);
      maxError = Math.max(maxError, err);
      sdValues.push(published);
    });
    let sd4neg: number | null = null;
    let sd4: number | null = null;
    if (is2007 && src.indicator === "BMI_FOR_AGE") {
      if (r.SD4 === undefined || r.SD4neg === undefined) fail(`${src.file}: faltan SD4/SD4neg`);
      const e1 = Math.abs(r.SD3! + (r.SD3! - r.SD2!) - r.SD4);
      const e2 = Math.abs(r.SD3neg! - (r.SD2neg! - r.SD3neg!) - r.SD4neg);
      if (e1 > TOL_SD4 || e2 > TOL_SD4) fail(`${src.file}: mes ${Month}: SD4/SD4neg no cierran con la extensión`);
      maxErrorSd4 = Math.max(maxErrorSd4 ?? 0, e1, e2);
      sd4neg = r.SD4neg;
      sd4 = r.SD4;
    }
    lms.push([Month!, L!, M!, S!]);
    sd.push([Month!, ...(sdValues as [number, number, number, number, number, number, number]), sd4neg, sd4]);
  }
  return { lms, sd, maxError, maxErrorSd4 };
}

function main(): void {
  const folder = process.argv[2];
  if (!folder) fail("Uso: npx tsx packages/core/scripts/who/build-who-lms.ts <carpeta>");
  const here = dirname(fileURLToPath(import.meta.url));
  const outDir = resolve(here, "../../src/who");

  const tables: Record<Indicator, Record<SexKey, TableOut>> = {
    BMI_FOR_AGE: { MALE: { lms: [], sd: [], maxError: 0, maxErrorSd4: null }, FEMALE: { lms: [], sd: [], maxError: 0, maxErrorSd4: null } },
    HEIGHT_FOR_AGE: { MALE: { lms: [], sd: [], maxError: 0, maxErrorSd4: null }, FEMALE: { lms: [], sd: [], maxError: 0, maxErrorSd4: null } },
  };
  const summary: string[] = [];
  // Primero 2006 (mes 60), después 2007 (61–228): así el orden queda por mes.
  const ordered = [...SOURCES].sort((a, b) => (a.reference === b.reference ? 0 : a.reference === "OMS 2006" ? -1 : 1));
  for (const src of ordered) {
    const out = processSource(folder, src);
    const t = tables[src.indicator][src.sex];
    t.lms.push(...out.lms);
    t.sd.push(...out.sd);
    summary.push(
      `${src.indicator.padEnd(14)} ${src.sex.padEnd(6)} ${src.reference}: ${String(out.lms.length).padStart(3)} filas, error máx. DE ${out.maxError.toFixed(6)}` +
        (out.maxErrorSd4 !== null ? `, error máx. SD4/SD4neg ${out.maxErrorSd4.toFixed(6)}` : ""),
    );
  }
  for (const ind of ["BMI_FOR_AGE", "HEIGHT_FOR_AGE"] as const) {
    for (const sex of ["MALE", "FEMALE"] as const) {
      const t = tables[ind][sex];
      if (t.lms.length !== LAST_MONTH - FIRST_MONTH + 1) fail(`${ind} ${sex}: ${t.lms.length} filas, se esperaban 169`);
      t.lms.forEach((row, i) => {
        if (row[0] !== FIRST_MONTH + i) fail(`${ind} ${sex}: meses no contiguos`);
      });
    }
  }

  const fmt = (v: number | null) => (v === null ? "null" : String(v));
  const lmsBlock = (ind: Indicator, sex: SexKey) =>
    tables[ind][sex].lms.map((r) => `      [${r.map(fmt).join(", ")}],`).join("\n");
  const sdBlock = (ind: Indicator, sex: SexKey) =>
    tables[ind][sex].sd.map((r) => `      [${r.map(fmt).join(", ")}],`).join("\n");

  const header =
    "// GENERADO por packages/core/scripts/who/build-who-lms.ts — NO EDITAR A MANO.\n" +
    "// Fuentes: ver ./README.md (OMS 2007 \"z-scores expanded\" meses 61–228; OMS 2006 solo mes 60).\n";

  const sourcesBlock = SOURCES.map(
    (s) =>
      `  {\n    indicator: "${s.indicator}",\n    sex: "${s.sex}",\n    reference: "${s.reference}",\n    months: "${s.months}",\n    url: "${s.url}",\n    file: "${s.file}",\n    sha256: "${s.sha256}",\n  },`,
  ).join("\n");

  const lmsFile = `${header}
/** [mes, L, M, S] */
export type WhoLmsTuple = readonly [month: number, L: number, M: number, S: number];
export type WhoIndicator = "BMI_FOR_AGE" | "HEIGHT_FOR_AGE";

export const WHO_LMS_FIRST_MONTH = ${FIRST_MONTH};
export const WHO_LMS_LAST_MONTH = ${LAST_MONTH};
export const WHO_LMS_DOWNLOADED_AT = "${DOWNLOADED_AT}";

/** 169 filas por tabla, ordenadas por mes (índice = mes − 60). La fila 60 es de la OMS 2006. */
export const WHO_LMS: Readonly<Record<WhoIndicator, Readonly<Record<"MALE" | "FEMALE", readonly WhoLmsTuple[]>>>> = {
  BMI_FOR_AGE: {
    MALE: [
${lmsBlock("BMI_FOR_AGE", "MALE")}
    ],
    FEMALE: [
${lmsBlock("BMI_FOR_AGE", "FEMALE")}
    ],
  },
  HEIGHT_FOR_AGE: {
    MALE: [
${lmsBlock("HEIGHT_FOR_AGE", "MALE")}
    ],
    FEMALE: [
${lmsBlock("HEIGHT_FOR_AGE", "FEMALE")}
    ],
  },
};

export interface WhoLmsSource {
  indicator: WhoIndicator;
  sex: "MALE" | "FEMALE";
  reference: "OMS 2007" | "OMS 2006";
  months: string; // "61–228" | "60"
  url: string;
  file: string;
  sha256: string;
}

export const WHO_LMS_SOURCES: readonly WhoLmsSource[] = [
${sourcesBlock}
];
`;

  const sdFile = `${header}
import type { WhoIndicator } from "./who-lms-data";

/** [mes, SD3neg, SD2neg, SD1neg, SD0, SD1, SD2, SD3, SD4neg | null, SD4 | null]
 *  SD4neg/SD4 solo en IMC/E OMS 2007 (null en talla y en el mes 60). */
export type WhoSdTuple = readonly [number, number, number, number, number, number, number, number, number | null, number | null];

export const WHO_SD_COLUMNS: Readonly<Record<WhoIndicator, Readonly<Record<"MALE" | "FEMALE", readonly WhoSdTuple[]>>>> = {
  BMI_FOR_AGE: {
    MALE: [
${sdBlock("BMI_FOR_AGE", "MALE")}
    ],
    FEMALE: [
${sdBlock("BMI_FOR_AGE", "FEMALE")}
    ],
  },
  HEIGHT_FOR_AGE: {
    MALE: [
${sdBlock("HEIGHT_FOR_AGE", "MALE")}
    ],
    FEMALE: [
${sdBlock("HEIGHT_FOR_AGE", "FEMALE")}
    ],
  },
};
`;

  writeFileSync(join(outDir, "who-lms-data.ts"), lmsFile);
  writeFileSync(join(outDir, "who-sd-columns.test-data.ts"), sdFile);
  console.log(summary.join("\n"));
  console.log(`Escrito: ${join(outDir, "who-lms-data.ts")}`);
  console.log(`Escrito: ${join(outDir, "who-sd-columns.test-data.ts")}`);
}

main();
