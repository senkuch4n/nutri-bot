import { Prisma, prisma } from "@nutri-bot/db";
import {
  SlotUnavailableError,
  cancelAppointment,
  createAppointment,
  createDepositCheckout,
  createPatientToken,
  findOrCreatePatientByJid,
  countBotAiQuestionsToday,
  getProfessional,
  markBotAiQuestionHandedOff,
  recordBotAiQuestion,
  recordInquiryMessage,
  runBotAiTool,
} from "@nutri-bot/db/domain";
import {
  afterHoursConfigFrom,
  formatClock,
  formatServiceList,
  inquiryBodyFromAiQuestion,
  isBotAiAvailable,
  isExitCommand,
  lateAttendanceAnswer,
  isExitWord,
  isMenuCommand,
  isWakeWord,
  isWithinAfterHours,
  menuDigit,
  mergeBotAiLimits,
  messages,
  normalize,
  parseBookingReason,
  trimHistory,
  type AfterHoursConfig,
  type AiTurn,
  type BotAiLimits,
} from "@nutri-bot/core";
import { answerQuestion } from "./ai/ask";
import type { BotAiProvider } from "./ai/provider";
import { getBotAiConfig, getBotAiRuntime } from "./ai/runtime";
import {
  cancelableAppointments,
  listActiveServices,
  nextAvailableDays,
  slotsForDay,
  type DayOption,
} from "./booking";
import { logger } from "./logger";

type Send = (text: string) => Promise<void>;

type Professional = Awaited<ReturnType<typeof getProfessional>>;
type PatientRow = Awaited<ReturnType<typeof findOrCreatePatientByJid>>;

/** Opciones inyectables. En producción no se pasan. */
export type ConversationOptions = {
  /** Hora "actual" (default new Date()). Afecta el timeout de sesión, la franja y `at` de la consulta. */
  now?: Date;
  /** SOLO pruebas: reemplaza la franja de Professional. */
  afterHours?: AfterHoursConfig;
  /** SOLO pruebas: reemplaza Professional.phoneJid como destino de las alertas (opción 0 y, desde la
   *  HU-013, turno nuevo) (null = sin alertas). */
  alertJid?: string | null;
  /** HU-012: proveedor de IA. undefined = el del .env (getBotAiRuntime; null si falta la clave);
   *  null = sin IA. Las pruebas pasan uno falso. */
  aiProvider?: BotAiProvider | null;
  /** SOLO pruebas: reemplaza Professional.botAiEnabled. */
  aiEnabled?: boolean;
  /** SOLO pruebas: pisa límites de D6 (sobre getBotAiConfig().limits). */
  aiLimits?: Partial<BotAiLimits>;
  /** HU-012: muestra "escribiendo…" mientras la IA piensa. */
  typing?: () => Promise<void>;
};

/** HU-012: estado de la IA para ESTE mensaje. `provider` no es null si `available`. */
type AiState = { available: boolean; provider: BotAiProvider | null };

const STEP = {
  /** El bot no está atendiendo a este contacto: ignora todo salvo una palabra clave. */
  DORMANT: "DORMANT",
  ASK_NAME: "ASK_NAME",
  MENU: "MENU",
  BOOK_SERVICE: "BOOK_SERVICE",
  BOOK_DAY: "BOOK_DAY",
  BOOK_SLOT: "BOOK_SLOT",
  BOOK_CONFIRM: "BOOK_CONFIRM",
  CANCEL_PICK: "CANCEL_PICK",
  CANCEL_CONFIRM: "CANCEL_CONFIRM",
  CONFIRM_ATTENDANCE: "CONFIRM_ATTENDANCE",
  /** HU-011: el paciente eligió 0; lo que escriba en la sesión se guarda como consulta. */
  AWAIT_INQUIRY: "AWAIT_INQUIRY",
  /** HU-012: modo pregunta; el texto libre va a la IA. */
  AWAIT_QUESTION: "AWAIT_QUESTION",
  /** HU-013: esperando el motivo de consulta (texto libre). */
  BOOK_REASON: "BOOK_REASON",
} as const;

/** Tras este tiempo de inactividad, una conversación abierta vuelve a DORMANT. */
const SESSION_TIMEOUT_MS = Number(process.env.BOT_SESSION_TIMEOUT_MIN ?? 20) * 60_000;

