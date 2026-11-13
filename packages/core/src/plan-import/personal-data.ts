// HU-020 (SDD T4): ÚNICO lugar del importador que conoce datos personales.
// D12/D14 pendientes: agregar reglas acá (una entrada en PERSONAL_DATA_RULES + su test) cuando
// lleguen planes con otros datos de la paciente (peso, diagnóstico, etc.).
//
// Lo que se descarta no se guarda en ningún lado: solo se cuenta.
import { plainText } from "../recipe-import/text";
import type { ImportLine } from "./types";

/** "Nombre, Apellido dd/mm/aa" (o dd/mm/aaaa) en la portada. */
export const COVER_NAME_DATE_RE =
  /^\s*(\p{L}[\p{L}'-]*(?:[\s,]+\p{L}[\p{L}'-]*){0,4})\s*,?\s*(\d{1,2}[/.-]\d{1,2}[/.-]\d{2}(?:\d{2})?)\s*$/u;

const COVER_PERSONAL_PREFIX_RE =
  /^(?:peso|edad|talla|altura|diagnostico|dni|telefono|fecha|paciente)\b/;

const FOOTER_RES = [/\bLic\.?\s/i, /\bM\.?\s?[PN]\.?\s*\d+/i];

/** Pie de la profesional ("Lic. … M.P 0000"): ya está en Professional, se descarta en silencio. */
export function isProfessionalFooter(text: string): boolean {
  return FOOTER_RES.some((re) => re.test(text));
}

/** Objetivo de la portada ("Para mejorar …"): lo único de la portada que se guarda (título). */
export function isCoverObjective(text: string): boolean {
  return /^para\s/.test(plainText(text));
}

export type PersonalDataAction = "cover-name" | "drop-counted" | "drop-silent" | "keep";

/**
 * Reglas en orden: la primera que aplica decide. `scope: "cover"` solo mira la portada.
 * (a) nombre + fecha, (c) datos clínicos/identificatorios, (b) cualquier otra línea de portada que no
 * sea el objetivo, (d) pie de la profesional en cualquier página. (e) está en `redactCoverName`.
 */
export const PERSONAL_DATA_RULES: ReadonlyArray<{
  id: string;
  scope: "cover" | "any";
  test: (line: ImportLine, coverContext: { previousKept: ImportLine | null }) => boolean;
  action: PersonalDataAction;
}> = [
  { id: "professional-footer", scope: "any", test: (l) => isProfessionalFooter(l.text), action: "drop-silent" },
  { id: "cover-name-date", scope: "cover", test: (l) => COVER_NAME_DATE_RE.test(l.text), action: "cover-name" },
  {
    id: "cover-personal-prefix",
    scope: "cover",
    test: (l) => COVER_PERSONAL_PREFIX_RE.test(plainText(l.text)),
    action: "drop-counted",
  },
  { id: "cover-objective", scope: "cover", test: (l) => isCoverObjective(l.text), action: "keep" },
  {
    // Segundo renglón del objetivo ("y la composición…"): empieza en minúscula justo debajo.
    id: "cover-objective-continuation",
    scope: "cover",
    test: (l, ctx) =>
      ctx.previousKept !== null &&
      /^\p{Ll}/u.test(l.text.trim()) &&
      l.page === ctx.previousKept.page &&
      l.y0 - ctx.previousKept.y0 <= 2 * Math.max(l.h, ctx.previousKept.h),
    action: "keep",
  },
  { id: "cover-other", scope: "cover", test: () => true, action: "drop-counted" },
];

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Mayúscula inicial y el resto en cualquier caja: "Clara" y "CLARA", nunca "clara". */
function namePattern(word: string): string {
  const chars = [...word];
  const first = chars[0]!;
  const rest = chars
    .slice(1)
    .map((c) => {
      const lo = c.toLowerCase();
      const up = c.toUpperCase();
      return lo === up ? escapeRe(c) : `[${escapeRe(lo)}${escapeRe(up)}]`;
    })
    .join("");
  return `${escapeRe(first.toUpperCase())}${rest}`;
}

/** (e) Cada palabra del nombre de portada (≥ 3 letras) con mayúscula inicial → "[paciente]". */
export function redactCoverName(text: string, coverName: readonly string[]): { text: string; count: number } {
  let out = text;
  let count = 0;
  for (const word of coverName) {
    if ([...word].length < 3) continue;
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${namePattern(word)}(?![\\p{L}\\p{N}])`, "gu");
    out = out.replace(re, () => {
      count += 1;
      return "[paciente]";
    });
  }
  return { text: out, count };
}

export function stripPersonalData(lines: readonly ImportLine[]): {
  lines: ImportLine[];
  coverName: string[];
  redactions: number;
  coverLinesDropped: number;
  footerSegments: number;
} {
  const coverName: string[] = [];
  let coverLinesDropped = 0;
  let footerSegments = 0;
  const kept: ImportLine[] = [];
  let previousCoverKept: ImportLine | null = null;

  for (const line of lines) {
    const isCover = line.section === "COVER";
    const rule = PERSONAL_DATA_RULES.find(
      (r) => (r.scope === "any" || isCover) && r.test(line, { previousKept: previousCoverKept }),
    );
    const action = rule?.action ?? "keep";
    if (action === "cover-name") {
      const m = COVER_NAME_DATE_RE.exec(line.text)!;
      coverName.push(...m[1]!.split(/[\s,]+/).filter(Boolean));
      continue;
    }
    if (action === "drop-silent") {
      footerSegments += 1;
      continue;
    }
    if (action === "drop-counted") {
      coverLinesDropped += 1;
      continue;
    }
    kept.push(line);
    if (isCover) previousCoverKept = line;
  }

  let redactions = 0;
  const out = kept.map((line) => {
    const r = redactCoverName(line.text, coverName);
    if (r.count === 0) return line;
    redactions += r.count;
    return { ...line, text: r.text };
  });
  return { lines: out, coverName, redactions, coverLinesDropped, footerSegments };
}
