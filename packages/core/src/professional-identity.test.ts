import { describe, expect, it } from "vitest";
import {
  LOGO_IMAGE_MAX_BYTES,
  PROFESSIONAL_TEXT,
  SIGNATURE_IMAGE_MAX_BYTES,
  detectSignatureImageMime,
  isPdfDrawableImageMime,
  logoImageSizeError,
  professionalDataMissingNotice,
  professionalDisplayName,
  professionalLogoNotice,
  professionalSignature,
  professionalSignatureLines,
  signatureImageSizeError,
  validateLogoImage,
  validateSignatureImage,
} from "./professional-identity";

const PNG_HEAD = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
// Firma PNG + chunk IHDR (largo 13, "IHDR").
const PNG_BYTES = Uint8Array.from([...PNG_HEAD, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]);
const JPEG_BYTES = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]);
const ascii = (s: string) => new TextEncoder().encode(s);

/** Buffer de `size` bytes que arranca con `head` (resto en cero). */
function sized(head: ArrayLike<number>, size: number): Uint8Array {
  const out = new Uint8Array(size);
  out.set(Array.from(head).slice(0, size));
  return out;
}

describe("professionalDisplayName", () => {
  it("antepone el título", () => {
    expect(professionalDisplayName({ title: "Lic.", name: "Daiana Ponce" })).toBe("Lic. Daiana Ponce");
  });
  it.each([null, "", "  "])("sin título (%j) devuelve solo el nombre", (title) => {
    expect(professionalDisplayName({ title, name: "Daiana Ponce" })).toBe("Daiana Ponce");
  });
  it("recorta cada parte", () => {
    expect(professionalDisplayName({ title: "  Lic. ", name: " Daiana Ponce " })).toBe("Lic. Daiana Ponce");
  });
});

describe("professionalSignature (movida desde isak-report)", () => {
  it("mismos casos que isak-report.test.ts", () => {
    expect(professionalSignature({ title: "Lic.", name: "Ana Pérez", licenseNumber: "M.P. 123" })).toBe(
      "Lic. Ana Pérez · M.P. 123",
    );
    expect(professionalSignature({ title: null, name: "Ana Pérez", licenseNumber: null })).toBe("Ana Pérez");
    expect(professionalSignature({ title: "", name: "Ana Pérez", licenseNumber: "M.P. 123" })).toBe("Ana Pérez · M.P. 123");
    expect(professionalSignature({ title: "Lic.", name: "Ana Pérez", licenseNumber: "  " })).toBe("Lic. Ana Pérez");
    expect(professionalSignature({ title: "  Lic. ", name: " Ana Pérez ", licenseNumber: " M.P. 123 " })).toBe(
      "Lic. Ana Pérez · M.P. 123",
    );
  });
});

describe("professionalSignatureLines", () => {
  it("completo: dos líneas", () => {
    expect(professionalSignatureLines({ title: "Lic.", name: "Daiana Ponce", licenseNumber: "M.P. 852" })).toEqual({
      nameLine: "Lic. Daiana Ponce",
      licenseLine: "M.P. 852",
    });
  });
  it("sin título", () => {
    expect(professionalSignatureLines({ title: null, name: "Daiana Ponce", licenseNumber: "M.P. 852" })).toEqual({
      nameLine: "Daiana Ponce",
      licenseLine: "M.P. 852",
    });
  });
  it.each([null, "", "  "])("matrícula %j → licenseLine null", (licenseNumber) => {
    expect(professionalSignatureLines({ title: "Lic.", name: "Daiana Ponce", licenseNumber })).toEqual({
      nameLine: "Lic. Daiana Ponce",
      licenseLine: null,
    });
  });
  it("recorta la matrícula y deja intacta una compuesta", () => {
    expect(professionalSignatureLines({ title: "Lic.", name: "D", licenseNumber: "  M.P. 852 " }).licenseLine).toBe("M.P. 852");
    expect(
      professionalSignatureLines({ title: "Lic.", name: "D", licenseNumber: "M.P. 852 · M.N. 1234" }).licenseLine,
    ).toBe("M.P. 852 · M.N. 1234");
  });
});

describe("detectSignatureImageMime", () => {
  it("PNG y JPEG reales", () => {
    expect(detectSignatureImageMime(PNG_BYTES)).toBe("image/png");
    expect(detectSignatureImageMime(JPEG_BYTES)).toBe("image/jpeg");
  });
  it.each([
    ["PDF", ascii("%PDF-1.7\n%âãÏÓ")],
    ["GIF", ascii("GIF89a\x01\x00\x01\x00")],
    ["WEBP", ascii("RIFF\x24\x00\x00\x00WEBPVP8 ")],
    ["SVG", ascii('<svg xmlns="http://www.w3.org/2000/svg"></svg>')],
    ["HTML", ascii("<html><body>hola</body></html>")],
    ["vacío", new Uint8Array(0)],
    ["PNG cortado", Uint8Array.from([0x89, 0x50, 0x4e])],
    ["PNG con un byte de la firma cambiado", Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0b, 0, 0])],
  ])("%s → null", (_label, bytes) => {
    expect(detectSignatureImageMime(bytes)).toBeNull();
  });
});

