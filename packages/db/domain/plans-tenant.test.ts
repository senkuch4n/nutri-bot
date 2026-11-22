// HU-025b-1 (M3): planes, comidas, ítems, secciones y menú semanal acotados al consultorio (Prisma mockeado).
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  nutritionPlan: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
  planMeal: { create: vi.fn(), update: vi.fn(), delete: vi.fn(), count: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn() },
  planMealItem: { create: vi.fn(), update: vi.fn(), delete: vi.fn(), findFirst: vi.fn() },
  nutritionPrescription: { findFirst: vi.fn() },
  consultation: { findFirst: vi.fn() },
  outboundMessage: { create: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock("../index", () => ({ prisma: db }));

import {
  addMeal, addMealItem, deleteMeal, deleteMealItem, deletePlan, enqueuePlanPdfMessage, getPlan,
  getPlanConsultationId, getPlanTarget, listPatientPlans, savePlanPdf, updateMeal, updateMealItem, updatePlan,
} from "./nutritionPlans";
import { MealOwnershipError, copyDay, nextItemOrder, setMealMode } from "./weeklyMenu";

const A = { tenantId: "tenant-a" };
const OWNED = { tenantId: "tenant-a", patient: { tenantId: "tenant-a" } };

beforeEach(() => {
  vi.resetAllMocks();
  db.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(db));
});

describe("lecturas de plan", () => {
  it("getPlan / listPatientPlans / getPlanTarget / getPlanConsultationId filtran por consultorio; un plan de B → null", async () => {
    db.nutritionPlan.findUnique.mockResolvedValue(null);
    db.nutritionPlan.findMany.mockResolvedValue([]);
    db.consultation.findFirst.mockResolvedValue(null);
    await expect(getPlan(A, "plan-b")).resolves.toBeNull();
    await expect(getPlanTarget(A, "plan-b")).resolves.toBeNull();
    await expect(getPlanConsultationId(A, "plan-b")).resolves.toBeNull();
    await listPatientPlans(A, "p1");
    expect(db.nutritionPlan.findUnique.mock.calls[0]![0].where).toEqual({ id: "plan-b", ...OWNED });
    expect(db.nutritionPlan.findUnique.mock.calls[1]![0].where).toEqual({ id: "plan-b", ...OWNED });
    expect(db.nutritionPrescription.findFirst).not.toHaveBeenCalled();
    expect(db.consultation.findFirst.mock.calls[0]![0].where).toEqual({ planId: "plan-b", tenantId: "tenant-a", plan: OWNED });
    expect(db.nutritionPlan.findMany.mock.calls[0]![0].where).toEqual({ patientId: "p1", ...OWNED });
  });
});

describe("escrituras de plan, comida e ítem", () => {
  it("cada escritura lleva el filtro del consultorio en el where", async () => {
    for (const m of [db.nutritionPlan.update, db.nutritionPlan.delete, db.planMeal.update, db.planMeal.delete,
      db.planMealItem.update, db.planMealItem.delete]) m.mockResolvedValue({});
    await updatePlan(A, "plan", { title: "x" });
    await deletePlan(A, "plan");
    await savePlanPdf(A, "plan", { data: Buffer.from("x"), fileName: "f.pdf" });
    await updateMeal(A, "meal", { name: "x" });
    await deleteMeal(A, "meal");
    await updateMealItem(A, "item", { notes: "x" });
    await deleteMealItem(A, "item");
    expect(db.nutritionPlan.update.mock.calls.map((c) => c[0]!.where)).toEqual([{ id: "plan", ...OWNED }, { id: "plan", ...OWNED }]);
    expect(db.nutritionPlan.delete.mock.calls[0]![0].where).toEqual({ id: "plan", ...OWNED });
    expect(db.planMeal.update.mock.calls[0]![0].where).toEqual({ id: "meal", plan: OWNED });
    expect(db.planMeal.delete.mock.calls[0]![0].where).toEqual({ id: "meal", plan: OWNED });
    expect(db.planMealItem.update.mock.calls[0]![0].where).toEqual({ id: "item", meal: { plan: OWNED } });
    expect(db.planMealItem.delete.mock.calls[0]![0].where).toEqual({ id: "item", meal: { plan: OWNED } });
  });

  it("addMeal conecta el plan del consultorio (P2025 si es de B)", async () => {
    db.planMeal.count.mockResolvedValue(0);
    db.planMeal.create.mockResolvedValue({ id: "m" });
    await addMeal(A, "plan", { name: "Cena", order: 0 });
    expect(db.planMeal.count.mock.calls[0]![0].where).toEqual({ planId: "plan", plan: { tenantId: "tenant-a" }, mode: "PER_DAY" });
    expect(db.planMeal.create.mock.calls[0]![0].data.plan).toEqual({ connect: { id: "plan", ...OWNED } });
  });

  it("addMealItem en una comida de B → MealOwnershipError sin escribir", async () => {
    db.planMeal.findUnique.mockResolvedValue(null);
    await expect(addMealItem(A, "meal-b", { foodId: "f", order: 0 })).rejects.toBeInstanceOf(MealOwnershipError);
    expect(db.planMeal.findUnique.mock.calls[0]![0].where).toEqual({ id: "meal-b", plan: { tenantId: "tenant-a" } });
    expect(db.planMealItem.create).not.toHaveBeenCalled();
  });

  it("enviar el PDF escribe el tenant (la FK compuesta rechaza un plan ajeno)", async () => {
    db.outboundMessage.create.mockResolvedValue({ id: "o" });
    await enqueuePlanPdfMessage(A, { planId: "plan", toJid: "j", caption: "c" });
    expect(db.outboundMessage.create.mock.calls[0]![0].data).toMatchObject({ tenantId: "tenant-a", planId: "plan" });
  });
});

describe("menú semanal de un plan", () => {
  it("sin tenant un plan no se lee ni se escribe (MealOwnershipError)", async () => {
    await expect(setMealMode("plan", "plan", "meal", { mode: "PER_DAY" })).rejects.toBeInstanceOf(MealOwnershipError);
    await expect(copyDay("plan", "plan", { from: "MON", to: ["TUE"] })).rejects.toBeInstanceOf(MealOwnershipError);
    await expect(nextItemOrder("plan", "meal", null)).rejects.toBeInstanceOf(MealOwnershipError);
    expect(db.planMeal.findFirst).not.toHaveBeenCalled();
    expect(db.planMealItem.findFirst).not.toHaveBeenCalled();
  });

  it("un plan de otro consultorio: copyDay no encuentra el plan y no escribe", async () => {
    db.nutritionPlan.findUnique.mockResolvedValue(null);
    await expect(copyDay("plan", "plan-b", { from: "MON", to: ["TUE"] }, "tenant-a")).rejects.toBeInstanceOf(MealOwnershipError);
    expect(db.nutritionPlan.findUnique.mock.calls[0]![0].where).toEqual({ id: "plan-b", tenantId: "tenant-a" });
  });
});
