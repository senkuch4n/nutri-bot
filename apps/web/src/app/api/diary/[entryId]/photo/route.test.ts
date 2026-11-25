// HU-025b-1: foto de diario del panel acotada al consultorio de la sesión (mocks, sin base).
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getTenantContext: vi.fn(), findFirst: vi.fn() }));
vi.mock("@/lib/tenant-context", () => ({ getTenantContext: mocks.getTenantContext }));
vi.mock("@nutri-bot/db", () => ({ prisma: { diaryEntry: { findFirst: mocks.findFirst } } }));

import { GET } from "./route";

const ctxA = { userId: "u", tenantId: "tenant-a", agendaId: "agenda-a", professionalId: 1 };
const call = (entryId: string) => GET(new Request("http://localhost/api/diary/x/photo"), { params: Promise.resolve({ entryId }) });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getTenantContext.mockResolvedValue(ctxA);
});

describe("GET /api/diary/[entryId]/photo", () => {
  it("busca la entrada por id y por el consultorio del paciente", async () => {
    mocks.findFirst.mockResolvedValue({ photoData: Buffer.from("img"), photoMimeType: "image/png" });
    const res = await call("e1");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocks.findFirst.mock.calls[0]![0].where).toEqual({ id: "e1", patient: { tenantId: "tenant-a" } });
  });

  it("una entrada de otro consultorio responde igual que una inexistente", async () => {
    mocks.findFirst.mockResolvedValue(null);
    const foreign = await call("entrada-de-b");
    const missing = await call("no-existe");
    expect(foreign.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(await foreign.json()).toEqual(await missing.json());
  });

  it("sin contexto → 401 sin leer la base", async () => {
    mocks.getTenantContext.mockResolvedValue(null);
    const res = await call("e1");
    expect(res.status).toBe(401);
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });
});
