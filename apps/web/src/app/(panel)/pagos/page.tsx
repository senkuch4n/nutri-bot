import { prisma } from "@nutri-bot/db";
import { listPendingPayments, listApprovedPaymentsInRange } from "@nutri-bot/db/domain";
import { formatDate, formatDateTime, formatPrice } from "@nutri-bot/core";
import { Badge, Card, PageHeader, SectionLabel } from "@/components/ui";
import { getProfessional } from "@/lib/professional";
import { ManualPaymentForm, type AppointmentOption } from "./manual-payment-form";

export const dynamic = "force-dynamic";

const kindLabel = { DEPOSIT: "Seña", FULL: "Total" } as const;

export default async function PagosPage() {
  const pro = await getProfessional();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const [pending, approvedThisMonth, recentAppointments] = await Promise.all([
    listPendingPayments(),
    listApprovedPaymentsInRange(monthStart, monthEnd),
    prisma.appointment.findMany({
      where: {
        status: "CONFIRMED",
        startsAt: {
          gte: new Date(now.getTime() - 7 * 86_400_000),
          lte: new Date(now.getTime() + 7 * 86_400_000),
        },
      },
      include: { patient: true, service: true },
      orderBy: { startsAt: "desc" },
      take: 50,
    }),
  ]);

  const totalThisMonth = approvedThisMonth.reduce((sum, p) => sum + Number(p.amount), 0);

  const appointmentOptions: AppointmentOption[] = recentAppointments.map((a) => ({
    id: a.id,
    priceSnapshot: a.priceSnapshot.toString(),
    label: `${a.patient.name ?? a.patient.phone} · ${a.service.name} · ${formatDateTime(a.startsAt, pro.timezone)}`,
  }));

  return (
    <div className="space-y-8">
      <PageHeader
        title="Pagos"
        description="Señas cobradas por Mercado Pago y facturación del mes."
      />

      <div className="border border-line bg-paper px-5 py-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
          Cobrado este mes
        </p>
        <p className="mt-1 font-display text-3xl font-bold text-ink">
          {formatPrice(totalThisMonth, pro.currency)}
        </p>
      </div>

      <Card>
        <SectionLabel>Pagos pendientes ({pending.length})</SectionLabel>
        {pending.length === 0 ? (
          <p className="text-sm text-ink-faint">No hay señas esperando confirmación.</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {pending.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="font-medium text-ink">
                    {p.appointment.patient.name ?? p.appointment.patient.phone}
                    <span className="mx-1.5 text-ink-faint">·</span>
                    {p.appointment.service.name}
                  </p>
                  <p className="text-xs text-ink-faint">
                    {formatDateTime(p.appointment.startsAt, pro.timezone)} hs · esperando desde{" "}
                    {formatDateTime(p.createdAt, pro.timezone)}
                  </p>
                </div>
                <Badge tone="amber">{formatPrice(p.amount.toString(), pro.currency)}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <SectionLabel>Registrar pago manual (efectivo, transferencia)</SectionLabel>
        <ManualPaymentForm appointments={appointmentOptions} />
      </Card>

      <Card>
        <SectionLabel>Pagos del mes ({approvedThisMonth.length})</SectionLabel>
        {approvedThisMonth.length === 0 ? (
          <p className="text-sm text-ink-faint">Todavía no hay pagos acreditados este mes.</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {approvedThisMonth.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="font-medium text-ink">
                    {p.appointment.patient.name ?? p.appointment.patient.phone}
                    <span className="mx-1.5 text-ink-faint">·</span>
                    {p.appointment.service.name}
                  </p>
                  <p className="text-xs text-ink-faint">
                    {p.paidAt ? formatDate(p.paidAt, pro.timezone) : ""} · {kindLabel[p.kind]} ·{" "}
                    {p.provider === "manual" ? "Manual" : "Mercado Pago"}
                  </p>
                </div>
                <span className="font-semibold text-ink">
                  {formatPrice(p.amount.toString(), pro.currency)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
