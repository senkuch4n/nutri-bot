import { countInquiriesByStatus, listInquiries } from "@nutri-bot/db/domain";
import { formatInTimeZone } from "@nutri-bot/core";
import { PageHeader } from "@/components/ui";
import { getProfessional } from "@/lib/professional";
import { MensajesView, type InquiryRow } from "./mensajes-view";

export const dynamic = "force-dynamic";

/** HU-011: bandeja de consultas que dejan los pacientes por WhatsApp (opción 0 del bot). */
export default async function MensajesPage() {
  const [pro, inquiries, counts] = await Promise.all([
    getProfessional(),
    listInquiries(),
    countInquiriesByStatus(),
  ]);
  const tz = pro.timezone;

  const rows: InquiryRow[] = inquiries.map((i) => {
    const phone = i.patient.phone.replace(/\D/g, "");
    return {
      id: i.id,
      status: i.status,
      patientId: i.patient.id,
      patientLabel: i.patient.name ?? i.patient.phone,
      phone: i.patient.phone,
      waUrl: `https://wa.me/${phone}`,
      receivedLabel: formatInTimeZone(i.receivedAt, tz, "dd/MM · HH:mm"),
      receivedSort: i.receivedAt.getTime(),
      lastMessageLabel:
        i.lastMessageAt.getTime() - i.receivedAt.getTime() >= 60_000
          ? `últ. mensaje ${formatInTimeZone(i.lastMessageAt, tz, "HH:mm")}`
          : null,
      answeredLabel: i.answeredAt ? `Respondida ${formatInTimeZone(i.answeredAt, tz, "dd/MM · HH:mm")}` : null,
      afterHours: i.receivedAfterHours,
      body: i.body,
    };
  });

  return (
    <div>
      <PageHeader
        title="Mensajes"
        description="Lo que te dejaron los pacientes por WhatsApp con la opción “Hablar con la nutricionista”. Respondé desde WhatsApp y marcala como respondida."
      />
      <MensajesView rows={rows} counts={counts} />
    </div>
  );
}
