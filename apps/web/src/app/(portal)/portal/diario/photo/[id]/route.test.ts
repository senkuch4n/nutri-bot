// HU-033 (025c): la foto del diario del portal sale solo si la entrada es del paciente de la sesión Y de su
// consultorio. Un id de otro paciente o de otro consultorio responde igual que uno inexistente.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ session: vi.fn(), findFirst: vi.fn() }));
vi.mock("@/lib/patient-session", () => ({ getPortalSession: mocks.session }));
vi.mock("@nutri-bot/db", () => ({ prisma: { diaryEntry: { findFirst: mocks.findFirst } } }));

import { GET } from "./route";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const call = (id: string) => GET(new Request(`http://localhost/portal/diario/photo/${id}`), { params: Promise.resolve({ id }) });

describe("GET /portal/diario/photo/[id]", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.session.mockResolvedValue({ patient: { id: "pat_a", tenantId: "tenant-a" }, tenantId: "tenant-a" });
  });

  it("sin sesión → 401 sin consultar", async () => {
    mocks.session.mockResolvedValue(null);
    expect((await call("e1")).status).toBe(401);
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });

  it("busca por id, paciente de la sesión y consultorio de la sesión", async () => {
    mocks.findFirst.mockResolvedValue({ photoData: PNG, photoMimeType: "image/png" });
    const res = await call("e1");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(Buffer.from(await res.arrayBuffer()).equals(PNG)).toBe(true);
    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: { id: "e1", patientId: "pat_a", patient: { tenantId: "tenant-a" } },
      select: { photoData: true, photoMimeType: true },
    });
  });

  it("id de otro paciente, de otro consultorio o inexistente → el mismo 404", async () => {
    mocks.findFirst.mockResolvedValue(null); // la consulta filtrada no encuentra nada en los tres casos
    const foreign = await call("de-otro");
    const missing = await call("no-existe");
    expect(foreign.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(await foreign.json()).toEqual(await missing.json());
  });

  it("entrada sin foto → el mismo 404", async () => {
    mocks.findFirst.mockResolvedValue({ photoData: null, photoMimeType: null });
    const res = await call("e1");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "no encontrado" });
  });
});
