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
    await addSection("plan", "p1", { title: "T", body: "x" });
    expect(p().planSection.create.mock.calls[0][0].data).toEqual({ planId: "p1", title: "T", body: "x", order: 0 });
  });

  it("entrada inválida → PlanSectionInvalidError con el código, sin escribir", async () => {
    const err = await addSection("plan", "p1", { title: "a".repeat(81), body: "x" }).catch((e) => e);
    expect(err).toBeInstanceOf(PlanSectionInvalidError);
    expect(err.code).toBe("TITLE_TOO_LONG");
    expect(p().planSection.create).not.toHaveBeenCalled();
  });

  it("con 30 → PlanSectionLimitError", async () => {
    p().planSection.count.mockResolvedValue(30);
    await expect(addSection("plan", "p1", { title: "T", body: "x" })).rejects.toBeInstanceOf(PlanSectionLimitError);
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
    await expect(updateSection("plan", "p1", "x", { title: "T", body: "b" })).rejects.toBeInstanceOf(PlanSectionNotFoundError);
    await expect(deleteSection("plan", "p1", "x")).rejects.toBeInstanceOf(PlanSectionNotFoundError);
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
    await moveSection("plan", "p1", "b", -1);
    expect(p().planSection.updateMany.mock.calls).toEqual([
      [{ where: { id: "b", planId: "p1" }, data: { order: 0 } }],
      [{ where: { id: "a", planId: "p1" }, data: { order: 1 } }],
    ]);
  });
  it("en el borde no escribe", async () => {
    p().planSection.findMany.mockResolvedValue(rows);
    await moveSection("plan", "p1", "c", 1);
    await moveSection("plan", "p1", "a", -1);
    expect(p().planSection.updateMany).not.toHaveBeenCalled();
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
