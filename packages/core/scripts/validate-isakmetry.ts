/**
 * HU-006 (SDD 10.5): validación LOCAL de las fórmulas ISAK contra las exportaciones de ISAKMetry.
 *
 * Este script está versionado pero NO tiene datos: lee `docs/ISAKMetry_*.xlsx|pdf` si están (no se
 * versionan: tienen datos de salud) y compara cada número con lo que calcula `buildIsakStudy`.
 * Nunca imprime ni escribe el nombre, el evaluador ni la fecha del estudio. No escribe archivos.
 *
 * Uso (desde la raíz):
 *   npm run isak:validate                  → tabla de diferencias; sale con 1 si hay algún DIF
 *   npm run isak:validate -- --check-leaks → busca el nombre (en memoria) en los archivos que toca
 *                                            la rama (git status); imprime solo rutas
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import {
  buildIsakStudy,
  formatFixedEs,
  roundTo,
  type IsakMeasureKey,
  type IsakMeasures,
  type IsakStudyResult,
  type IsakValue,
  type Sex,
} from "@nutri-bot/core";

const ROOT = resolve(import.meta.dirname, "../../..");
const DOCS = join(ROOT, "docs");

// ─── Utilidades ─────────────────────────────────────────────────────────────

/** "1,23" / "-0,40" / "98" → número. */
function parseEsArNumber(raw: string): number {
  return Number(raw.replace(/\./g, "").replace(",", "."));
}

/** Rótulo de ISAKMetry → clave (el mismo rótulo en el Excel y en el PDF). */
const MEASURE_LABELS: Record<string, IsakMeasureKey> = {
  "Masa corporal (kg)": "weightKg",
  "Talla (cm)": "heightCm",
  "Talla sentado (cm)": "sittingHeightCm",
  "Envergadura de brazos (cm)": "armSpanCm",
  "Tríceps (mm)": "tricepsSkinfoldMm",
  "Subescapular (mm)": "subscapularSkinfoldMm",
  "Bíceps (mm)": "bicepsSkinfoldMm",
  "Cresta ilíaca (mm)": "iliacCrestSkinfoldMm",
  "Supraespinal (mm)": "supraspinaleSkinfoldMm",
  "Abdominal (mm)": "abdominalSkinfoldMm",
  "Muslo (mm)": "thighSkinfoldMm",
  "Pierna (mm)": "calfSkinfoldMm",
  "Brazo relajado (cm)": "armCm",
  "Brazo flexionado y contraído (cm)": "armFlexedCm",
  "Cintura (cm)": "waistCm",
  "Caderas (cm)": "hipCm",
  "Muslo medio (cm)": "thighCm",
  "Pierna (cm)": "calfCm",
  "Húmero (cm)": "humerusBreadthCm",
  "Biestiloideo (cm)": "bistyloidBreadthCm",
  "Fémur (cm)": "femurBreadthCm",
};

type Status = "OK" | "TOLERADA" | "CONOCIDA" | "DIF";

interface Check {
  field: string;
  isak: number;
  system: IsakValue | number | null;
  decimals: number;
  /** "exact" (0 al decimal que se muestra), una tolerancia numérica, o una diferencia conocida. */
  rule: "exact" | { tolerance: number; reason: string } | { known: string };
}

interface ExtractedCase {
  kind: "pdf" | "xlsx";
  sex: Sex;
  ageYears: number;
  measures: IsakMeasures;
  /** Arma los chequeos con el resultado del sistema. */
  checks: (r: IsakStudyResult) => Check[];
}

function emptyMeasures(): IsakMeasures {
  return Object.fromEntries(Object.values(MEASURE_LABELS).map((k) => [k, null])) as IsakMeasures;
}

function zOf(r: IsakStudyResult, key: IsakMeasureKey): IsakValue | null {
  return r.measures.find((m) => m.key === key)?.z ?? null;
}

function sysNumber(v: IsakValue | number | null): number | null {
  if (v === null) return null;
  if (typeof v === "number") return v;
  return v.status === "ok" ? v.value : null;
}