type Ctx = {
  serviceId?: string;
  dayKey?: string;
  days?: DayOption[];
  slots?: string[];
  startsAt?: string;
  apptIds?: string[];
  apptId?: string;
  /** HU-011: consulta de esta sesión. */
  inquiryId?: string;
  /** HU-011: ya se encoló la alerta inmediata en esta sesión. */
  alerted?: boolean;
  /** HU-011: ya se mandó la confirmación en esta sesión. */
  confirmed?: boolean;
  /** HU-012: vueltas de esta sesión del modo pregunta (trimHistory). */
  aiHistory?: AiTurn[];
  /** HU-012 (D4 c): última pregunta "derivable" con 0 y su fila de BotAiQuestion. */
  lastQuestion?: string;
  lastQuestionLogId?: string;
  /** HU-013: motivo aceptado (parseBookingReason "ok"), entre BOOK_REASON y el "sí". */
  reason?: string;
};

async function loadState(jid: string): Promise<{ step: string; ctx: Ctx; updatedAt: Date }> {
  const row = await prisma.conversationState.upsert({
    where: { patientJid: jid },
    create: { patientJid: jid, step: STEP.DORMANT, context: {} },
    update: {},
  });
  return { step: row.step, ctx: (row.context ?? {}) as Ctx, updatedAt: row.updatedAt };
}

async function save(jid: string, step: string, ctx: Ctx = {}): Promise<void> {
  const context = ctx as unknown as Prisma.InputJsonValue;
  await prisma.conversationState.upsert({
    where: { patientJid: jid },
    create: { patientJid: jid, step, context },
    update: { step, context },
  });
}

function parseChoice(text: string, max: number): number | null {
  const n = Number(text.trim().replace(/\D/g, ""));
  if (!Number.isInteger(n) || n < 1 || n > max) return null;
  return n - 1;
}

