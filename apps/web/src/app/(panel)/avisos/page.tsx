import { prisma, type MessageKind } from "@nutri-bot/db";
import {
  MESSAGE_KIND_TEXT,
  OUTBOX_TEXT,
  broadcastRecipients,
  calendarDaysBetween,
  dayKeyInTz,
  formatInTimeZone,
  outboxRecipientLabel,
} from "@nutri-bot/core";
import { PageHeader } from "@/components/ui";
import { getProfessional } from "@/lib/professional";
import { AvisosView, type MessageRow } from "./avisos-view";
import { BroadcastForm } from "./broadcast-form";

export const dynamic = "force-dynamic";

// Un valor nuevo del enum rompe el typecheck acá (SDD 4.1 de 017b-3).
const KIND_TEXT = MESSAGE_KIND_TEXT satisfies Record<MessageKind, string>;

/** "hoy, 10:02" · "ayer, 18:30" · "02/10, 9:15" · "02/10/2025, 9:15". */
function whenText(at: Date, now: Date, tz: string): string {
  const time = formatInTimeZone(at, tz, "H:mm");
  const days = calendarDaysBetween(dayKeyInTz(at, tz), dayKeyInTz(now, tz));
  if (days <= 0) return `hoy, ${time}`;
  if (days === 1) return `ayer, ${time}`;
  const sameYear = dayKeyInTz(at, tz).slice(0, 4) === dayKeyInTz(now, tz).slice(0, 4);
  return `${formatInTimeZone(at, tz, sameYear ? "dd/MM" : "dd/MM/yyyy")}, ${time}`;
}

export default async function AvisosPage() {
  const [pro, messages, grouped, patients] = await Promise.all([
    getProfessional(),
    prisma.outboundMessage.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.outboundMessage.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.patient.findMany({ select: { whatsappJid: true } }),
  ]);

  // D13: el mismo número que encola el comunicado (solo personas, sin repetidos).
  const recipientCount = broadcastRecipients(patients.map((p) => p.whatsappJid)).length;

  const counts = { PENDING: 0, SENT: 0, FAILED: 0 };
  for (const g of grouped) counts[g.status] = g._count._all;

  // Nombres por toJid, solo de los 100 mensajes de la lista.
  const jids = [...new Set(messages.map((m) => m.toJid))];
  const named = jids.length
    ? await prisma.patient.findMany({
        where: { whatsappJid: { in: jids } },
        select: { whatsappJid: true, name: true, phone: true },
      })
    : [];
  const nameByJid = new Map(named.map((p) => [p.whatsappJid, p.name]));

  const now = new Date();
  const rows: MessageRow[] = messages.map((m) => ({
    id: m.id,
    status: m.status,
    kindLabel: KIND_TEXT[m.kind],
    to: outboxRecipientLabel({
      toJid: m.toJid,
      patientName: nameByJid.get(m.toJid) ?? null,
      professionalJid: pro.phoneJid,
    }),
    body: m.body,
    error: m.lastError,
    at: whenText(m.createdAt, now, pro.timezone),
    atISO: m.createdAt.toISOString(),
  }));

  return (
    <div>
      <PageHeader title="Avisos" description="Mandá un aviso a todas tus pacientes y mirá qué mensajes mandó el bot." />

      <section aria-labelledby="comunicado-titulo" className="mb-10">
        <h2 id="comunicado-titulo" className="mb-3 text-title-3">
          {OUTBOX_TEXT.broadcastTitle}
        </h2>
        <BroadcastForm patientCount={recipientCount} />
      </section>

      <AvisosView rows={rows} counts={counts} intervalSeconds={8} />
    </div>
  );
}
