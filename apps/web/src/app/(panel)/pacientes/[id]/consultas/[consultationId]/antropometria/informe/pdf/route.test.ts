// HU-025b-1: PDF del informe antropométrico acotado al consultorio de la sesión (mocks, sin base).
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getTenantContext: vi.fn(),
  getConsultation: vi.fn(),
  getIsakStudy: vi.fn(),
  getAnthropometricReportPdf: vi.fn(),
}));
vi.mock("@/lib/tenant-context", () => ({ getTenantContext: mocks.getTenantContext }));
vi.mock("@nutri-bot/db/domain", () => ({
  getConsultation: mocks.getConsultation,
  getIsakStudy: mocks.getIsakStudy,
  getAnthropometricReportPdf: mocks.getAnthropometricReportPdf,
}));

import { GET } from "./route";

const ctxA = { userId: "u", tenantId: "tenant-a", agendaId: "agenda-a", professionalId: 1 };
const call = (id: string, consultationId: string) =>
  GET(new Request("http://localhost/x"), { params: Promise.resolve({ id, consultationId }) });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getTenantContext.mockResolvedValue(ctxA);
});

describe("GET informe/pdf", () => {
  it("lee consulta, estudio y PDF con el contexto de la sesión", async () => {
    mocks.getConsultation.mockResolvedValue({ id: "c1", patientId: "p1" });
    mocks.getIsakStudy.mockResolvedValue({ id: "e1" });
    mocks.getAnthropometricReportPdf.mockResolvedValue({ data: Buffer.from("%PDF"), fileName: "informe.pdf" });
    const res = await call("p1", "c1");
    expect(res.status).toBe(200);
    expect(mocks.getConsultation).toHaveBeenCalledWith(ctxA, "c1");
    expect(mocks.getIsakStudy).toHaveBeenCalledWith(ctxA, "c1");
    expect(mocks.getAnthropometricReportPdf).toHaveBeenCalledWith(ctxA, "e1");
  });

  it("consulta de otro consultorio → 404 igual que inexistente, sin leer el PDF", async () => {
    mocks.getConsultation.mockResolvedValue(null);
    const res = await call("p-b", "c-b");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "no encontrado" });
    expect(mocks.getAnthropometricReportPdf).not.toHaveBeenCalled();
  });

  it("sin contexto → 401", async () => {
    mocks.getTenantContext.mockResolvedValue(null);
    expect((await call("p1", "c1")).status).toBe(401);
    expect(mocks.getConsultation).not.toHaveBeenCalled();
  });
});
