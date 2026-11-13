import { prisma } from "../index";

export function updateProfessionalLogo(data: { logoData: Buffer; logoMimeType: string }) {
  return prisma.professional.update({ where: { id: 1 }, data, select: { id: true } });
}

export function removeProfessionalLogo() {
  return prisma.professional.update({
    where: { id: 1 },
    data: { logoData: null, logoMimeType: null },
    select: { id: true },
  });
}

// --- HU-016: firma (D10: dato sensible; nunca se loguea ni sale de estas funciones salvo al PDF) ---

export type ProfessionalImage = { data: Buffer; mimeType: string };

function toImage(data: Buffer | Uint8Array | null, mimeType: string | null): ProfessionalImage | null {
  if (!data || data.length === 0 || !mimeType) return null;
  return { data: Buffer.isBuffer(data) ? data : Buffer.from(data), mimeType };
}

/** Solo la vista previa del panel. null si falta cualquiera de las dos columnas. */
export async function getProfessionalSignatureImage(): Promise<ProfessionalImage | null> {
  const row = await prisma.professional.findUnique({
    where: { id: 1 },
    select: { signatureData: true, signatureMimeType: true },
  });
  if (!row) return null;
  return toImage(row.signatureData, row.signatureMimeType);
}

/** Reemplaza la firma (sin historial, D4). Devuelve void: select { id: true } para no traer bytes. */
export async function updateProfessionalSignature(input: {
  data: Buffer;
  mimeType: "image/png" | "image/jpeg";
}): Promise<void> {
  await prisma.professional.update({
    where: { id: 1 },
    data: { signatureData: input.data, signatureMimeType: input.mimeType },
    select: { id: true },
  });
}

export async function removeProfessionalSignature(): Promise<void> {
  await prisma.professional.update({
    where: { id: 1 },
    data: { signatureData: null, signatureMimeType: null },
    select: { id: true },
  });
}

/** Lo que necesita un PDF (informe hoy; plan después de la HU-015). Una sola consulta. */
export async function getProfessionalPdfAssets(): Promise<{
  name: string;
  title: string | null;
  licenseNumber: string | null;
  pdfAccentColor: string | null;
  pdfFooterText: string | null;
  logo: ProfessionalImage | null;
  signature: ProfessionalImage | null;
}> {
  const row = await prisma.professional.findUniqueOrThrow({
    where: { id: 1 },
    select: {
      name: true,
      title: true,
      licenseNumber: true,
      pdfAccentColor: true,
      pdfFooterText: true,
      logoData: true,
      logoMimeType: true,
      signatureData: true,
      signatureMimeType: true,
    },
  });
  return {
    name: row.name,
    title: row.title,
    licenseNumber: row.licenseNumber,
    pdfAccentColor: row.pdfAccentColor,
    pdfFooterText: row.pdfFooterText,
    logo: toImage(row.logoData, row.logoMimeType),
    signature: toImage(row.signatureData, row.signatureMimeType),
  };
}
