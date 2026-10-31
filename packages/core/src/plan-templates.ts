/**
 * HU-020: plantillas importadas de PDF y textos del plan (secciones). Lógica pura que comparten el
 * panel (revisión del borrador, textos del plan, aviso sin cantidades) y packages/db (avisos,
 * validación de secciones).
 */
import { WEEKDAYS, joinWeekdaysEs, type Weekday } from "./weekly-menu";

export type TemplateStatusKey = "DRAFT" | "PUBLISHED";
export type TemplateOriginKey = "MANUAL" | "IMPORT";

export type MenuSectionKey = "BREAKFAST_SNACK" | "LUNCH_DINNER";

export type TemplateImportHint =
  | { id: string; kind: "TANDAS"; section: MenuSectionKey; count: number }
  | { id: string; kind: "BREAKFAST_SNACK_SAME_CONTENT" }
  | {
      id: string;
      kind: "RECIPE_SUGGESTION";
      label: string;
      recipeId: string;
      recipeName: string;
      itemRef: string;
      itemId?: string;
    }
  | { id: string; kind: "PATIENT_NAME_REPLACED"; count: number }
  | { id: string; kind: "COVER_LINES_DROPPED"; count: number }
  | { id: string; kind: "UNKNOWN_SECTION"; heading: string; page: number }
  | { id: string; kind: "MISSING_DAYS"; mealName: string; days: Weekday[] }
  | { id: string; kind: "UNPLACED"; text: string; page: number };

type Rec = Record<string, unknown>;

const isStr = (v: unknown): v is string => typeof v === "string";
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function parseHint(raw: unknown): TemplateImportHint | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const r = raw as Rec;
  if (!isStr(r.id) || r.id === "") return null;
  const id = r.id;
  switch (r.kind) {
    case "TANDAS":
      if ((r.section === "BREAKFAST_SNACK" || r.section === "LUNCH_DINNER") && isNum(r.count)) {
        return { id, kind: "TANDAS", section: r.section, count: r.count };
      }
      return null;
    case "BREAKFAST_SNACK_SAME_CONTENT":
      return { id, kind: "BREAKFAST_SNACK_SAME_CONTENT" };
    case "RECIPE_SUGGESTION":
      if (isStr(r.label) && isStr(r.recipeId) && isStr(r.recipeName) && isStr(r.itemRef)) {
        const hint: TemplateImportHint = {
          id,
          kind: "RECIPE_SUGGESTION",
          label: r.label,
          recipeId: r.recipeId,
          recipeName: r.recipeName,
          itemRef: r.itemRef,
        };
        if (isStr(r.itemId)) hint.itemId = r.itemId;
        return hint;
      }
      return null;
    case "PATIENT_NAME_REPLACED":
    case "COVER_LINES_DROPPED":
      return isNum(r.count) ? { id, kind: r.kind, count: r.count } : null;
    case "UNKNOWN_SECTION":
      return isStr(r.heading) && isNum(r.page) ? { id, kind: "UNKNOWN_SECTION", heading: r.heading, page: r.page } : null;
    case "MISSING_DAYS":
      if (
        isStr(r.mealName) &&
        Array.isArray(r.days) &&
        r.days.every((d) => (WEEKDAYS as readonly unknown[]).includes(d))
      ) {
        return { id, kind: "MISSING_DAYS", mealName: r.mealName, days: r.days as Weekday[] };
      }
      return null;
    case "UNPLACED":
      return isStr(r.text) && isNum(r.page) ? { id, kind: "UNPLACED", text: r.text, page: r.page } : null;
    default:
      return null;
  }
}

/** Lee el JSON de PlanTemplate.importHints. null/no-array → []. Descarta entradas mal formadas. */
export function parseTemplateHints(json: unknown): TemplateImportHint[] {
  if (!Array.isArray(json)) return [];
  const out: TemplateImportHint[] = [];
  for (const raw of json) {
    const hint = parseHint(raw);
    if (hint) out.push(hint);
  }
  return out;
}

