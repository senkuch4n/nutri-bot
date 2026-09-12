import { formatDate, formatDateTime, formatPrice, formatTime } from "./format";

export const MENU = `¡Hola! 👋 Soy el asistente de turnos. ¿Qué necesitás?

1️⃣ Sacar un turno
2️⃣ Cancelar un turno
3️⃣ Ver precios
4️⃣ Ver mi portal (plan, turnos, evolución)
0️⃣ Hablar con la nutricionista

Respondé con el número de la opción.`;

export const ASK_NAME = "Antes de empezar, ¿cómo es tu nombre completo?";

export function greetByName(name: string): string {
  return `¡Gracias, ${name}! 🙌\n\n${MENU}`;
}

export function welcomeBack(name: string): string {
  return `¡Hola de nuevo, ${name}! 👋\n\n${MENU}`;
}

export const NOT_UNDERSTOOD = `No entendí esa respuesta. Escribí *menú* para ver las opciones.`;

export function portalLink(url: string): string {
  return `🌐 Accedé a tu portal acá (válido por 15 minutos):\n${url}\n\nDesde ahí podés ver tu plan, tu próximo turno, tu evolución y anotar tu comida del día.`;
}

export const DORMANT_BYE = `¡Listo! Cuando necesites un turno escribime *turno* y te ayudo. 👋`;

export const HANDOFF = `Perfecto, le aviso a la nutricionista y te va a responder por acá lo antes posible. 🙂`;

export function askService(serviceLines: string): string {
  return `Elegí el servicio:\n\n${serviceLines}\n\nRespondé con el número.`;
}

export function askDay(dayOptions: { label: string }[]): string {
  const lines = dayOptions.map((d, i) => `${i + 1}. ${d.label}`).join("\n");
  return `¿Qué día preferís?\n\n${lines}\n\nRespondé con el número.`;
}

export function askSlot(slots: Date[], tz: string): string {
  const lines = slots.map((s, i) => `${i + 1}. ${formatTime(s, tz)} hs`).join("\n");
  return `Horarios disponibles:\n\n${lines}\n\nRespondé con el número.`;
}

export const NO_SLOTS = `No hay horarios disponibles para ese día. Escribí *menú* y probá con otro.`;

export function confirmBooking(params: {
  serviceName: string;
  startsAt: Date;
  price: number | string;
  tz: string;
  currency: string;
}): string {
  return `Confirmás este turno?

📋 *${params.serviceName}*
🗓️ ${formatDateTime(params.startsAt, params.tz)} hs
💲 ${formatPrice(params.price, params.currency)}

Respondé *sí* para confirmar o *no* para cancelar.`;
}

export function bookingConfirmed(params: { serviceName: string; startsAt: Date; tz: string }): string {
  return `✅ ¡Turno confirmado!

📋 ${params.serviceName}
🗓️ ${formatDateTime(params.startsAt, params.tz)} hs

Si necesitás cancelar, escribí *menú* y elegí la opción 2.`;
}

export function depositRequired(params: {
  serviceName: string;
  startsAt: Date;
  tz: string;
  amount: number;
  currency: string;
  checkoutUrl: string;
}): string {
  return `🕐 Reserva iniciada

📋 ${params.serviceName}
🗓️ ${formatDateTime(params.startsAt, params.tz)} hs
💲 Seña: ${formatPrice(params.amount, params.currency)}

Para confirmar el turno, completá el pago desde este link:
${params.checkoutUrl}

La reserva se libera si no completás el pago en 15 minutos.`;
}

export function depositExpired(params: { serviceName: string; startsAt: Date; tz: string }): string {
  return `La reserva de *${params.serviceName}* del ${formatDateTime(
    params.startsAt,
    params.tz,
  )} hs se liberó porque no se completó el pago de la seña a tiempo.

Si todavía querés un turno, escribí *turno* para volver a intentar.`;
}

export const SLOT_TAKEN = `Ese horario se acaba de ocupar. Escribí *menú* para elegir otro.`;

