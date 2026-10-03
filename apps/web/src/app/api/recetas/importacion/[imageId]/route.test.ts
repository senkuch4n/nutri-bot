// HU-018a-2: las imágenes de la carga asistida solo salen con sesión del panel.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), getBytes: vi.fn() }));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@nutri-bot/db/domain", () => ({ getImportImageBytes: mocks.getBytes }));

import { GET } from "./route";

const WEBP = Buffer.from("RIFF0000WEBPVP8 ");
const call = (query = "") =>
  GET(new Request(`http://localhost/api/recetas/importacion/img1${query}`), { params: Promise.resolve({ imageId: "img1" }) });

describe("GET /api/recetas/importacion/[imageId]", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.auth.mockResolvedValue({ user: { email: "pro@example.test" } });
  });

  it("sin sesión → 401 sin consultar la base", async () => {
    mocks.auth.mockResolvedValue(null);
    const res = await call();
    expect(res.status).toBe(401);
    expect(mocks.getBytes).not.toHaveBeenCalled();
  });

  it("si no existe → 404", async () => {
    mocks.getBytes.mockResolvedValue(null);
    expect((await call()).status).toBe(404);
  });

  it("200 con WebP y caché privada de 1 hora", async () => {
    mocks.getBytes.mockResolvedValue({ data: WEBP, mimeType: "image/webp" });
    const res = await call("?size=full");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/webp");
    expect(res.headers.get("Cache-Control")).toBe("private, max-age=3600");
    expect(Buffer.from(await res.arrayBuffer()).equals(WEBP)).toBe(true);
  });

  it("pide full o thumb según el parámetro (thumb por defecto)", async () => {
    mocks.getBytes.mockResolvedValue({ data: WEBP, mimeType: "image/webp" });
    await call("?size=full");
    await call();
    expect(mocks.getBytes.mock.calls).toEqual([["img1", "full"], ["img1", "thumb"]]);
  });
});