// \b de JS no trata vocales acentuadas como caracteres de palabra, así que
// "sí" (la forma en que el bot mismo pide responder) no matcheaba contra
// \b. Se usa (?!\p{L}) en su lugar: sigue exigiendo que no venga pegado a
// otra letra (para no confundir "si" con "sino"), pero sí funciona con tildes.
function isYes(text: string): boolean {
  return /^(s[ií]|si|dale|ok|confirmo|listo|obvio)(?!\p{L})/iu.test(text.trim());
}
function isNo(text: string): boolean {
  return /^(no|n|nel|mejor no)(?!\p{L})/iu.test(text.trim());
}
export async function handleIncoming(
  jid: string,
  text: string,
  send: Send,
  opts: ConversationOptions = {},
): Promise<void> {
  const now = opts.now ?? new Date();
  const pro = await getProfessional();

  // Interruptor global: la nutricionista puede apagar el bot desde el panel.
  if (pro.botPaused) return;

  const patient = await findOrCreatePatientByJid(jid);
  const state = await loadState(jid);
  const ctx = state.ctx;
  let step = state.step;

  // HU-012: la opción 5 existe solo con el interruptor prendido Y un proveedor (clave en el .env).
  const provider = opts.aiProvider !== undefined ? opts.aiProvider : (getBotAiRuntime()?.provider ?? null);
  const aiEnabled = opts.aiEnabled ?? pro.botAiEnabled;
  const ai: AiState = {
    available: isBotAiAvailable({ enabled: aiEnabled, hasProvider: provider !== null }),
    provider,
  };
  const menuText = messages.menu({ withQuestions: ai.available });

  // Una conversación abierta pero inactiva vuelve a estar "dormida". Excepción: la confirmación de
  // asistencia se pide días antes del turno, así que un "sí"/"no" tardío sigue valiendo, pero solo
  // si el mensaje ENTERO es una respuesta clara (lateAttendanceAnswer); lo demás, silencio.
  const late = step !== STEP.DORMANT && now.getTime() - state.updatedAt.getTime() > SESSION_TIMEOUT_MS;
  if (late && !(step === STEP.CONFIRM_ATTENDANCE && lateAttendanceAnswer(text) !== null)) {
    step = STEP.DORMANT;
  }

  // --- Bot dormido: solo reacciona a una palabra clave ---
  if (step === STEP.DORMANT) {
    if (!isWakeWord(text)) return; // silencio total ante mensajes normales
    if (!patient.name) {
      await save(jid, STEP.ASK_NAME);
      await send(messages.ASK_NAME);
    } else {
      await save(jid, STEP.MENU);
      await send(messages.welcomeBack(patient.name, menuText));
    }
    return;
  }

  // --- Conversación abierta ---
  // HU-011 (P3): esperando la consulta, salir/menú solo si el mensaje ENTERO es el comando,
  // para que "¿puedo salir a correr?" se guarde como consulta.
  if (step === STEP.AWAIT_INQUIRY) {
    if (isExitCommand(text)) {
      await save(jid, STEP.DORMANT);
      await send(messages.DORMANT_BYE);
      return;
    }
    if (isMenuCommand(text)) {
      await save(jid, STEP.MENU);
      await send(menuText);
      return;
    }
    return handleInquiryText(jid, text, ctx, patient, pro, send, opts, now, menuText, ai);
  }

  // HU-012: modo pregunta. Comandos estrictos y dígitos sueltos no llaman a la IA.
  if (step === STEP.AWAIT_QUESTION) {
    if (isExitCommand(text)) {
      await save(jid, STEP.DORMANT);
      await send(messages.DORMANT_BYE);
      return;
    }
    if (isMenuCommand(text)) {
      await save(jid, STEP.MENU);
      await send(menuText);
      return;
    }
    const d = menuDigit(text, 5);
    if (d === "0" && ctx.lastQuestion) {
      return handoffFromQuestion(jid, ctx, patient, pro, send, opts, now);
    }
    if (d !== null) return handleMenu(jid, d, send, pro, opts, now, menuText, ai);
    return handleQuestionText(jid, text, ctx, patient, pro, send, opts, now, ai);
  }

  // HU-013: paso del motivo. Texto libre: solo comandos estrictos (mensaje entero).
  if (step === STEP.BOOK_REASON) {
    if (isExitCommand(text)) {
      await save(jid, STEP.DORMANT);
      await send(messages.DORMANT_BYE);
      return;
    }
    if (isMenuCommand(text)) {
      await save(jid, STEP.MENU);
      await send(menuText);
      return;
    }
    return handleBookReason(jid, text, ctx, send, menuText);
  }

  if (isExitWord(text)) {
    await save(jid, STEP.DORMANT);
    await send(messages.DORMANT_BYE);
    return;
  }

  if (step === STEP.ASK_NAME) {
    const name = text.trim().slice(0, 80);
    if (name.length < 2) {
      await send(messages.ASK_NAME);
      return;
    }
    await prisma.patient.update({ where: { id: patient.id }, data: { name } });
    await save(jid, STEP.MENU);
    await send(messages.greetByName(name, menuText));
    return;
  }

  if (isWakeWord(text) && /\bmenu\b/.test(normalize(text))) {
    await save(jid, STEP.MENU);
    await send(menuText);
    return;
  }

  switch (step) {
    case STEP.MENU:
      return handleMenu(jid, text, send, pro, opts, now, menuText, ai);
    case STEP.BOOK_SERVICE:
      return handleBookService(jid, text, send);
    case STEP.BOOK_DAY:
      return handleBookDay(jid, text, ctx, send);
    case STEP.BOOK_SLOT:
      return handleBookSlot(jid, text, ctx, send);
    case STEP.BOOK_CONFIRM:
      return handleBookConfirm(jid, text, ctx, patient.id, send, menuText, opts);
    case STEP.CANCEL_PICK:
      return handleCancelPick(jid, text, ctx, send);
    case STEP.CANCEL_CONFIRM:
      return handleCancelConfirm(jid, text, ctx, send, menuText);
    case STEP.CONFIRM_ATTENDANCE:
      return handleConfirmAttendance(jid, text, ctx, send, menuText, now);
    default:
      await save(jid, STEP.MENU);
      await send(menuText);
  }
}

