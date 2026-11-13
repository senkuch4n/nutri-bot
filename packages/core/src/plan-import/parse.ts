// HU-020 (SDD 5.2.1): páginas de un plan alimentario (pdftotext -bbox) → borrador de plantilla. Sin IA,
// sin base, sin red, sin fs. Lo que no entiende queda como aviso (no falla): "Texto sin ubicar".
import { MENU_SECTION_LABELS, PLAN_IMPORT_TEXT, PLAN_SECTION_LIMITS, type MenuSectionKey, type TemplateImportHint } from "../plan-templates";
import { normalizePdfText } from "../recipe-import/text";
import type { BboxPage } from "../sara2/bbox";
import { pageLines, type Seg } from "../sara2/lines";
import { WEEKDAYS, type Weekday } from "../weekly-menu";
import { MENU_SECTION_MEALS, OPTIONS_MEAL_NAME, matchLunchDinnerLabel, mealNameFor, type MenuMealKey } from "./meal-mapping";
import { isMacroContinuation, isQualitativeMacroLine, normalizeCombo, parseWeekdayLine, splitTandas } from "./menu";
import { isProfessionalFooter, redactCoverName, stripPersonalData } from "./personal-data";
import { matchRecipeOption } from "./recipe-match";
import {
  KNOWN_SECTIONS,
  PLATE_RULE_TITLE,
  isDecorativeLabel,
  isHeadingLike,
  isLetterSpaced,
  matchSectionHeading,
  type PlanSectionKey,
} from "./sections";
import type { ImportLine, PlanImportItem, PlanImportMeal, PlanImportResult, RecipeMatchCandidate } from "./types";

export const PLAN_IMPORT_LABEL_MAX = 500;
export const PLAN_IMPORT_NOTE_MAX = 300;
const TITLE_MAX = 140;
const MIN_WORDS = 20;
/** Encabezado de página: en el 20 % superior. */
const PAGE_TOP_RATIO = 0.2;

/** "pdf-sha256:<hex>". Lanza si sha256Hex no es /^[0-9a-f]{64}$/. */
export function planImportKey(sha256Hex: string): string {
  if (!/^[0-9a-f]{64}$/.test(sha256Hex)) throw new Error("planImportKey: se esperaba un sha256 en hex");
  return `pdf-sha256:${sha256Hex}`;
}

/** Texto del tramo; las letras espaciadas se juntan ("L I S TA  D E" → "LISTA DE"). */
function segText(seg: Seg): string {
  if (!isLetterSpaced(seg.text)) return seg.text;
  let out = "";
  let prev: Seg["words"][number] | null = null;
  for (const w of seg.words) {
    if (prev && w.x0 - prev.x1 > 0.25 * Math.min(prev.h, w.h)) out += " ";
    out += w.text.trim();
    prev = w;
  }
  return normalizePdfText(out);
}

type HintDraft = TemplateImportHint extends infer H ? (H extends unknown ? Omit<H, "id"> : never) : never;

const startsLower = (t: string) => /^\p{Ll}/u.test(t.trim());

/**
 * Arma el cuerpo de una sección de texto: renglones consecutivos unidos con espacio; párrafo nuevo
 * ("\n\n") con un hueco vertical > 1,5 × h, un cambio de columna o de página, o un subtítulo (que va
 * en su propio renglón). `starts[i]` = posición en el cuerpo donde empieza el renglón i (-1 si se omitió).
 */
function buildBody(lines: readonly ImportLine[], isSubtitle: (l: ImportLine) => boolean): { body: string; starts: number[] } {
  const blocks: string[] = [];
  const starts: number[] = [];
  let cur = "";
  let prev: ImportLine | null = null;
  let prevSubtitle = false;
  let lastSubtitle: string | null = null;
  const done = () => (blocks.length === 0 ? 0 : blocks.join("\n\n").length + 2);
  const flush = () => {
    if (cur !== "") blocks.push(cur);
    cur = "";
  };
  for (const l of lines) {
    const text = normalizePdfText(l.text);
    const subtitle = text !== "" && isSubtitle(l);
    if (text === "" || (subtitle && text === lastSubtitle)) {
      // Vacío, o el mismo subtítulo repetido en la página siguiente.
      starts.push(-1);
      continue;
    }
    const newParagraph =
      prev === null ||
      l.page !== prev.page ||
      l.column !== prev.column ||
      l.y0 < prev.y0 ||
      l.y0 - prev.y0 > 1.5 * Math.max(l.h, prev.h);
    if (subtitle) {
      flush();
      starts.push(done());
      cur = text;
      lastSubtitle = text;
    } else if (prevSubtitle) {
      starts.push(done() + cur.length + 1);
      cur += `\n${text}`;
    } else if (newParagraph) {
      flush();
      starts.push(done());
      cur = text;
    } else {
      starts.push(done() + cur.length + 1);
      cur += /^[•·▪◦‣✓✔*-]/.test(text) ? `\n${text}` : ` ${text}`;
    }
    prev = l;
    prevSubtitle = subtitle;
  }
  flush();
  return { body: blocks.join("\n\n"), starts };
}