function evaluate(c: Check): { status: Status; sys: number | null; diff: number | null; tol: string } {
  const sys = sysNumber(c.system);
  if (sys === null) return { status: "DIF", sys: null, diff: null, tol: "0" };
  const diff = roundTo(roundTo(sys, c.decimals) - roundTo(c.isak, c.decimals), c.decimals);
  if (Math.abs(diff) < 1e-9) return { status: "OK", sys, diff, tol: "0" };
  if (c.rule === "exact") return { status: "DIF", sys, diff, tol: "0" };
  if ("tolerance" in c.rule) {
    const tol = `±${formatFixedEs(c.rule.tolerance, c.decimals)} (${c.rule.reason})`;
    return { status: Math.abs(diff) <= c.rule.tolerance + 1e-9 ? "TOLERADA" : "DIF", sys, diff, tol };
  }
  return { status: "CONOCIDA", sys, diff, tol: c.rule.known };
}

const MASS_Z_RULE = { tolerance: 0.02, reason: "D7" } as const;

// ─── Excel (versión vieja de ISAKMetry) ─────────────────────────────────────

function readXlsxCells(file: string): Map<string, string> {
  const unzip = (path: string) => execFileSync("unzip", ["-p", file, path], { encoding: "utf8", maxBuffer: 1 << 24 });
  const shared = [...unzip("xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    (m[1] ?? "")
      .replace(/<[^>]+>/g, "")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&"),
  );
  const cells = new Map<string, string>();
  const sheet = unzip("xl/worksheets/sheet1.xml");
  // Las celdas vacías son autocerradas (<c r="A1" s="1"/>): no tienen que tragarse la siguiente.
  for (const m of sheet.matchAll(/<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const [, ref, attrs, inner] = m;
    const v = /<v>([\s\S]*?)<\/v>/.exec(inner ?? "")?.[1];
    if (!ref || v === undefined) continue;
    cells.set(ref, (attrs ?? "").includes('t="s"') ? (shared[Number(v)] ?? "") : v);
  }
  return cells;
}

class FormatError extends Error {}

function extractXlsx(file: string): ExtractedCase {
  const cells = readXlsxCells(file);
  const text = (ref: string) => (cells.get(ref) ?? "").trim();
  const expectLabel = (ref: string, startsWith: string) => {
    if (!text(ref).startsWith(startsWith)) throw new FormatError();
  };
  const num = (ref: string, labelRef: string, label: string) => {
    expectLabel(labelRef, label);
    const raw = text(ref);
    if (raw === "" || Number.isNaN(Number(raw))) throw new FormatError();
    return Number(raw);
  };

  // Edad y sexo (la validación no lee B6, H6 ni H7).
  const ageYears = num("B7", "A7", "Edad");
  const sexRaw = text("B8");
  if (sexRaw !== "Masculino" && sexRaw !== "Femenino") throw new FormatError();
  const sex: Sex = sexRaw === "Masculino" ? "MALE" : "FEMALE";

  const measures = emptyMeasures();
  const zRows: Array<{ key: IsakMeasureKey; z: number }> = [];
  for (let row = 13; row <= 36; row++) {
    const key = MEASURE_LABELS[text(`B${row}`)];
    if (!key) continue;
    measures[key] = Number(text(`D${row}`));
    if (key !== "heightCm" && text(`G${row}`) !== "") zRows.push({ key, z: Number(text(`G${row}`)) });
  }
  if (Object.values(measures).some((v) => v === null)) throw new FormatError();

  const tissueRow = (label: string): number => {
    for (let row = 40; row <= 43; row++) if (text(`A${row}`).startsWith(label)) return row;
    throw new FormatError();
  };
  const adiposeRow = tissueRow("Masa adiposa");
  const boneRow = tissueRow("Masa ósea");
  const muscleRow = tissueRow("Masa muscular");
  const residualRow = tissueRow("Masa residual");
  const v = {
    adiposeKg: Number(text(`C${adiposeRow}`)),
    adiposeZ: Number(text(`J${adiposeRow}`)),
    boneKg: Number(text(`C${boneRow}`)),
    boneZ: Number(text(`J${boneRow}`)),
    muscleKg: Number(text(`C${muscleRow}`)),
    muscleZ: Number(text(`J${muscleRow}`)),
    residualKg: Number(text(`C${residualRow}`)),
    residualZ: Number(text(`J${residualRow}`)),
    sum6: num("C68", "A68", "Sumatorio de 6"),
    sum8: num("C69", "A69", "Sumatorio de 8"),
    cArm: num("H68", "F68", "Brazo corregido"),
    cThigh: num("H69", "F69", "Muslo corregido"),
    cCalf: num("H70", "F70", "Pierna corregida"),
    zArm: num("H72", "F72", "Z brazo corregido"),
    zThigh: num("H73", "F73", "Z muslo corregido"),
    zCalf: num("H74", "F74", "Z pierna corregida"),
    iam: num("C82", "A82", "Índice adiposo muscular"),
    imo: num("C83", "A83", "Índice músculo/óseo"),
    endo: num("F87", "F86", "Endomorfia"),
    meso: num("F89", "F88", "Mesomorfia"),
    ecto: num("F91", "F90", "Ectomorfia"),
    icc: num("D114", "B114", "Índice cintura cadera"),
    conicity: num("D115", "B115", "Índice de conicidad"),
    bmi: num("D117", "B117", "IMC"),
    armDiff: num("D122", "A122", "Diferencia brazo"),
    cormic: num("D125", "A125", "Índice córmico"),
    manouvrier: num("D126", "A126", "Índice de Manouvrier"),
    span: num("D127", "A127", "Envergadura relativa"),
  };

  return {
    kind: "xlsx",
    sex,
    ageYears,
    measures,
    checks: (r) => [
      ...zRows.map(
        ({ key, z }): Check => ({
          field: `Z ${key}`,
          isak: z,
          system: zOf(r, key),
          decimals: 2,
          rule: key === "weightKg" ? MASS_Z_RULE : "exact",
        }),
      ),
      { field: "Tejido adiposo kg", isak: v.adiposeKg, system: r.tissues.adipose.kg, decimals: 2, rule: "exact" },
      {
        field: "Tejido adiposo Z",
        isak: v.adiposeZ,
        system: r.tissues.adipose.z,
        decimals: 2,
        rule: { known: "D6: el Excel viejo no sale de ninguna fórmula; se usa Kerr del Σ6" },
      },
      { field: "Tejido muscular kg", isak: v.muscleKg, system: r.tissues.muscle.kg, decimals: 2, rule: "exact" },
      { field: "Tejido muscular Z", isak: v.muscleZ, system: r.tissues.muscle.z, decimals: 2, rule: "exact" },
      { field: "Tejido óseo kg", isak: v.boneKg, system: r.tissues.bone.kg, decimals: 2, rule: "exact" },
      { field: "Tejido óseo Z", isak: v.boneZ, system: r.tissues.bone.z, decimals: 2, rule: "exact" },
      { field: "Tejido residual kg", isak: v.residualKg, system: r.tissues.residual.kg, decimals: 2, rule: "exact" },
      { field: "Tejido residual Z", isak: v.residualZ, system: r.tissues.residual.z, decimals: 2, rule: "exact" },
      { field: "Σ6 pliegues", isak: v.sum6, system: r.adiposity.sum6, decimals: 1, rule: "exact" },
      { field: "Σ8 pliegues", isak: v.sum8, system: r.adiposity.sum8, decimals: 1, rule: "exact" },
      { field: "Brazo corregido", isak: v.cArm, system: r.muscularity.correctedArm.value, decimals: 2, rule: "exact" },
      { field: "Muslo corregido", isak: v.cThigh, system: r.muscularity.correctedThigh.value, decimals: 2, rule: "exact" },
      { field: "Pierna corregida", isak: v.cCalf, system: r.muscularity.correctedCalf.value, decimals: 2, rule: "exact" },
      { field: "Z brazo corregido", isak: v.zArm, system: r.muscularity.correctedArm.z, decimals: 2, rule: "exact" },
      {
        field: "Z muslo corregido",
        isak: v.zThigh,
        system: r.muscularity.correctedThigh.z,
        decimals: 2,
        rule: { known: "D5: ISAKMetry muestra el Z del muslo sin corregir" },
      },
      { field: "Z pierna corregida", isak: v.zCalf, system: r.muscularity.correctedCalf.z, decimals: 2, rule: "exact" },
      { field: "Índice adiposo muscular", isak: v.iam, system: r.compositionIndices.adiposeMuscle, decimals: 2, rule: "exact" },
      { field: "Índice músculo/óseo", isak: v.imo, system: sysClassified(r.compositionIndices.muscleBone), decimals: 2, rule: "exact" },
      { field: "Endomorfia", isak: v.endo, system: r.somatotype.endo, decimals: 2, rule: "exact" },
      { field: "Mesomorfia", isak: v.meso, system: r.somatotype.meso, decimals: 2, rule: "exact" },
      { field: "Ectomorfia", isak: v.ecto, system: r.somatotype.ecto, decimals: 2, rule: "exact" },
      { field: "ICC", isak: v.icc, system: diagValue(r.health.diagnosis.waistHipRatio), decimals: 2, rule: "exact" },
      { field: "Conicidad", isak: v.conicity, system: diagValue(r.health.diagnosis.conicity), decimals: 2, rule: "exact" },
      { field: "IMC", isak: v.bmi, system: diagValue(r.health.diagnosis.bmi), decimals: 1, rule: "exact" },
      { field: "Diferencia de brazo", isak: v.armDiff, system: r.muscularity.armDifference, decimals: 1, rule: "exact" },
      { field: "Índice córmico", isak: v.cormic, system: sysClassified(r.proportionality.cormic), decimals: 2, rule: "exact" },
      {
        field: "Índice de Manouvrier",
        isak: v.manouvrier,
        system: sysClassified(r.proportionality.manouvrier),
        decimals: 0,
        rule: "exact",
      },
      {
        field: "Envergadura relativa",
        isak: v.span,
        system: sysClassified(r.proportionality.relativeSpan),
        decimals: 2,
        rule: "exact",
      },
    ],
  };
}

function sysClassified(v: { status: string; value?: number }): number | null {
  return v.status === "ok" && typeof v.value === "number" ? v.value : null;
}

function diagValue(row: { status: string; value?: number } | null): number | null {
  if (row === null) return null;
  return row.status === "classified" || row.status === "unclassified" ? (row.value ?? null) : null;
}

// ─── PDF (versión actual de ISAKMetry) ──────────────────────────────────────

const NUMBER_RE = /-?\d+(?:\.\d{3})*(?:,\d+)?/g;

function pdfText(file: string): string | null {
  try {
    return execFileSync("pdftotext", ["-layout", file, "-"], { encoding: "utf8", maxBuffer: 1 << 24 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

/** Líneas sin las de datos personales (se ignoran siempre en la validación). */
function pdfLines(text: string): string[] {
  return text
    .split("\n")
    .filter((l) => !/^\s*(Nombre:|Evaluado por|Realizado por|E-mail)/i.test(l));
}

function extractPdf(text: string): ExtractedCase {
  const lines = pdfLines(text);

  /** Números de la primera línea que empieza con `label` y tiene números después. */
  const numbersAfter = (label: string, nextLine = false): number[] => {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!.trim();
      if (!line.startsWith(label)) continue;
      const rest = nextLine ? (lines[i + 1] ?? "") : line.slice(label.length);
      const nums = rest.match(NUMBER_RE);
      if (nums && nums.length > 0) return nums.map(parseEsArNumber);
    }
    throw new FormatError();
  };
  const first = (label: string, nextLine = false) => numbersAfter(label, nextLine)[0]!;

  const ageMatch = /Edad:\s+(\d+)/.exec(text);
  const sexMatch = /Género:\s+(Masculino|Femenino)/.exec(text);
  if (!ageMatch || !sexMatch) throw new FormatError();
  const ageYears = Number(ageMatch[1]);
  const sex: Sex = sexMatch[1] === "Masculino" ? "MALE" : "FEMALE";

  const measures = emptyMeasures();
  const zRows: Array<{ key: IsakMeasureKey; z: number }> = [];
  for (const [label, key] of Object.entries(MEASURE_LABELS)) {
    const nums = numbersAfter(label);
    measures[key] = nums[0]!;
    if (key !== "heightCm" && nums.length > 1) zRows.push({ key, z: nums[1]! });
  }

  // Masa grasa: el rótulo ocupa 3 líneas; los números están en la siguiente al rótulo.
  const [fatKg, fatZ] = numbersAfter("Masa grasa (kg) (Durnin-", true) as [number, number];

  /** Distribución: el % debajo del rótulo, en la misma columna. */
  const percentBelow = (marker: string): number => {
    for (let i = 0; i < lines.length; i++) {
      const col = lines[i]!.indexOf(marker);
      if (col < 0) continue;
      for (let j = i + 1; j <= i + 3 && j < lines.length; j++) {
        let best: { value: number; dist: number } | null = null;
        for (const m of lines[j]!.matchAll(/(\d+,\d+)%/g)) {
          const dist = Math.abs((m.index ?? 0) - col);
          if (dist <= 10 && (!best || dist < best.dist)) best = { value: parseEsArNumber(m[1]!), dist };
        }
        if (best) return best.value;
      }
    }
    throw new FormatError();
  };

  const v = {
    fatKg,
    fatZ,
    ffmKg: first("Masa libre de grasa (kg)"),
    adipose: numbersAfter("Tejido adiposo (Kerr, 1991) (kg)"),
    muscle: numbersAfter("Tejido muscular (Lee, 2000) (kg)"),
    bone: numbersAfter("Tejido óseo (Rocha, 1974) (kg)"),
    upper: percentBelow("Superior:"),
    central: percentBelow("Central:"),
    lower: percentBelow("Inferior:"),
    arm: percentBelow("Brazo:"),
    thigh: percentBelow("Muslo:"),
    calf: percentBelow("Pierna:"),
    iam: first("Índice adiposo muscular"),
    imo: first("Índice músculo/óseo"),
    sum6: first("Sumatorio de 6 pliegues (mm)"),
    sum8: first("Sumatorio de 8 pliegues (mm)"),
    cArm: first("Brazo corregido (cm)"),
    cThigh: first("Muslo corregido (cm)"),
    cCalf: first("Pierna corregida (cm)"),
    zArm: first("Z brazo corregido"),
    zThigh: first("Z muslo corregido"),
    zCalf: first("Z pierna corregida"),
    armDiff: first("Diferencia perímetro del brazo flexionado", true),
    cormic: first("Índice córmico"),
    manouvrier: first("Índice de Manouvrier"),
    span: first("Envergadura relativa"),
    endo: first("Endomorfia"),
    meso: first("Mesomorfia"),
    ecto: first("Ectomorfia"),
    icc: first("Índice cintura cadera"),
    conicity: first("Índice de conicidad"),
    whtr: first("Índice cintura talla"),
    bmi: first("IMC (kg/m"),
    idg: first("Índice de distribución grasa"),
  };

  return {
    kind: "pdf",
    sex,
    ageYears,
    measures,
    checks: (r) => [
      ...zRows.map(
        ({ key, z }): Check => ({
          field: `Z ${key}`,
          isak: z,
          system: zOf(r, key),
          decimals: 2,
          rule: key === "weightKg" ? MASS_Z_RULE : "exact",
        }),
      ),
      { field: "Masa grasa kg", isak: v.fatKg, system: r.molecular.fatMass.kg, decimals: 2, rule: "exact" },
      { field: "Masa grasa Z", isak: v.fatZ, system: r.molecular.fatMass.z, decimals: 2, rule: "exact" },
      { field: "Masa libre de grasa kg", isak: v.ffmKg, system: r.molecular.fatFreeMass.kg, decimals: 2, rule: "exact" },
      { field: "Tejido adiposo kg", isak: v.adipose[0]!, system: r.tissues.adipose.kg, decimals: 2, rule: "exact" },
      { field: "Tejido adiposo Z", isak: v.adipose[1]!, system: r.tissues.adipose.z, decimals: 2, rule: "exact" },
      { field: "Tejido muscular kg", isak: v.muscle[0]!, system: r.tissues.muscle.kg, decimals: 2, rule: "exact" },
      { field: "Tejido muscular Z", isak: v.muscle[1]!, system: r.tissues.muscle.z, decimals: 2, rule: "exact" },
      { field: "Tejido óseo kg", isak: v.bone[0]!, system: r.tissues.bone.kg, decimals: 2, rule: "exact" },
      { field: "Tejido óseo Z", isak: v.bone[1]!, system: r.tissues.bone.z, decimals: 2, rule: "exact" },
      { field: "Distribución adiposa superior %", isak: v.upper, system: r.distribution.adipose.upper, decimals: 2, rule: "exact" },
      { field: "Distribución adiposa central %", isak: v.central, system: r.distribution.adipose.central, decimals: 2, rule: "exact" },
      { field: "Distribución adiposa inferior %", isak: v.lower, system: r.distribution.adipose.lower, decimals: 2, rule: "exact" },
      { field: "Distribución muscular brazo %", isak: v.arm, system: r.distribution.muscle.arm, decimals: 2, rule: "exact" },
      { field: "Distribución muscular muslo %", isak: v.thigh, system: r.distribution.muscle.thigh, decimals: 2, rule: "exact" },
      { field: "Distribución muscular pierna %", isak: v.calf, system: r.distribution.muscle.calf, decimals: 2, rule: "exact" },
      { field: "Índice adiposo muscular", isak: v.iam, system: r.compositionIndices.adiposeMuscle, decimals: 2, rule: "exact" },
      { field: "Índice músculo/óseo", isak: v.imo, system: sysClassified(r.compositionIndices.muscleBone), decimals: 2, rule: "exact" },
      { field: "Σ6 pliegues", isak: v.sum6, system: r.adiposity.sum6, decimals: 1, rule: "exact" },
      { field: "Σ8 pliegues", isak: v.sum8, system: r.adiposity.sum8, decimals: 1, rule: "exact" },
      { field: "Brazo corregido", isak: v.cArm, system: r.muscularity.correctedArm.value, decimals: 2, rule: "exact" },
      { field: "Muslo corregido", isak: v.cThigh, system: r.muscularity.correctedThigh.value, decimals: 2, rule: "exact" },
      { field: "Pierna corregida", isak: v.cCalf, system: r.muscularity.correctedCalf.value, decimals: 2, rule: "exact" },
      { field: "Z brazo corregido", isak: v.zArm, system: r.muscularity.correctedArm.z, decimals: 2, rule: "exact" },
      {
        field: "Z muslo corregido",
        isak: v.zThigh,
        system: r.muscularity.correctedThigh.z,
        decimals: 2,
        rule: { known: "D5: ISAKMetry muestra el Z del muslo sin corregir" },
      },
      { field: "Z pierna corregida", isak: v.zCalf, system: r.muscularity.correctedCalf.z, decimals: 2, rule: "exact" },
      { field: "Diferencia de brazo", isak: v.armDiff, system: r.muscularity.armDifference, decimals: 1, rule: "exact" },
      { field: "Índice córmico", isak: v.cormic, system: sysClassified(r.proportionality.cormic), decimals: 2, rule: "exact" },
      {
        field: "Índice de Manouvrier",
        isak: v.manouvrier,
        system: sysClassified(r.proportionality.manouvrier),
        decimals: 0,
        rule: "exact",
      },
      {
        field: "Envergadura relativa",
        isak: v.span,
        system: sysClassified(r.proportionality.relativeSpan),
        decimals: 2,
        rule: "exact",
      },
      { field: "Endomorfia", isak: v.endo, system: r.somatotype.endo, decimals: 2, rule: "exact" },
      { field: "Mesomorfia", isak: v.meso, system: r.somatotype.meso, decimals: 2, rule: "exact" },
      { field: "Ectomorfia", isak: v.ecto, system: r.somatotype.ecto, decimals: 2, rule: "exact" },
      { field: "ICC", isak: v.icc, system: diagValue(r.health.diagnosis.waistHipRatio), decimals: 2, rule: "exact" },
      { field: "Conicidad", isak: v.conicity, system: diagValue(r.health.diagnosis.conicity), decimals: 2, rule: "exact" },
      { field: "Cintura/talla", isak: v.whtr, system: diagValue(r.health.diagnosis.waistToHeight), decimals: 2, rule: "exact" },
      { field: "IMC", isak: v.bmi, system: diagValue(r.health.diagnosis.bmi), decimals: 1, rule: "exact" },
      { field: "Índice de distribución grasa", isak: v.idg, system: r.health.fatDistributionIndex, decimals: 2, rule: "exact" },
    ],
  };
}

// ─── Material local ─────────────────────────────────────────────────────────

function materialFiles(): string[] {
  if (!existsSync(DOCS)) return [];
  return readdirSync(DOCS)
    .filter((f) => f.startsWith("ISAKMetry_") && (f.endsWith(".xlsx") || f.endsWith(".pdf")))
    .sort()
    .map((f) => join(DOCS, f));
}

const NO_MATERIAL = "No está el material de ISAKMetry en docs/ (no se versiona). Nada que validar.";

// ─── Validación ─────────────────────────────────────────────────────────────

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

function validate(files: string[]): number {
  const totals: Record<Status, number> = { OK: 0, TOLERADA: 0, CONOCIDA: 0, DIF: 0 };
  for (const file of files) {
    let extracted: ExtractedCase;
    try {
      if (file.endsWith(".xlsx")) extracted = extractXlsx(file);
      else {
        const text = pdfText(file);
        if (text === null) {
          console.log("Falta pdftotext (poppler): se saltea el PDF");
          continue;
        }
        extracted = extractPdf(text);
      }
    } catch (error) {
      if (error instanceof FormatError) {
        console.log(`Formato de ${file.endsWith(".xlsx") ? "Excel" : "PDF"} no reconocido: se saltea el archivo`);
        continue;
      }
      throw error;
    }

    const result = buildIsakStudy({ measures: extracted.measures, sex: extracted.sex, ageYears: extracted.ageYears });
    const sexText = extracted.sex === "MALE" ? "masculino" : "femenino";
    console.log(`\nCaso: ${extracted.kind} · ${sexText} · ${extracted.ageYears} años`);
    console.log(
      `${pad("Campo", 36)} | ${pad("ISAKMetry", 9)} | ${pad("Sistema", 9)} | ${pad("Dif.", 6)} | ${pad("Tolerancia", 12)} | Estado`,
    );
    console.log("-".repeat(100));
    for (const check of extracted.checks(result)) {
      const e = evaluate(check);
      totals[e.status] += 1;
      console.log(
        [
          pad(check.field, 36),
          pad(formatFixedEs(check.isak, check.decimals), 9),
          pad(e.sys === null ? "—" : formatFixedEs(e.sys, check.decimals), 9),
          pad(e.diff === null ? "—" : formatFixedEs(e.diff, check.decimals), 6),
          pad(e.tol, 12),
          e.status,
        ].join(" | "),
      );
    }
  }
  console.log(`\n${totals.OK} OK · ${totals.TOLERADA} TOLERADA · ${totals.CONOCIDA} CONOCIDA · ${totals.DIF} DIF`);
  return totals.DIF > 0 ? 1 : 0;
}

// ─── --check-leaks ──────────────────────────────────────────────────────────

/** Nombres, solo en memoria. Nunca se imprimen. */
function readNames(files: string[]): string[] {
  const names: string[] = [];
  for (const file of files) {
    try {
      if (file.endsWith(".xlsx")) {
        const name = readXlsxCells(file).get("B6");
        if (name) names.push(name);
      } else {
        const text = pdfText(file);
        const line = text?.split("\n").find((l) => /^\s*Nombre:/.test(l));
        if (line) {
          const after = line.replace(/^\s*Nombre:\s*/, "");
          names.push(after.split(/Evaluado por:|\s{2,}/)[0] ?? "");
        }
      }
    } catch {
      // Si no se puede leer un archivo, no aporta nombres.
    }
  }
  return names;
}

function changedFiles(): string[] {
  const out = execFileSync("git", ["status", "--porcelain", "--untracked-files=all"], { cwd: ROOT, encoding: "utf8" });
  const files: string[] = [];
  for (const raw of out.split("\n")) {
    if (raw.trim() === "") continue;
    const status = raw.slice(0, 2);
    if (status.includes("D")) continue;
    let path = raw.slice(3);
    if (path.includes(" -> ")) path = path.split(" -> ")[1]!;
    path = path.replace(/^"|"$/g, "");
    const abs = join(ROOT, path);
    if (existsSync(abs) && statSync(abs).isFile()) files.push(path);
  }
  return files;
}

function checkLeaks(files: string[]): number {
  const words = [
    ...new Set(
      readNames(files)
        .flatMap((n) => n.split(/[^\p{L}]+/u))
        .filter((w) => w.length >= 4)
        .map((w) => w.toLowerCase()),
    ),
  ];
  if (words.length === 0) {
    console.log(NO_MATERIAL);
    return 0;
  }
  const strip = [homedir(), process.cwd(), ROOT].filter((p) => p.length > 1);
  const hits: string[] = [];
  for (const path of changedFiles()) {
    let content = readFileSync(join(ROOT, path), "utf8");
    for (const p of strip) content = content.split(p).join("");
    const lower = content.toLowerCase();
    if (words.some((w) => lower.includes(w))) hits.push(path);
  }
  if (hits.length === 0) {
    console.log("Sin fugas del nombre en archivos versionados");
    return 0;
  }
  console.log("Posible fuga del nombre en:");
  for (const h of hits) console.log(`  ${h}`);
  return 1;
}

// ─── main ───────────────────────────────────────────────────────────────────

const files = materialFiles();
if (files.length === 0) {
  console.log(NO_MATERIAL);
  process.exit(0);
}
process.exit(process.argv.includes("--check-leaks") ? checkLeaks(files) : validate(files));