async function handleMenu(
  jid: string,
  text: string,
  send: Send,
  pro: Professional,
  opts: ConversationOptions,
  now: Date,
  menuText: string,
  ai: AiState,
): Promise<void> {
  const choice = text.trim().replace(/\D/g, "");

  if (choice === "1") {
    const services = await listActiveServices();
    if (services.length === 0) {
      await send("Todavía no hay servicios disponibles para reservar. Probá más tarde.");
      return;
    }
    await save(jid, STEP.BOOK_SERVICE);
    await send(
      messages.askService(
        services
          .map((s, i) => `${i + 1}. *${s.name}* (${s.durationMin} min)`)
          .join("\n"),
      ),
    );
    return;
  }

  if (choice === "2") {
    const patient = await prisma.patient.findUniqueOrThrow({ where: { whatsappJid: jid } });
    const appts = await cancelableAppointments(patient.id);
    if (appts.length === 0) {
      await send(messages.NO_APPTS_TO_CANCEL);
      await send(menuText);
      return;
    }
    await save(jid, STEP.CANCEL_PICK, { apptIds: appts.map((a) => a.id) });
    await send(
      messages.askWhichToCancel(
        appts.map((a) => ({ serviceName: a.service.name, startsAt: a.startsAt })),
        pro.timezone,
      ),
    );
    return;
  }

  if (choice === "3") {
    const services = await listActiveServices();
    await send(
      messages.pricesMessage(
        formatServiceList(
          services.map((s) => ({
            name: s.name,
            description: s.description,
            price: s.price.toString(),
            durationMin: s.durationMin,
          })),
          pro.currency,
        ),
        pro.acceptedInsurances,
      ),
    );
    return;
  }

  if (choice === "4") {
    const patient = await prisma.patient.findUniqueOrThrow({ where: { whatsappJid: jid } });
    const token = createPatientToken(patient.id, 15);
    const url = `${process.env.AUTH_URL}/portal/login?token=${token}`;
    await send(messages.portalLink(url));
    return;
  }

  if (choice === "0") {
    const config = afterHoursConfigFor(pro, opts);
    const alertJid = alertJidFor(pro, opts);
    if (isWithinAfterHours(now, config, pro.timezone)) {
      // HU-011: fuera de horario no se alerta en el momento; se pide la consulta.
      await send(
        messages.afterHoursHandoff({ attendFrom: formatClock(config.end), attendTo: formatClock(config.start) }),
      );
      await save(jid, STEP.AWAIT_INQUIRY, { alerted: false, confirmed: false });
      return;
    }
    await send(messages.HANDOFF);
    if (alertJid) {
      const patient = await prisma.patient.findUniqueOrThrow({ where: { whatsappJid: jid } });
      await enqueueHandoffAlert(patient, alertJid);
    }
    // HU-011 (D4): de día también se captura lo que escriba después.
    await save(jid, STEP.AWAIT_INQUIRY, { alerted: Boolean(alertJid), confirmed: false });
    return;
  }

  // HU-012: opción 5 (oculta si la IA no está disponible: como hoy, no se entiende).
  if (choice === "5" && ai.available) {
    await save(jid, STEP.AWAIT_QUESTION, { aiHistory: [] }); // historial nuevo al entrar (P7)
    await send(messages.QUESTION_MODE_INTRO);
    return;
  }

  await send(messages.NOT_UNDERSTOOD);
}

async function handleBookService(jid: string, text: string, send: Send): Promise<void> {
  const services = await listActiveServices();
  const idx = parseChoice(text, services.length);
  if (idx === null) {
    await send(messages.NOT_UNDERSTOOD);
    return;
  }
  const service = services[idx]!;
  const days = await nextAvailableDays(service.id);
  if (days.length === 0) {
    await send("No hay turnos disponibles en las próximas semanas. Escribí *menú* para volver.");
    await save(jid, STEP.MENU);
    return;
  }
  await save(jid, STEP.BOOK_DAY, { serviceId: service.id, days });
  await send(messages.askDay(days));
}

async function handleBookDay(jid: string, text: string, ctx: Ctx, send: Send): Promise<void> {
  const days = ctx.days ?? [];
  const idx = parseChoice(text, days.length);
  if (idx === null || !ctx.serviceId) {
    await send(messages.NOT_UNDERSTOOD);
    return;
  }
  const day = days[idx]!;
  const slots = await slotsForDay(ctx.serviceId, day.dayKey);
  if (slots.length === 0) {
    await send(messages.NO_SLOTS);
    await save(jid, STEP.MENU);
    return;
  }
  const iso = slots.map((s) => s.toISOString());
  await save(jid, STEP.BOOK_SLOT, {
    serviceId: ctx.serviceId,
    dayKey: day.dayKey,
    slots: iso,
    ...(ctx.reason ? { reason: ctx.reason } : {}), // HU-013: motivo conservado tras SLOT_TAKEN
  });
  const pro = await getProfessional();
  await send(messages.askSlot(slots, pro.timezone));
}

