import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), findUser: vi.fn(), read: vi.fn() }));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("server-only", () => ({}));
// HU-025a2: resolvePrivateContentAccess envuelve getTenantContext. Este mock reproduce su cadena
// (sesión → userId → una sola membresía OWNER/STAFF) sobre `mocks.auth` y `mocks.findUser`; el candado
// legacy y la agenda principal se prueban en lib/tenant-context.test.ts.
vi.mock("@/lib/tenant-context", () => ({
  getTenantContext: async () => {
    const session = await mocks.auth();
    if (!session?.userId) return null;
    const user = await mocks.findUser();
    if (user?.memberships.length !== 1) return null;
    const [m] = user.memberships;
    if (m.role !== "OWNER" && m.role !== "STAFF") return null;
    return {
      userId: session.userId, tenantId: m.tenantId, agendaId: "agenda", professionalId: 1,
      access: { kind: "member", tenantId: m.tenantId, role: m.role },
    };
  },
}));
vi.mock("@nutri-bot/db/domain", () => ({
  getImportImageBytes: () => ({ data: Buffer.from("legacy bytes") }),
  getTenantImportImageBytes: mocks.read,
}));

import { GET } from "./route";

const WEBP = Buffer.concat([Buffer.from("RIFF0000WEBPVP8 "), Buffer.from([0x00, 0xff])]);

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ user: { email: "panel@example.test" }, userId: "user-b" });
  mocks.findUser.mockResolvedValue({ memberships: [{ tenantId: "tenant-b", role: "OWNER" }] });
  mocks.read.mockImplementation((tenant, id, size) => tenant === "tenant-b" && id === "own" ? { data: Buffer.concat([WEBP, Buffer.from(size)]) } : null);
});

function get(imageId: string, query = "") {
  return GET(new Request(`http://127.0.0.1:1/import?tenantId=tenant-a${query}`), { params: Promise.resolve({ imageId }) });
}

it("rejects a missing session without consulting the database", async () => {
  mocks.auth.mockResolvedValue(null);
  expect((await get("own")).status).toBe(401);
  expect(mocks.findUser).not.toHaveBeenCalled();
  expect(mocks.read).not.toHaveBeenCalled();
});

it("denies a signed-in user without membership before reading", async () => {
  mocks.findUser.mockResolvedValue({ memberships: [] });
  const res = await get("own");
  expect(res.status).toBe(401);
  expect(res.headers.get("cache-control")).toBe("no-store");
  expect(await res.json()).toEqual({ error: "unauthorized" });
  expect(mocks.read).not.toHaveBeenCalled();
});

it.each(["foreign", "missing"])("returns the same 404 for %s", async (id) => {
  const res = await get(id);
  expect(mocks.read).toHaveBeenCalledWith("tenant-b", id, "thumb");
  expect(res.status).toBe(404);
  expect(res.headers.get("cache-control")).toBe("no-store");
  expect(await res.json()).toEqual({ error: "no encontrada" });
});

it.each([["", "thumb"], ["&size=full", "full"]])("serves own WebP bytes (%s)", async (query, size) => {
  const res = await get("own", query);
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toBe("image/webp");
  expect(res.headers.get("cache-control")).toBe("no-store");
  expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  expect(Buffer.from(await res.arrayBuffer())).toEqual(Buffer.concat([WEBP, Buffer.from(size)]));
});
