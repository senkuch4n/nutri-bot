// HU-033 (025c): las funciones del portal del shell leen la profesional del consultorio que se les pasa.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ summary: vi.fn(), count: vi.fn(), botStatus: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@nutri-bot/db", () => ({ prisma: { botStatus: { findUnique: mocks.botStatus } } }));
vi.mock("@nutri-bot/db/domain", () => ({ findTenantProfessionalSummary: mocks.summary, countPendingInquiries: mocks.count }));

import { getPortalDocumentTitle, getProfessionalPortalContact } from "./shell";

const PRO_B = { name: "Ana Pérez", title: "Lic.", phoneJid: "5493510000000@s.whatsapp.net", botPaused: false };

describe("shell del portal por consultorio", () => {
  beforeEach(() => vi.resetAllMocks());

  it("getProfessionalPortalContact usa la profesional del consultorio pedido", async () => {
    mocks.summary.mockResolvedValue(PRO_B);
    expect(await getProfessionalPortalContact("tenant-b")).toEqual({
      name: "Lic. Ana Pérez",
      whatsappUrl: "https://wa.me/5493510000000",
    });
    expect(mocks.summary.mock.calls).toEqual([["tenant-b"]]);
  });

  it("getProfessionalPortalContact sin profesional (o error) → nulls, nunca tira", async () => {
    mocks.summary.mockResolvedValue(null);
    expect(await getProfessionalPortalContact("tenant-x")).toEqual({ name: null, whatsappUrl: null });
    mocks.summary.mockRejectedValue(new Error("db caída"));
    expect(await getProfessionalPortalContact("tenant-x")).toEqual({ name: null, whatsappUrl: null });
  });

  it("getPortalDocumentTitle usa el consultorio pedido y nunca tira", async () => {
    mocks.summary.mockResolvedValue(PRO_B);
    expect(await getPortalDocumentTitle("tenant-b")).toContain("Ana Pérez");
    expect(mocks.summary.mock.calls).toEqual([["tenant-b"]]);
    mocks.summary.mockRejectedValue(new Error("db caída"));
    await expect(getPortalDocumentTitle("tenant-b")).resolves.toEqual(expect.any(String));
  });
});
