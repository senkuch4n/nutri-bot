// HU-018a (D3/D19): la foto de receta del portal solo sale si el paciente tiene un plan activo con ella.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getPatient: vi.fn(), canSee: vi.fn(), getBytes: vi.fn() }));
vi.mock("@/lib/patient-session", () => ({ getPortalSession: mocks.getPatient }));
vi.mock("@nutri-bot/db/domain", () => ({ patientCanSeeRecipePhoto: mocks.canSee, getRecipePhotoBytes: mocks.getBytes }));

import { GET } from "./route";

const WEBP = Buffer.from("RIFF0000WEBPVP8 ");
const call = () => GET(new Request("http://localhost/portal/recetas/fotos/ph1?size=full"), { params: Promise.resolve({ photoId: "ph1" }) });

describe("GET /portal/recetas/fotos/[photoId]", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getPatient.mockResolvedValue({ patient: { id: "pat1", tenantId: "tenant-a" }, tenantId: "tenant-a" });
    mocks.getBytes.mockResolvedValue({ data: WEBP, mimeType: "image/webp" });
  });

  it("sin paciente → 401", async () => {
    mocks.getPatient.mockResolvedValue(null);
    expect((await call()).status).toBe(401);
    expect(mocks.canSee).not.toHaveBeenCalled();
    expect(mocks.getBytes).not.toHaveBeenCalled();
  });

  it("si patientCanSeeRecipePhoto da false → 404 sin leer los bytes", async () => {
    mocks.canSee.mockResolvedValue(false);
    const res = await call();
    expect(res.status).toBe(404);
    expect(mocks.canSee).toHaveBeenCalledWith({ tenantId: "tenant-a" }, "pat1", "ph1");
    expect(mocks.getBytes).not.toHaveBeenCalled();
  });

  it("HU-033: una foto de otro consultorio o inexistente → el mismo 404", async () => {
    mocks.canSee.mockResolvedValue(false);
    const foreign = await call();
    const missing = await GET(new Request("http://localhost/portal/recetas/fotos/nope"), { params: Promise.resolve({ photoId: "nope" }) });
    expect(foreign.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(await foreign.json()).toEqual(await missing.json());
    expect(mocks.canSee.mock.calls.every(([t]) => t.tenantId === "tenant-a")).toBe(true);
  });

  it("si da true → 200 con la foto, caché privada no inmutable", async () => {
    mocks.canSee.mockResolvedValue(true);
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/webp");
    expect(res.headers.get("Cache-Control")).toBe("private, max-age=3600");
    expect(mocks.getBytes).toHaveBeenCalledWith("ph1", "full");
    expect(Buffer.from(await res.arrayBuffer()).equals(WEBP)).toBe(true);
  });
});
