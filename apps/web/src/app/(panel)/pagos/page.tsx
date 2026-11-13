import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { prisma } from "@nutri-bot/db";
import { listApprovedPaymentsInRange, listPendingPayments } from "@nutri-bot/db/domain";
import {
  APPOINTMENT_STATUS_TEXT,
  PAYMENT_TEXT,
  appointmentDayTime,
  computeDepositAmount,
  formatPrice,
  isValidMonthKey,
  monthKeyInTz,
  monthName,
  monthRangeInTz,
  monthTitle,
  patientDisplayName,
  shiftMonthKey,
  type DepositKind,
} from "@nutri-bot/core";
import { Metric, PageHeader, cn } from "@/components/ui";
import { getProfessional } from "@/lib/professional";
import { ManualPaymentDialog } from "./manual-payment-dialog";
import type { AppointmentOption } from "./manual-payment-form";
import { PaymentsTable, type PaymentRow } from "./payments-table";

export const dynamic = "force-dynamic";

const navButton =
  "inline-flex size-11 items-center justify-center rounded-full text-primary press-none transition-colors duration-hover hover:bg-overlay-hover pressed:bg-overlay-pressed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/** `?mes=yyyy-MM` (D12). Inválido o futuro → el mes en curso, en la zona de la profesional. */
function resolveMonth(raw: string | string[] | undefined, current: string): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || !isValidMonthKey(value) || value > current) return current;
  return value;
}

function monthHref(key: string, current: string): string {
  return key === current ? "/pagos" : `/pagos?mes=${key}`;
}

export default async function PagosPage({ searchParams }: { searchParams: Promise<{ mes?: string | string[] }> }) {
  const [pro, { mes }] = await Promise.all([getProfessional(), searchParams]);
  const tz = pro.timezone;
  const now = new Date();
  const currentMonth = monthKeyInTz(now, tz);
  const month = resolveMonth(mes, currentMonth);
  const { from, to } = monthRangeInTz(month, tz);
  const prevMonth = shiftMonthKey(month, -1);
  const nextMonth = shiftMonthKey(month, 1);
  const isCurrent = month === currentMonth;

  const [pending, approvedInMonth, recentAppointments] = await Promise.all([
    listPendingPayments(),
    // El dominio filtra con `lte`: se resta 1 ms para que el rango quede [1°, 1° del siguiente).
    listApprovedPaymentsInRange(from, new Date(to.getTime() - 1)),
    // D9: turnos confirmados y los que ya vinieron, de la última semana y de la próxima.
    prisma.appointment.findMany({
      where: {
        status: { in: ["CONFIRMED", "COMPLETED"] },
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

  const appointmentOptions: AppointmentOption[] = recentAppointments.map((a) => {
    const patientLabel = patientDisplayName(a.patient);
    const price = Number(a.priceSnapshot);
    const deposit =
      a.service.requiresDeposit && a.service.depositKind && a.service.depositValue
        ? computeDepositAmount(price, a.service.depositKind as DepositKind, Number(a.service.depositValue))
        : 0;
    return {
      id: a.id,
      priceSnapshot: a.priceSnapshot.toString(),
      depositAmount: deposit > 0 ? String(deposit) : undefined,
      patientLabel,
      label: `${patientLabel} · ${a.service.name} · ${appointmentDayTime(a.startsAt, now, tz)} · ${APPOINTMENT_STATUS_TEXT[a.status]}`,
    };
  });

  const collected = approvedInMonth.reduce((sum, p) => sum + Number(p.amount), 0);
  const pendingTotal = pending.reduce((s, p) => s + Number(p.amount), 0);
  const manualCount = approvedInMonth.filter((p) => p.provider === "manual").length;
  const mpCount = approvedInMonth.length - manualCount;

  const toRow = (p: (typeof pending)[number], status: PaymentRow["status"]): PaymentRow => {
    const date = status === "APPROVED" ? (p.paidAt ?? p.createdAt) : p.createdAt;
    return {
      id: p.id,
      status,
      patient: patientDisplayName(p.appointment.patient),
      service: p.appointment.service.name,
      appointmentLabel: appointmentDayTime(p.appointment.startsAt, now, tz),
      dateISO: date.toISOString(),
      kind: p.kind,
      provider: p.provider === "manual" ? "manual" : "mercadopago",
      amountLabel: formatPrice(p.amount.toString(), pro.currency),
    };
  };
  const rows: PaymentRow[] = [
    ...pending.map((p) => toRow(p, "PENDING")),
    ...approvedInMonth.map((p) => toRow(p, "APPROVED")),
  ];

  const title = monthTitle(month);
  return (
    <div>
      <PageHeader
        title="Pagos"
        description="Lo que cobraste por mes: señas de Mercado Pago y pagos que registrás a mano."
        action={<ManualPaymentDialog appointments={appointmentOptions} currency={pro.currency} />}
      />

      <nav aria-label="Mes" className="mb-6 flex items-center gap-1">
        <Link href={monthHref(prevMonth, currentMonth)} className={navButton} aria-label={`Mes anterior: ${monthTitle(prevMonth)}`} title="Mes anterior">
          <ChevronLeft className="size-5" strokeWidth={2} aria-hidden />
        </Link>
        <h2 className="min-w-40 text-center text-title-3 tabular-nums" aria-live="polite">
          {title}
        </h2>
        {isCurrent ? (
          <button type="button" disabled className={cn(navButton, "disabled:opacity-30")} aria-label="Mes siguiente (es el mes en curso)" title="Es el mes en curso">
            <ChevronRight className="size-5" strokeWidth={2} aria-hidden />
          </button>
        ) : (
          <Link href={monthHref(nextMonth, currentMonth)} className={navButton} aria-label={`Mes siguiente: ${monthTitle(nextMonth)}`} title="Mes siguiente">
            <ChevronRight className="size-5" strokeWidth={2} aria-hidden />
          </Link>
        )}
      </nav>

      <div className="mb-8 grid gap-4 rounded-xl bg-card p-5 shadow-card more-contrast:border more-contrast:border-input sm:grid-cols-3">
        <Metric
          label={PAYMENT_TEXT.collectedIn(monthName(month))}
          value={collected}
          valueText={formatPrice(collected, pro.currency)}
          size="lg"
        />
        <Metric
          label={PAYMENT_TEXT.pendingDeposits}
          value={pendingTotal}
          valueText={formatPrice(pendingTotal, pro.currency)}
          caption={pending.length === 0 ? "ninguna" : pending.length === 1 ? "1 seña" : `${pending.length} señas`}
        />
        <Metric
          label={PAYMENT_TEXT.count}
          value={approvedInMonth.length}
          decimals={0}
          caption={`${mpCount} Mercado Pago · ${manualCount} efectivo o transferencia`}
        />
      </div>

      <PaymentsTable rows={rows} monthLabel={monthName(month)} />
    </div>
  );
}
