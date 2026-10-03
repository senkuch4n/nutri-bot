// HU-016 (D10, SDD §17): generar/enviar el informe pasa por la firma (y por un PDF que la lleva):
// si algo falla, el log lleva solo el código del error, nunca el error, su mensaje ni bytes.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  saveTexts: vi.fn(),
  savePdf: vi.fn(),
  enqueue: vi.fn(),
  render: vi.fn(),
  branding: vi.fn(),
  loadCtx: vi.fn(),
  belongs: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@nutri-bot/db/domain", () => ({
  saveAnthropometricReportTexts: mocks.saveTexts,
  saveAnthropometricReportPdf: mocks.savePdf,
  enqueueAnthropometricReportMessage: mocks.enqueue,
}));
vi.mock("@/lib/anthropometric-report-pdf", () => ({ renderAnthropometricReportPdf: mocks.render }));
vi.mock("@/lib/professional-pdf", () => ({ loadProfessionalPdfBranding: mocks.branding }));
vi.mock("@/lib/anthropometric-report", () => ({ loadIsakReportContext: mocks.loadCtx }));
vi.mock("@/lib/consultation-guard", () => ({ belongsToPatient: mocks.belongs }));

import { generateIsakReportPdfAction, sendIsakReportWhatsAppAction } from "./report-actions";

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...Buffer.from("FIRMA-SECRETA-XYZ")]);
const B64 = SIGNATURE.toString("base64");
const PDF = Buffer.concat([Buffer.from("%PDF-1.7 "), SIGNATURE]);

const TEXTS = {
  girths: "a",
  distribution: "b",
  adiposeMuscle: "c",
  muscleBone: "d",
  waistHip: "e",
  somatotype: "f",
  conclusions: "Conclusiones de prueba",
};
const INPUT = { patientId: "p1", consultationId: "c1", texts: TEXTS };

/** Error como los de Prisma: código + mensaje y meta con los argumentos (bytes) de la llamada. */
function prismaLikeError() {
  return Object.assign(new Error(`Invalid \`prisma.anthropometricReport.update()\` invocation: { pdfData: ${B64} }`), {
    name: "PrismaClientKnownRequestError",
    code: "P2000",
    meta: { data: PDF, signature: SIGNATURE },
  });
}

function expectSafeLogs(spy: ReturnType<typeof vi.spyOn>, label: string) {
  expect(spy).toHaveBeenCalledTimes(1);
  expect(spy.mock.calls[0]).toEqual([label, "P2000"]);
  for (const a of spy.mock.calls.flat()) {
    expect(a).not.toBeInstanceOf(Error);
    expect(Buffer.isBuffer(a)).toBe(false);
    const text = String(a);
    expect(text).not.toContain(B64);
    expect(text).not.toContain("FIRMA-SECRETA-XYZ");
    expect(text).not.toContain("invocation");
  }
}

describe("report-actions: logs sin datos de la firma (HU-016, D10)", () => {
  let spy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.belongs.mockResolvedValue(true);
    mocks.loadCtx.mockResolvedValue({
      status: "ok",
      ctx: {
        entry: { id: "e1" },
        model: {},
        fileName: "informe.pdf",
        sourceKey: "k",
        patient: { whatsappJid: "549000@s.whatsapp.net" },
        currentDateLabel: "08/05/2026",
      },
    });
    mocks.saveTexts.mockResolvedValue({ texts: TEXTS });
    mocks.branding.mockResolvedValue({
      displayName: "Lic. Daiana Ponce",
      footerSignature: "Lic. Daiana Ponce · M.P. 852",
      logo: null,
      accentColor: null,
      footerText: null,
      signature: { image: { data: SIGNATURE, mimeType: "image/png" }, nameLine: "Lic. Daiana Ponce", licenseLine: "M.P. 852" },
    });
    mocks.render.mockResolvedValue(PDF);
    spy = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("generar: si falla guardar el PDF, loguea solo el código", async () => {
    mocks.savePdf.mockRejectedValue(prismaLikeError());
    const r = await generateIsakReportPdfAction(INPUT);
    expect(r.ok).toBe(false);
    expectSafeLogs(spy, "generateIsakReportPdfAction");
    expect(mocks.render.mock.calls[0]![0].signatureBlock.image.data).toBe(SIGNATURE);
  });

  it("enviar: si falla encolar, loguea solo el código y no encola nada más", async () => {
    mocks.savePdf.mockResolvedValue({ id: "r1" });
    mocks.enqueue.mockRejectedValue(prismaLikeError());
    const r = await sendIsakReportWhatsAppAction(INPUT);
    expect(r.ok).toBe(false);
    expectSafeLogs(spy, "sendIsakReportWhatsAppAction");
  });

  it("enviar: si falla leer la firma, loguea solo la clase del error", async () => {
    mocks.branding.mockRejectedValue(Object.assign(new TypeError(`bytes ${B64}`), {}));
    const r = await sendIsakReportWhatsAppAction(INPUT);
    expect(r.ok).toBe(false);
    expect(spy.mock.calls[0]).toEqual(["sendIsakReportWhatsAppAction", "TypeError"]);
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });
});
