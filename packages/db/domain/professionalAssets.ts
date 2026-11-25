import { prisma } from "../index";
import { resolvePrimaryAgenda, type TenantRef } from "./tenantScope";

// HU-025 (4.4): los activos son de la profesional de la agenda principal del consultorio `t`
// (antes, Professional(1)). Toda escritura va con la clave compuesta id + tenantId.

async function tenantProfessionalKey(t: TenantRef) {
  const { professionalId } = await resolvePrimaryAgenda(prisma, t.tenantId, { id: true } as const);
  return { id_tenantId: { id: professionalId, tenantId: t.tenantId } };
}

export async function updateProfessionalLogo(t: TenantRef, data: { logoData: Buffer; logoMimeType: string }) {
  return prisma.professional.update({ where: await tenantProfessionalKey(t), data, select: { id: true } });
}

export async function removeProfessionalLogo(t: TenantRef) {
  return prisma.professional.update({
    where: await tenantProfessionalKey(t),
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
export async function getProfessionalSignatureImage(t: TenantRef): Promise<ProfessionalImage | null> {
  const row = await prisma.professional.findUnique({
    where: await tenantProfessionalKey(t),
    select: { signatureData: true, signatureMimeType: true },
  });
  if (!row) return null;
  return toImage(row.signatureData, row.signatureMimeType);
}

/** Reemplaza la firma (sin historial, D4). Devuelve void: select { id: true } para no traer bytes. */
export async function updateProfessionalSignature(t: TenantRef, input: {
  data: Buffer;
  mimeType: "image/png" | "image/jpeg";
}): Promise<void> {
  await prisma.professional.update({
    where: await tenantProfessionalKey(t),
    data: { signatureData: input.data, signatureMimeType: input.mimeType },
    select: { id: true },
  });
}

export async function removeProfessionalSignature(t: TenantRef): Promise<void> {
  await prisma.professional.update({
    where: await tenantProfessionalKey(t),
    data: { signatureData: null, signatureMimeType: null },
    select: { id: true },
  });
}

/** Lo que necesita un PDF (informe hoy; plan después de la HU-015). Una sola consulta. */
export async function getProfessionalPdfAssets(t: TenantRef): Promise<{
  name: string;
  title: string | null;
  licenseNumber: string | null;
  pdfAccentColor: string | null;
  pdfFooterText: string | null;
  logo: ProfessionalImage | null;
  signature: ProfessionalImage | null;
}> {
  const row = await prisma.professional.findUniqueOrThrow({
    where: await tenantProfessionalKey(t),
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
