"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, CalendarX, Check, RotateCw, X } from "lucide-react";
import {
  AGENDA_TEXT,
  HOME_TEXT,
  appointmentDayAtTime,
  buildAppointmentListRows,
  capitalizeFirst,
  classifyWhatsappJid,
  countAgendaDay,
  formatAppointmentWhen,
  formatPhone,
  formatPrice,
  homeDayStatus,
  patientDisplayName,
  type AppointmentListRow,
} from "@nutri-bot/core";
import { useConfirm } from "@/components/confirm";
import { Button, cn } from "@/components/ui";
import { usePendingDeletions } from "@/lib/deferred-delete";
import type { SelectedAppointment } from "../appointment-detail-sheet";
import { appointmentCancelKey, useScheduleAppointmentCancel } from "../appointment-cancel";
import { AppointmentPaymentModal } from "../appointment-payment-modal";
import { NewAppointmentModal, type ServiceOption } from "../new-appointment-modal";
import { AppointmentDetailDialog } from "../turnos/appointment-detail-dialog";
import { StatusPill } from "../turnos/appointments-table";
import { toListInput, toSelectedAppointment } from "../turnos/appointment-dto";
import type { TurnosAppointment } from "../turnos/data";

const T = HOME_TEXT;

// Paneles con el lenguaje de la ficha: el destacado tintado, el resto de contorno fino.
const PANEL = "rounded-[1.75rem] border border-black/[0.05] bg-[#fcfbfd] p-6";
const BLACK = "rounded-full bg-foreground text-background hover:bg-foreground/85 pressed:bg-foreground/75";
const QUIET = "rounded-full hover:bg-black/[0.05]";

type TodayTab = "pending" | "done";

