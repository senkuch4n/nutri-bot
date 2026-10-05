"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AVAILABILITY_TEXT, exceptionFields, findOverlap } from "@nutri-bot/core";
import { prisma } from "@nutri-bot/db";

// HU-017b-2 (SDD 4.3 de 017b-2). Solo se leen, validan y tocan las reglas ACTIVAS (Q16): las inactivas
// que vienen de cargas viejas no se muestran, no se borran ni se reactivan, igual que las ignora el bot.

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Elegí una hora válida");

const ruleFields = {
  weekday: z.coerce.number().int().min(0).max(6),
  startTime: hhmm,
  endTime: hhmm,
};

const RULE_GONE = "Ese horario ya no está. Recargá la página.";
const SAVE_ERROR = "No se pudo guardar. Probá de nuevo.";
const DELETE_ERROR = "No se pudo borrar. Probá de nuevo.";

/** field: para mostrar el error junto al campo. */
export type FormState = { ok: boolean; error?: string; field?: "startTime" | "endTime" };

type RuleInput = { weekday: number; startTime: string; endTime: string };

function parseRule(fd: FormData): { ok: true; data: RuleInput } | { ok: false; state: FormState } {
  const parsed = z.object(ruleFields).safeParse({
    weekday: fd.get("weekday"),
    startTime: fd.get("startTime"),
    endTime: fd.get("endTime"),
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path[0];
    return {
      ok: false,
      state: {
        ok: false,
        error: issue?.message ?? SAVE_ERROR,
        field: path === "startTime" || path === "endTime" ? path : undefined,
      },
    };
  }
  if (parsed.data.startTime >= parsed.data.endTime) {
    return { ok: false, state: { ok: false, error: AVAILABILITY_TEXT.startBeforeEnd, field: "endTime" } };
  }
  return { ok: true, data: parsed.data };
}

/** Superposición contra las reglas ACTIVAS del mismo día (sin la propia al editar). */
async function overlapState(rule: RuleInput, excludeId?: string): Promise<FormState | null> {
  const sameDay = await prisma.availabilityRule.findMany({
    where: { weekday: rule.weekday, active: true },
    select: { id: true, startTime: true, endTime: true },
  });
  const hit = findOverlap(rule, sameDay, excludeId);
  return hit ? { ok: false, error: AVAILABILITY_TEXT.overlap(hit), field: "startTime" } : null;
}

function isNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2025";
}

export async function addRuleAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const parsed = parseRule(fd);
  if (!parsed.ok) return parsed.state;
  const overlap = await overlapState(parsed.data);
  if (overlap) return overlap;
  await prisma.availabilityRule.create({ data: parsed.data });
  revalidatePath("/disponibilidad");
  return { ok: true };
}

/** fd: id, weekday, startTime, endTime. Valida como add, excluyendo el propio id. Solo actualiza esas 3
 *  columnas. Inexistente (o inactiva, que no se muestra) → "Ese horario ya no está. Recargá la página." */
export async function updateRuleAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const id = String(fd.get("id") ?? "");
  if (!id) return { ok: false, error: RULE_GONE };
  const parsed = parseRule(fd);
  if (!parsed.ok) return parsed.state;

  const current = await prisma.availabilityRule.findFirst({ where: { id, active: true }, select: { id: true } });
  if (!current) return { ok: false, error: RULE_GONE };

  const overlap = await overlapState(parsed.data, id);
  if (overlap) return overlap;

  try {
    await prisma.availabilityRule.update({
      where: { id },
      data: { weekday: parsed.data.weekday, startTime: parsed.data.startTime, endTime: parsed.data.endTime },
    });
  } catch (error) {
    if (isNotFound(error)) return { ok: false, error: RULE_GONE };
    return { ok: false, error: SAVE_ERROR };
  }
  revalidatePath("/disponibilidad");
  return { ok: true };
}

/** Commit del borrado diferido. Ya borrado → { ok: true }. Solo borra si la regla está activa: una
 *  inactiva (que no se muestra) nunca se borra desde acá. */
export async function deleteRuleAction(id: string): Promise<FormState> {
  try {
    await prisma.availabilityRule.deleteMany({ where: { id, active: true } });
  } catch {
    return { ok: false, error: DELETE_ERROR };
  }
  revalidatePath("/disponibilidad");
  return { ok: true };
}

const exceptionSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Elegí la fecha"),
  kind: z.enum(["closed_day", "closed_range", "custom_hours"], { message: "Elegí qué pasa ese día" }),
  startTime: z.union([hhmm, z.literal("")]).optional(),
  endTime: z.union([hhmm, z.literal("")]).optional(),
  reason: z.string().trim().max(200, "El motivo es muy largo").optional(),
});

/** fd: date, kind ("closed_day" | "closed_range" | "custom_hours"), startTime?, endTime?, reason? →
 *  exceptionFields(kind,…). */
export async function addExceptionAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const parsed = exceptionSchema.safeParse({
    date: fd.get("date") ?? "",
    kind: fd.get("kind") ?? "",
    startTime: fd.get("startTime") ?? undefined,
    endTime: fd.get("endTime") ?? undefined,
    reason: fd.get("reason") ?? undefined,
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path[0];
    return {
      ok: false,
      error: issue?.message ?? SAVE_ERROR,
      field: path === "startTime" || path === "endTime" ? path : undefined,
    };
  }
  const { date, kind, reason } = parsed.data;
  const startTime = parsed.data.startTime || null;
  const endTime = parsed.data.endTime || null;
  if (kind !== "closed_day") {
    if (!startTime) return { ok: false, error: "Elegí desde qué hora", field: "startTime" };
    if (!endTime) return { ok: false, error: "Elegí hasta qué hora", field: "endTime" };
    if (startTime >= endTime) return { ok: false, error: AVAILABILITY_TEXT.startBeforeEnd, field: "endTime" };
  }
  const fields = exceptionFields(kind, startTime, endTime);
  try {
    await prisma.availabilityException.create({
      data: {
        date: new Date(`${date}T00:00:00Z`),
        type: fields.type,
        startTime: fields.startTime,
        endTime: fields.endTime,
        reason: reason || null,
      },
    });
  } catch {
    return { ok: false, error: SAVE_ERROR };
  }
  revalidatePath("/disponibilidad");
  return { ok: true };
}

/** Commit del borrado diferido. Ya borrada → { ok: true }. */
export async function deleteExceptionAction(id: string): Promise<FormState> {
  try {
    await prisma.availabilityException.deleteMany({ where: { id } });
  } catch {
    return { ok: false, error: DELETE_ERROR };
  }
  revalidatePath("/disponibilidad");
  return { ok: true };
}
