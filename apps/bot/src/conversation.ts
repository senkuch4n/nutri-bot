import { Prisma, prisma } from "@nutri-bot/db";
import {
  SlotUnavailableError,
  cancelAppointment,
  createAppointment,
  createDepositCheckout,
  createPatientToken,
  findOrCreatePatientByJid,
  getProfessional,
  recordInquiryMessage,
} from "@nutri-bot/db/domain";
import {
  afterHoursConfigFrom,
  formatClock,
  formatServiceList,
  isExitCommand,
  isExitWord,
  isMenuCommand,
  isWakeWord,
  isWithinAfterHours,
  messages,
  normalize,
  type AfterHoursConfig,
} from "@nutri-bot/core";
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
  /** SOLO pruebas: reemplaza Professional.phoneJid como destino de las alertas (null = sin alertas). */
  alertJid?: string | null;
};

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

  // Una conversación abierta pero inactiva vuelve a estar "dormida".
  if (step !== STEP.DORMANT && now.getTime() - state.updatedAt.getTime() > SESSION_TIMEOUT_MS) {
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
      await send(messages.welcomeBack(patient.name));
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
      await send(messages.MENU);
      return;
    }
    return handleInquiryText(jid, text, ctx, patient, pro, send, opts, now);
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
    await send(messages.greetByName(name));
    return;
  }

  if (isWakeWord(text) && /\bmenu\b/.test(normalize(text))) {
    await save(jid, STEP.MENU);
    await send(messages.MENU);
    return;
  }

  switch (step) {
    case STEP.MENU:
      return handleMenu(jid, text, send, pro, opts, now);
    case STEP.BOOK_SERVICE:
      return handleBookService(jid, text, send);
    case STEP.BOOK_DAY:
      return handleBookDay(jid, text, ctx, send);
    case STEP.BOOK_SLOT:
      return handleBookSlot(jid, text, ctx, send);
    case STEP.BOOK_CONFIRM:
      return handleBookConfirm(jid, text, ctx, patient.id, send);
    case STEP.CANCEL_PICK:
      return handleCancelPick(jid, text, ctx, send);
    case STEP.CANCEL_CONFIRM:
      return handleCancelConfirm(jid, text, ctx, send);
    case STEP.CONFIRM_ATTENDANCE:
      return handleConfirmAttendance(jid, text, ctx, send);
    default:
      await save(jid, STEP.MENU);
      await send(messages.MENU);
  }
}

async function handleMenu(
  jid: string,
  text: string,
  send: Send,
  pro: Professional,
  opts: ConversationOptions,
  now: Date,
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
      await send(messages.MENU);
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
  await save(jid, STEP.BOOK_SLOT, { serviceId: ctx.serviceId, dayKey: day.dayKey, slots: iso });
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
  const [service, pro] = await Promise.all([
    prisma.service.findUniqueOrThrow({ where: { id: ctx.serviceId } }),
    getProfessional(),
  ]);
  await save(jid, STEP.BOOK_CONFIRM, { serviceId: ctx.serviceId, startsAt });
  await send(
    messages.confirmBooking({
      serviceName: service.name,
      startsAt: new Date(startsAt),
      price: service.price.toString(),
      tz: pro.timezone,
      currency: pro.currency,
    }),
  );
}

async function handleBookConfirm(
  jid: string,
  text: string,
  ctx: Ctx,
  patientId: string,
  send: Send,
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
    await send(messages.MENU);
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
    });
    if (appointment.status === "AWAITING_PAYMENT") {
      const checkout = await createDepositCheckout(appointment.id);
      await send(messages.depositRequired({ serviceName: service.name, startsAt: appointment.startsAt, tz: pro.timezone, amount: checkout.amount, currency: pro.currency, checkoutUrl: checkout.checkoutUrl }));
    } else {
      await send(messages.bookingConfirmed({ serviceName: service.name, startsAt: appointment.startsAt, tz: pro.timezone }));
    }
  } catch (err) {
    if (err instanceof SlotUnavailableError) {
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

async function handleCancelConfirm(jid: string, text: string, ctx: Ctx, send: Send): Promise<void> {
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
    await send(messages.MENU);
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

async function handleConfirmAttendance(jid: string, text: string, ctx: Ctx, send: Send): Promise<void> {
  if (!ctx.apptId) {
    await save(jid, STEP.MENU);
    await send(messages.MENU);
    return;
  }
  const appt = await prisma.appointment.findUnique({ where: { id: ctx.apptId }, include: { service: true } });
  if (!appt || appt.status !== "CONFIRMED") {
    await save(jid, STEP.MENU);
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
): Promise<void> {
  // P4: un dígito suelto es una opción del menú, no una consulta.
  if (/^[0-4]$/.test(text.trim())) return handleMenu(jid, text, send, pro, opts, now);

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
  if (!row || row.step !== STEP.AWAIT_INQUIRY) return;
  if (now.getTime() - row.updatedAt.getTime() > SESSION_TIMEOUT_MS) return; // silencio, como hoy
  await send(messages.INQUIRY_TEXT_ONLY);
  await save(jid, STEP.AWAIT_INQUIRY, (row.context ?? {}) as Ctx);
}
