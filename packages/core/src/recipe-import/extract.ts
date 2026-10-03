import { foodSearchText } from "../food-search";
import type { BboxPage, BboxWord } from "../sara2/bbox";
import { recipeFileBase, suggestFromFileName } from "./files";
import { parseIngredientLine, type IngredientLineFlag, type ParsedIngredientLine } from "./ingredient-line";
import { BULLETS, normalizePdfText, plainText, stripBullet } from "./text";

// HU-018a-2 (SDD 8.1): páginas de un recetario (pdftotext -bbox) → borradores de receta. Sin IA y
// sin inventar gramos: los gramos salen solo de parseIngredientLine. Formatos:
//   F1: títulos de sección horizontales ("Ingredientes", "Procedimiento", "Tips").
//   F2: títulos rotados (caja más alta que ancha) o sin títulos: se separa por viñetas.
//   F4: colaciones en párrafo ("Nombre: descripción… Porción: X"), varias por página.
//   F5: páginas que no son recetas (intro, índice, consejos) → skippedPages.

export interface RecipeImportHints {
  /** "Rinde para 8 personas aprox." / "16 unidades". */
  yieldText: string | null;
  /** "¾ albóndigas", "3 unidades". */
  portionText: string | null;
  /** La línea del pie con "Lic." / "MN" / "MP" si aparece. */
  authorLine: string | null;
  /** Con qué estrategia se armó (SDD 8.1). */
  format: "F1" | "F2" | "F4";
  /** "Título partido en 3 renglones", "Subtítulo «Relleno»"… */
  warnings: string[];
  /** En el mismo orden que ingredients. */
  ingredientFlags: IngredientLineFlag[][];
}

export interface RecipeImportDraft {
  importKey: string;
  file: string;
  page: number;
  name: string;
  /** Solo si el texto trae un número de porciones/personas ("8"); "16 unidades" → null. */
  yieldPortions: number | null;
  /** = hints.portionText. */
  portionHousehold: string | null;
  ingredients: ParsedIngredientLine[];
  /** Pasos unidos con "\n", sin viñetas. */
  preparation: string | null;
  tips: string | null;
  published: {
    portionText: string | null;
    kcal: number | null;
    protein: number | null;
    carbs: number | null;
    fat: number | null;
    fiber: number | null;
  } | null;
  /** RecipeTypeKey sugerido por el nombre del archivo. */
  suggestedType: string | null;
  /** RecipeMomentKey[]. */
  suggestedMoments: string[];
  /** "Nutriarte — Almuerzos y cenas 2". */
  suggestedSourceName: string;
  /** Texto de la página en orden de lectura. */
  rawText: string;
  hints: RecipeImportHints;
}

export type SkippedPageReason = "NO_RECIPE" | "INDEX" | "CONTINUATION_UNMERGED" | "EMPTY";

export interface RecipeExtractionResult {
  drafts: RecipeImportDraft[];
  skippedPages: { page: number; reason: SkippedPageReason }[];
}

/**
 * "<archivo-normalizado>:p<página>:<foodSearchText(nombre)>". El archivo se normaliza sin extensión
 * ni sufijos " (1)", "_compressed", " byn", y pasa por foodSearchText con "-" en vez de espacios.
 */
export function recipeImportKey(file: string, page: number, name: string): string {
  const fileKey = foodSearchText(recipeFileBase(file)).replace(/ /g, "-");
  return `${fileKey}:p${page}:${foodSearchText(name)}`;
}

// ── Geometría ──────────────────────────────────────────────────────────────────────────────────

interface Word extends BboxWord {
  h: number;
  yc: number;
}

/** Tramo de una línea (las líneas se cortan donde hay un hueco grande: columnas). */
interface Seg {
  words: Word[];
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  yc: number;
  h: number;
  text: string;
}