async function handleBookSlot(jid: string, text: string, ctx: Ctx, send: Send): Promise<void> {
  const slots = ctx.slots ?? [];
  const idx = parseChoice(text, slots.length);
  if (idx === null || !ctx.serviceId) {
    await send(messages.NOT_UNDERSTOOD);
    return;
  }
  const startsAt = slots[idx]!;
  // HU-013: el motivo ya lo dejó antes de que se ocupara el horario anterior: no se pide de nuevo.
  if (ctx.reason) return sendBookingSummary(jid, { serviceId: ctx.serviceId, startsAt, reason: ctx.reason }, send);
  const service = await prisma.service.findUniqueOrThrow({ where: { id: ctx.serviceId } });
  // HU-013: si el servicio pide motivo, se pide antes del resumen.
  if (service.asksReason) {
    await save(jid, STEP.BOOK_REASON, { serviceId: ctx.serviceId, startsAt });
    await send(messages.ASK_BOOKING_REASON);
    return;
  }
  return sendBookingSummary(jid, { serviceId: ctx.serviceId, startsAt }, send);
}

/** HU-013: resumen de confirmación (lo usan handleBookSlot y handleBookReason). */
async function sendBookingSummary(
  jid: string,
  b: { serviceId: string; startsAt: string; reason?: string },
  send: Send,
): Promise<void> {
  const [service, pro] = await Promise.all([
    prisma.service.findUniqueOrThrow({ where: { id: b.serviceId } }),
    getProfessional(),
  ]);
  await save(jid, STEP.BOOK_CONFIRM, {
    serviceId: b.serviceId,
    startsAt: b.startsAt,
    ...(b.reason ? { reason: b.reason } : {}),
  });
  await send(
    messages.confirmBooking({
      serviceName: service.name,
      startsAt: new Date(b.startsAt),
      price: service.price.toString(),
      tz: pro.timezone,
      currency: pro.currency,
      reason: b.reason ?? null,
    }),
  );
}

/** HU-013: paso del motivo (D1–D3). El texto inválido no se guarda. */
async function handleBookReason(
  jid: string,
  text: string,
  ctx: Ctx,
  send: Send,
  menuText: string,
): Promise<void> {
  if (!ctx.serviceId || !ctx.startsAt) {
    await save(jid, STEP.MENU);
    await send(menuText);
    return;
  }
  const b = { serviceId: ctx.serviceId, startsAt: ctx.startsAt };
  const r = parseBookingReason(text);
  switch (r.kind) {
    case "skip":
      return sendBookingSummary(jid, b, send);
    case "ok":
      return sendBookingSummary(jid, { ...b, reason: r.reason }, send);
    case "tooShort":
      await save(jid, STEP.BOOK_REASON, b);
      await send(messages.BOOKING_REASON_TOO_SHORT);
      return;
    case "tooLong":
      await save(jid, STEP.BOOK_REASON, b);
      await send(messages.BOOKING_REASON_TOO_LONG);
      return;
  }
}

async function handleBookConfirm(
  jid: string,
  text: string,
  ctx: Ctx,
  patientId: string,
  send: Send,
  menuText: string,
  opts: ConversationOptions,
): Promise<void> {
  if (isNo(text)) {
    await send("Sin problema, no reservé nada. Escribí *menú* si querés hacer otra cosa.");
    await save(jid, STEP.MENU);
    return;
  }
  if (!isYes(text)) {
    await send('Respondé *sí* para confirmar o *no* para cancelar.');
    return;
  }
  if (!ctx.serviceId || !ctx.startsAt) {
    await save(jid, STEP.MENU);
    await send(menuText);
    return;
  }

  try {
    const [service, pro] = await Promise.all([
      prisma.service.findUniqueOrThrow({ where: { id: ctx.serviceId } }),
      getProfessional(),
    ]);
    const appointment = await createAppointment({
      patientId,
      serviceId: ctx.serviceId,
      startsAt: new Date(ctx.startsAt),
      createdBy: "PATIENT",
      notifyPatient: false,
      reason: ctx.reason ?? null,
      professionalAlertJid: opts.alertJid,
    });
    if (appointment.status === "AWAITING_PAYMENT") {
      const checkout = await createDepositCheckout(appointment.id);
      await send(messages.depositRequired({ serviceName: service.name, startsAt: appointment.startsAt, tz: pro.timezone, amount: checkout.amount, currency: pro.currency, checkoutUrl: checkout.checkoutUrl }));
    } else {
      await send(messages.bookingConfirmed({ serviceName: service.name, startsAt: appointment.startsAt, tz: pro.timezone }));
    }
  } catch (err) {
    if (err instanceof SlotUnavailableError) {
      // HU-013: si dejó motivo, se le ofrecen otros días del mismo servicio sin perderlo.
      if (ctx.reason) {
        const days = await nextAvailableDays(ctx.serviceId);
        if (days.length > 0) {
          await save(jid, STEP.BOOK_DAY, { serviceId: ctx.serviceId, days, reason: ctx.reason });
          await send(messages.slotTakenKeepReason(days));
          return;
        }
      }
      await send(messages.SLOT_TAKEN);
    } else {
      logger.error({ err }, "Error creando turno desde el bot");
      await send("Hubo un problema al reservar. Escribí *menú* e intentá de nuevo.");
    }
  }
  await save(jid, STEP.MENU);
}

