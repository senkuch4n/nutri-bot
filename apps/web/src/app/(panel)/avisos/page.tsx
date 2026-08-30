import { prisma } from "@nutri-bot/db";
import { formatInTimeZone } from "@nutri-bot/core";
import { PageHeader } from "@/components/ui";
import { getProfessional } from "@/lib/professional";
import { jidToPhone } from "@/lib/patients";
import { AvisosView, type MessageRow } from "./avisos-view";

export const dynamic = "force-dynamic";

const kindLabel: Record<string, string> = {
  CONFIRMATION: "Confirmación",
  CANCELLATION: "Cancelación",
  REMINDER: "Recordatorio",
  PROFESSIONAL_ALERT: "Alerta a la profesional",
  AD_HOC: "Manual",
};

export default async function AvisosPage() {
  const [pro, messages, grouped] = await Promise.all([
    getProfessional(),
    prisma.outboundMessage.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.outboundMessage.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);

  const counts = { PENDING: 0, SENT: 0, FAILED: 0 };
  for (const g of grouped) counts[g.status] = g._count._all;

  const rows: MessageRow[] = messages.map((m) => ({
    id: m.id,
    status: m.status,
    kind: kindLabel[m.kind] ?? m.kind,
    to: jidToPhone(m.toJid),
    body: m.body,
    error: m.lastError,
    at: formatInTimeZone(m.createdAt, pro.timezone, "dd/MM · HH:mm"),
  }));

  return (
    <div>
      <PageHeader
        title="Avisos"
        description="Cola de mensajes que envía el bot: confirmaciones, cancelaciones y recordatorios."
      />
      <AvisosView rows={rows} counts={counts} intervalSeconds={8} />
    </div>
  );
}
