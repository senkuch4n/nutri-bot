import { describe, expect, it } from "vitest";
import {
  PLAN_IMPORT_TEXT,
  canPublishTemplate,
  hasAnyItem,
  hasQuantifiedItems,
  parseTemplateHints,
  templateHintText,
  unplacedCount,
  validatePlanSectionInput,
  type TemplateImportHint,
} from "./plan-templates";

const unplaced = (id: string): TemplateImportHint => ({ id, kind: "UNPLACED", text: "x", page: 2 });

describe("parseTemplateHints", () => {
  it("null o no-array → []", () => {
    expect(parseTemplateHints(null)).toEqual([]);
    expect(parseTemplateHints({ kind: "UNPLACED" })).toEqual([]);
  });

  it("descarta entradas mal formadas y deja pasar las válidas", () => {
    const valid = [
      { id: "h1", kind: "TANDAS", section: "BREAKFAST_SNACK", count: 2 },
      { id: "h2", kind: "UNPLACED", text: "algo", page: 3 },
      { id: "h3", kind: "RECIPE_SUGGESTION", label: "Tarta", recipeId: "r1", recipeName: "Tarta", itemRef: "i1", itemId: "x" },
    ];
    const parsed = parseTemplateHints([
      ...valid,
      { id: "h4", text: "sin kind", page: 1 },
      { id: "h5", kind: "UNPLACED", text: "x", page: "2" },
      { id: "h6", kind: "MISSING_DAYS", mealName: "Cena", days: ["XXX"] },
      "basura",
    ]);
    expect(parsed).toEqual(valid);
  });
});

describe("unplacedCount / canPublishTemplate", () => {
  it("0 UNPLACED → se puede publicar", () => {
    const hints: TemplateImportHint[] = [{ id: "h1", kind: "BREAKFAST_SNACK_SAME_CONTENT" }];
    expect(unplacedCount(hints)).toBe(0);
    expect(canPublishTemplate(hints)).toBe(true);
  });
  it("3 UNPLACED → no", () => {
    const hints = [unplaced("a"), unplaced("b"), unplaced("c")];
    expect(unplacedCount(hints)).toBe(3);
    expect(canPublishTemplate(hints)).toBe(false);
  });
});

describe("templateHintText", () => {
  it("TANDAS: 2 → 'dos', 3 → '3'", () => {
    expect(templateHintText({ id: "h", kind: "TANDAS", section: "BREAKFAST_SNACK", count: 2 })).toBe(
      "Este PDF trae dos tandas de días en Desayuno y merienda: revisá los nombres de las comidas.",
    );
    expect(templateHintText({ id: "h", kind: "TANDAS", section: "LUNCH_DINNER", count: 3 })).toBe(
      "Este PDF trae 3 tandas de días en Almuerzo y cena: revisá los nombres de las comidas.",
    );
  });

  it("resto de los avisos", () => {
    expect(templateHintText({ id: "h", kind: "BREAKFAST_SNACK_SAME_CONTENT" })).toBe(
      "El PDF no distingue el desayuno de la merienda: cargué lo mismo en Desayuno y en Merienda. Borrá o cambiá lo que no corresponda.",
    );
    expect(
      templateHintText({
        id: "h",
        kind: "RECIPE_SUGGESTION",
        label: "Tarta dulce (2 unidades)",
        recipeId: "r2",
        recipeName: "Tarta dulce",
        itemRef: "i1",
      }),
    ).toBe("¿'Tarta dulce (2 unidades)' es la receta Tarta dulce?");
    expect(templateHintText({ id: "h", kind: "PATIENT_NAME_REPLACED", count: 1 })).toBe(
      "Reemplacé el nombre de la paciente por [paciente] en 1 lugar.",
    );
    expect(templateHintText({ id: "h", kind: "PATIENT_NAME_REPLACED", count: 2 })).toBe(
      "Reemplacé el nombre de la paciente por [paciente] en 2 lugares.",
    );
    expect(templateHintText({ id: "h", kind: "COVER_LINES_DROPPED", count: 1 })).toBe(
      "Descarté 1 línea de la portada que no supe ubicar (pueden ser datos de la paciente).",
    );
    expect(templateHintText({ id: "h", kind: "UNKNOWN_SECTION", heading: "LISTA DE COMPRAS", page: 9 })).toBe(
      "No reconocí la sección «LISTA DE COMPRAS» (pág. 9): sus líneas quedaron en «Texto sin ubicar».",
    );
    expect(templateHintText({ id: "h", kind: "MISSING_DAYS", mealName: "Desayuno (2)", days: ["TUE"] })).toBe(
      "Desayuno (2): el PDF no trae martes.",
    );
    expect(templateHintText({ id: "h", kind: "MISSING_DAYS", mealName: "Cena", days: ["SUN", "TUE"] })).toBe(
      "Cena: el PDF no trae martes y domingo.",
    );
  });
});

describe("validatePlanSectionInput", () => {
  it("errores por campo", () => {
    expect(validatePlanSectionInput({ title: "   ", body: "x" })).toEqual({ ok: false, error: "TITLE_REQUIRED" });
    expect(validatePlanSectionInput({ title: "a".repeat(81), body: "x" })).toEqual({ ok: false, error: "TITLE_TOO_LONG" });
    expect(validatePlanSectionInput({ title: "T", body: "  \n " })).toEqual({ ok: false, error: "BODY_REQUIRED" });
    expect(validatePlanSectionInput({ title: "T", body: "a".repeat(20001) })).toEqual({ ok: false, error: "BODY_TOO_LONG" });
  });
  it("trim conserva los saltos de línea internos", () => {
    expect(validatePlanSectionInput({ title: "  Recomendaciones ", body: "\n a\nb\n\nc  " })).toEqual({
      ok: true,
      value: { title: "Recomendaciones", body: "a\nb\n\nc" },
    });
  });
});

describe("hasQuantifiedItems / hasAnyItem", () => {
  it("solo texto → false; con foodId o receta → true", () => {
    expect(hasQuantifiedItems([{ items: [{ foodId: null, recipe: null }] }])).toBe(false);
    expect(hasQuantifiedItems([{ items: [{ foodId: null }, { foodId: "f1" }] }])).toBe(true);
    expect(hasQuantifiedItems([{ items: [{ foodId: null, recipe: { id: "r" } }] }])).toBe(true);
    expect(hasAnyItem([])).toBe(false);
    expect(hasAnyItem([{ items: [] }, { items: [1] }])).toBe(true);
  });
});

describe("PLAN_IMPORT_TEXT", () => {
  it("textos exactos", () => {
    expect(PLAN_IMPORT_TEXT.publishBlocked(1)).toBe("Quedan 1 línea sin ubicar");
    expect(PLAN_IMPORT_TEXT.publishBlocked(3)).toBe("Quedan 3 líneas sin ubicar");
    expect(PLAN_IMPORT_TEXT.noQuantities("template")).toBe(
      "Plantilla sin cantidades: los macros aparecen cuando agregás alimentos o recetas.",
    );
    expect(PLAN_IMPORT_TEXT.noQuantities("plan")).toBe(
      "Plan sin cantidades: los macros aparecen cuando agregás alimentos o recetas.",
    );
    expect(PLAN_IMPORT_TEXT.notReadable).toBe("No pude leer el plan de este PDF. Cargalo a mano o pasáselo a Joel.");
    expect(PLAN_IMPORT_TEXT.draftNotApplicable).toBe("Esta plantilla es un borrador: publicala antes de aplicarla.");
  });
});
