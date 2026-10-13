// HU-017b-2 (SDD 4.2 de 017b-2). La línea gris de la tarjeta del servicio: lo que hace el bot con ese
// servicio, en palabras ("Pide seña (50 %) · Manda recomendaciones · Recordatorio: 24 h antes"), y los
// textos de la pantalla de Servicios.
import { formatPrice } from "./format";
import { serviceRemindersSummary, type ServiceReminder } from "./service-reminders";

const percentFormat = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });

function depositPart(kind: "FIXED" | "PERCENT" | null, value: number | null, currency: string): string {
  if (kind === null || value === null || !Number.isFinite(value)) return "Pide seña";
  return kind === "PERCENT" ? `Pide seña (${percentFormat.format(value)} %)` : `Pide seña (${formatPrice(value, currency)})`;
}

/** Una línea con lo que hace el bot, solo lo activo, separado por " · ":
 *  "Pide seña (50 %)" | "Pide seña ($ 5.000)" (formatPrice) · "Manda recomendaciones" (si prepInstructions)
 *  · "Pide motivo" (si asksReason) · serviceRemindersSummary(reminders) (si hay recordatorios).
 *  Nada activo → "Sin recordatorios". */
export function serviceSummaryLine(
  s: {
    requiresDeposit: boolean;
    depositKind: "FIXED" | "PERCENT" | null;
    depositValue: number | null;
    prepInstructions: string | null;
    asksReason: boolean;
    reminders: readonly ServiceReminder[];
  },
  currency: string,
): string {
  const parts: string[] = [];
  if (s.requiresDeposit) parts.push(depositPart(s.depositKind, s.depositValue, currency));
  if (s.prepInstructions?.trim()) parts.push("Manda recomendaciones");
  if (s.asksReason) parts.push("Pide motivo");
  if (s.reminders.length > 0) parts.push(serviceRemindersSummary(s.reminders));
  return parts.length > 0 ? parts.join(" · ") : serviceRemindersSummary([]);
}

/** Textos exactos de la pantalla de Servicios (solo panel). */
export const SERVICE_TEXT = {
  offeredByBot: "Lo ofrece el bot",
  active: (n: number) => `Activos (${n})`,
  paused: (n: number) => `Pausados (${n})`,
  pausedToast: "Servicio pausado: el bot ya no lo ofrece",
  pausedUndone: "Listo, el bot lo vuelve a ofrecer",
  resumed: "El bot ya lo ofrece",
  edit: "Editar",
  groups: {
    data: "Datos",
    deposit: "Seña",
    beforeAppointment: "Antes del turno",
    reminders: "Recordatorios",
    onBooking: "Al reservar",
  },
  leaveTitle: "¿Salir sin guardar?",
  leaveDescription: "Los cambios que hiciste se pierden.",
  keepEditing: "Seguir editando",
  leave: "Salir sin guardar",
} as const;