export function unplacedCount(hints: readonly TemplateImportHint[]): number {
  return hints.filter((h) => h.kind === "UNPLACED").length;
}

export function canPublishTemplate(hints: readonly TemplateImportHint[]): boolean {
  return unplacedCount(hints) === 0;
}

const plural = (n: number, singular: string, pluralForm: string) => (n === 1 ? singular : pluralForm);

export const MENU_SECTION_LABELS: Record<MenuSectionKey, string> = {
  BREAKFAST_SNACK: "Desayuno y merienda",
  LUNCH_DINNER: "Almuerzo y cena",
};

export const PLAN_IMPORT_TEXT = {
  draftChip: "Borrador",
  importedUnreviewed: "Importada de PDF · sin revisar",
  importedReviewed: "Importada de PDF · revisada",
  importedPublished: "Importada de PDF",
  banner: "Borrador importado de PDF. Revisalo y publicalo para poder aplicarlo a tus pacientes.",
  publishButton: "Publicar plantilla",
  publishing: "Publicando…",
  publishBlocked: (n: number) => `Quedan ${n} línea${n === 1 ? "" : "s"} sin ubicar`,
  published: "Plantilla publicada. Ya podés aplicarla a tus pacientes.",
  hintsTitle: (n: number) => `Avisos del importador (${n})`,
  hintDone: "Listo",
  tandas: (sectionLabel: string, count: number) =>
    `Este PDF trae ${count === 2 ? "dos" : count} tandas de días en ${sectionLabel}: revisá los nombres de las comidas.`,
  breakfastSnackSame:
    "El PDF no distingue el desayuno de la merienda: cargué lo mismo en Desayuno y en Merienda. Borrá o cambiá lo que no corresponda.",
  recipeSuggestion: (label: string, recipe: string) => `¿'${label}' es la receta ${recipe}?`,
  recipeLink: "Vincular",
  recipeKeepText: "Dejar como texto",
  linkTitle: (recipe: string) => `Vincular ${recipe}`,
  linkConfirm: "Vincular",
  nameReplaced: (n: number) =>
    `Reemplacé el nombre de la paciente por [paciente] en ${n} ${plural(n, "lugar", "lugares")}.`,
  coverDropped: (n: number) =>
    `Descarté ${n} línea${n === 1 ? "" : "s"} de la portada que no supe ubicar (pueden ser datos de la paciente).`,
  unknownSection: (heading: string, page: number) =>
    `No reconocí la sección «${heading}» (pág. ${page}): sus líneas quedaron en «Texto sin ubicar».`,
  missingDays: (meal: string, days: readonly Weekday[]) => `${meal}: el PDF no trae ${joinWeekdaysEs(days)}.`,
  unplacedTitle: "Texto sin ubicar",
  unplacedPage: (page: number) => `pág. ${page}`,
  moveTo: "Mover a…",
  discard: "Descartar",
  moveToMeal: "A una comida",
  moveToSection: "A un texto del plan",
  newSectionTitle: "Texto importado",
  noQuantities: (kind: "template" | "plan") =>
    `${kind === "template" ? "Plantilla" : "Plan"} sin cantidades: los macros aparecen cuando agregás alimentos o recetas.`,
  draftNotApplicable: "Esta plantilla es un borrador: publicala antes de aplicarla.",
  notReadable: "No pude leer el plan de este PDF. Cargalo a mano o pasáselo a Joel.",
  alreadyImported: (title: string) => `Este PDF ya se importó: ${title}`,
  defaultTitle: "Plan importado de PDF",
  showMore: "Ver completo",
  showLess: "Ver menos",
} as const;

export type PlanSectionErrorCode = "TITLE_REQUIRED" | "TITLE_TOO_LONG" | "BODY_REQUIRED" | "BODY_TOO_LONG";

