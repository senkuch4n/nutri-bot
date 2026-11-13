// HU-016: lectura y escritura de la firma; armado de las imágenes de los PDF.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: { professional: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn() } },
}));
vi.mock("../index", () => ({ prisma: mocks.prisma }));

import {
  getProfessionalPdfAssets,
  getProfessionalSignatureImage,
  removeProfessionalSignature,
  updateProfessionalSignature,
} from "./professionalAssets";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 9]);

beforeEach(() => vi.resetAllMocks());

describe("updateProfessionalSignature", () => {
  it("guarda bytes y MIME sin devolver la fila", async () => {
    mocks.prisma.professional.update.mockResolvedValue({ id: 1 });
    await expect(updateProfessionalSignature({ data: PNG, mimeType: "image/png" })).resolves.toBeUndefined();
    expect(mocks.prisma.professional.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { signatureData: PNG, signatureMimeType: "image/png" },
      select: { id: true },
    });
  });
});

describe("removeProfessionalSignature", () => {
  it("pone las dos columnas en null", async () => {
    mocks.prisma.professional.update.mockResolvedValue({ id: 1 });
    await expect(removeProfessionalSignature()).resolves.toBeUndefined();
    expect(mocks.prisma.professional.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { signatureData: null, signatureMimeType: null },
      select: { id: true },
    });
  });
});

describe("getProfessionalSignatureImage", () => {
  it("con las dos columnas devuelve la imagen; el select pide solo esas dos", async () => {
    mocks.prisma.professional.findUnique.mockResolvedValue({ signatureData: PNG, signatureMimeType: "image/png" });
    await expect(getProfessionalSignatureImage()).resolves.toEqual({ data: PNG, mimeType: "image/png" });
    expect(mocks.prisma.professional.findUnique).toHaveBeenCalledWith({
      where: { id: 1 },
      select: { signatureData: true, signatureMimeType: true },
    });
  });

  it.each([
    ["sin bytes", { signatureData: null, signatureMimeType: "image/png" }],
    ["sin MIME", { signatureData: PNG, signatureMimeType: null }],
    ["sin fila", null],
  ])("%s → null", async (_label, row) => {
    mocks.prisma.professional.findUnique.mockResolvedValue(row);
    await expect(getProfessionalSignatureImage()).resolves.toBeNull();
  });
});

describe("getProfessionalPdfAssets", () => {
  const base = {
    name: "Daiana Ponce",
    title: "Lic.",
    licenseNumber: "M.P. 852",
    pdfAccentColor: "#3c7a24",
    pdfFooterText: null,
  };

  it("arma logo y firma cuando están completos", async () => {
    mocks.prisma.professional.findUniqueOrThrow.mockResolvedValue({
      ...base,
      logoData: JPG,
      logoMimeType: "image/jpeg",
      signatureData: PNG,
      signatureMimeType: "image/png",
    });
    await expect(getProfessionalPdfAssets()).resolves.toEqual({
      ...base,
      logo: { data: JPG, mimeType: "image/jpeg" },
      signature: { data: PNG, mimeType: "image/png" },
    });
    const arg = mocks.prisma.professional.findUniqueOrThrow.mock.calls[0]![0];
    expect(arg.where).toEqual({ id: 1 });
    expect(Object.keys(arg.select).sort()).toEqual(
      [
        "licenseNumber",
        "logoData",
        "logoMimeType",
        "name",
        "pdfAccentColor",
        "pdfFooterText",
        "signatureData",
        "signatureMimeType",
        "title",
      ].sort(),
    );
  });

  it("logo o firma en null si falta el byte o el MIME", async () => {
    mocks.prisma.professional.findUniqueOrThrow.mockResolvedValue({
      ...base,
      logoData: JPG,
      logoMimeType: null,
      signatureData: null,
      signatureMimeType: "image/png",
    });
    const r = await getProfessionalPdfAssets();
    expect(r.logo).toBeNull();
    expect(r.signature).toBeNull();
    expect(r.name).toBe("Daiana Ponce");
  });
});
