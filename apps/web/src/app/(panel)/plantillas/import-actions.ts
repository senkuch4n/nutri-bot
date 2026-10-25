"use server";

import { z } from "zod";
import { PLAN_IMPORT_TEXT, PLAN_SECTION_TEXT, RECIPE_PICKER_TEXT, RECIPE_TEXT, WEEKDAYS } from "@nutri-bot/core";
import {
  PlanSectionInvalidError,
  RecipeNotAvailableError,
  TemplateHintNotFoundError,
  TemplateNotPublishableError,
  dismissTemplateHint,
  linkHintRecipe,
  publishTemplate,
  resolveUnplacedHint,
} from "@nutri-bot/db/domain";
import type { TemplateImportActionResult } from "@/components/template-import/types";
import { errorCode } from "@/lib/error-code";
import { touchTemplate } from "@/lib/touch-template";
import { hasPanelSession } from "../recetas/recipe-save";

// HU-020 (SDD 6.2): revisión de un borrador importado de PDF (publicar, avisos, texto sin ubicar,
// vincular receta). "use server": exporta SOLO funciones async; los tipos viven en
// components/template-import/types.ts. El log lleva solo el código del error, nunca el texto.

const SESSION_EXPIRED = { ok: false as const, error: RECIPE_TEXT.sessionExpired };
const GENERIC = { ok: false as const, error: PLAN_SECTION_TEXT.errors.generic };

const idSchema = z.string().min(1).max(64);
const templateSchema = z.object({ templateId: idSchema });
const hintSchema = templateSchema.extend({ hintId: idSchema });
const resolveSchema = hintSchema.extend({
  target: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("meal"), mealId: idSchema, weekday: z.enum(WEEKDAYS).nullable() }),
    z.object({ kind: z.literal("section"), sectionId: idSchema.nullable() }),
  ]),
});
const linkSchema = hintSchema.extend({ portions: z.number().min(0.5).max(4).multipleOf(0.5) });

function logError(err: unknown): void {
  console.error("[template-import]", errorCode(err));
}

export async function publishTemplateAction(input: { templateId: string }): Promise<TemplateImportActionResult> {
  if (!(await hasPanelSession())) return SESSION_EXPIRED;
  const parsed = templateSchema.safeParse(input);
  if (!parsed.success) return GENERIC;
  try {
    await publishTemplate(parsed.data.templateId);
    await touchTemplate(parsed.data.templateId);
    return { ok: true };
  } catch (err) {
    if (err instanceof TemplateNotPublishableError) return { ok: false, error: PLAN_IMPORT_TEXT.publishBlocked(err.unplaced) };
    logError(err);
    return GENERIC;
  }
}

/** "Listo" de un aviso, o "Dejar como texto" de una sugerencia de receta. */
export async function dismissTemplateHintAction(input: {
  templateId: string;
  hintId: string;
}): Promise<TemplateImportActionResult> {
  if (!(await hasPanelSession())) return SESSION_EXPIRED;
  const parsed = hintSchema.safeParse(input);
  if (!parsed.success) return GENERIC;
  try {
    await dismissTemplateHint(parsed.data.templateId, parsed.data.hintId);
    await touchTemplate(parsed.data.templateId);
    return { ok: true };
  } catch (err) {
    if (err instanceof TemplateHintNotFoundError) {
      // Ya no estaba (otra pestaña): se revalida y listo.
      await touchTemplate(parsed.data.templateId);
      return { ok: true };
    }
    logError(err);
    return GENERIC;
  }
}

export async function resolveUnplacedHintAction(input: {
  templateId: string;
  hintId: string;
  target: { kind: "meal"; mealId: string; weekday: (typeof WEEKDAYS)[number] | null } | { kind: "section"; sectionId: string | null };
}): Promise<TemplateImportActionResult> {
  if (!(await hasPanelSession())) return SESSION_EXPIRED;
  const parsed = resolveSchema.safeParse(input);
  if (!parsed.success) return GENERIC;
  try {
    await resolveUnplacedHint(parsed.data.templateId, parsed.data.hintId, parsed.data.target);
    await touchTemplate(parsed.data.templateId);
    return { ok: true };
  } catch (err) {
    logError(err);
    if (err instanceof PlanSectionInvalidError) return { ok: false, error: PLAN_SECTION_TEXT.errors[err.code] };
    return GENERIC;
  }
}

export async function linkHintRecipeAction(input: {
  templateId: string;
  hintId: string;
  portions: number;
}): Promise<TemplateImportActionResult> {
  if (!(await hasPanelSession())) return SESSION_EXPIRED;
  const parsed = linkSchema.safeParse(input);
  if (!parsed.success) return GENERIC;
  try {
    await linkHintRecipe(parsed.data.templateId, parsed.data.hintId, parsed.data.portions);
    await touchTemplate(parsed.data.templateId);
    return { ok: true };
  } catch (err) {
    logError(err);
    if (err instanceof RecipeNotAvailableError) return { ok: false, error: RECIPE_PICKER_TEXT.notPublished };
    return GENERIC;
  }
}
