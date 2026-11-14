"use client";

import { APPOINTMENT_LIST_TEXT, type AppointmentListRow } from "@nutri-bot/core";
import { cn } from "@/components/ui";
import { PaymentPill, StatusPill } from "./appointments-table";

const T = APPOINTMENT_LIST_TEXT;

/** HU-021 V1. Lista del celular (< 640 px): filas planas con divisores, mismas pastillas neutras que la
 *  tabla, sin botones ni motivo; tocar la fila abre el detalle. */
export function AppointmentsMobileList({
  rows,
  onOpen,
}: {
  rows: AppointmentListRow[];
  /** Sin onOpen las filas no son interactivas. */
  onOpen?: (id: string, origin: HTMLElement) => void;
}) {
  return (
    <ul className="border-t border-border/60">
      {rows.map((row) => {
        const body = (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-callout text-foreground">
                {row.patientLabel}
                {row.patientArchived ? <span className="text-muted-foreground"> · {T.archived}</span> : null}
              </span>
              <span className="mt-0.5 block text-footnote tabular-nums text-muted-foreground">
                {row.dateLabel} · {row.timeLabel}
              </span>
              <span className="mt-2 flex flex-wrap items-start gap-1.5">
                <StatusPill row={row} />
                <PaymentPill row={row} />
              </span>
            </span>
            <span
              className={cn(
                "shrink-0 text-callout tabular-nums",
                row.payment.state === "free" ? "text-muted-foreground" : "text-foreground",
              )}
            >
              {row.priceLabel}
            </span>
          </>
        );
        const rowClass = "relative -mx-2 flex w-[calc(100%+1rem)] items-start gap-3 rounded-lg px-2 py-4 text-left";
        return (
          <li key={row.id} className="border-b border-border/60">
            {onOpen ? (
              <button
                type="button"
                onClick={(e) => onOpen(row.id, e.currentTarget)}
                className={cn(
                  rowClass,
                  "press-none transition-colors duration-hover hover:bg-overlay-hover pressed:bg-overlay-pressed focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
                )}
              >
                {body}
              </button>
            ) : (
              <div className={rowClass}>{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