export const PLAN_SECTION_TEXT = {
  cardTitle: "Textos del plan",
  cardDescription: (kind: "template" | "plan") =>
    kind === "template"
      ? "Recomendaciones, porciones y reemplazos. Se copian al plan cuando aplicás la plantilla."
      : "Recomendaciones, porciones y reemplazos. Tu paciente los ve en el portal y en el PDF.",
  add: "Agregar texto",
  save: "Guardar",
  delete: "Borrar",
  edit: "Editar",
  moveUp: "Subir",
  moveDown: "Bajar",
  titleLabel: "Título",
  bodyLabel: "Texto",
  deleteConfirm: (title: string) => `¿Borrar «${title}»? No se puede deshacer.`,
  errors: {
    TITLE_REQUIRED: "Poné un título.",
    TITLE_TOO_LONG: "El título puede tener hasta 80 caracteres.",
    BODY_REQUIRED: "Escribí el texto.",
    BODY_TOO_LONG: "El texto puede tener hasta 20.000 caracteres.",
    tooMany: "Llegaste al máximo de 30 textos.",
    generic: "No se pudo guardar. Probá de nuevo.",
  },
  empty: "Todavía no hay textos. Sumá recomendaciones, porciones diarias o reemplazos.",
} as const;

/** Texto de cada aviso (no aplica a UNPLACED, que se muestra en su tarjeta). */
export function templateHintText(hint: TemplateImportHint): string {
  switch (hint.kind) {
    case "TANDAS":
      return PLAN_IMPORT_TEXT.tandas(MENU_SECTION_LABELS[hint.section], hint.count);
    case "BREAKFAST_SNACK_SAME_CONTENT":
      return PLAN_IMPORT_TEXT.breakfastSnackSame;
    case "RECIPE_SUGGESTION":
      return PLAN_IMPORT_TEXT.recipeSuggestion(hint.label, hint.recipeName);
    case "PATIENT_NAME_REPLACED":
      return PLAN_IMPORT_TEXT.nameReplaced(hint.count);
    case "COVER_LINES_DROPPED":
      return PLAN_IMPORT_TEXT.coverDropped(hint.count);
    case "UNKNOWN_SECTION":
      return PLAN_IMPORT_TEXT.unknownSection(hint.heading, hint.page);
    case "MISSING_DAYS":
      return PLAN_IMPORT_TEXT.missingDays(hint.mealName, hint.days);
    case "UNPLACED":
      return hint.text;
  }
}

export const PLAN_SECTION_LIMITS = { titleMax: 80, bodyMax: 20000, maxPerOwner: 30 } as const;

export function validatePlanSectionInput(input: {
  title: string;
  body: string;
}):
  | { ok: true; value: { title: string; body: string } }
  | { ok: false; error: PlanSectionErrorCode } {
  const title = (input.title ?? "").trim();
  const body = (input.body ?? "").replace(/\r\n?/g, "\n").trim();
  if (title === "") return { ok: false, error: "TITLE_REQUIRED" };
  if (title.length > PLAN_SECTION_LIMITS.titleMax) return { ok: false, error: "TITLE_TOO_LONG" };
  if (body === "") return { ok: false, error: "BODY_REQUIRED" };
  if (body.length > PLAN_SECTION_LIMITS.bodyMax) return { ok: false, error: "BODY_TOO_LONG" };
  return { ok: true, value: { title, body } };
}

/** D10: algún ítem con alimento (foodId) o receta. */
export function hasQuantifiedItems(
  meals: readonly {
    items: readonly { foodId: string | null; recipe?: unknown | null; recipeId?: string | null }[];
  }[],
): boolean {
  return meals.some((m) => m.items.some((i) => i.foodId != null || i.recipe != null || i.recipeId != null));
}

export function hasAnyItem(meals: readonly { items: readonly unknown[] }[]): boolean {
  return meals.some((m) => m.items.length > 0);
}
