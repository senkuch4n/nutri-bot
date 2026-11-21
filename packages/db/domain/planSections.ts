/**
 * HU-020 (D9, SDD 5.6): textos del plan (recomendaciones, consumo diario, reemplazos…) de una
 * plantilla (`PlanTemplateSection`) o de un plan (`PlanSection`). Toda escritura valida con core y
 * filtra por { id, dueño }: nunca se borra por un filtro amplio.
 */
import { PLAN_IMPORT_TEXT, PLAN_SECTION_LIMITS, validatePlanSectionInput, type PlanSectionErrorCode } from "@nutri-bot/core";
import { prisma, type Prisma } from "../index";
import type { MealOwnerKind } from "./weeklyMenu";

export class PlanSectionNotFoundError extends Error {
  constructor(message = "El texto no existe.") {
    super(message);
    this.name = "PlanSectionNotFoundError";
  }
}

/** Más de PLAN_SECTION_LIMITS.maxPerOwner textos. */
export class PlanSectionLimitError extends Error {
  constructor(message = "Llegaste al máximo de textos.") {
    super(message);
    this.name = "PlanSectionLimitError";
  }
}

export class PlanSectionInvalidError extends Error {
  code: PlanSectionErrorCode;
  constructor(code: PlanSectionErrorCode) {
    super(code);
    this.name = "PlanSectionInvalidError";
    this.code = code;
  }
}

type Db = Prisma.TransactionClient | typeof prisma;

interface SectionDelegate {
  findMany(args: unknown): Promise<unknown>;
  findFirst(args: unknown): Promise<unknown>;
  count(args: unknown): Promise<number>;
  aggregate(args: unknown): Promise<unknown>;
  create(args: unknown): Promise<unknown>;
  updateMany(args: unknown): Promise<{ count: number }>;
  deleteMany(args: unknown): Promise<{ count: number }>;
}

/** Delegado y campo del dueño según el tipo (mismo patrón que weeklyMenu.ts). */
function sectionDb(kind: MealOwnerKind, db: Db): { section: SectionDelegate; ownerField: "templateId" | "planId" } {
  return kind === "template"
    ? { section: db.planTemplateSection as unknown as SectionDelegate, ownerField: "templateId" }
    : { section: db.planSection as unknown as SectionDelegate, ownerField: "planId" };
}

function validated(input: { title: string; body: string }): { title: string; body: string } {
  const r = validatePlanSectionInput(input);
  if (!r.ok) throw new PlanSectionInvalidError(r.error);
  return r.value;
}

const SECTION_SELECT = { id: true, title: true, body: true, order: true } as const;

export async function listSections(
  kind: MealOwnerKind,
  ownerId: string,
): Promise<{ id: string; title: string; body: string; order: number }[]> {
  const { section, ownerField } = sectionDb(kind, prisma);
  return (await section.findMany({
    where: { [ownerField]: ownerId },
    orderBy: { order: "asc" },
    select: SECTION_SELECT,
  })) as { id: string; title: string; body: string; order: number }[];
}

async function nextOrder(section: SectionDelegate, where: object): Promise<number> {
  const agg = (await section.aggregate({ where, _max: { order: true } })) as {
    _max: { order: number | null };
  };
  return agg._max.order === null ? 0 : agg._max.order + 1;
}

function templateOwner(kind: MealOwnerKind, tenantId?: string) {
  if (tenantId === undefined) return undefined;
  if (kind !== "template") throw new PlanSectionNotFoundError();
  return { tenantId };
}

async function createIn(
  db: Db, kind: MealOwnerKind, ownerId: string, value: { title: string; body: string },
  scope?: { tenantId: string; status?: "DRAFT" },
) {
  const { section, ownerField } = sectionDb(kind, db);
  const owner = { [ownerField]: ownerId };
  const where = scope ? { ...owner, template: scope } : owner;
  const count = await section.count({ where });
  if (count >= PLAN_SECTION_LIMITS.maxPerOwner) throw new PlanSectionLimitError();
  const order = await nextOrder(section, where);
  return (await section.create({
    data: {
      ...(scope ? { template: { connect: { id: ownerId, ...scope } } } : owner),
      title: value.title, body: value.body, order,
    },
    select: { id: true },
  })) as { id: string };
}

