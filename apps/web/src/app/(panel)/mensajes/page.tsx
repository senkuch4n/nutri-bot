import { prisma } from "@nutri-bot/db";
import { listInquiries } from "@nutri-bot/db/domain";
import {
  HIDDEN_NUMBER_TEXT,
  calendarDaysBetween,
  capitalizeFirst,
  classifyWhatsappJid,
  dayKeyInTz,
  formatInTimeZone,
  formatPhone,
  formatTimeAgo,
  whatsappChatUrl,
} from "@nutri-bot/core";
import { getProfessional } from "@/lib/professional";
import { MensajesView, type InquiryRow } from "./mensajes-view";

export const dynamic = "force-dynamic";

/** "Hoy, 22:40" · "Ayer, 9:15" · "Hace 2 días" (en la zona de la profesional). */
function receivedText(at: Date, now: Date, tz: string): string {
  const days = calendarDaysBetween(dayKeyInTz(at, tz), dayKeyInTz(now, tz));
  const time = formatInTimeZone(at, tz, "H:mm");
  if (days <= 0) return `Hoy, ${time}`;
  if (days === 1) return `Ayer, ${time}`;
  return capitalizeFirst(formatTimeAgo(at, now, tz));
}

/** HU-011 / HU-017b-3: bandeja de consultas que dejan los pacientes por WhatsApp (opción 0 del bot). */
export default async function MensajesPage() {
  const [pro, inquiries] = await Promise.all([getProfessional(), listInquiries()]);
  const tz = pro.timezone;
  const now = new Date();

  // El JID dice si el contacto muestra el número (los @lid no): lectura solo de la web, sin tocar domain.
  const patientIds = [...new Set(inquiries.map((i) => i.patient.id))];
  const jids = patientIds.length
    ? await prisma.patient.findMany({ where: { id: { in: patientIds } }, select: { id: true, whatsappJid: true } })
    : [];
  const jidById = new Map(jids.map((p) => [p.id, p.whatsappJid]));

  const rows: InquiryRow[] = inquiries.map((i) => {
    const whatsappJid = jidById.get(i.patient.id) ?? "";
    const hidden = classifyWhatsappJid(whatsappJid) !== "phone";
    return {
      id: i.id,
      status: i.status,
      patientId: i.patient.id,
      name: i.patient.name?.trim() || null,
      phoneLabel: hidden ? HIDDEN_NUMBER_TEXT : formatPhone(i.patient.phone),
      waUrl: whatsappChatUrl({ whatsappJid, phone: i.patient.phone }),
      receivedLabel: receivedText(i.receivedAt, now, tz),
      receivedISO: i.receivedAt.toISOString(),
      answeredLabel: i.answeredAt ? `Respondida ${formatTimeAgo(i.answeredAt, now, tz)}` : null,
      answeredSort: i.answeredAt?.getTime() ?? 0,
      receivedSort: i.receivedAt.getTime(),
      afterHours: i.receivedAfterHours,
      body: i.body,
    };
  });

  return <MensajesView rows={rows} />;
}