describe("validateSignatureImage", () => {
  it("vacío", () => {
    expect(validateSignatureImage(new Uint8Array(0))).toEqual({ ok: false, error: "Elegí una imagen" });
  });
  it("PNG de exactamente 1 MB pasa", () => {
    expect(validateSignatureImage(sized(PNG_BYTES, 1_048_576))).toEqual({ ok: true, mimeType: "image/png" });
  });
  it("un byte más que 1 MB no pasa", () => {
    expect(validateSignatureImage(sized(PNG_BYTES, 1_048_577))).toEqual({ ok: false, error: "La imagen pesa más de 1 MB" });
  });
  it("JPEG chico pasa con su tipo", () => {
    expect(validateSignatureImage(JPEG_BYTES)).toEqual({ ok: true, mimeType: "image/jpeg" });
  });
  it("PDF chico → formato inválido", () => {
    expect(validateSignatureImage(ascii("%PDF-1.7 hola"))).toEqual({ ok: false, error: "Formato inválido (usá PNG o JPG)" });
  });
  it("PDF de más de 1 MB → primero el tamaño", () => {
    expect(validateSignatureImage(sized(ascii("%PDF-1.7"), 1_048_577))).toEqual({
      ok: false,
      error: "La imagen pesa más de 1 MB",
    });
  });
});

describe("signatureImageSizeError", () => {
  it.each([
    [0, "Elegí una imagen"],
    [1, null],
    [1_048_576, null],
    [1_048_577, "La imagen pesa más de 1 MB"],
  ])("%d → %j", (size, expected) => {
    expect(signatureImageSizeError(size)).toBe(expected);
  });
  it("el tope es 1.048.576 bytes", () => {
    expect(SIGNATURE_IMAGE_MAX_BYTES).toBe(1_048_576);
  });
});

describe("logo (sección 16, P4)", () => {
  it("tope de 2 MB", () => {
    expect(LOGO_IMAGE_MAX_BYTES).toBe(2_097_152);
    expect(logoImageSizeError(0)).toBe("Elegí una imagen");
    expect(logoImageSizeError(2_097_152)).toBeNull();
    expect(logoImageSizeError(2_097_153)).toBe("La imagen pesa más de 2 MB");
  });
  it("PNG y JPG pasan con el tipo detectado; un PNG de 1,5 MB también (el tope del logo es otro)", () => {
    expect(validateLogoImage(PNG_BYTES)).toEqual({ ok: true, mimeType: "image/png" });
    expect(validateLogoImage(JPEG_BYTES)).toEqual({ ok: true, mimeType: "image/jpeg" });
    expect(validateLogoImage(sized(PNG_BYTES, 1_572_864))).toEqual({ ok: true, mimeType: "image/png" });
  });
  it("WEBP, SVG y PDF se rechazan por magic bytes", () => {
    for (const bytes of [ascii("RIFF\x24\x00\x00\x00WEBPVP8 "), ascii("<svg></svg>"), ascii("%PDF-1.7")]) {
      expect(validateLogoImage(bytes)).toEqual({ ok: false, error: "Formato inválido (usá PNG o JPG)" });
    }
  });
  it("más de 2 MB → error de tamaño antes que el de tipo", () => {
    expect(validateLogoImage(sized(ascii("RIFF"), 2_097_153))).toEqual({ ok: false, error: "La imagen pesa más de 2 MB" });
  });
  it("isPdfDrawableImageMime", () => {
    expect(isPdfDrawableImageMime("image/png")).toBe(true);
    expect(isPdfDrawableImageMime("image/jpeg")).toBe(true);
    expect(isPdfDrawableImageMime("image/webp")).toBe(false);
    expect(isPdfDrawableImageMime(null)).toBe(false);
  });
  it("professionalLogoNotice: aviso solo con un logo que no se dibuja", () => {
    expect(professionalLogoNotice(null)).toBeNull();
    expect(professionalLogoNotice("image/png")).toBeNull();
    expect(professionalLogoNotice("image/jpeg")).toBeNull();
    const msg = "Tu logo está en un formato que no sale en los PDF. Volvé a subirlo en PNG o JPG.";
    expect(professionalLogoNotice("image/webp")).toBe(msg);
    expect(professionalLogoNotice("image/gif")).toBe(msg);
  });
});

describe("professionalDataMissingNotice", () => {
  it("nada faltante → null", () => {
    expect(professionalDataMissingNotice({ licenseMissing: false, signatureMissing: false })).toBeNull();
  });
  it("solo matrícula", () => {
    expect(professionalDataMissingNotice({ licenseMissing: true, signatureMissing: false })).toBe(
      "Tu matrícula no está cargada. Completala en Ajustes para que aparezca en tus PDF.",
    );
  });
  it("solo firma", () => {
    expect(professionalDataMissingNotice({ licenseMissing: false, signatureMissing: true })).toBe(
      "Tu firma no está cargada. Subila en Ajustes para que aparezca en tus PDF.",
    );
  });
  it("las dos", () => {
    expect(professionalDataMissingNotice({ licenseMissing: true, signatureMissing: true })).toBe(
      "Tu matrícula y tu firma no están cargadas. Completalas en Ajustes para que aparezcan en tus PDF.",
    );
  });
  it("los textos de la tarjeta son los de la SDD", () => {
    expect(PROFESSIONAL_TEXT.cardDescription).toBe(
      "Tu título, matrícula y firma aparecen en el informe antropométrico, y tu título y matrícula en el portal del paciente.",
    );
    expect(PROFESSIONAL_TEXT.removeConfirmTitle).toBe("¿Quitar tu firma?");
  });
});
