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
  tenantId: string,
): Promise<{ id: string; title: string; body: string; order: number }[]> {
  const { section, ownerField } = sectionDb(kind, prisma);
  return (await section.findMany({
    where: { [ownerField]: ownerId, ...ownerRelation(kind, sectionScope(kind, tenantId)) },
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

/** HU-025: alcance del dueño. Plantilla: su tenant (y estado si se pide); plan: el tenant del plan. */
type SectionScope = { tenantId: string; status?: "DRAFT" };

/** HU-025: plan y plantilla exigen tenant (obligatorio por tipo desde 025b-2). Defensa para llamadores
 *  JS: sin él, PlanSectionNotFoundError, como un dueño inexistente. */
function sectionScope(_kind: MealOwnerKind, tenantId: string | undefined): SectionScope {
  if (!tenantId) throw new PlanSectionNotFoundError();
  return { tenantId };
}

function ownerRelation(kind: MealOwnerKind, scope: SectionScope | undefined) {
  // Sin alcance: solo la importación de plantillas sin tenant (scripts legacy); nunca un plan.
  if (!scope) return {};
  return kind === "template" ? { template: scope } : { plan: { tenantId: scope.tenantId } };
}

async function createIn(
  db: Db, kind: MealOwnerKind, ownerId: string, value: { title: string; body: string },
  scope: SectionScope | undefined,
) {
  const { section, ownerField } = sectionDb(kind, db);
  const where = { [ownerField]: ownerId, ...ownerRelation(kind, scope) };
  const count = await section.count({ where });
  if (count >= PLAN_SECTION_LIMITS.maxPerOwner) throw new PlanSectionLimitError();
  const order = await nextOrder(section, where);
  // connect con el tenant: un dueño de otro consultorio no se encuentra (P2025), igual que uno inexistente.
  const owner = !scope
    ? { [ownerField]: ownerId }
    : kind === "template"
      ? { template: { connect: { id: ownerId, ...scope } } }
      : { plan: { connect: { id: ownerId, tenantId: scope.tenantId } } };
  return (await section.create({
    data: { ...owner, title: value.title, body: value.body, order },
    select: { id: true },
  })) as { id: string };
}

/** order = max + 1. */
export async function addSection(
  kind: MealOwnerKind,
  ownerId: string,
  input: { title: string; body: string },
  tenantId: string,
): Promise<{ id: string }> {
  const value = validated(input);
  const scope = sectionScope(kind, tenantId);
  return prisma.$transaction((tx) => createIn(tx, kind, ownerId, value, scope));
}

export async function updateSection(
  kind: MealOwnerKind,
  ownerId: string,
  sectionId: string,
  input: { title: string; body: string },
  tenantId: string,
): Promise<void> {
  const value = validated(input);
  const scope = sectionScope(kind, tenantId);
  const { section, ownerField } = sectionDb(kind, prisma);
  const r = await section.updateMany({
    where: { id: sectionId, [ownerField]: ownerId, ...ownerRelation(kind, scope) },
    data: value,
  });
  if (r.count === 0) throw new PlanSectionNotFoundError();
}

export async function deleteSection(kind: MealOwnerKind, ownerId: string, sectionId: string, tenantId: string): Promise<void> {
  const scope = sectionScope(kind, tenantId);
  const { section, ownerField } = sectionDb(kind, prisma);
  const r = await section.deleteMany({ where: { id: sectionId, [ownerField]: ownerId, ...ownerRelation(kind, scope) } });
  if (r.count === 0) throw new PlanSectionNotFoundError();
}

/** Intercambia `order` con la vecina; en el borde no hace nada. */
export async function moveSection(
  kind: MealOwnerKind,
  ownerId: string,
  sectionId: string,
  direction: -1 | 1,
  tenantId: string,
): Promise<void> {
  const scope = sectionScope(kind, tenantId);
  await prisma.$transaction(async (tx) => {
    const { section, ownerField } = sectionDb(kind, tx);
    const where = { [ownerField]: ownerId, ...ownerRelation(kind, scope) };
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
    if (scope && first.count === 0) throw new PlanSectionNotFoundError();
    const second = await section.updateMany({ where: { id: other.id, ...where }, data: { order: me.order } });
    if (scope && second.count === 0) throw new PlanSectionNotFoundError();
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
  tenantId: string,
): Promise<{ id: string }> {
  // Importación de plantillas: solo borradores. Plan y plantilla exigen el tenant (HU-025).
  if (!tenantId) throw new PlanSectionNotFoundError();
  const scope: SectionScope = kind === "template" ? { tenantId, status: "DRAFT" } : { tenantId };
  if (sectionId === null) {
    return createIn(tx, kind, ownerId, validated({ title: PLAN_IMPORT_TEXT.newSectionTitle, body: text }), scope);
  }
  const { section, ownerField } = sectionDb(kind, tx);
  const where = { id: sectionId, [ownerField]: ownerId, ...ownerRelation(kind, scope) };
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