/** order = max + 1. */
export async function addSection(
  kind: MealOwnerKind,
  ownerId: string,
  input: { title: string; body: string },
  tenantId?: string,
): Promise<{ id: string }> {
  const value = validated(input);
  const scope = templateOwner(kind, tenantId);
  return prisma.$transaction((tx) => createIn(tx, kind, ownerId, value, scope));
}

export async function updateSection(
  kind: MealOwnerKind,
  ownerId: string,
  sectionId: string,
  input: { title: string; body: string },
  tenantId?: string,
): Promise<void> {
  const value = validated(input);
  const template = templateOwner(kind, tenantId);
  const { section, ownerField } = sectionDb(kind, prisma);
  const r = await section.updateMany({ where: { id: sectionId, [ownerField]: ownerId, ...(template && { template }) }, data: value });
  if (r.count === 0) throw new PlanSectionNotFoundError();
}

export async function deleteSection(kind: MealOwnerKind, ownerId: string, sectionId: string, tenantId?: string): Promise<void> {
  const template = templateOwner(kind, tenantId);
  const { section, ownerField } = sectionDb(kind, prisma);
  const r = await section.deleteMany({ where: { id: sectionId, [ownerField]: ownerId, ...(template && { template }) } });
  if (r.count === 0) throw new PlanSectionNotFoundError();
}

/** Intercambia `order` con la vecina; en el borde no hace nada. */
export async function moveSection(
  kind: MealOwnerKind,
  ownerId: string,
  sectionId: string,
  direction: -1 | 1,
  tenantId?: string,
): Promise<void> {
  const template = templateOwner(kind, tenantId);
  await prisma.$transaction(async (tx) => {
    const { section, ownerField } = sectionDb(kind, tx);
    const where = { [ownerField]: ownerId, ...(template && { template }) };
    const all = (await section.findMany({
      where,
      orderBy: { order: "asc" },
      select: { id: true, order: true },
    })) as { id: string; order: number }[];
    const idx = all.findIndex((s) => s.id === sectionId);
    if (idx === -1) throw new PlanSectionNotFoundError();
    const other = all[idx + direction];
    if (!other) return;
    const me = all[idx]!;
    const first = await section.updateMany({ where: { id: me.id, ...where }, data: { order: other.order } });
    if (template && first.count === 0) throw new PlanSectionNotFoundError();
    const second = await section.updateMany({ where: { id: other.id, ...where }, data: { order: me.order } });
    if (template && second.count === 0) throw new PlanSectionNotFoundError();
  });
}

/**
 * Para "Mover a…" (T19). sectionId null → crea "Texto importado" con el texto. Con id, agrega
 * "\n\n" + texto al final del cuerpo. Si no entra en el límite → PlanSectionInvalidError("BODY_TOO_LONG").
 */
export async function appendToSection(
  tx: Prisma.TransactionClient,
  kind: MealOwnerKind,
  ownerId: string,
  sectionId: string | null,
  text: string,
  tenantId?: string,
): Promise<{ id: string }> {
  if (tenantId !== undefined && kind !== "template") throw new PlanSectionNotFoundError();
  const draftOwner = tenantId === undefined ? undefined : { tenantId, status: "DRAFT" as const };
  if (sectionId === null) {
    return createIn(tx, kind, ownerId, validated({ title: PLAN_IMPORT_TEXT.newSectionTitle, body: text }), draftOwner);
  }
  const { section, ownerField } = sectionDb(kind, tx);
  const where = { id: sectionId, [ownerField]: ownerId, ...(draftOwner && { template: draftOwner }) };
  const current = (await section.findFirst({
    where,
    select: { id: true, title: true, body: true },
  })) as { id: string; title: string; body: string } | null;
  if (!current) throw new PlanSectionNotFoundError();
  const body = `${current.body}\n\n${text.trim()}`;
  const value = validated({ title: current.title, body });
  const r = await section.updateMany({ where, data: { body: value.body } });
  if (r.count === 0) throw new PlanSectionNotFoundError();
  return { id: sectionId };
}
