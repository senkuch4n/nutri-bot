// HU-020: textos del plan (prisma mockeado; $transaction pasa el mismo objeto como tx).
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ prisma: {} as Record<string, any> }));
vi.mock("../index", () => ({ prisma: mocks.prisma }));

import {
  PlanSectionInvalidError,
  PlanSectionLimitError,
  PlanSectionNotFoundError,
  addSection,
  appendToSection,
  deleteSection,
  moveSection,
  updateSection,
} from "./planSections";

const p = () => mocks.prisma;
const delegate = () => ({
  findMany: vi.fn(),
  findFirst: vi.fn(),
  count: vi.fn().mockResolvedValue(0),
  aggregate: vi.fn().mockResolvedValue({ _max: { order: null } }),
  create: vi.fn().mockResolvedValue({ id: "new" }),
  updateMany: vi.fn().mockResolvedValue({ count: 1 }),
  deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.prisma.planTemplateSection = delegate();
  mocks.prisma.planSection = delegate();
  mocks.prisma.$transaction = vi.fn((fn: (tx: unknown) => unknown) => fn(mocks.prisma));
});

describe("addSection", () => {
  it("plantilla: crea con templateId y order = max + 1", async () => {
    p().planTemplateSection.aggregate.mockResolvedValue({ _max: { order: 2 } });
    await addSection("template", "t1", { title: " Recomendaciones ", body: "a\nb" });
    expect(p().planTemplateSection.create).toHaveBeenCalledWith({
      data: { templateId: "t1", title: "Recomendaciones", body: "a\nb", order: 3 },
      select: { id: true },
    });
    expect(p().planSection.create).not.toHaveBeenCalled();
  });

  it("plan: usa planSection con planId; sin secciones order 0", async () => {
    await addSection("plan", "p1", { title: "T", body: "x" }, "legacy-tenant");
    expect(p().planSection.create.mock.calls[0][0].data).toEqual({ plan: { connect: { id: "p1", tenantId: "legacy-tenant" } }, title: "T", body: "x", order: 0 });
  });

  it("entrada inválida → PlanSectionInvalidError con el código, sin escribir", async () => {
    const err = await addSection("plan", "p1", { title: "a".repeat(81), body: "x" }, "legacy-tenant").catch((e) => e);
    expect(err).toBeInstanceOf(PlanSectionInvalidError);
    expect(err.code).toBe("TITLE_TOO_LONG");
    expect(p().planSection.create).not.toHaveBeenCalled();
  });

  it("preserva el filtro por plan al contar secciones y calcular el orden", async () => {
    p().planSection.aggregate.mockResolvedValue({ _max: { order: 3 } });
    await addSection("plan", "p1", { title: "T", body: "x" }, "legacy-tenant");
    expect(p().planSection.count).toHaveBeenCalledWith({ where: { planId: "p1", plan: { tenantId: "legacy-tenant" } } });
    expect(p().planSection.aggregate).toHaveBeenCalledWith({ where: { planId: "p1", plan: { tenantId: "legacy-tenant" } }, _max: { order: true } });
    expect(p().planSection.create).toHaveBeenCalledWith({ data: { plan: { connect: { id: "p1", tenantId: "legacy-tenant" } }, title: "T", body: "x", order: 4 }, select: { id: true } });
  });

  it("con 30 → PlanSectionLimitError", async () => {
    p().planSection.count.mockResolvedValue(30);
    await expect(addSection("plan", "p1", { title: "T", body: "x" }, "legacy-tenant")).rejects.toBeInstanceOf(PlanSectionLimitError);
    expect(p().planSection.create).not.toHaveBeenCalled();
  });
});

describe("updateSection / deleteSection", () => {
  it("filtran por { id, templateId }", async () => {
    await updateSection("template", "t1", "s1", { title: "T", body: "b" });
    expect(p().planTemplateSection.updateMany).toHaveBeenCalledWith({
      where: { id: "s1", templateId: "t1" },
      data: { title: "T", body: "b" },
    });
    await deleteSection("template", "t1", "s1");
    expect(p().planTemplateSection.deleteMany).toHaveBeenCalledWith({ where: { id: "s1", templateId: "t1" } });
  });

  it("count 0 → PlanSectionNotFoundError", async () => {
    p().planSection.updateMany.mockResolvedValue({ count: 0 });
    p().planSection.deleteMany.mockResolvedValue({ count: 0 });
    await expect(updateSection("plan", "p1", "x", { title: "T", body: "b" }, "legacy-tenant")).rejects.toBeInstanceOf(PlanSectionNotFoundError);
    await expect(deleteSection("plan", "p1", "x", "legacy-tenant")).rejects.toBeInstanceOf(PlanSectionNotFoundError);
  });
});

describe("moveSection", () => {
  const rows = [
    { id: "a", order: 0 },
    { id: "b", order: 1 },
    { id: "c", order: 2 },
  ];
  it("intercambia order con la vecina", async () => {
    p().planSection.findMany.mockResolvedValue(rows);
    await moveSection("plan", "p1", "b", -1, "legacy-tenant");
    expect(p().planSection.updateMany.mock.calls).toEqual([
      [{ where: { id: "b", planId: "p1", plan: { tenantId: "legacy-tenant" } }, data: { order: 0 } }],
      [{ where: { id: "a", planId: "p1", plan: { tenantId: "legacy-tenant" } }, data: { order: 1 } }],
    ]);
  });
  it("en el borde no escribe", async () => {
    p().planSection.findMany.mockResolvedValue(rows);
    await moveSection("plan", "p1", "c", 1, "legacy-tenant");
    await moveSection("plan", "p1", "a", -1, "legacy-tenant");
    expect(p().planSection.updateMany).not.toHaveBeenCalled();
  });
});