export function HomeClient({
  greetingName,
  todayLabel,
  today,
  awaiting,
  next,
  nowISO,
  tz,
  currency,
  todayKey,
  services,
}: {
  greetingName: string | null;
  /** "Sábado, 31 de octubre". */
  todayLabel: string;
  /** Turnos de hoy que cuentan (confirmados, vinieron, no vinieron). */
  today: TurnosAppointment[];
  /** Turnos próximos esperando la seña. */
  awaiting: TurnosAppointment[];
  next: TurnosAppointment | null;
  nowISO: string;
  tz: string;
  currency: string;
  todayKey: string;
  services: ServiceOption[];
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const now = useMemo(() => new Date(nowISO), [nowISO]);
  const pending = usePendingDeletions();
  const scheduleCancel = useScheduleAppointmentCancel({ onCommitted: () => router.refresh() });

  const todayRows = useMemo(() => rowsOf(today, now, tz, currency), [today, now, tz, currency]);
  const awaitingRows = useMemo(
    () => rowsOf(awaiting.filter((a) => !pending.has(appointmentCancelKey(a.id))), now, tz, currency),
    [awaiting, pending, now, tz, currency],
  );
  const count = countAgendaDay(
    today.map((a) => ({ status: a.status, startsAt: new Date(a.startsAt) })),
    now,
  );

  const [tab, setTab] = useState<TodayTab>("pending");
  const shownToday = todayRows.filter(({ dto }) => (tab === "pending" ? dto.status === "CONFIRMED" : dto.status !== "CONFIRMED"));

  const [creating, setCreating] = useState(false);
  const [createOrigin, setCreateOrigin] = useState<HTMLElement | null>(null);
  const [selected, setSelected] = useState<SelectedAppointment | null>(null);
  const [detailOrigin, setDetailOrigin] = useState<HTMLElement | null>(null);
  const [paying, setPaying] = useState<{ dto: TurnosAppointment; row: AppointmentListRow } | null>(null);

  async function cancel(dto: TurnosAppointment, row: AppointmentListRow) {
    const ok = await confirm({
      title: AGENDA_TEXT.cancel.title(row.patientLabel),
      description: AGENDA_TEXT.cancel.description(appointmentDayAtTime(new Date(dto.startsAt), now, tz)),
      confirmLabel: AGENDA_TEXT.cancel.confirm,
      cancelLabel: AGENDA_TEXT.cancel.back,
    });
    if (ok) scheduleCancel(toSelectedAppointment(dto, row));
  }

  return (
    // Acento en negro, como la ficha y el plan (globals.css, .ink-accent).
    <div className="ink-accent">
      <h1 className="mb-6 text-title-1 font-medium">{T.navLabel}</h1>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Saludo y turnos de hoy; el botón crea un turno (el diálogo crece desde él). */}
        <section className="relative flex min-h-48 flex-col rounded-[1.75rem] bg-[#f6f5f8] p-6">
          <h2 className="text-title-2 font-semibold">{T.greeting(greetingName)}</h2>
          <p className="mt-0.5 text-callout text-muted-foreground">{todayLabel}</p>
          <p className="mt-auto pt-6 text-callout text-muted-foreground">{T.todayYouHave}</p>
          <p className="text-[2.75rem] font-semibold leading-tight tracking-tight tabular-nums">{T.todayCount(count.total)}</p>
          <Button
            type="button"
            size="icon"
            aria-label={T.newAppointment}
            className={cn(BLACK, "absolute bottom-6 right-6 size-14 [&_svg]:size-5")}
            onClick={(e) => {
              setCreateOrigin(e.currentTarget);
              setCreating(true);
            }}
          >
            <CalendarPlus aria-hidden />
          </Button>
        </section>

        <section className={cn(PANEL, "flex min-h-48 flex-col justify-center")}>
          <p className="text-title-2 font-normal text-muted-foreground">{T.todayLabel}</p>
          <p className="text-title-2 font-semibold">{homeDayStatus(count)}</p>
        </section>

        <section className={cn(PANEL, "flex min-h-48 flex-col justify-center")}>
          <p className="text-title-2 font-normal text-muted-foreground">{T.nextLabel}</p>
          {next ? (
            <>
              <p className="mt-1 truncate text-title-2 font-semibold">{patientDisplayName(next.patient)}</p>
              <p className="mt-1 text-callout text-muted-foreground">
                {formatAppointmentWhen(new Date(next.startsAt), now, tz)} · {next.service.name}
              </p>
            </>
          ) : (
            <p className="mt-1 text-title-2 font-semibold">{AGENDA_TEXT.noNext}</p>
          )}
        </section>

        {/* Turnos de hoy: pendientes (confirmados) o completados (vinieron / no vinieron). */}
        <section className={cn(PANEL, "flex min-h-[28rem] flex-col")}>
          <h2 className="text-title-2 font-medium">{T.todayListTitle}</h2>
          <div role="radiogroup" aria-label={T.todayTabs} className="mt-4 flex gap-2">
            {(["pending", "done"] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={tab === value}
                onClick={() => setTab(value)}
                className={cn(
                  "h-10 rounded-full px-4 text-callout font-medium transition-colors duration-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  tab === value ? "bg-foreground text-background" : "bg-black/[0.04] text-foreground hover:bg-black/[0.07]",
                )}
              >
                {value === "pending" ? T.pending : T.done}
              </button>
            ))}
          </div>
          {shownToday.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 py-10 text-muted-foreground">
              <CalendarX className="size-9" strokeWidth={1.5} aria-hidden />
              <p className="text-callout">{T.todayEmpty}</p>
            </div>
          ) : (
            <ul className="mt-4 space-y-2">
              {shownToday.map(({ dto, row }) => (
                <li key={dto.id}>
                  <button
                    type="button"
                    onClick={(e) => {
                      setDetailOrigin(e.currentTarget);
                      setSelected(toSelectedAppointment(dto, row));
                    }}
                    className="flex w-full items-center gap-3 rounded-2xl bg-black/[0.03] px-4 py-3 text-left transition-colors duration-hover hover:bg-black/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    <span className="w-12 shrink-0 text-callout font-medium tabular-nums">{row.timeLabel}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body">{row.patientLabel}</span>
                      <span className="block truncate text-footnote text-muted-foreground">{dto.service.name}</span>
                    </span>
                    {tab === "done" ? <StatusPill row={row} /> : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Turnos esperando la seña: «Registrar seña» los confirma; «Cancelar», con Deshacer. */}
        <section className={cn(PANEL, "flex min-h-[28rem] flex-col lg:col-span-2")}>
          <h2 className="text-title-2 font-medium">{T.awaitingTitle}</h2>
          <div className="mt-4">
            <Button type="button" variant="ghost" size="sm" className={cn(QUIET, "bg-black/[0.04]")} onClick={() => router.refresh()}>
              <RotateCw aria-hidden />
              {T.refresh}
            </Button>
          </div>
          {awaitingRows.length === 0 ? (
            <p className="flex flex-1 items-center justify-center py-10 text-callout text-muted-foreground">
              {T.awaitingEmpty}
            </p>
          ) : (
            <ul className="mt-4 space-y-3">
              {awaitingRows.map(({ dto, row }) => {
                const startsAt = new Date(dto.startsAt);
                return (
                  <li key={dto.id} className="rounded-2xl border border-black/[0.05] bg-background p-4">
                    <p className="min-w-0 truncate text-body">
                      <span className="font-medium">{row.patientLabel}</span>
                      {/* Con nombre, el teléfono al lado (sin nombre, la etiqueta ya es el teléfono). */}
                      {dto.patient.name && classifyWhatsappJid(dto.patient.whatsappJid) === "phone" ? (
                        <span className="tabular-nums text-muted-foreground">, {formatPhone(dto.patient.phone)}</span>
                      ) : null}
                    </p>
                    <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-black/[0.03] px-3 py-2.5 text-callout">
                      <span className="min-w-0 truncate tabular-nums">
                        {capitalizeFirst(formatAppointmentWhen(startsAt, now, tz))} · {dto.service.name}
                      </span>
                      {dto.depositAmount ? (
                        <span className="shrink-0 font-medium tabular-nums">
                          {T.depositOf(formatPrice(dto.depositAmount, currency))}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button type="button" size="sm" className={BLACK} onClick={() => setPaying({ dto, row })}>
                        <Check aria-hidden />
                        {T.registerDeposit}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className={cn(QUIET, "bg-black/[0.04]")}
                        onClick={() => void cancel(dto, row)}
                      >
                        <X aria-hidden />
                        {T.cancel}
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <NewAppointmentModal
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={() => router.refresh()}
        services={services}
        tz={tz}
        todayKey={todayKey}
        origin={createOrigin}
      />

      <AppointmentDetailDialog
        appt={selected}
        origin={detailOrigin}
        tz={tz}
        currency={currency}
        onClose={() => setSelected(null)}
        onChanged={() => router.refresh()}
        onUpdated={setSelected}
        onCancel={scheduleCancel}
      />

      {paying ? (
        <AppointmentPaymentModal
          open
          onClose={() => setPaying(null)}
          currency={currency}
          appointment={{
            id: paying.dto.id,
            label: `${paying.row.patientLabel} · ${paying.dto.service.name} · ${formatAppointmentWhen(new Date(paying.dto.startsAt), now, tz)}`,
            priceSnapshot: paying.dto.priceSnapshot,
            patientLabel: paying.row.patientLabel,
            depositAmount: paying.dto.depositAmount ?? undefined,
            balanceAmount: String(paying.row.payment.balance),
          }}
          onDone={() => {
            setPaying(null);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function rowsOf(dtos: TurnosAppointment[], now: Date, tz: string, currency: string) {
  const rows = buildAppointmentListRows(dtos.map(toListInput), now, tz, currency);
  const byId = new Map(rows.map((r) => [r.id, r]));
  return dtos.flatMap((dto) => {
    const row = byId.get(dto.id);
    return row ? [{ dto, row }] : [];
  });
}