async function handleCancelPick(jid: string, text: string, ctx: Ctx, send: Send): Promise<void> {
  const ids = ctx.apptIds ?? [];
  const idx = parseChoice(text, ids.length);
  if (idx === null) {
    await send(messages.NOT_UNDERSTOOD);
    return;
  }
  const apptId = ids[idx]!;
  const appt = await prisma.appointment.findUnique({
    where: { id: apptId },
    include: { service: true },
  });
  if (!appt || appt.status !== "CONFIRMED") {
    await send("Ese turno ya no está activo. Escribí *menú* para volver.");
    await save(jid, STEP.MENU);
    return;
  }
  const pro = await getProfessional();
  await save(jid, STEP.CANCEL_CONFIRM, { apptId });
  await send(
    messages.confirmCancel({
      serviceName: appt.service.name,
      startsAt: appt.startsAt,
      tz: pro.timezone,
    }),
  );
}

async function handleCancelConfirm(
  jid: string,
  text: string,
  ctx: Ctx,
  send: Send,
  menuText: string,
): Promise<void> {
  if (isNo(text)) {
    await send("Listo, dejo el turno como está. Escribí *menú* para volver.");
    await save(jid, STEP.MENU);
    return;
  }
  if (!isYes(text)) {
    await send('Respondé *sí* para cancelar o *no* para dejarlo.');
    return;
  }
  if (!ctx.apptId) {
    await save(jid, STEP.MENU);
    await send(menuText);
    return;
  }

  const appt = await prisma.appointment.findUnique({
    where: { id: ctx.apptId },
    include: { service: true },
  });
  if (appt && appt.status === "CONFIRMED") {
    await cancelAppointment({ id: ctx.apptId, by: "PATIENT", notifyPatient: false });
    const pro = await getProfessional();
    await send(
      messages.cancelDone({
        serviceName: appt.service.name,
        startsAt: appt.startsAt,
        tz: pro.timezone,
      }),
    );
  } else {
    await send("Ese turno ya no estaba activo.");
  }
  await save(jid, STEP.MENU);
}

async function handleConfirmAttendance(
  jid: string,
  text: string,
  ctx: Ctx,
  send: Send,
  menuText: string,
  now: Date,
): Promise<void> {
  if (!ctx.apptId) {
    await save(jid, STEP.MENU);
    await send(menuText);
    return;
  }
  const appt = await prisma.appointment.findUnique({ where: { id: ctx.apptId }, include: { service: true } });
  // Turno cancelado, ya empezado o inexistente: la confirmación ya no aplica (silencio).
  if (!appt || appt.status !== "CONFIRMED" || appt.startsAt.getTime() <= now.getTime()) {
    await save(jid, STEP.DORMANT);
    return;
  }
  const pro = await getProfessional();

  if (isYes(text)) {
    await prisma.appointment.update({
      where: { id: appt.id },
      data: { confirmationResponse: true, confirmationRespondedAt: new Date() },
    });
    await send(messages.attendanceConfirmedThanks({ serviceName: appt.service.name, startsAt: appt.startsAt, tz: pro.timezone }));
    await save(jid, STEP.MENU);
    return;
  }
  if (isNo(text)) {
    await prisma.appointment.update({
      where: { id: appt.id },
      data: { confirmationResponse: false, confirmationRespondedAt: new Date() },
    });
    await cancelAppointment({ id: appt.id, by: "PATIENT", reason: "Avisó que no puede asistir", notifyPatient: false });
    await send(messages.attendanceDeclinedNotice({ serviceName: appt.service.name, startsAt: appt.startsAt, tz: pro.timezone }));
    await save(jid, STEP.MENU);
    return;
  }
  await send("Respondé *sí* si vas a poder venir, o *no* si no vas a poder.");
}