describe("scoped template section edits", () => {
  const owner = { templateId: "t1", template: { tenantId: "tenant-a" } };
  const value = { title: "T", body: "b" };

  it("scopes count, order and parent connect without imposing draft status", async () => {
    const s = p().planTemplateSection;
    s.aggregate.mockResolvedValue({ _max: { order: 2 } });
    expect(await addSection("template", "t1", value, "tenant-a")).toEqual({ id: "new" });
    expect(s.count).toHaveBeenCalledWith({ where: owner });
    expect(s.aggregate).toHaveBeenCalledWith({ where: owner, _max: { order: true } });
    expect(s.create).toHaveBeenCalledWith({
      data: { template: { connect: { id: "t1", tenantId: "tenant-a" } }, ...value, order: 3 },
      select: { id: true },
    });
  });

  it("edit and delete reject unmatched tenant or parent", async () => {
    const s = p().planTemplateSection;
    const where = { id: "s1", ...owner };
    s.updateMany.mockResolvedValueOnce({ count: 0 });
    s.deleteMany.mockResolvedValueOnce({ count: 0 });
    await expect(updateSection("template", "t1", "s1", value, "tenant-a")).rejects.toBeInstanceOf(PlanSectionNotFoundError);
    await expect(deleteSection("template", "t1", "s1", "tenant-a")).rejects.toBeInstanceOf(PlanSectionNotFoundError);
    expect(s.updateMany.mock.calls).toEqual([[{ where, data: value }]]);
    expect(s.deleteMany.mock.calls).toEqual([[{ where }]]);
  });

  it("reorder scopes its read and both writes; aborts when a write no longer matches", async () => {
    const s = p().planTemplateSection;
    s.findMany.mockResolvedValueOnce([]);
    await expect(moveSection("template", "t1", "b", -1, "tenant-a")).rejects.toBeInstanceOf(PlanSectionNotFoundError);
    expect(s.updateMany).not.toHaveBeenCalled();
    s.findMany.mockResolvedValue([{ id: "a", order: 0 }, { id: "b", order: 1 }]);
    await moveSection("template", "t1", "b", -1, "tenant-a");
    expect(s.findMany).toHaveBeenCalledWith({ where: owner, select: { id: true, order: true }, orderBy: { order: "asc" } });
    expect(s.updateMany.mock.calls).toEqual([
      [{ where: { id: "b", ...owner }, data: { order: 0 } }],
      [{ where: { id: "a", ...owner }, data: { order: 1 } }],
    ]);
    s.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    await expect(moveSection("template", "t1", "b", -1, "tenant-a")).rejects.toBeInstanceOf(PlanSectionNotFoundError);
  });
});

describe("appendToSection", () => {
  it("sectionId null → crea 'Texto importado'", async () => {
    await appendToSection(mocks.prisma as any, "template", "t1", null, "x");
    expect(p().planTemplateSection.create.mock.calls[0][0].data).toMatchObject({ templateId: "t1", title: "Texto importado", body: "x" });
  });
  it("con id → agrega '\\n\\nx' al cuerpo", async () => {
    p().planTemplateSection.findFirst.mockResolvedValue({ id: "s1", title: "Recomendaciones", body: "a" });
    await appendToSection(mocks.prisma as any, "template", "t1", "s1", "x");
    expect(p().planTemplateSection.updateMany).toHaveBeenCalledWith({
      where: { id: "s1", templateId: "t1" },
      data: { body: "a\n\nx" },
    });
  });
  it("si no entra → BODY_TOO_LONG", async () => {
    p().planTemplateSection.findFirst.mockResolvedValue({ id: "s1", title: "T", body: "a".repeat(19999) });
    const err = await appendToSection(mocks.prisma as any, "template", "t1", "s1", "xyz").catch((e) => e);
    expect(err).toBeInstanceOf(PlanSectionInvalidError);
    expect(err.code).toBe("BODY_TOO_LONG");
  });
});

describe("HU-025b-1: secciones de plan siempre con el tenant", () => {
  it("sin tenant un plan no se lee ni se escribe (PlanSectionNotFoundError)", async () => {
    await expect(addSection("plan", "p1", { title: "T", body: "x" })).rejects.toBeInstanceOf(PlanSectionNotFoundError);
    await expect(updateSection("plan", "p1", "s", { title: "T", body: "x" })).rejects.toBeInstanceOf(PlanSectionNotFoundError);
    await expect(deleteSection("plan", "p1", "s")).rejects.toBeInstanceOf(PlanSectionNotFoundError);
    await expect(moveSection("plan", "p1", "s", 1)).rejects.toBeInstanceOf(PlanSectionNotFoundError);
    expect(p().planSection.create).not.toHaveBeenCalled();
    expect(p().planSection.updateMany).not.toHaveBeenCalled();
    expect(p().planSection.deleteMany).not.toHaveBeenCalled();
  });

  it("un plan de otro consultorio: el filtro por tenant no lo encuentra", async () => {
    p().planSection.updateMany.mockResolvedValue({ count: 0 });
    await expect(updateSection("plan", "plan-de-b", "s", { title: "T", body: "x" }, "tenant-a")).rejects.toBeInstanceOf(PlanSectionNotFoundError);
    expect(p().planSection.updateMany.mock.calls[0][0].where).toEqual({ id: "s", planId: "plan-de-b", plan: { tenantId: "tenant-a" } });
  });
});
