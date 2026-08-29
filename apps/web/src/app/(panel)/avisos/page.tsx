import { prisma } from "@nutri-bot/db";
import { formatInTimeZone } from "@nutri-bot/core";
import { Badge, Card, PageHeader } from "@/components/ui";
import { AutoRefresh } from "@/components/auto-refresh";
import { getProfessional } from "@/lib/professional";
import { jidToPhone } from "@/lib/patients";
import { RetryButton } from "./retry-button";

export const dynamic = "force-dynamic";

const kindLabel: Record<string, string> = {
  CONFIRMATION: "Confirmación",
  CANCELLATION: "Cancelación",
  REMINDER: "Recordatorio",
  PROFESSIONAL_ALERT: "Alerta a la profesional",
  AD_HOC: "Manual",
};

const statusTone = { PENDING: "amber", SENT: "green", FAILED: "red" } as const;

export default async function AvisosPage() {
  const [pro, messages] = await Promise.all([
    getProfessional(),
    prisma.outboundMessage.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
  ]);

  return (
    <div>
      <AutoRefresh seconds={8} />
      <PageHeader
        title="Avisos"
        description="Cola de mensajes que envía el bot. Los recordatorios se generan automáticamente."
      />
      <Card>
        {messages.length === 0 ? (
          <p className="text-sm text-slate-500">No hay mensajes todavía.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {messages.map((m) => (
              <li key={m.id} className="flex items-start justify-between gap-4 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge tone={statusTone[m.status]}>{m.status}</Badge>
                    <span className="text-sm font-medium">{kindLabel[m.kind] ?? m.kind}</span>
                    <span className="text-xs text-slate-400">→ {jidToPhone(m.toJid)}</span>
                  </div>
                  <p className="mt-1 truncate text-sm text-slate-600">{m.body}</p>
                  {m.lastError ? (
                    <p className="mt-1 text-xs text-red-500">Error: {m.lastError}</p>
                  ) : null}
                </div>
                <div className="flex flex-col items-end gap-1 whitespace-nowrap">
                  <span className="text-xs text-slate-400">
                    {formatInTimeZone(m.createdAt, pro.timezone, "dd/MM HH:mm")}
                  </span>
                  {m.status === "FAILED" ? <RetryButton id={m.id} /> : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
