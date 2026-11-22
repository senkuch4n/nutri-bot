import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ ctx: vi.fn(), read: vi.fn() }));
vi.mock("server-only", () => ({}));
// HU-025b-2: getTenantContext mockeado directo (la cadena sesión → membresía → candado → agenda se
// prueba en lib/tenant-context.test.ts). `ctx` = contexto de la sesión o null.
vi.mock("@/lib/tenant-context", () => ({ getTenantContext: mocks.ctx }));
vi.mock("@nutri-bot/db/domain", () => ({
  getImportImageBytes: () => ({ data: Buffer.from("legacy bytes") }),
  getTenantImportImageBytes: mocks.read,
}));

import { GET } from "./route";

const WEBP = Buffer.concat([Buffer.from("RIFF0000WEBPVP8 "), Buffer.from([0x00, 0xff])]);

beforeEach(() => {
  vi.resetAllMocks();
  mocks.ctx.mockResolvedValue({ userId: "u", tenantId: "tenant-b", agendaId: "agenda", professionalId: 1, access: { kind: "member", tenantId: "tenant-b", role: "STAFF" } });
  mocks.read.mockImplementation((tenant, id, size) => tenant === "tenant-b" && id === "own" ? { data: Buffer.concat([WEBP, Buffer.from(size)]) } : null);
});

function get(imageId: string, query = "") {
  return GET(new Request(`http://127.0.0.1:1/import?tenantId=tenant-a${query}`), { params: Promise.resolve({ imageId }) });
}

it("sin contexto (sin sesión, sin membresía o revocada) → 401 sin leer", async () => {
  mocks.ctx.mockResolvedValue(null);
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