interface Line extends Seg {
  segs: Seg[];
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

function makeSeg(words: Word[]): Seg {
  const ws = [...words].sort((a, b) => a.x0 - b.x0);
  return {
    words: ws,
    x0: Math.min(...ws.map((w) => w.x0)),
    x1: Math.max(...ws.map((w) => w.x1)),
    y0: Math.min(...ws.map((w) => w.y0)),
    y1: Math.max(...ws.map((w) => w.y1)),
    yc: ws.reduce((a, w) => a + w.yc, 0) / ws.length,
    h: median(ws.map((w) => w.h)),
    text: normalizePdfText(ws.map((w) => w.text).join(" ")),
  };
}

/** Palabra rotada: título de sección vertical (F2). Las palabras de 1–3 letras no cuentan (viñetas). */
function isRotated(w: BboxWord): boolean {
  return w.text.trim().length >= 4 && w.y1 - w.y0 > (w.x1 - w.x0) * 1.5;
}

function buildLines(words: Word[], tolerance: number): Line[] {
  const sorted = [...words].sort((a, b) => a.yc - b.yc || a.x0 - b.x0);
  const groups: Word[][] = [];
  let current: Word[] = [];
  let currentYc = 0;
  for (const w of sorted) {
    if (current.length > 0 && Math.abs(w.yc - currentYc) <= tolerance) {
      current.push(w);
      currentYc = current.reduce((a, x) => a + x.yc, 0) / current.length;
    } else {
      if (current.length > 0) groups.push(current);
      current = [w];
      currentYc = w.yc;
    }
  }
  if (current.length > 0) groups.push(current);
  return groups.map((g) => {
    const line = makeSeg(g);
    // Cortar en tramos donde el hueco entre palabras supera 1,5 × la altura (otra columna).
    const segs: Seg[] = [];
    let buf: Word[] = [];
    for (const w of line.words) {
      const prev = buf[buf.length - 1];
      if (prev && w.x0 - prev.x1 > 1.5 * Math.min(prev.h, w.h)) {
        segs.push(makeSeg(buf));
        buf = [];
      }
      buf.push(w);
    }
    if (buf.length > 0) segs.push(makeSeg(buf));
    return { ...line, segs };
  });
}

// ── Títulos de sección ─────────────────────────────────────────────────────────────────────────

type SectionKind = "ingredients" | "steps" | "tips";

function sectionKind(text: string): SectionKind | null {
  const t = plainText(text);
  if (t === "" || t.split(" ").length > 4) return null;
  if (/^ingredientes?\b/.test(t)) return "ingredients";
  if (/^(?:procedimiento|preparacion|elaboracion|paso a paso|modo de preparacion)\b/.test(t)) return "steps";
  if (/^(?:tips?|consejos?)\b/.test(t)) return "tips";
  return null;
}

interface Title {
  kind: SectionKind;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

// ── Tabla nutricional ──────────────────────────────────────────────────────────────────────────

type NutrientKey = "kcal" | "protein" | "carbs" | "fat" | "fiber";

function nutrientKey(text: string): NutrientKey | null {
  const t = plainText(text);
  if (/^(?:calorias|kcal|energia|valor energetico)$/.test(t)) return "kcal";
  if (/^(?:proteinas?)$/.test(t)) return "protein";
  if (/^(?:hidratos|carbohidratos|hc|hdc|hidratos de carbono)$/.test(t)) return "carbs";
  if (/^(?:grasas?|lipidos)$/.test(t)) return "fat";
  if (/^(?:fibras?)$/.test(t)) return "fiber";
  return null;
}

const NUMERIC_WORD = /^(\d+(?:[.,]\d+)?)(?:\s*(?:kcal|g|gr))?$/i;

function numericValue(text: string): number | null {
  const m = NUMERIC_WORD.exec(normalizePdfText(text));
  if (!m) return null;
  const v = Number(m[1]!.replace(",", "."));
  return Number.isFinite(v) ? v : null;
}

interface TableResult {
  published: NonNullable<RecipeImportDraft["published"]>;
  lines: Set<Line>;
}

function findTable(lines: Line[], medianH: number): TableResult | null {
  for (let i = 0; i < lines.length; i++) {
    const header = lines[i]!;
    const labels = header.words
      .map((w) => ({ w, key: nutrientKey(w.text) }))
      .filter((x): x is { w: Word; key: NutrientKey } => x.key !== null);
    if (new Set(labels.map((l) => l.key)).size < 3) continue;

    const used = new Set<Line>([header]);
    const values: Partial<Record<NutrientKey, number>> = {};
    const valueLine = lines
      .slice(i + 1)
      .find((l) => l.yc - header.yc <= 4 * Math.max(medianH, header.h) && l.words.filter((w) => numericValue(w.text) !== null).length >= 2);
    let leftovers: string[] = [];
    if (valueLine) {
      used.add(valueLine);
      const nums = valueLine.words.filter((w) => numericValue(w.text) !== null);
      const taken = new Set<Word>();
      for (const { w, key } of labels) {
        const xc = (w.x0 + w.x1) / 2;
        const best = nums
          .filter((n) => !taken.has(n))
          .sort((a, b) => Math.abs((a.x0 + a.x1) / 2 - xc) - Math.abs((b.x0 + b.x1) / 2 - xc))[0];
        if (best) {
          taken.add(best);
          values[key] = numericValue(best.text)!;
        }
      }
      leftovers = valueLine.words.filter((w) => !taken.has(w)).map((w) => w.text);
    } else {
      // Valores a la derecha de cada etiqueta, en la misma línea.
      for (const { w, key } of labels) {
        const next = header.words.find((x) => x.x0 >= w.x1 && numericValue(x.text) !== null);
        if (next) values[key] = numericValue(next.text)!;
      }
    }
    if (Object.keys(values).length === 0) continue;

    // Porción: "TABLA NUTRICIONAL porción ¾ albóndigas" (en la línea de arriba o en la cabecera).
    let portionText: string | null = null;
    const above = lines[i - 1];
    for (const l of [header, above]) {
      if (!l) continue;
      const m = /porci[oó]n(?:es)?\s*[:,]?\s*(.+)$/i.exec(
        l.words
          .filter((w) => nutrientKey(w.text) === null)
          .map((w) => w.text)
          .join(" "),
      );
      if (m && m[1]!.trim() !== "") {
        portionText = normalizePdfText(m[1]!);
        if (l === above) used.add(above);
        break;
      }
    }
    if (above && /\btabla\b/.test(plainText(above.text)) && header.yc - above.yc <= 4 * Math.max(medianH, header.h)) {
      used.add(above);
    }
    if (portionText === null && leftovers.length > 0) portionText = normalizePdfText(leftovers.join(" "));

    return {
      published: {
        portionText,
        kcal: values.kcal ?? null,
        protein: values.protein ?? null,
        carbs: values.carbs ?? null,
        fat: values.fat ?? null,
        fiber: values.fiber ?? null,
      },
      lines: used,
    };
  }
  return null;
}

// ── Armado de ítems (ingredientes, pasos, tips) ────────────────────────────────────────────────

const AUTHOR_RE = /(?:^|[\s(])(?:lic\.?|m\.?\s?n\.?|m\.?\s?p\.?)(?=[\s:.]|$).*\d{3,}/i;
const YIELD_LINE = /^(?:rinde|para \d|\d+\s*(?:a\s*\d+\s*)?(?:porciones|personas|unidades)\b)/;
const QUANTITY_HINT = /\d|c\s*[./]\s*n\b|una?\s|media|medio/i;

function startsLower(text: string): boolean {
  return /^[a-zñáéíóú(¿¡,]/.test(text);
}

function isSubtitle(text: string, nextHasBullet: boolean, usesBullets: boolean): boolean {
  const words = text.split(" ").filter(Boolean);
  if (words.length === 0 || words.length > 3) return false;
  if (/\d/.test(text) || /[.,;]$/.test(text)) return false;
  if (!/^[A-ZÁÉÍÓÚÑ]/.test(text)) return false;
  if (/:$/.test(text)) return true;
  return usesBullets && nextHasBullet;
}

interface Assembled {
  items: string[];
  subtitles: string[];
  leading: string[];
}

/** Viñeta → ítem nuevo; renglón sin viñeta → continuación (o subtítulo). Sin viñetas: mayúscula = ítem nuevo. */
function assemble(segs: Seg[], withSubtitles: boolean): Assembled {
  const parsed = segs.map((s) => stripBullet(s.text)).filter((p) => p.text !== "" || p.bullet !== null);
  const usesBullets = parsed.some((p) => p.bullet !== null);
  const items: string[] = [];
  const subtitles: string[] = [];
  const leading: string[] = [];
  parsed.forEach((p, i) => {
    if (p.text === "") return;
    const nextHasBullet = parsed[i + 1]?.bullet != null;
    if (p.bullet !== null) {
      items.push(p.text);
      return;
    }
    if (withSubtitles && isSubtitle(p.text, nextHasBullet, usesBullets)) {
      subtitles.push(p.text.replace(/:$/, ""));
      return;
    }
    const last = items.length - 1;
    const continues = usesBullets || startsLower(p.text) || (last >= 0 && /[,(]$/.test(items[last]!));
    if (last >= 0 && continues) {
      items[last] = `${items[last]} ${p.text}`;
    } else if (usesBullets) {
      const lastLeading = leading.length - 1;
      if (lastLeading >= 0 && startsLower(p.text)) leading[lastLeading] = `${leading[lastLeading]} ${p.text}`;
      else leading.push(p.text);
    } else {
      items.push(p.text);
    }
  });
  return { items, subtitles, leading };
}

/** Ordena los tramos de una sección: por columna (relativa al borde izquierdo de la sección) y después por y. */
function readingOrder(segs: Seg[], pageWidth: number): Seg[] {
  if (segs.length === 0) return segs;
  const minX = Math.min(...segs.map((s) => s.x0));
  const col = (s: Seg) => Math.floor((s.x0 - minX) / (pageWidth * 0.3));
  return [...segs].sort((a, b) => col(a) - col(b) || a.yc - b.yc || a.x0 - b.x0);
}

function hasQuantity(text: string): boolean {
  const p = parseIngredientLine(text);
  return p.grams !== null || p.household !== null || p.noQuantity || p.flags.includes("VOLUME_ONLY") || p.flags.includes("AMBIGUOUS_GRAMS");
}

function joinText(parts: readonly string[]): string | null {
  const t = parts.map((s) => s.trim()).filter(Boolean).join("\n");
  return t === "" ? null : t;
}

// ── Cabecera: nombre, rinde, porción ───────────────────────────────────────────────────────────

function titleCase(name: string): string {
  const letters = name.replace(/[^a-zA-ZñÑáéíóúÁÉÍÓÚ]/g, "");
  if (letters !== "" && letters === letters.toUpperCase()) {
    const lower = name.toLowerCase();
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  }
  return name.charAt(0).toUpperCase() + name.slice(1);
}

interface HeaderInfo {
  name: string;
  nameLines: number;
  yieldText: string | null;
  yieldPortions: number | null;
  yieldRange: boolean;
  portionText: string | null;
  rest: Seg[];
}

function readHeader(header: Seg[], medianH: number): HeaderInfo {
  const ordered = [...header].sort((a, b) => a.yc - b.yc || a.x0 - b.x0);
  // Nombre: los renglones con letra grande. Las cajas de pdftotext incluyen el interlineado, así que
  // se compara contra la más alta de la cabecera (un "Rinde 4-5 porciones" en cuerpo mediano no entra).
  const withText = ordered.filter((s) => plainText(s.text) !== "");
  const tallest = withText.reduce<Seg | null>((a, b) => (a === null || b.h > a.h ? b : a), null);
  const nameSegs =
    tallest && tallest.h >= 1.4 * medianH
      ? withText.filter((s) => s.h >= Math.max(1.4 * medianH, 0.75 * tallest.h))
      : [];
  const bulletChars = new RegExp(`(^|\\s)[${BULLETS.map((b) => `\\${b}`).join("")}](?=\\s|$)`, "g");
  const name = titleCase(
    normalizePdfText(nameSegs.map((s) => s.text).join(" ").replace(bulletChars, " ")).replace(/[\s.,;:]+$/, ""),
  );
  const rest = ordered.filter((s) => !nameSegs.includes(s));

  let yieldText: string | null = null;
  let yieldPortions: number | null = null;
  let yieldRange = false;
  let portionText: string | null = null;
  for (const s of rest) {
    const t = plainText(s.text);
    const range = /(\d+)(?:\s*(?:a|y)\s*|\s+)(\d+)\s*(?:porciones|personas)\b/.exec(t);
    const rinde = /\brinde\s+(?:para\s+)?(\d+)(?!\s*(?:a|y)?\s*\d)/.exec(t);
    const portions = /(?<!\d\s?)(\d+)\s*(?:porciones|personas)\b/.exec(t);
    const units = /\b\d+\s*(?:a\s*\d+\s*)?(?:unidades|u)\b/.exec(t);
    if (yieldText === null && (range || rinde || portions || units)) {
      yieldText = s.text;
      if (range && range[1] !== range[2]) yieldRange = true;
      else if (rinde) yieldPortions = Number(rinde[1]);
      else if (portions) yieldPortions = Number(portions[1]);
    }
    const p = /porci[oó]n(?:es)?\s*[:,]\s*(.+)$/i.exec(s.text);
    if (portionText === null && p) portionText = p[1]!.trim();
  }
  if (yieldPortions !== null && !(yieldPortions > 0 && yieldPortions <= 999)) yieldPortions = null;
  return { name, nameLines: nameSegs.length, yieldText, yieldPortions, yieldRange, portionText, rest };
}

// ── Página ─────────────────────────────────────────────────────────────────────────────────────

interface DocContext {
  file: string;
  nutriarte: boolean;
  docAuthor: string | null;
}

type PageOutcome = { drafts: Omit<RecipeImportDraft, "importKey">[] } | { skipped: SkippedPageReason };

function cleanAuthor(line: string): string {
  const bulletClass = BULLETS.map((b) => `\\${b}`).join("");
  return normalizePdfText(line.replace(new RegExp(`\\s[${bulletClass}]\\s`, "g"), " · "));
}

function sourceName(ctx: DocContext, pageAuthor: string | null): string {
  const title = suggestFromFileName(ctx.file).title;
  if (ctx.nutriarte) {
    const t = title.replace(/(^|\s)nutriarte(?=\s|$)/i, " ").replace(/\s+/g, " ").trim();
    const tt = t === "" ? title : t.charAt(0).toUpperCase() + t.slice(1);
    return `Nutriarte — ${tt}`;
  }
  const author = pageAuthor ?? ctx.docAuthor;
  return author ? `${author} — ${title}` : title;
}

function pageRawText(lines: Line[]): string {
  return lines.map((l) => l.segs.map((s) => s.text).join("   ")).join("\n");
}

function extractPage(page: BboxPage, ctx: DocContext): PageOutcome {
  const all: Word[] = page.words
    .filter((w) => w.text.trim() !== "")
    .map((w) => ({ ...w, h: w.y1 - w.y0, yc: (w.y0 + w.y1) / 2 }));
  if (all.length === 0) return { skipped: "EMPTY" };

  const rotated = all.filter(isRotated);
  const flat = all.filter((w) => !isRotated(w));
  const medianH = median(flat.map((w) => w.h)) || 10;
  const lines = buildLines(flat, 0.5 * medianH);
  const rawText = pageRawText(lines);

  // Pie con autor y tabla nutricional: fuera de las secciones.
  const authorLines = lines.filter((l) => AUTHOR_RE.test(l.text));
  const authorLine = authorLines[0] ? cleanAuthor(authorLines[0].text) : null;
  const table = findTable(lines, medianH);
  const excluded = new Set<Line>([...authorLines, ...(table?.lines ?? [])]);
  const segs = lines.filter((l) => !excluded.has(l)).flatMap((l) => l.segs);

  const flatTitles: (Title & { seg: Seg })[] = segs
    .map((s) => ({ s, kind: sectionKind(s.text) }))
    .filter((x): x is { s: Seg; kind: SectionKind } => x.kind !== null)
    .map(({ s, kind }) => ({ kind, x0: s.x0, x1: s.x1, y0: s.y0, y1: s.y1, seg: s }));
  const rotatedTitles: Title[] = rotated
    .map((w) => ({ w, kind: sectionKind(w.text) }))
    .filter((x): x is { w: Word; kind: SectionKind } => x.kind !== null)
    .map(({ w, kind }) => ({ kind, x0: w.x0, x1: w.x1, y0: w.y0, y1: w.y1 }));
  const content = segs.filter((s) => !flatTitles.some((t) => t.seg === s));

  const warnings: string[] = [];
  const bySection: Record<SectionKind, Seg[]> = { ingredients: [], steps: [], tips: [] };
  let header: Seg[] = [];
  let format: "F1" | "F2" | "F4";

  const portionLines = lines.filter((l) => /^porci[oó]n(?:es)?\s*[:,]/i.test(l.text.trim()));

  // Sin título "Ingredientes" pero con "Procedimiento": si arriba del procedimiento hay renglones con
  // cantidades, ahí empiezan los ingredientes (título implícito, del ancho de esos renglones).
  const titles: Title[] = flatTitles.map(({ kind, x0, x1, y0, y1 }) => ({ kind, x0, x1, y0, y1 }));
  if (!titles.some((t) => t.kind === "ingredients")) {
    const stepsTitle = titles.filter((t) => t.kind === "steps").sort((a, b) => a.y0 - b.y0)[0];
    if (stepsTitle) {
      const qty = content.filter(
        (s) =>
          s.yc < stepsTitle.y0 &&
          !YIELD_LINE.test(plainText(s.text)) &&
          hasQuantity(stripBullet(s.text).text),
      );
      if (qty.length >= 2) {
        const top = Math.min(...qty.map((s) => s.y0));
        titles.push({
          kind: "ingredients",
          x0: Math.min(...qty.map((s) => s.x0)),
          x1: Math.max(...qty.map((s) => s.x1)),
          y0: top - 2,
          y1: top - 1,
        });
        warnings.push("Ingredientes sin título de sección: se tomaron los renglones de arriba del procedimiento.");
      }
    }
  }

  if (titles.some((t) => t.kind === "ingredients")) {
    // F1: cada tramo va a la sección cuyo título está más cerca por arriba y se solapa en x.
    format = "F1";
    const flatTitles = titles;
    const firstTitleY = Math.min(...flatTitles.map((t) => t.y0));
    let lastOrphan: { seg: Seg; kind: SectionKind | "tips" } | null = null;
    const ordered = [...content].sort((a, b) => a.yc - b.yc || a.x0 - b.x0);
    for (const s of ordered) {
      if (s.yc < firstTitleY) {
        header.push(s);
        continue;
      }
      const slack = medianH;
      const above = flatTitles.filter((t) => (t.y0 + t.y1) / 2 < s.yc);
      const overlapping = above
        .filter((t) => s.x0 <= t.x1 + slack && s.x1 >= t.x0 - slack)
        .sort((a, b) => b.y0 - a.y0)[0];
      if (overlapping) {
        bySection[overlapping.kind].push(s);
        continue;
      }
      // Tramo sin título arriba en su columna: con viñeta va a la sección más cercana por arriba;
      // sin viñeta sigue al tramo huérfano anterior si está pegado, si no va a tips.
      const bullet = stripBullet(s.text).bullet !== null;
      let kind: SectionKind;
      if (bullet) {
        kind = [...above].sort((a, b) => b.y0 - a.y0)[0]?.kind ?? "tips";
      } else if (
        lastOrphan &&
        s.yc - lastOrphan.seg.yc <= 2 * Math.max(s.h, lastOrphan.seg.h) &&
        Math.abs(s.x0 - lastOrphan.seg.x0) <= 2 * s.h
      ) {
        kind = lastOrphan.kind;
      } else {
        kind = "tips";
      }
      bySection[kind].push(s);
      lastOrphan = { seg: s, kind };
    }
  } else if (rotatedTitles.some((t) => t.kind === "ingredients")) {
    // F2 con títulos rotados: cada tramo va al título cuya franja vertical le queda más cerca.
    format = "F2";
    const firstBullet = content
      .filter((s) => stripBullet(s.text).bullet !== null)
      .sort((a, b) => a.yc - b.yc)[0];
    const startY = Math.min(firstBullet ? firstBullet.yc : Infinity, ...rotatedTitles.map((t) => t.y0));
    const dist = (t: Title, y: number) => (y < t.y0 ? t.y0 - y : y > t.y1 ? y - t.y1 : 0);
    for (const s of content) {
      if (s.yc < startY - 0.25 * medianH) {
        header.push(s);
        continue;
      }
      const nearest = [...rotatedTitles].sort((a, b) => dist(a, s.yc) - dist(b, s.yc))[0]!;
      bySection[nearest.kind].push(s);
    }
  } else if (portionLines.length > 0) {
    format = "F4";
  } else {
    // F2 sin títulos: bloques de viñetas; el primero con cantidades son los ingredientes.
    const ordered = [...content].sort((a, b) => a.yc - b.yc || a.x0 - b.x0);
    const firstBulletIdx = ordered.findIndex((s) => stripBullet(s.text).bullet !== null);
    const quantityBullets = ordered.filter((s) => {
      const p = stripBullet(s.text);
      return p.bullet !== null && hasQuantity(p.text);
    });
    if (firstBulletIdx < 0 || quantityBullets.length < 2) {
      if (all.length === 0) return { skipped: "EMPTY" };
      const crosses = lines.filter((l) => /^[×x•]\s/.test(l.text)).length;
      if (crosses > 5 && !lines.some((l) => QUANTITY_HINT.test(l.text) && hasQuantity(stripBullet(l.text).text))) {
        return { skipped: "INDEX" };
      }
      if (flatTitles.some((t) => t.kind === "steps") || rotatedTitles.some((t) => t.kind === "steps")) {
        return { skipped: "CONTINUATION_UNMERGED" };
      }
      return { skipped: "NO_RECIPE" };
    }
    format = "F2";
    warnings.push("Ingredientes sin título de sección: se separaron por las viñetas.");
    header = ordered.slice(0, firstBulletIdx);
    const blocks: { bullet: string; segs: Seg[] }[] = [];
    for (const s of ordered.slice(firstBulletIdx)) {
      const b = stripBullet(s.text).bullet;
      const last = blocks[blocks.length - 1];
      if (b !== null && (!last || last.bullet !== b)) blocks.push({ bullet: b, segs: [s] });
      else last!.segs.push(s);
    }
    const ingIdx = blocks.findIndex((bl) => bl.segs.some((s) => hasQuantity(stripBullet(s.text).text)));
    blocks.forEach((bl, i) => {
      if (i === ingIdx) bySection.ingredients.push(...bl.segs);
      else if (i === ingIdx + 1) bySection.steps.push(...bl.segs);
      else bySection.tips.push(...bl.segs);
    });
  }

  if (format === "F4") return { drafts: extractParagraphs(lines, excluded, ctx, authorLine, rawText) };

  const head = readHeader(header, medianH);
  if (head.name === "") {
    return { skipped: bySection.steps.length > 0 && bySection.ingredients.length === 0 ? "CONTINUATION_UNMERGED" : "NO_RECIPE" };
  }
  if (head.nameLines > 1) warnings.push(`Título partido en ${head.nameLines} renglones.`);
  if (head.yieldRange) warnings.push("El rinde es un rango: cargá cuántas porciones.");

  const ing = assemble(readingOrder(bySection.ingredients, page.width), true);
  const steps = assemble(readingOrder(bySection.steps, page.width), false);
  const tipsAsm = assemble(readingOrder(bySection.tips, page.width), false);
  for (const sub of ing.subtitles) warnings.push(`Subtítulo «${sub}».`);
  const ingredients = ing.items.map(parseIngredientLine).filter((p) => p.rawText !== "");
  if (ingredients.length === 0) warnings.push("No se encontraron ingredientes: cargalos a mano.");
  if (!table) warnings.push("Sin tabla nutricional.");

  // Lo que quedó en la cabecera (aclaraciones) y el texto suelto antes de los ingredientes va a tips.
  const headerNotes = head.rest.filter((s) => s.text !== head.yieldText && !/porci[oó]n/i.test(s.text)).map((s) => s.text);
  const tips = joinText([...tipsAsm.items, ...tipsAsm.leading, ...ing.leading, ...steps.leading, ...headerNotes]);
  const portionText = table?.published.portionText ?? head.portionText;

  return {
    drafts: [
      {
        file: ctx.file,
        page: page.pageNumber,
        name: head.name.slice(0, 120),
        yieldPortions: head.yieldPortions,
        portionHousehold: portionText,
        ingredients,
        preparation: joinText(steps.items),
        tips,
        published: table?.published ?? null,
        ...suggestions(ctx, authorLine),
        rawText,
        hints: {
          yieldText: head.yieldText,
          portionText,
          authorLine,
          format,
          warnings,
          ingredientFlags: ingredients.map((i) => i.flags),
        },
      },
    ],
  };
}

function suggestions(ctx: DocContext, authorLine: string | null) {
  const s = suggestFromFileName(ctx.file);
  return { suggestedType: s.type, suggestedMoments: s.moments, suggestedSourceName: sourceName(ctx, authorLine) };
}

/** F4: "Nombre: descripción… Porción: X" en párrafos; cada párrafo cerrado por "Porción" es un borrador. */
function extractParagraphs(
  lines: Line[],
  excluded: Set<Line>,
  ctx: DocContext,
  authorLine: string | null,
  rawText: string,
): Omit<RecipeImportDraft, "importKey">[] {
  const usable = lines.filter((l) => !excluded.has(l));
  const spacing = median(usable.slice(1).map((l, i) => l.yc - usable[i]!.yc)) || 12;
  const drafts: Omit<RecipeImportDraft, "importKey">[] = [];
  let buf: Line[] = [];
  for (const l of usable) {
    const m = /^porci[oó]n(?:es)?\s*[:,]\s*(.*)$/i.exec(l.text.trim());
    if (!m) {
      buf.push(l);
      continue;
    }
    // El párrafo empieza después del último hueco grande (separa la colación anterior o la intro).
    let start = 0;
    for (let i = 1; i < buf.length; i++) {
      if (buf[i]!.yc - buf[i - 1]!.yc > 1.6 * spacing && !/:$/.test(buf[i - 1]!.text.trim())) start = i;
    }
    const block = buf.slice(start);
    buf = [];
    const text = normalizePdfText(block.map((b) => b.text).join(" "));
    if (text === "") continue;
    const colon = text.indexOf(":");
    const paren = text.indexOf("(");
    let name: string;
    let description: string;
    if (colon > 1 && colon <= 80) {
      name = text.slice(0, colon);
      description = text.slice(colon + 1).trim();
    } else if (paren > 1 && paren <= 80) {
      name = text.slice(0, paren);
      description = text;
    } else {
      const cut = text.search(/[.,]/);
      name = cut > 1 && cut <= 80 ? text.slice(0, cut) : text.split(" ").slice(0, 6).join(" ");
      description = text;
    }
    name = titleCase(name.replace(/[\s,;:.-]+$/, "").trim());
    if (name === "") continue;
    const portion = normalizePdfText(m[1] ?? "") || null;
    drafts.push({
      file: ctx.file,
      page: 0, // se completa afuera
      name: name.slice(0, 120),
      yieldPortions: null,
      portionHousehold: portion,
      ingredients: [],
      preparation: description || null,
      tips: null,
      published: null,
      ...suggestions(ctx, authorLine),
      rawText,
      hints: {
        yieldText: null,
        portionText: portion,
        authorLine,
        format: "F4",
        warnings: ["Colación en párrafo: cargá los ingredientes a mano."],
        ingredientFlags: [],
      },
    });
  }
  return drafts;
}

/** pages = parseBboxXhtml(pdftotext -bbox) de sara2/bbox.ts (se reusa tal cual). */
export function extractRecipesFromPages(pages: readonly BboxPage[], ctx: { file: string }): RecipeExtractionResult {
  const docText = plainText(pages.flatMap((p) => p.words.map((w) => w.text)).join(" "));
  const nutriarte = /\bnutriarte\b/.test(plainText(ctx.file)) || /\bnutriarte\b/.test(docText);
  const dc: DocContext = { file: ctx.file, nutriarte, docAuthor: null };

  const drafts: RecipeImportDraft[] = [];
  const skippedPages: RecipeExtractionResult["skippedPages"] = [];
  const keys = new Set<string>();
  // Autor del documento: el primero que aparezca en alguna página (para las que no lo tienen).
  const firstPass = pages.map((p) => ({ p, out: extractPage(p, dc) }));
  const firstAuthor =
    firstPass.flatMap((x) => ("drafts" in x.out ? x.out.drafts.map((d) => d.hints.authorLine) : [])).find((a) => a) ?? null;

  for (const { p, out } of firstPass) {
    if ("skipped" in out) {
      skippedPages.push({ page: p.pageNumber, reason: out.skipped });
      continue;
    }
    if (out.drafts.length === 0) {
      skippedPages.push({ page: p.pageNumber, reason: "NO_RECIPE" });
      continue;
    }
    for (const d of out.drafts) {
      const page = p.pageNumber;
      const sourceNameFinal =
        !nutriarte && !d.hints.authorLine && firstAuthor ? sourceName({ ...dc, docAuthor: firstAuthor }, null) : d.suggestedSourceName;
      let key = recipeImportKey(ctx.file, page, d.name);
      for (let n = 2; keys.has(key); n++) key = `${recipeImportKey(ctx.file, page, d.name)}:${n}`;
      keys.add(key);
      drafts.push({ ...d, page, importKey: key, suggestedSourceName: sourceNameFinal });
    }
  }
  return { drafts, skippedPages };
}
