// HU-017b-1 (SDD 4.6, 9-1): pago manual (también desde el panel del turno).
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ revalidatePath: vi.fn(), registerManualPayment: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@nutri-bot/db/domain", () => ({ registerManualPayment: mocks.registerManualPayment }));

import { registerManualPaymentAction } from "./actions";

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.registerManualPayment.mockResolvedValue({});
});

describe("registerManualPaymentAction", () => {
  it("éxito: devuelve tipo y monto y revalida pagos y calendario", async () => {
    const res = await registerManualPaymentAction(
      { ok: false },
      form({ appointmentId: "appt-1", kind: "FULL", amount: "15000" }),
    );
    expect(res).toEqual({ ok: true, kind: "FULL", amount: 15000 });
    expect(mocks.registerManualPayment).toHaveBeenCalledWith("appt-1", { kind: "FULL", amount: 15000 });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/pagos");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/");
  });

  it("si el dominio falla → mensaje claro, sin revalidar", async () => {
    mocks.registerManualPayment.mockRejectedValue(new Error("db"));
    const res = await registerManualPaymentAction(
      { ok: false },
      form({ appointmentId: "appt-1", kind: "DEPOSIT", amount: "5000" }),
    );
    expect(res).toEqual({ ok: false, error: "No se pudo registrar el pago. Probá de nuevo." });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it.each(["0", ""])("monto %j → Datos inválidos, sin llamar al dominio", async (amount) => {
    const res = await registerManualPaymentAction({ ok: false }, form({ appointmentId: "appt-1", kind: "FULL", amount }));
    expect(res).toEqual({ ok: false, error: "Datos inválidos" });
    expect(mocks.registerManualPayment).not.toHaveBeenCalled();
  });
});
