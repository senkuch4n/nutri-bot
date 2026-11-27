// HU-028b (D15, uso limitado de Google): ningún dato obtenido con calendar.events llega a un proveedor de
// IA. Chequeo de source (sin base ni red): Calendar es solo escritura y queda fuera del alcance del código
// de IA del bot y del panel.
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PROFESSIONAL_SELECT } from "./professionalSelect";

const DOMAIN_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(DOMAIN_DIR, "../../..");

function read(path: string): string {
  return readFileSync(resolve(REPO_ROOT, path), "utf8");
}

/** Archivos .ts (no .test.ts) de un directorio, sin recursión. */
function tsFilesIn(dir: string): string[] {
  return readdirSync(resolve(REPO_ROOT, dir))
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
    .map((f) => join(dir, f));
}

/** Código sin comentarios, para que una nota en un comentario no cuente como llamada. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("D15 · garantía 2: Calendar es solo escritura", () => {
  const SYNC_FILES = ["packages/db/domain/gcal.ts", "packages/db/domain/googleCalendarAccount.ts"];

  it.each(SYNC_FILES)("%s no lee eventos, disponibilidad ni calendarios", (file) => {
    const src = code(read(file));
    for (const forbidden of [
      /events\s*\.\s*list\b/,
      /events\s*\.\s*get\b/,
      /events\s*\.\s*watch\b/,
      /events\s*\.\s*instances\b/,
      /freebusy/i,
      /calendarList/,
      /\.list\s*\(/,
    ]) {
      expect(src, `${file} usa ${forbidden}`).not.toMatch(forbidden);
    }
  });

  it("gcal.ts solo usa insert/patch/delete y de la respuesta del insert lee únicamente data.id", () => {
    const src = code(read("packages/db/domain/gcal.ts"));
    const calls = [...src.matchAll(/\bevents\s*\.\s*([a-zA-Z]+)\s*\(/g)].map((m) => m[1]);
    expect(new Set(calls)).toEqual(new Set(["insert", "patch", "delete"]));
    const insertResults = [...src.matchAll(/const\s+(\w+)\s*=\s*await\s+events\.insert\(/g)].map((m) => m[1]!);
    expect(insertResults).toEqual(["res"]);
    const uses = [...src.matchAll(/\bres\.([\w.?]+)/g)].map((m) => m[1]);
    expect(uses).toEqual(["data.id"]);
  });
});

describe("D15 · garantía 3: Google Calendar queda fuera del alcance de la IA", () => {
  it("domain/index.ts no exporta Google Calendar ni secretBox", () => {
    const src = code(read("packages/db/domain/index.ts"));
    for (const name of ["gcal", "googleCalendar", "googleCalendarAccount", "googleOAuthClient", "secretBox"]) {
      expect(src).not.toMatch(new RegExp(`["']\\./${name}["']`));
    }
  });

  it("PROFESSIONAL_SELECT no trae columnas de Google", () => {
    expect(Object.keys(PROFESSIONAL_SELECT).filter((k) => /google/i.test(k))).toEqual([]);
  });

  const AI_FILES = [
    "packages/db/domain/botAi.ts",
    "packages/db/domain/aiUsage.ts",
    ...tsFilesIn("apps/bot/src/ai"),
    "apps/web/src/lib/deepseek.ts",
    "apps/web/src/lib/assistant-tools.ts",
    "apps/web/src/lib/bot-ai.ts",
    ...tsFilesIn("apps/web/src/app/(panel)/asistente"),
    "apps/web/src/app/(panel)/pacientes/[id]/planes/[planId]/ai-actions.ts",
  ];
  const FORBIDDEN = ["googleCalendar", "GoogleCalendar", "gcal", "googleapis", "googleOAuthClient", "refreshTokenEnc", "secretBox"];

  it("la lista de archivos de IA no está vacía (los paths existen)", () => {
    expect(AI_FILES.length).toBeGreaterThanOrEqual(8);
    expect(AI_FILES.some((f) => f.startsWith("apps/bot/src/ai/"))).toBe(true);
    expect(AI_FILES.some((f) => f.includes("/asistente/"))).toBe(true);
  });

  it.each(AI_FILES)("%s no menciona Google Calendar", (file) => {
    const src = read(file);
    for (const word of FORBIDDEN) {
      expect(src.includes(word), `${relative(REPO_ROOT, resolve(REPO_ROOT, file))} menciona ${word}`).toBe(false);
    }
  });
});
