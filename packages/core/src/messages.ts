import { formatDate, formatDateTime, formatPrice, formatTime } from "./format";
import { reasonForAlert } from "./booking-reason";
import { PAYMENT_METHODS } from "./payment-methods";

export const MENU = `¡Hola! 👋 Soy el asistente de turnos. ¿Qué necesitás?

1️⃣ Sacar un turno
2️⃣ Cancelar un turno
3️⃣ Ver precios
4️⃣ Ver mi portal (plan, turnos, evolución)
0️⃣ Hablar con la nutricionista

Respondé con el número de la opción.`;

export const ASK_NAME = "Antes de empezar, ¿cómo es tu nombre completo?";

export function greetByName(name: string, menuText: string = MENU): string {
  return `¡Gracias, ${name}! 🙌\n\n${menuText}`;
}

export function welcomeBack(name: string, menuText: string = MENU): string {
  return `¡Hola de nuevo, ${name}! 👋\n\n${menuText}`;
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

/** HU-013: línea del motivo (resumen al paciente y alerta). */
export function bookingReasonLine(reason: string): string {
  return `📝 Motivo: ${reason}`;
}

export function confirmBooking(params: {
  serviceName: string;
  startsAt: Date;
  price: number | string;
  tz: string;
  currency: string;
  /** HU-013: motivo ya normalizado. null/undefined/"" → sin línea (texto idéntico al de antes). */
  reason?: string | null;
}): string {
  const reasonLine = params.reason ? `\n${bookingReasonLine(params.reason)}` : "";
  return `Confirmás este turno?

📋 *${params.serviceName}*
🗓️ ${formatDateTime(params.startsAt, params.tz)} hs
💲 ${formatPrice(params.price, params.currency)}${reasonLine}

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

/** HU-013: el horario se ocupó pero el paciente ya había dejado motivo: se conserva y se ofrecen otros días. */
export function slotTakenKeepReason(dayOptions: { label: string }[]): string {
  return `Ese horario se acaba de ocupar. 😕 Tu motivo quedó guardado, no hace falta que lo vuelvas a escribir.\n\n${askDay(dayOptions)}`;
}

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

export function formatInsuranceList(insurances?: string | null): string[] {
  return (insurances ?? "")
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function pricesMessage(serviceLines: string, insurances?: string | null): string {
  const items = formatInsuranceList(insurances);
  const insuranceLine = items.length
    ? `\n\n🏥 Obras sociales:\n${items.map((i) => `• ${i}`).join("\n")}`
    : "";
  const paymentLine = `\n\n💳 Medios de pago:\n${PAYMENT_METHODS.map((method) => `• ${method}`).join("\n")}`;
  return `💲 *Precios*\n\n${serviceLines}${insuranceLine}${paymentLine}\n\nEscribí *menú* para volver.`;
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
  /** HU-014 (D10): relativeDayPhrase(now, startsAt, tz) ("hoy", "mañana", "en 3 días"…). Obligatorio. */
  when: string;
}): string {
  const hi = params.patientName ? `Hola ${params.patientName}! ` : "";
  return `⏰ ${hi}Te recuerdo que tenés turno ${params.when}:

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
  /** HU-013 (D7): null/undefined/"" → texto idéntico al de antes. */
  reason?: string | null;
}): string {
  const who = params.patientName ?? params.patientPhone;
  const text = `🔔 ${who} sacó un turno de ${params.serviceName} para el ${formatDateTime(
    params.startsAt,
    params.tz,
  )} hs.`;
  return params.reason ? `${text}\n${bookingReasonLine(reasonForAlert(params.reason))}` : text;
}

export function professionalHandoffAlert(params: {
  patientName?: string | null;
  patientPhone: string;
}): string {
  const who = params.patientName ?? params.patientPhone;
  return `🔔 ${who} quiere hablar con vos por WhatsApp.`;
}

// --- HU-011: consultas fuera de horario (opción 0) ---

export function afterHoursHandoff(params: { attendFrom: string; attendTo: string }): string {
  return `🌙 La nutricionista responde consultas de *${params.attendFrom} a ${params.attendTo}*.\n\nSi querés, escribime ahora tu consulta en un mensaje y se la dejo para que la vea a primera hora. 🙂\n\nSi era para un turno, escribí *menú* y lo resolvemos ya mismo.`;
}

export function inquirySavedAfterHours(params: { attendFrom: string }): string {
  return `¡Listo! Le dejé tu consulta a la nutricionista. Te va a responder por acá a partir de las *${params.attendFrom}*. 🙌\n\nSi querés agregar algo más, escribilo ahora.`;
}

