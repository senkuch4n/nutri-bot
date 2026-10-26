"use client";

import { APPOINTMENT_LIST_TEXT, type AppointmentListRow } from "@nutri-bot/core";
import { GroupedList, GroupedListRow } from "@/components/grouped-list";
import { cn } from "@/components/ui";
import { ROW_STATUS_VISUAL } from "./appointments-table";

const T = APPOINTMENT_LIST_TEXT;

/** HU-021 (SDD 7.4). Lista del celular (< 640 px): sin botones ni motivo; tocar la fila abre el detalle. */
export function AppointmentsMobileList({
  rows,
  onOpen,
}: {
  rows: AppointmentListRow[];
  /** Sin onOpen las filas no son interactivas. */
  onOpen?: (id: string, origin: HTMLElement) => void;
}) {
  return (
    <GroupedList>
      {rows.map((row) => {
        const visual = ROW_STATUS_VISUAL[row.rowStatus];
        const Icon = visual.icon;
        return (
          <GroupedListRow
            key={row.id}
            size="lg"
            onClick={onOpen ? (e) => onOpen(row.id, e.currentTarget) : undefined}
            label={
              <span className="block truncate">
                {row.patientLabel}
                <span className="font-normal text-muted-foreground"> · {row.serviceName}</span>
              </span>
            }
            description={
              <span className="flex flex-wrap items-center gap-x-1">
                <span className={cn("inline-flex items-center gap-1 font-medium", visual.text)}>
                  <Icon className="size-3.5 shrink-0" strokeWidth={2.25} aria-hidden />
                  {row.statusLabel}
                </span>
                <span aria-hidden>·</span>
                <span className="tabular-nums">
                  {row.dateLabel}, {row.timeLabel}
                </span>
                {row.statusNote ? (
                  <>
                    <span aria-hidden>·</span>
                    <span>{row.statusNote}</span>
                  </>
                ) : null}
                {row.patientArchived ? (
                  <>
                    <span aria-hidden>·</span>
                    <span>{T.archived}</span>
                  </>
                ) : null}
              </span>
            }
            accessory={
              <span className="flex flex-col items-end text-right">
                <span className={cn("text-headline tabular-nums", row.payment.state === "free" && "text-muted-foreground")}>
                  {row.priceLabel}
                </span>
                <span className="text-footnote text-muted-foreground">{row.paymentText}</span>
              </span>
            }
          />
        );
      })}
    </GroupedList>
  );
}
