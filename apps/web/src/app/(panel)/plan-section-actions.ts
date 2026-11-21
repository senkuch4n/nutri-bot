"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { PLAN_SECTION_LIMITS, PLAN_SECTION_TEXT, RECIPE_TEXT } from "@nutri-bot/core";
import {
  PlanSectionInvalidError,
  PlanSectionLimitError,
  addSection,
  deleteSection,
  moveSection,
  updateSection,
  type MealOwnerKind,
} from "@nutri-bot/db/domain";
import type { PlanSectionActionResult } from "@/components/plan-sections/types";
import { errorCode } from "@/lib/error-code";
import { revalidateMenuOwner } from "@/lib/revalidate-menu-owner";
import { resolvePrivateContentAccess } from "@/lib/private-content-access";
import { touchTemplate } from "@/lib/touch-template";
import { hasPanelSession } from "./recetas/recipe-save";

// HU-020 (D9, SDD 6.2): "Textos del plan" de un plan o una plantilla. Mismo patrón que
// weekly-menu-actions.ts. Este archivo es "use server": exporta SOLO funciones async; los tipos viven
// en components/plan-sections/types.ts. El log lleva solo el código del error, nunca el texto.

const SESSION_EXPIRED = { ok: false as const, error: RECIPE_TEXT.sessionExpired };
const GENERIC = { ok: false as const, error: PLAN_SECTION_TEXT.errors.generic };

const kindSchema = z.enum(["plan", "template"]);
const idSchema = z.string().min(1).max(64);
const ownerSchema = z.object({ kind: kindSchema, ownerId: idSchema });
// Los límites finos (y sus textos) los valida core en domain; acá solo se cortan entradas absurdas.
const textSchema = z.object({
  title: z.string().max(PLAN_SECTION_LIMITS.titleMax * 4),
  body: z.string().max(PLAN_SECTION_LIMITS.bodyMax * 2),
});

const addSchema = ownerSchema.merge(textSchema);
const updateSchema = ownerSchema.merge(textSchema).extend({ sectionId: idSchema });
const deleteSchema = ownerSchema.extend({ sectionId: idSchema });
const moveSchema = ownerSchema.extend({ sectionId: idSchema, direction: z.union([z.literal(-1), z.literal(1)]) });

function toResult(err: unknown): PlanSectionActionResult {
  if (err instanceof PlanSectionInvalidError) {
    return {
      ok: false,
      error: PLAN_SECTION_TEXT.errors[err.code],
      field: err.code.startsWith("TITLE") ? "title" : "body",
    };
  }
  if (err instanceof PlanSectionLimitError) return { ok: false, error: PLAN_SECTION_TEXT.errors.tooMany };
  // PlanSectionNotFoundError (lo borraron en otra pestaña) y cualquier otro → genérico.
  console.error("[plan-sections]", errorCode(err));
  return GENERIC;
}

async function run<S extends z.ZodType<{ kind: MealOwnerKind; ownerId: string }>>(
  schema: S,
  input: unknown,
  fn: (data: z.infer<S>, ...scope: [] | [tenantId: string]) => Promise<{ id: string } | void>,
): Promise<PlanSectionActionResult> {
  if (!(await hasPanelSession())) return SESSION_EXPIRED;
  const parsed = schema.safeParse(input);
  if (!parsed.success) return GENERIC;
  try {
    const { kind, ownerId } = parsed.data;
    let out: { id: string } | void;
    if (kind === "template") {
      const access = await resolvePrivateContentAccess();
      if (!access) return SESSION_EXPIRED;
      out = await fn(parsed.data, access.tenantId);
      await touchTemplate(ownerId, access.tenantId);
    } else {
      out = await fn(parsed.data);
      await revalidateMenuOwner(kind, ownerId);
      revalidatePath("/portal/plan");
    }
    return out ? { ok: true, id: out.id } : { ok: true };
  } catch (err) {
    return toResult(err);
  }
}

export async function addPlanSectionAction(input: {
  kind: MealOwnerKind; ownerId: string; title: string; body: string;
}): Promise<PlanSectionActionResult> {
  return run(addSchema, input, (d, ...scope) => addSection(d.kind, d.ownerId, { title: d.title, body: d.body }, ...scope));
}

export async function updatePlanSectionAction(input: {
  kind: MealOwnerKind; ownerId: string; sectionId: string; title: string; body: string;
}): Promise<PlanSectionActionResult> {
  return run(updateSchema, input, (d, ...scope) => updateSection(d.kind, d.ownerId, d.sectionId, { title: d.title, body: d.body }, ...scope));
}

export async function deletePlanSectionAction(input: {
  kind: MealOwnerKind; ownerId: string; sectionId: string;
}): Promise<PlanSectionActionResult> {
  return run(deleteSchema, input, (d, ...scope) => deleteSection(d.kind, d.ownerId, d.sectionId, ...scope));
}

export async function movePlanSectionAction(input: {
  kind: MealOwnerKind; ownerId: string; sectionId: string; direction: -1 | 1;
}): Promise<PlanSectionActionResult> {
  return run(moveSchema, input, (d, ...scope) => moveSection(d.kind, d.ownerId, d.sectionId, d.direction, ...scope));
}
