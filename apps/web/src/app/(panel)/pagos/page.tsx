import { prisma } from "@nutri-bot/db";
import { listPendingPayments, listApprovedPaymentsInRange } from "@nutri-bot/db/domain";
import { formatDateTime, formatInTimeZone, formatPrice } from "@nutri-bot/core";
import { Card, PageHeader, StatTile } from "@/components/ui";
import { getProfessional } from "@/lib/professional";
import { ManualPaymentDialog } from "./manual-payment-dialog";
import type { AppointmentOption } from "./manual-payment-form";
import { PaymentsTable, type PaymentRow } from "./payments-table";

export const dynamic = "force-dynamic";

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

  // Presentación sobre los mismos datos (reordenamiento 3): totales arriba y una sola tabla.
  const tz = pro.timezone;
  const pendingTotal = pending.reduce((s, p) => s + Number(p.amount), 0);
  const manualCount = approvedThisMonth.filter((p) => p.provider === "manual").length;
  const mpCount = approvedThisMonth.length - manualCount;

  const toRow = (p: (typeof pending)[number] | (typeof approvedThisMonth)[number], status: PaymentRow["status"]): PaymentRow => {
    const date = status === "APPROVED" ? (p.paidAt ?? p.createdAt) : p.createdAt;
    return {
      id: p.id,
      status,
      patient: p.appointment.patient.name ?? p.appointment.patient.phone,
      service: p.appointment.service.name,
      appointmentLabel: formatInTimeZone(p.appointment.startsAt, tz, "dd/MM/yyyy HH:mm"),
      dateISO: date.toISOString(),
      dateLabel: formatInTimeZone(date, tz, "dd/MM/yyyy"),
      kind: p.kind,
      provider: p.provider === "manual" ? "manual" : "mercadopago",
      amount: Number(p.amount),
      amountLabel: formatPrice(p.amount.toString(), pro.currency),
    };
  };
  const rows: PaymentRow[] = [
    ...pending.map((p) => toRow(p, "PENDING")),
    ...approvedThisMonth.map((p) => toRow(p, "APPROVED")),
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        title="Pagos"
        description="Señas cobradas por Mercado Pago y facturación del mes."
        action={<ManualPaymentDialog appointments={appointmentOptions} />}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label="Cobrado este mes" value={formatPrice(totalThisMonth, pro.currency)} />
        <StatTile label="Pendiente de confirmar" value={formatPrice(pendingTotal, pro.currency)}>
          <p className="mt-1 text-xs text-muted-foreground">
            {pending.length} seña{pending.length === 1 ? "" : "s"} esperando
          </p>
        </StatTile>
        <StatTile label="Pagos del mes" value={approvedThisMonth.length}>
          <p className="mt-1 text-xs text-muted-foreground">
            {mpCount} Mercado Pago · {manualCount} manual{manualCount === 1 ? "" : "es"}
          </p>
        </StatTile>
      </div>

      <Card title="Pagos" description="Pendientes de confirmar y pagos acreditados este mes." padding="none">
        <PaymentsTable rows={rows} />
      </Card>
    </div>
  );
}
