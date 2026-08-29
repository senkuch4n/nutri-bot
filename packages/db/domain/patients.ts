import { prisma } from "../index";

/** Normaliza un teléfono a JID de WhatsApp: solo dígitos + sufijo. */
export function phoneToJid(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return `${digits}@s.whatsapp.net`;
}

export function jidToPhone(jid: string): string {
  return jid.split("@")[0] ?? jid;
}

export async function findOrCreatePatient(params: { phone: string; name?: string }) {
  const whatsappJid = phoneToJid(params.phone);
  const digits = whatsappJid.split("@")[0]!;
  return prisma.patient.upsert({
    where: { whatsappJid },
    update: params.name ? { name: params.name } : {},
    create: { whatsappJid, phone: digits, name: params.name ?? null },
  });
}

export async function findOrCreatePatientByJid(jid: string) {
  const digits = jidToPhone(jid);
  return prisma.patient.upsert({
    where: { whatsappJid: jid },
    update: {},
    create: { whatsappJid: jid, phone: digits },
  });
}
