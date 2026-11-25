// HU-025 (025b-2 M5): marcar una consulta como respondida sobre el consultorio del contexto.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ revalidatePath: vi.fn(), markInquiryAnswered: vi.fn(), requireTenantContext: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@nutri-bot/db/domain", () => ({ markInquiryAnswered: mocks.markInquiryAnswered }));
vi.mock("@/lib/tenant-context", () => ({ requireTenantContext: mocks.requireTenantContext }));

import { markInquiryAnsweredAction } from "./actions";

const CTX_A = { userId: "u-a", tenantId: "tenant-a", agendaId: "agenda-a", professionalId: 1 };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireTenantContext.mockResolvedValue(CTX_A);
});

describe("markInquiryAnsweredAction", () => {
  it("marca con el consultorio del contexto y revalida la bandeja y el contador", async () => {
    mocks.markInquiryAnswered.mockResolvedValue("answered");
    await expect(markInquiryAnsweredAction("inq-a")).resolves.toEqual({ ok: true });
    expect(mocks.requireTenantContext).toHaveBeenCalledWith("write");
    expect(mocks.markInquiryAnswered).toHaveBeenCalledWith(CTX_A, "inq-a");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/mensajes");
  });

  it("una consulta de otro consultorio da el mismo resultado que una inexistente", async () => {
    mocks.markInquiryAnswered.mockResolvedValue("not_found");
    await expect(markInquiryAnsweredAction("inq-de-b")).resolves.toEqual({ ok: false, error: "La consulta ya no existe." });
    expect(mocks.markInquiryAnswered).toHaveBeenCalledWith(CTX_A, "inq-de-b");
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("sin contexto (membresía revocada) → error genérico, sin tocar el dominio", async () => {
    mocks.requireTenantContext.mockRejectedValue(new Error("tenant_access:no_context"));
    const res = await markInquiryAnsweredAction("inq-a");
    expect(res).toMatchObject({ ok: false, error: "No se pudo marcar la consulta. Probá de nuevo." });
    expect(mocks.markInquiryAnswered).not.toHaveBeenCalled();
  });
});