export const INQUIRY_SAVED_DAY = `¡Listo! Le pasé tu consulta a la nutricionista. Te va a responder por acá lo antes posible. 🙌\n\nSi querés agregar algo más, escribilo ahora.`;

export const INQUIRY_TEXT_ONLY = `Por ahora solo puedo guardar mensajes de texto. ¿Me la escribís? 🙏`;

export function afterHoursDigest(params: {
  items: { patientName?: string | null; patientPhone: string; receivedAt: Date }[];
  tz: string;
}): string {
  const n = params.items.length;
  const head = `🌙 Anoche te dejaron ${n} ${n === 1 ? "consulta" : "consultas"} fuera de horario:`;
  const lines = params.items.map(
    (i) => `• ${i.patientName ?? i.patientPhone} (${formatTime(i.receivedAt, params.tz)})`,
  );
  return `${head}\n${lines.join("\n")}\n\nLas ves completas en el panel → Mensajes.`;
}

// --- HU-012: preguntas al bot con IA (opción 5) ---

export const MENU_WITH_QUESTIONS = `¡Hola! 👋 Soy el asistente de turnos. ¿Qué necesitás?

1️⃣ Sacar un turno
2️⃣ Cancelar un turno
3️⃣ Ver precios
4️⃣ Ver mi portal (plan, turnos, evolución)
5️⃣ Hacer una pregunta
0️⃣ Hablar con la nutricionista

Respondé con el número de la opción.`;

/** Menú del bot: con la opción 5 solo si la IA está disponible (interruptor + clave). */
export function menu(p: { withQuestions: boolean }): string {
  return p.withQuestions ? MENU_WITH_QUESTIONS : MENU;
}

export const QUESTION_MODE_INTRO = `💬 Escribime tu pregunta sobre servicios, precios, turnos o pagos y te respondo al toque.\n\nTe responde un asistente automático con inteligencia artificial de un proveedor externo: lo que escribas acá se procesa en sus servidores, fuera del país. No da indicaciones de salud ni de alimentación, así que no me cuentes datos personales de salud. Para eso está la nutricionista (opción *0*).\n\nPara volver, escribí *menú*.`;

export const AI_DAILY_LIMIT = `Por hoy ya respondí muchas preguntas tuyas. 🙂 Podés usar el *menú* para turnos y precios, o responder *0* para dejarle tu consulta a la nutricionista.`;

export const AI_TOO_LONG = `Uy, es un mensaje muy largo para mí. ¿Me lo resumís en una pregunta más corta?`;

export const AI_ERROR = `Ahora no puedo responderte. 😕 Probá de nuevo en un rato, escribí *menú* para ver las opciones o respondé *0* para dejarle tu consulta a la nutricionista.`;

export const AI_UNAVAILABLE = `Por ahora no puedo responder preguntas. Escribí *menú* para ver las opciones o respondé *0* para hablar con la nutricionista.`;

export const AI_TEXT_ONLY = `Por ahora solo entiendo preguntas escritas. ¿Me la escribís? 🙏`;

export const AI_OFF_TOPIC = `Solo puedo ayudarte con temas del consultorio: servicios, precios, turnos y pagos. ¿Tenés alguna duda sobre eso?`;

/** Sufijo de una respuesta cortada por max_tokens (SDD P3). */
export const AI_TRUNCATED_SUFFIX = `\n\nSi necesitás más detalle, preguntame algo más puntual o respondé *0* para dejarle tu consulta a la nutricionista.`;

// --- HU-013: motivo de consulta al reservar ---

export const ASK_BOOKING_REASON = `Contame en pocas palabras el *motivo de la consulta* 📝
(por ejemplo: bajar de peso, control, alimentación deportiva, un estudio que te pidieron).

Así la nutricionista puede preparar tu turno. Si preferís no decirlo ahora, escribí *saltear*.`;

export const BOOKING_REASON_TOO_SHORT = `No llegué a entenderlo 🙈. Contame el motivo en unas palabras, o escribí *saltear* si preferís no decirlo.`;

export const BOOKING_REASON_TOO_LONG = `¡Gracias por el detalle! Es un poco largo para guardarlo 😅. ¿Me lo resumís en un mensaje más corto? Lo demás se lo podés contar a la nutricionista en la consulta.`;

export const BOOKING_REASON_TEXT_ONLY = `Por ahora solo puedo guardar texto. ¿Me lo escribís? 🙏 Si preferís no decirlo, escribí *saltear*.`;
