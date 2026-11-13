import "server-only";
import {
  isPdfDrawableImageMime,
  professionalDisplayName,
  professionalSignature,
  professionalSignatureLines,
} from "@nutri-bot/core";
import { getProfessionalPdfAssets } from "@nutri-bot/db/domain";
import type { PdfImage, PdfSignatureInput } from "@/lib/pdf-common";

// HU-016: lo que pone cualquier PDF sobre la profesional (encabezado, pie, logo y bloque de firma).
// Es el único punto que va a llamar el PDF del plan después de la HU-015 (sección 12 de la SDD).
// D10: no loguea nada; la firma solo sale de acá hacia el PDF.

export type ProfessionalPdfBranding = {
  displayName: string; // professionalDisplayName → encabezado (brandName) y metadato author
  footerSignature: string; // professionalSignature → pie del informe (y pie default del plan, D5)
  logo: PdfImage | null;
  signature: PdfSignatureInput; // → <PdfSignatureBlock>
  accentColor: string | null;
  footerText: string | null; // pdfFooterText de /ajustes (lo usa el plan)
};

/** Sección 16 (P4): una imagen que react-pdf no dibuja (p. ej. un logo WEBP viejo) no se manda. */
function drawable(img: PdfImage | null): PdfImage | null {
  return img && isPdfDrawableImageMime(img.mimeType) ? img : null;
}

export async function loadProfessionalPdfBranding(): Promise<ProfessionalPdfBranding> {
  const a = await getProfessionalPdfAssets();
  const identity = { title: a.title, name: a.name, licenseNumber: a.licenseNumber };
  const lines = professionalSignatureLines(identity);
  return {
    displayName: professionalDisplayName(identity),
    footerSignature: professionalSignature(identity),
    logo: drawable(a.logo),
    signature: { image: drawable(a.signature), nameLine: lines.nameLine, licenseLine: lines.licenseLine },
    accentColor: a.pdfAccentColor,
    footerText: a.pdfFooterText,
  };
}