export function askWhichToCancel(
  appts: { serviceName: string; startsAt: Date }[],
  tz: string,
): string {
  const lines = appts
    .map((a, i) => `${i + 1}. ${a.serviceName} — ${formatDateTime(a.startsAt, tz)} hs`)
    .join("\n");
  return `¿Qué turno querés cancelar?\n\n${lines}\n\nRespondé con el número.`;
}

export const NO_APPTS_TO_CANCEL = `No tenés turnos próximos para cancelar.`;

export function confirmCancel(params: { serviceName: string; startsAt: Date; tz: string }): string {
  return `¿Seguro que querés cancelar este turno?

📋 ${params.serviceName}
🗓️ ${formatDateTime(params.startsAt, params.tz)} hs

Respondé *sí* para cancelar o *no* para dejarlo.`;
}

export function cancelDone(params: { serviceName: string; startsAt: Date; tz: string }): string {
  return `Listo, cancelé tu turno de *${params.serviceName}* del ${formatDate(
    params.startsAt,
    params.tz,
  )}. Cuando quieras sacás otro escribiendo *menú*.`;
}

export function pricesMessage(serviceLines: string, insurances?: string | null): string {
  const insuranceLine = insurances ? `\n\n🏥 Obras sociales: ${insurances}` : "";
  return `💲 *Precios*\n\n${serviceLines}${insuranceLine}\n\nEscribí *menú* para volver.`;
}

export function confirmAttendanceRequest(params: { serviceName: string; startsAt: Date; tz: string }): string {
  return `¿Vas a poder venir a tu turno?\n\n📋 ${params.serviceName}\n🗓️ ${formatDateTime(params.startsAt, params.tz)} hs\n\nRespondé *sí* si vas a venir o *no* si no vas a poder.`;
}

export function attendanceConfirmedThanks(params: { serviceName: string; startsAt: Date; tz: string }): string {
  return `✅ ¡Gracias por confirmar!\n\nTe esperamos el ${formatDateTime(params.startsAt, params.tz)} hs para tu turno de ${params.serviceName}.`;
}

export function attendanceDeclinedNotice(params: { serviceName: string; startsAt: Date; tz: string }): string {
  return `Listo, liberé tu turno de *${params.serviceName}* del ${formatDateTime(params.startsAt, params.tz)} hs porque no vas a poder venir.\n\nCuando quieras sacar otro, escribí *turno*.`;
}

export function prepInstructionsMessage(params: { serviceName: string; startsAt: Date; tz: string; instructions: string }): string {
  return `📋 Recordatorio para tu turno de ${params.serviceName}\n🗓️ ${formatDateTime(params.startsAt, params.tz)} hs\n\nAntes de venir:\n${params.instructions}`;
}

// --- Avisos salientes ---

export function reminderMessage(params: {
  patientName?: string | null;
  serviceName: string;
  startsAt: Date;
  tz: string;
}): string {
  const hi = params.patientName ? `Hola ${params.patientName}! ` : "";
  return `⏰ ${hi}Te recuerdo tu turno:

📋 ${params.serviceName}
🗓️ ${formatDateTime(params.startsAt, params.tz)} hs

Si no podés asistir, escribí *menú* y elegí la opción 2 para cancelar.`;
}

export function professionalCancelAlert(params: {
  patientName?: string | null;
  patientPhone: string;
  serviceName: string;
  startsAt: Date;
  tz: string;
}): string {
  const who = params.patientName ?? params.patientPhone;
  return `🔔 ${who} canceló su turno de ${params.serviceName} del ${formatDateTime(
    params.startsAt,
    params.tz,
  )} hs.`;
}

export function professionalNewBookingAlert(params: {
  patientName?: string | null;
  patientPhone: string;
  serviceName: string;
  startsAt: Date;
  tz: string;
}): string {
  const who = params.patientName ?? params.patientPhone;
  return `🔔 ${who} sacó un turno de ${params.serviceName} para el ${formatDateTime(
    params.startsAt,
    params.tz,
  )} hs.`;
}

export function professionalHandoffAlert(params: {
  patientName?: string | null;
  patientPhone: string;
}): string {
  const who = params.patientName ?? params.patientPhone;
  return `🔔 ${who} quiere hablar con vos por WhatsApp.`;
}
