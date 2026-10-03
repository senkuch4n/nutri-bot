// HU-016 (D10): la firma no llega a la IA del bot aunque getProfessional() la trajera por error.
import { beforeEach, describe, expect, it, vi } from "vitest";

const SECRET = "FIRMA-SECRETA-XYZ";
const SECRET_BYTES = Buffer.from(SECRET);

const mocks = vi.hoisted(() => ({
  getProfessional: vi.fn(),
  getAvailableSlotsForService: vi.fn(),
  prisma: {},
}));
vi.mock("../index", () => ({ prisma: mocks.prisma }));
vi.mock("./availability", () => ({
  getProfessional: mocks.getProfessional,
  getAvailableSlotsForService: mocks.getAvailableSlotsForService,
}));

import { runBotAiTool } from "./botAi";

describe("privacidad de la firma (HU-016, D10)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getProfessional.mockResolvedValue({
      id: 1,
      name: "Daiana Ponce",
      title: "Lic.",
      licenseNumber: "M.P. 852",
      timezone: "America/Argentina/Buenos_Aires",
      currency: "ARS",
      acceptedInsurances: "OSDE",
      botAiInfo: "Calle Falsa 123",
      afterHoursEnabled: true,
      afterHoursStart: "22:00",
      afterHoursEnd: "09:00",
      signatureData: SECRET_BYTES,
      signatureMimeType: "image/png",
    });
  });

  it("datos_consultorio no devuelve los bytes de la firma ni su base64", async () => {
    const r = await runBotAiTool({
      name: "datos_consultorio",
      input: {},
      patientId: "p1",
      now: new Date("2026-10-03T15:00:00Z"),
    });
    expect(r.isError).toBe(false);
    expect(r.content).toContain("Daiana Ponce");
    const out = JSON.stringify(r);
    expect(out).not.toContain(SECRET);
    expect(out).not.toContain(SECRET_BYTES.toString("base64"));
    expect(out).not.toContain("image/png");
  });
});
