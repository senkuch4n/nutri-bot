import { Check, X, type LucideIcon } from "lucide-react";
import { readableTextOn } from "@nutri-bot/core";

/** Estados que muestra el calendario, en el orden de los filtros. */
export const CALENDAR_STATUSES = ["CONFIRMED", "COMPLETED", "NO_SHOW"] as const;
export type CalendarStatus = (typeof CALENDAR_STATUSES)[number];

// Confirmado va sin marca (punto lleno); los demás llevan su marca adentro.
const STATUS_GLYPH: Record<CalendarStatus, LucideIcon | null> = {
  CONFIRMED: null,
  COMPLETED: Check,
  NO_SHOW: X,
};

/**
 * Punto del turno: el color es el del servicio y la marca adentro es el estado. Lo usan la pastilla del
 * calendario y el popover de Filtros. El anillo (.appt-dot) lo mantiene visible sobre cualquier pastilla.
 */
export function AppointmentStatusDot({ status, color }: { status: string; color: string }) {
  const Glyph = STATUS_GLYPH[status as CalendarStatus] ?? null;
  return (
    <span aria-hidden className="appt-dot" style={{ backgroundColor: color, color: readableTextOn(color) }}>
      {Glyph ? <Glyph className="size-2.5" strokeWidth={3.5} /> : null}
    </span>
  );
}
