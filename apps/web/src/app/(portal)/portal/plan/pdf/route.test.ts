// HU-033 (025c): el PDF del portal es el del plan ACTIVE del paciente de la sesión en su consultorio.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ session: vi.fn(), findFirst: vi.fn() }));
vi.mock("@/lib/patient-session", () => ({ getPortalSession: mocks.session }));
vi.mock("@nutri-bot/db", () => ({ prisma: { nutritionPlan: { findFirst: mocks.findFirst } } }));

import { GET } from "./route";

const PDF = Buffer.from("%PDF-1.4");

describe("GET /portal/plan/pdf", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.session.mockResolvedValue({ patient: { id: "pat_a", tenantId: "tenant-a" }, tenantId: "tenant-a" });
  });

  it("sin sesión → 401 sin consultar", async () => {
    mocks.session.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });

  it("plan ACTIVE del paciente y del consultorio de la sesión", async () => {
    mocks.findFirst.mockResolvedValue({ pdfData: PDF, pdfFileName: "plan-ana.pdf" });
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="plan-ana.pdf"');
    expect(Buffer.from(await res.arrayBuffer()).equals(PDF)).toBe(true);
    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: { patientId: "pat_a", tenantId: "tenant-a", status: "ACTIVE" },
      orderBy: { updatedAt: "desc" },
      select: { pdfData: true, pdfFileName: true },
    });
  });

  it("sin plan en el consultorio (o de otro paciente) y plan sin PDF → el mismo 404", async () => {
    mocks.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ pdfData: null, pdfFileName: null });
    const none = await GET();
    const noPdf = await GET();
    expect(none.status).toBe(404);
    expect(noPdf.status).toBe(404);
    expect(await none.json()).toEqual(await noPdf.json());
  });
});
