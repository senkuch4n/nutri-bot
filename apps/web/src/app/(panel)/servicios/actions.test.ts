// HU-017b-2 (SDD 4.4, Q17): guardar un servicio no toca `active` (un pausado sigue pausado) y los
// switches mandan "0"/"1" (con "0" no se prende nada). Todo con mocks (sin base).
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  createService: vi.fn(),
  updateService: vi.fn(),
  setServiceActive: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/services", () => ({
  createService: mocks.createService,
  updateService: mocks.updateService,
  setServiceActive: mocks.setServiceActive,
}));

import { saveServiceAction, toggleServiceAction } from "./actions";

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

const BASE = {
  name: "Control",
  price: "15000",
  durationMin: "45",
  color: "#2563eb",
  asksReason: "1",
  reminders: JSON.stringify([{ amount: 24, unit: "HOURS", asksConfirmation: false }]),
};

const prev = { ok: false };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.updateService.mockResolvedValue({});
  mocks.createService.mockResolvedValue({});
  mocks.setServiceActive.mockResolvedValue({});
});

describe("saveServiceAction", () => {
  it("editar no manda `active` a updateService (un servicio pausado sigue pausado)", async () => {
    const r = await saveServiceAction(prev, form({ ...BASE, id: "srv-1" }));
    expect(r).toEqual({ ok: true });
    expect(mocks.updateService).toHaveBeenCalledTimes(1);
    const [id, data] = mocks.updateService.mock.calls[0]!;
    expect(id).toBe("srv-1");
    expect(data).not.toHaveProperty("active");
  });

  it("aunque un cliente viejo mande active=true, no se reactiva", async () => {
    await saveServiceAction(prev, form({ ...BASE, id: "srv-1", active: "true" }));
    expect(mocks.updateService.mock.calls[0]![1]).not.toHaveProperty("active");
  });

  it("crear tampoco manda `active` (queda el default de la base)", async () => {
    await saveServiceAction(prev, form(BASE));
    expect(mocks.createService.mock.calls[0]![0]).not.toHaveProperty("active");
  });

  it('requiresDeposit "0" → sin seña (z.coerce.boolean() daba true)', async () => {
    await saveServiceAction(
      prev,
      form({ ...BASE, id: "srv-1", requiresDeposit: "0", depositKind: "PERCENT", depositValue: "50" }),
    );
    expect(mocks.updateService.mock.calls[0]![1]).toMatchObject({
      requiresDeposit: false,
      depositKind: null,
      depositValue: null,
    });
  });

  it('requiresDeposit "1" con tipo y valor → con seña', async () => {
    await saveServiceAction(
      prev,
      form({ ...BASE, id: "srv-1", requiresDeposit: "1", depositKind: "PERCENT", depositValue: "50" }),
    );
    expect(mocks.updateService.mock.calls[0]![1]).toMatchObject({
      requiresDeposit: true,
      depositKind: "PERCENT",
      depositValue: 50,
    });
  });

  it('requiresDeposit "1" sin valor → error y no guarda', async () => {
    const r = await saveServiceAction(prev, form({ ...BASE, id: "srv-1", requiresDeposit: "1", depositKind: "FIXED" }));
    expect(r.ok).toBe(false);
    expect(mocks.updateService).not.toHaveBeenCalled();
  });

  it('asksReason "0" → no pide motivo', async () => {
    await saveServiceAction(prev, form({ ...BASE, id: "srv-1", asksReason: "0" }));
    expect(mocks.updateService.mock.calls[0]![1]).toMatchObject({ asksReason: false });
  });

  it("recomendaciones apagadas (texto vacío) → sin recomendaciones ni horas", async () => {
    await saveServiceAction(prev, form({ ...BASE, id: "srv-1", prepInstructions: "", prepLeadHours: "24" }));
    expect(mocks.updateService.mock.calls[0]![1]).toMatchObject({ prepInstructions: null, prepLeadHours: null });
  });
});

describe("toggleServiceAction", () => {
  it("pausar devuelve ok", async () => {
    await expect(toggleServiceAction("srv-1", false)).resolves.toEqual({ ok: true });
    expect(mocks.setServiceActive).toHaveBeenCalledWith("srv-1", false);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/servicios");
  });

  it("Deshacer = la misma action con true", async () => {
    await expect(toggleServiceAction("srv-1", true)).resolves.toEqual({ ok: true });
    expect(mocks.setServiceActive).toHaveBeenCalledWith("srv-1", true);
  });

  it("si falla devuelve el error", async () => {
    mocks.setServiceActive.mockRejectedValue(new Error("db down"));
    await expect(toggleServiceAction("srv-1", false)).resolves.toMatchObject({ ok: false });
  });
});
