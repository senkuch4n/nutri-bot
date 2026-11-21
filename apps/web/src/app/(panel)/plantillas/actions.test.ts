import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  access: vi.fn(), createTemplate: vi.fn(), updateTemplate: vi.fn(), deleteTemplate: vi.fn(),
  getTemplate: vi.fn(), addTemplateMeal: vi.fn(), deleteTemplateMeal: vi.fn(),
  addTemplateMealItem: vi.fn(), deleteTemplateMealItem: vi.fn(), getTemplateMeal: vi.fn(),
  nextItemOrder: vi.fn(), getFood: vi.fn(), touch: vi.fn(), redirect: vi.fn(), revalidate: vi.fn(),
}));
vi.mock("@nutri-bot/db/domain", () => mocks);
vi.mock("@/lib/measure-form", () => ({ readMeasureFields: () => null }));
vi.mock("@/lib/private-content-access", () => ({ resolvePrivateContentAccess: mocks.access }));
vi.mock("@/lib/touch-template", () => ({ touchTemplate: mocks.touch }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect, notFound: () => { throw new Error("404"); } }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));

import * as actions from "./actions";

function fields() {
  const form = new FormData();
  for (const [key, value] of Object.entries({
    tenantId: "other", title: "Template", templateId: "t", mealId: "m", itemId: "i", name: "Lunch", customLabel: "Food",
  })) form.set(key, value);
  return form;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.access.mockResolvedValue({ tenantId: "mine", role: "STAFF" });
  mocks.createTemplate.mockResolvedValue({ id: "t" });
  mocks.getTemplate.mockResolvedValue({ meals: [{ id: "m" }] });
  mocks.getTemplateMeal.mockResolvedValue({ id: "m" });
  mocks.nextItemOrder.mockResolvedValue(3);
});

const prev = { ok: false };
const scope = { templateId: "t", tenantId: "mine" };

it("denies all writes without membership before database calls or cache changes", async () => {
  mocks.access.mockResolvedValue(null);
  expect(await actions.createTemplateAction(prev, fields())).toEqual({ ok: false, error: "Acceso no autorizado" });
  expect(await actions.updateTemplateAction("t", prev, fields())).toEqual({ ok: false, error: "Acceso no autorizado" });
  for (const invoke of [
    () => actions.deleteTemplateAction("t"), () => actions.addTemplateMealAction(fields()),
    () => actions.deleteTemplateMealAction(fields()), () => actions.addTemplateMealItemAction(fields()),
    () => actions.deleteTemplateMealItemAction(fields()),
  ]) await expect(invoke()).rejects.toThrow("404");
  for (const [name, mock] of Object.entries(mocks)) if (name !== "access") expect(mock).not.toHaveBeenCalled();
});

it("uses trusted membership for root writes and review, not submitted tenantId", async () => {
  await actions.createTemplateAction(prev, fields());
  expect(mocks.createTemplate).toHaveBeenCalledWith({ title: "Template", notes: null }, "mine");
  expect(mocks.redirect).toHaveBeenCalledWith("/plantillas/t");
  expect(await actions.updateTemplateAction("t", prev, fields())).toEqual({ ok: true });
  expect(mocks.updateTemplate).toHaveBeenCalledWith("t", { title: "Template", notes: null }, "mine");
  expect(mocks.touch).toHaveBeenCalledWith("t", "mine");
  await actions.deleteTemplateAction("t");
  expect(mocks.deleteTemplate).toHaveBeenCalledWith("t", "mine");
  expect(mocks.redirect).toHaveBeenCalledWith("/plantillas");
});

it("scopes all child operations, retaining meal and item ordering", async () => {
  await actions.addTemplateMealAction(fields());
  expect(mocks.getTemplate).toHaveBeenCalledWith("t", "mine");
  expect(mocks.addTemplateMeal).toHaveBeenCalledWith("t", { name: "Lunch", order: 1 }, "mine");
  await actions.deleteTemplateMealAction(fields());
  expect(mocks.deleteTemplateMeal).toHaveBeenCalledWith("m", scope);
  await actions.addTemplateMealItemAction(fields());
  expect(mocks.nextItemOrder).toHaveBeenCalledWith("template", "m", null, scope);
  expect(mocks.addTemplateMealItem).toHaveBeenCalledWith("m", expect.objectContaining({ customLabel: "Food", order: 3 }), scope);
  await actions.deleteTemplateMealItemAction(fields());
  expect(mocks.deleteTemplateMealItem).toHaveBeenCalledWith("i", scope);
  expect(mocks.touch.mock.calls).toEqual(Array.from({ length: 4 }, () => ["t", "mine"]));
});

it.each([null, { source: "PROPIO", active: true, tenantId: "mine" }, { source: "SARA2", active: false }])(
  "rejects a non-selectable food without saving or marking review (%j)", async (food) => {
    const form = fields();
    form.set("foodId", "submitted-food");
    mocks.getFood.mockResolvedValue(food);
    await expect(actions.addTemplateMealItemAction(form)).rejects.toThrow("Solo se pueden agregar alimentos activos de SARA 2.");
    expect(mocks.addTemplateMealItem).not.toHaveBeenCalled();
    expect(mocks.nextItemOrder).not.toHaveBeenCalled();
    expect(mocks.touch).not.toHaveBeenCalled();
  },
);

it("adds an active official food using the authenticated scope", async () => {
  const form = fields();
  form.set("foodId", "official");
  mocks.getFood.mockResolvedValue({ source: "SARA2", active: true });
  await expect(actions.addTemplateMealItemAction(form)).resolves.toBeUndefined();
  expect(mocks.addTemplateMealItem).toHaveBeenCalledWith("m", expect.objectContaining({ foodId: "official", order: 3 }), scope);
  expect(mocks.touch).toHaveBeenCalledWith("t", "mine");
});

it("rejects unknown or mismatched parents without touching review or choosing an item order", async () => {
  mocks.getTemplate.mockResolvedValue(null);
  mocks.getTemplateMeal.mockResolvedValue(null);
  await expect(actions.addTemplateMealAction(fields())).rejects.toThrow("404");
  await expect(actions.addTemplateMealItemAction(fields())).rejects.toThrow("404");
  expect(mocks.getTemplateMeal).toHaveBeenCalledWith("m", scope);
  expect(mocks.addTemplateMeal).not.toHaveBeenCalled();
  expect(mocks.addTemplateMealItem).not.toHaveBeenCalled();
  expect(mocks.nextItemOrder).not.toHaveBeenCalled();
  expect(mocks.touch).not.toHaveBeenCalled();
});