/** Orden de las secciones de texto (T6): por página, luego columna izquierda entera y después la derecha. */
function byColumn(lines: readonly ImportLine[]): ImportLine[] {
  return lines
    .map((l, i) => ({ l, i }))
    .sort((a, b) => a.l.page - b.l.page || a.l.column - b.l.column || a.i - b.i)
    .map((x) => x.l);
}

interface ComboDraft {
  meals: MenuMealKey[];
  parts: string[];
  page: number;
}

interface DayDraft {
  day: Weekday;
  combos: ComboDraft[];
  notes: string[];
}

export function parsePlanPdf(
  pages: readonly BboxPage[],
  ctx: { importKey: string; recipes: readonly RecipeMatchCandidate[] },
): PlanImportResult {
  const hints: HintDraft[] = [];
  const unplaced: { text: string; page: number }[] = [];

  // 1. Tramos por página.
  let wordCount = 0;
  const rawLines: { pageIndex: number; line: ImportLine }[] = [];
  pages.forEach((page, pageIndex) => {
    const lines = pageLines(page);
    for (const l of lines) wordCount += l.words.filter((w) => /[\p{L}\p{N}]/u.test(w.text)).length;
    let topSeen = false;
    for (const seg of lines.flatMap((l) => l.segs)) {
      const text = segText(seg);
      let isTop = false;
      if (!topSeen && !isProfessionalFooter(text)) {
        topSeen = true;
        isTop = seg.y0 < page.height * PAGE_TOP_RATIO;
      }
      rawLines.push({
        pageIndex,
        line: {
          page: page.pageNumber,
          section: null,
          text,
          x0: seg.x0,
          y0: seg.y0,
          h: seg.h,
          column: seg.x0 < page.width / 2 ? 0 : 1,
          isPageTopHeading: isTop,
        },
      });
    }
  });
  if (wordCount < MIN_WORDS) return { ok: false, reason: "NO_TEXT" };

  // 2. Asignar sección.
  let current: PlanSectionKey | "UNKNOWN" | null = null;
  const assigned: ImportLine[] = [];
  const unknownHeadings: { heading: string; page: number }[] = [];
  for (const { pageIndex, line } of rawLines) {
    const key = matchSectionHeading(line.text);
    if (key) {
      current = key;
      if (key === "REPLACEMENTS") assigned.push({ ...line, section: key });
      continue;
    }
    if (
      line.isPageTopHeading &&
      isHeadingLike(line.text) &&
      !parseWeekdayLine(line.text) &&
      !isDecorativeLabel(line.text)
    ) {
      current = "UNKNOWN";
      unknownHeadings.push({ heading: line.text, page: line.page });
      continue;
    }
    assigned.push({ ...line, section: current ?? (pageIndex === 0 ? "COVER" : "UNKNOWN") });
  }

  // 3. Datos personales (único lugar: personal-data.ts).
  const stripped = stripPersonalData(assigned);
  let redactions = stripped.redactions;
  for (const u of unknownHeadings) {
    const r = redactCoverName(u.heading, stripped.coverName);
    redactions += r.count;
    hints.push({ kind: "UNKNOWN_SECTION", heading: r.text, page: u.page });
  }
  const lines = stripped.lines;
  const inSection = (key: PlanSectionKey | "UNKNOWN") => lines.filter((l) => l.section === key);

  // 4. Título: el objetivo de la portada.
  const cover = inSection("COVER");
  const objective = normalizePdfText(cover.map((l) => l.text).join(" "));
  const title = objective === "" ? PLAN_IMPORT_TEXT.defaultTitle : objective.slice(0, TITLE_MAX).trim();

  // 5–7. Secciones de texto, menú y colaciones.
  const sections: { title: string; body: string }[] = [];
  const meals: PlanImportMeal[] = [];
  let refSeq = 0;
  const nextRef = () => `i${++refSeq}`;
  const plateRule: string[] = [];

  const pushTextSection = (sectionTitle: string, sectionLines: readonly ImportLine[], isSubtitle: (l: ImportLine) => boolean) => {
    const { body, starts } = buildBody(sectionLines, isSubtitle);
    if (body === "") return;
    if (body.length <= PLAN_SECTION_LIMITS.bodyMax) {
      sections.push({ title: sectionTitle, body });
      return;
    }
    const cut = PLAN_SECTION_LIMITS.bodyMax;
    const idx = starts.findIndex((s) => s >= cut);
    const page = sectionLines[idx === -1 ? sectionLines.length - 1 : Math.max(0, idx - 1)]!.page;
    sections.push({ title: sectionTitle, body: body.slice(0, cut) });
    unplaced.push({ text: body.slice(cut).trim(), page });
  };

  const parseMenu = (key: MenuSectionKey) => {
    const sectionLines = inSection(key);
    const rule: ImportLine[] = [];
    const days: DayDraft[] = [];
    let day: DayDraft | null = null;
    let combo: ComboDraft | null = null;
    let noteOpen = false;

    const content = (text: string, line: ImportLine) => {
      if (isQualitativeMacroLine(text) || (noteOpen && isMacroContinuation(text))) {
        day!.notes.push(text);
        noteOpen = true;
        return;
      }
      noteOpen = false;
      if (isHeadingLike(text)) {
        unplaced.push({ text, page: line.page });
        return;
      }
      if (key === "BREAKFAST_SNACK") {
        if (!combo) {
          combo = { meals: ["BREAKFAST", "SNACK"], parts: [], page: line.page };
          day!.combos.push(combo);
        }
        combo.parts.push(text);
        return;
      }
      const label = matchLunchDinnerLabel(text);
      if (label) {
        combo = { meals: [...label.meals], parts: label.rest ? [label.rest] : [], page: line.page };
        day!.combos.push(combo);
      } else if (combo) {
        combo.parts.push(text);
      } else {
        unplaced.push({ text, page: line.page });
      }
    };

    for (const line of sectionLines) {
      if (isDecorativeLabel(line.text)) continue;
      const wd = parseWeekdayLine(line.text);
      if (wd) {
        day = { day: wd.day, combos: [], notes: [] };
        days.push(day);
        combo = null;
        noteOpen = false;
        if (wd.rest) content(wd.rest, line);
        continue;
      }
      if (!day) {
        rule.push(line);
        continue;
      }
      content(line.text, line);
    }

    if (rule.length > 0) {
      const { body } = buildBody(rule, (l) => isHeadingLike(l.text));
      if (body) plateRule.push(`${MENU_SECTION_LABELS[key]}\n${body}`);
    }
    if (days.length === 0) return;

    const tandas = splitTandas(days.map((d) => d.day));
    const total = tandas.length;
    const tandaOf: number[] = [];
    tandas.forEach((t, i) => t.forEach(() => tandaOf.push(i + 1)));

    let anyItem = false;
    const missingHints: HintDraft[] = [];
    for (let t = 1; t <= total; t++) {
      for (const { mealKey, baseName } of MENU_SECTION_MEALS[key]) {
        const name = mealNameFor(baseName, t, total);
        const items: PlanImportItem[] = [];
        days.forEach((d, i) => {
          if (tandaOf[i] !== t) return;
          const notesText = normalizePdfText(d.notes.join(" "));
          const notes = notesText === "" ? null : notesText.slice(0, PLAN_IMPORT_NOTE_MAX).trim();
          for (const c of d.combos) {
            if (!c.meals.includes(mealKey)) continue;
            const label = normalizeCombo(c.parts.join(" "));
            if (label === "") continue;
            // Demasiado larga: completa a "Texto sin ubicar", una sola vez aunque vaya a 2 comidas.
            if (label.length > PLAN_IMPORT_LABEL_MAX) {
              if (c.meals[0] === mealKey) unplaced.push({ text: label, page: c.page });
              continue;
            }
            items.push({ kind: "TEXT", ref: nextRef(), weekday: d.day, label, notes });
          }
        });
        if (items.length === 0) continue;
        anyItem = true;
        meals.push({ key: `${mealKey}:${t}`, name, mode: "PER_DAY", isOptions: false, items });
        const present = new Set(items.map((i) => i.weekday));
        const missing = WEEKDAYS.filter((w) => !present.has(w));
        if (missing.length > 0) missingHints.push({ kind: "MISSING_DAYS", mealName: name, days: missing });
      }
    }
    if (total >= 2) hints.push({ kind: "TANDAS", section: key, count: total });
    if (key === "BREAKFAST_SNACK" && anyItem) hints.push({ kind: "BREAKFAST_SNACK_SAME_CONTENT" });
    hints.push(...missingHints);
  };

  const parseSnacks = () => {
    const options: { text: string; page: number }[] = [];
    for (const line of inSection("SNACKS")) {
      if (isDecorativeLabel(line.text)) continue;
      // Línea de macros de una opción: no es una opción nueva (la receta ya tiene sus macros).
      if (isQualitativeMacroLine(line.text)) continue;
      const last = options[options.length - 1];
      if (last && (startsLower(line.text) || /\+\s*$/.test(last.text))) {
        last.text = `${last.text} ${line.text}`;
        continue;
      }
      options.push({ text: line.text, page: line.page });
    }
    const items: PlanImportItem[] = [];
    for (const o of options) {
      const text = normalizeCombo(o.text);
      if (text === "") continue;
      const match = matchRecipeOption(text, ctx.recipes);
      if (match.kind === "RECIPE") {
        items.push({ kind: "RECIPE", ref: nextRef(), weekday: null, recipeId: match.recipeId, portions: match.portions });
        continue;
      }
      if (text.length > PLAN_IMPORT_LABEL_MAX) {
        unplaced.push({ text, page: o.page });
        continue;
      }
      const ref = nextRef();
      items.push({ kind: "TEXT", ref, weekday: null, label: text, notes: null });
      if (match.suggestion) {
        hints.push({
          kind: "RECIPE_SUGGESTION",
          label: text,
          recipeId: match.suggestion.id,
          recipeName: match.suggestion.name,
          itemRef: ref,
        });
      }
    }
    if (items.length > 0) {
      meals.push({ key: "OPTIONS", name: OPTIONS_MEAL_NAME, mode: "EVERY_DAY", isOptions: true, items });
    }
  };

  for (const s of KNOWN_SECTIONS) {
    if (s.kind === "text") {
      const forced = s.key === "REPLACEMENTS";
      pushTextSection(s.textTitle!, byColumn(inSection(s.key)), (l) =>
        forced && matchSectionHeading(l.text) === "REPLACEMENTS" ? true : isHeadingLike(l.text),
      );
    } else if (s.kind === "menu") {
      parseMenu(s.key as MenuSectionKey);
      if (s.key === "LUNCH_DINNER" && plateRule.length > 0) {
        sections.push({ title: PLATE_RULE_TITLE, body: plateRule.join("\n\n").slice(0, PLAN_SECTION_LIMITS.bodyMax) });
      }
    } else if (s.kind === "options") {
      parseSnacks();
    }
  }

  // 8. Sin menú no hay plantilla.
  if (meals.length === 0) return { ok: false, reason: "NO_MENU" };

  // 9. Secciones desconocidas: un aviso por renglón.
  for (const l of inSection("UNKNOWN")) unplaced.push({ text: normalizePdfText(l.text), page: l.page });

  if (redactions > 0) hints.push({ kind: "PATIENT_NAME_REPLACED", count: redactions });
  if (stripped.coverLinesDropped > 0) hints.push({ kind: "COVER_LINES_DROPPED", count: stripped.coverLinesDropped });
  for (const u of unplaced) if (u.text !== "") hints.push({ kind: "UNPLACED", text: u.text, page: u.page });

  // 10. Ids y contadores.
  const finalHints = hints.map((h, i) => ({ ...h, id: `h${i + 1}` }) as TemplateImportHint);
  const allItems = meals.flatMap((m) => m.items);
  return {
    ok: true,
    draft: {
      importKey: ctx.importKey,
      title,
      meals,
      sections,
      hints: finalHints,
      stats: {
        pages: pages.length,
        meals: meals.length,
        textItems: allItems.filter((i) => i.kind === "TEXT").length,
        recipeItems: allItems.filter((i) => i.kind === "RECIPE").length,
        recipeSuggestions: finalHints.filter((h) => h.kind === "RECIPE_SUGGESTION").length,
        sections: sections.length,
        unplaced: finalHints.filter((h) => h.kind === "UNPLACED").length,
        redactions,
        coverLinesDropped: stripped.coverLinesDropped,
        footerSegments: stripped.footerSegments,
      },
    },
  };
}
