// HU-025 (025b-2 M6): el logo es el de la profesional del consultorio del contexto.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ ctx: vi.fn(), findUnique: vi.fn() }));
vi.mock("@/lib/tenant-context", () => ({ getTenantContext: mocks.ctx }));
vi.mock("@nutri-bot/db", () => ({ prisma: { professional: { findUnique: mocks.findUnique } } }));

import { GET } from "./route";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe("GET /api/professional/logo", () => {
  beforeEach(() => vi.resetAllMocks());

  it("sin contexto → 401 sin consultar la base", async () => {
    mocks.ctx.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it("lee la profesional de la agenda principal del contexto (clave compuesta)", async () => {
    mocks.ctx.mockResolvedValue({ userId: "u", tenantId: "tenant-b", agendaId: "agenda-b", professionalId: 7 });
    mocks.findUnique.mockResolvedValue({ logoData: PNG, logoMimeType: "image/png" });
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(mocks.findUnique.mock.calls[0]![0].where).toEqual({ id_tenantId: { id: 7, tenantId: "tenant-b" } });
  });

  it("sin logo → 404", async () => {
    mocks.ctx.mockResolvedValue({ userId: "u", tenantId: "legacy-tenant", agendaId: "a", professionalId: 1 });
    mocks.findUnique.mockResolvedValue(null);
    expect((await GET()).status).toBe(404);
  });
});
