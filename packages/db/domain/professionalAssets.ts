import { prisma } from "../index";

export function updateProfessionalLogo(data: { logoData: Buffer; logoMimeType: string }) {
  return prisma.professional.update({ where: { id: 1 }, data });
}

export function removeProfessionalLogo() {
  return prisma.professional.update({
    where: { id: 1 },
    data: { logoData: null, logoMimeType: null },
  });
}
