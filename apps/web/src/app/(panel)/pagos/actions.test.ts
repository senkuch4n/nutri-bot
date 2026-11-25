// HU-017b-1 (SDD 4.6, 9-1): pago manual (también desde el panel del turno).
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ revalidatePath: vi.fn(), registerManualPayment: vi.fn(), requireTenantContext: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@nutri-bot/db/domain", () => ({ registerManualPayment: mocks.registerManualPayment }));
vi.mock("@/lib/tenant-context", () => ({ requireTenantContext: mocks.requireTenantContext }));
const CTX = { userId: "u-a", tenantId: "tenant-a", agendaId: "agenda-a", professionalId: 1 };

import { registerManualPaymentAction } from "./actions";

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.registerManualPayment.mockResolvedValue({});
  mocks.requireTenantContext.mockResolvedValue(CTX);
});

describe("registerManualPaymentAction", () => {
  it("éxito: devuelve tipo y monto y revalida pagos y calendario", async () => {
    const res = await registerManualPaymentAction(
      { ok: false },
      form({ appointmentId: "appt-1", kind: "FULL", amount: "15000" }),
    );
    expect(res).toEqual({ ok: true, kind: "FULL", amount: 15000 });
    expect(mocks.registerManualPayment).toHaveBeenCalledWith(CTX, "appt-1", { kind: "FULL", amount: 15000 });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/pagos");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/turnos"); // HU-021
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

  it("HU-025: el consultorio sale del contexto aunque el form mande otro tenant", async () => {
    await registerManualPaymentAction(
      { ok: false },
      form({ appointmentId: "appt-b", kind: "FULL", amount: "100", tenantId: "tenant-b", agendaId: "agenda-b", professionalId: "2" }),
    );
    expect(mocks.requireTenantContext).toHaveBeenCalledWith("write");
    expect(mocks.registerManualPayment).toHaveBeenCalledWith(CTX, "appt-b", { kind: "FULL", amount: 100 });
  });

  it("HU-025: sin contexto (membresía revocada) → error genérico con reauth, sin llamar al dominio", async () => {
    mocks.requireTenantContext.mockRejectedValue(Object.assign(new Error("tenant_access:no_context"), { name: "TenantAccessError" }));
    const res = await registerManualPaymentAction({ ok: false }, form({ appointmentId: "appt-1", kind: "FULL", amount: "1" }));
    expect(res).toEqual({ ok: false, error: "No se pudo registrar el pago. Probá de nuevo.", reauth: true });
    expect(mocks.registerManualPayment).not.toHaveBeenCalled();
  });
});