// --- HU-011: consultas por la opción 0 ---

function afterHoursConfigFor(pro: Professional, opts: ConversationOptions): AfterHoursConfig {
  return opts.afterHours ?? afterHoursConfigFrom(pro);
}

function alertJidFor(pro: Professional, opts: ConversationOptions): string | null {
  return opts.alertJid !== undefined ? opts.alertJid : pro.phoneJid;
}

/** Alerta inmediata "quiere hablar con vos" (la misma de antes de la HU-011). */
async function enqueueHandoffAlert(
  patient: { name: string | null; phone: string },
  alertJid: string,
): Promise<void> {
  await prisma.outboundMessage.create({
    data: {
      toJid: alertJid,
      kind: "PROFESSIONAL_ALERT",
      body: messages.professionalHandoffAlert({ patientName: patient.name, patientPhone: patient.phone }),
    },
  });
}

async function handleInquiryText(
  jid: string,
  text: string,
  ctx: Ctx,
  patient: PatientRow,
  pro: Professional,
  send: Send,
  opts: ConversationOptions,
  now: Date,
  menuText: string,
  ai: AiState,
): Promise<void> {
  // P4: un dígito suelto es una opción del menú, no una consulta (HU-012: el 5 si hay IA).
  const d = menuDigit(text, ai.available ? 5 : 4);
  if (d !== null) return handleMenu(jid, d, send, pro, opts, now, menuText, ai);

  const config = afterHoursConfigFor(pro, opts);
  const alertJid = alertJidFor(pro, opts);
  const afterHours = isWithinAfterHours(now, config, pro.timezone); // según la hora de ESTE mensaje
  const { inquiry } = await recordInquiryMessage({
    patientId: patient.id,
    text,
    at: now,
    afterHours,
    inquiryId: ctx.inquiryId,
  });

  let alerted = ctx.alerted ?? false;
  // Cruce de franja (empezó de noche, escribe de día): alerta inmediata, salvo que la consulta
  // ya sea nocturna (entonces va en el resumen y no se notifica dos veces).
  if (!afterHours && !alerted && !inquiry.receivedAfterHours && alertJid) {
    await enqueueHandoffAlert(patient, alertJid);
    alerted = true;
  }
  if (!ctx.confirmed) {
    await send(
      afterHours
        ? messages.inquirySavedAfterHours({ attendFrom: formatClock(config.end) })
        : messages.INQUIRY_SAVED_DAY,
    );
  }
  // El save renueva updatedAt: la sesión de 20 minutos sigue abierta.
  await save(jid, STEP.AWAIT_INQUIRY, { inquiryId: inquiry.id, alerted, confirmed: true });
}

/** Mensaje entrante sin texto (audio, foto sin epígrafe, sticker, documento…). D8. */
export async function handleIncomingMedia(
  jid: string,
  send: Send,
  opts: ConversationOptions = {},
): Promise<void> {
  const now = opts.now ?? new Date();
  const pro = await getProfessional();
  if (pro.botPaused) return;
  // findUnique (no loadState): no crea pacientes ni estado para contactos desconocidos.
  const row = await prisma.conversationState.findUnique({ where: { patientJid: jid } });
  if (
    !row ||
    (row.step !== STEP.AWAIT_INQUIRY &&
      row.step !== STEP.AWAIT_QUESTION &&
      row.step !== STEP.BOOK_REASON)
  ) {
    return;
  }
  if (now.getTime() - row.updatedAt.getTime() > SESSION_TIMEOUT_MS) return; // silencio, como hoy
  // HU-012: en el modo pregunta la IA solo entiende texto.
  // HU-013: en el paso del motivo solo se guarda texto.
  await send(
    row.step === STEP.AWAIT_QUESTION
      ? messages.AI_TEXT_ONLY
      : row.step === STEP.BOOK_REASON
        ? messages.BOOKING_REASON_TEXT_ONLY
        : messages.INQUIRY_TEXT_ONLY,
  );
  await save(jid, row.step, (row.context ?? {}) as Ctx);
}

// --- HU-012: preguntas al bot con IA (opción 5) ---

