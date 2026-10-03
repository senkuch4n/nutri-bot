// HU-016 (D10): la vista previa de la firma solo sale con sesión del panel y sin caché.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), getImage: vi.fn() }));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@nutri-bot/db/domain", () => ({ getProfessionalSignatureImage: mocks.getImage }));

import { GET } from "./route";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x46, 0x49, 0x52, 0x4d, 0x41]);

describe("GET /api/professional/signature", () => {
  beforeEach(() => vi.resetAllMocks());

  it("sin sesión → 401, sin imagen y sin consultar la base", async () => {
    mocks.auth.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("Content-Type")).toContain("application/json");
    expect(await res.text()).not.toContain("FIRMA");
    expect(mocks.getImage).not.toHaveBeenCalled();
  });

  it("con sesión solo del portal (patient_session) auth() da null → 401", async () => {
    // La sesión del portal es otra cookie: Auth.js no la reconoce como sesión del panel.
    mocks.auth.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(mocks.getImage).not.toHaveBeenCalled();
  });

  it("sesión sin user → 401", async () => {
    mocks.auth.mockResolvedValue({ expires: "2099-01-01" });
    expect((await GET()).status).toBe(401);
    expect(mocks.getImage).not.toHaveBeenCalled();
  });

  it("con sesión y firma → 200 con los bytes y headers privados", async () => {
    mocks.auth.mockResolvedValue({ user: { email: "pro@example.test" } });
    mocks.getImage.mockResolvedValue({ data: PNG, mimeType: "image/png" });
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(Buffer.from(await res.arrayBuffer()).equals(PNG)).toBe(true);
  });

  it("con sesión y sin firma → 404", async () => {
    mocks.auth.mockResolvedValue({ user: { email: "pro@example.test" } });
    mocks.getImage.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(404);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});
