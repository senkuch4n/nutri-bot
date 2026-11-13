// HU-018a: la foto de receta del panel solo sale con sesión y se cachea como inmutable.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), getBytes: vi.fn() }));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@nutri-bot/db/domain", () => ({ getRecipePhotoBytes: mocks.getBytes }));

import { GET } from "./route";

const WEBP = Buffer.from("RIFF0000WEBPVP8 ");
const call = (query = "") => GET(new Request(`http://localhost/api/recetas/fotos/ph1${query}`), { params: Promise.resolve({ photoId: "ph1" }) });

describe("GET /api/recetas/fotos/[photoId]", () => {
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

  it("200 con WebP y Cache-Control inmutable", async () => {
    mocks.getBytes.mockResolvedValue({ data: WEBP, mimeType: "image/webp" });
    const res = await call("?size=full");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/webp");
    expect(res.headers.get("Cache-Control")).toBe("private, max-age=31536000, immutable");
    expect(Buffer.from(await res.arrayBuffer()).equals(WEBP)).toBe(true);
  });

  it("pide full o thumb según el parámetro (thumb por defecto)", async () => {
    mocks.getBytes.mockResolvedValue({ data: WEBP, mimeType: "image/webp" });
    await call("?size=full");
    await call();
    await call("?size=cualquiera");
    expect(mocks.getBytes.mock.calls.map((c) => c[1])).toEqual(["full", "thumb", "thumb"]);
    expect(mocks.getBytes.mock.calls[0]![0]).toBe("ph1");
  });
});