/** D4 (c): "0" desde el modo pregunta con una pregunta previa → consulta con la pregunta cargada. */
async function handoffFromQuestion(
  jid: string,
  ctx: Ctx,
  patient: PatientRow,
  pro: Professional,
  send: Send,
  opts: ConversationOptions,
  now: Date,
): Promise<void> {
  const config = afterHoursConfigFor(pro, opts);
  const alertJid = alertJidFor(pro, opts);
  const afterHours = isWithinAfterHours(now, config, pro.timezone);
  const { inquiry } = await recordInquiryMessage({
    patientId: patient.id,
    // Sección 15 (P6): con prefijo, para que ella sepa que la IA ya respondió algo.
    text: inquiryBodyFromAiQuestion(ctx.lastQuestion ?? ""),
    at: now,
    afterHours,
    inquiryId: null,
  });
  if (ctx.lastQuestionLogId) {
    await markBotAiQuestionHandedOff({ id: ctx.lastQuestionLogId, patientId: patient.id, at: now });
  }
  let alerted = false;
  // De día: alerta inmediata (HU-011). De noche: va en el resumen de la mañana.
  if (!afterHours && !inquiry.receivedAfterHours && alertJid) {
    await enqueueHandoffAlert(patient, alertJid);
    alerted = true;
  }
  // P6: solo la confirmación de la HU-011 (la consulta ya está cargada).
  await send(
    afterHours ? messages.inquirySavedAfterHours({ attendFrom: formatClock(config.end) }) : messages.INQUIRY_SAVED_DAY,
  );
  await save(jid, STEP.AWAIT_INQUIRY, { inquiryId: inquiry.id, alerted, confirmed: true });
}

/** Texto libre en el modo pregunta: va a la IA (con límites, registro y limpieza de formato). */
async function handleQuestionText(
  jid: string,
  text: string,
  ctx: Ctx,
  patient: PatientRow,
  pro: Professional,
  send: Send,
  opts: ConversationOptions,
  now: Date,
  ai: AiState,
): Promise<void> {
  if (!ai.available || !ai.provider) {
    // La apagaron (o se fue la clave) en medio de la sesión.
    await save(jid, STEP.MENU);
    await send(messages.AI_UNAVAILABLE);
    return;
  }
  const limits = mergeBotAiLimits(getBotAiConfig().limits, opts.aiLimits);
  void opts.typing?.().catch(() => {}); // "escribiendo…" (no se espera)
  const title = pro.title?.trim();
  let result: Awaited<ReturnType<typeof answerQuestion>>;
  try {
    result = await answerQuestion(
      {
        provider: ai.provider,
        limits,
        countToday: () => countBotAiQuestionsToday({ patientId: patient.id, now, tz: pro.timezone }),
        record: (row) => recordBotAiQuestion({ ...row, patientId: patient.id, askedAt: now }),
        runTool: (name, input) =>
          runBotAiTool({ name, input, patientId: patient.id, now, afterHours: opts.afterHours }),
        log: logger,
      },
      {
        text,
        history: ctx.aiHistory ?? [],
        now,
        tz: pro.timezone,
        professionalName: title ? `${title} ${pro.name}` : pro.name,
      },
    );
  } catch (err) {
    // Falla de base (conteo o registro). Solo el nombre del error: uno de Prisma puede traer los
    // argumentos, o sea el texto de la pregunta. El paciente sigue en el modo pregunta.
    logger.error({ errName: err instanceof Error ? err.name : typeof err }, "Error de base en el modo pregunta");
    await save(jid, STEP.AWAIT_QUESTION, ctx);
    await send(messages.AI_ERROR);
    return;
  }
  const history = result.turn
    ? trimHistory([...(ctx.aiHistory ?? []), result.turn], limits.historyTurns)
    : (ctx.aiHistory ?? []);
  const next: Ctx = { aiHistory: history };
  if (result.question) {
    next.lastQuestion = result.question;
    if (result.logId) next.lastQuestionLogId = result.logId;
  } else {
    // TOO_LONG: se conserva la pregunta derivable anterior.
    if (ctx.lastQuestion) next.lastQuestion = ctx.lastQuestion;
    if (ctx.lastQuestionLogId) next.lastQuestionLogId = ctx.lastQuestionLogId;
  }
  // Se guarda ANTES de mandar: un mensaje encolado detrás (D14) ya ve el historial. Renueva la sesión.
  await save(jid, STEP.AWAIT_QUESTION, next);
  await send(result.reply);
}
