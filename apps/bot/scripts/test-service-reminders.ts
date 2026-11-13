/**
 * HU-014: simula, sin WhatsApp real, el encolado de los recordatorios por servicio contra la base
 * de desarrollo, con relojes inyectados (`now`).
 *
 * Reglas (SDD `Refactorizaciones/recordatorios-por-servicio.md`, 10.6):
 *  - Nunca manda WhatsApp. Aborta si el bot figura conectado (salvo ALLOW_BOT_RUNNING=1, para un
 *    BotStatus colgado): con el consumidor del outbox corriendo, cualquier fila PENDING se
 *    despacharía. Cada OutboundMessage que encola se borra por id al terminar su escenario (la
 *    idempotencia que se prueba necesita que la fila exista mientras dura el escenario).
 *  - Fechas lejanas: T0 = 12:00 (zona de la profesional) del día hoy + 40. Todos los turnos caen
 *    entre T0 y T0 + 12 días, fuera del horizonte de 15 días del cron real.
 *  - Datos propios: jids 5490000014031/14032 (no compartidos con otros scripts), servicios
 *    "HU014 … (TEST)" con active: false (no aparecen en el menú y cubren D9), turnos creados con
 *    prisma.appointment.create con status, bookedAt y needsGoogleSync: false explícitos.
 *  - Limpieza solo por id (al terminar cada escenario, en finally y al principio para restos de
 *    una corrida anterior, buscados por nombre exacto de servicio y jid de prueba). No lee ni
 *    escribe la fila de Professional (solo getProfessional() para la zona) ni ningún dato real.
 *
 * Uso: npm run test:service-reminders --workspace apps/bot
 */
import assert from "node:assert/strict";
import { prisma } from "@nutri-bot/db";
import {
  enqueueReminderNow,
  enqueueServiceReminders,
  getAppointmentReminderStatus,
  getProfessional,
} from "@nutri-bot/db/domain";
import { dayKeyInTz, reminderStatusText, wallTimeToUtc, type ServiceReminder } from "@nutri-bot/core";

const JID_A = "5490000014031@s.whatsapp.net";
const JID_B = "5490000014032@s.whatsapp.net";
const TEST_JIDS = [JID_A, JID_B];
const MIN = 60_000;
const H = 3_600_000;
const DAY = 24 * H;

const S = {
  d7: "HU014 7 días (TEST)",
  d2h24: "HU014 2 días + 24 h (TEST)",
  d2: "HU014 2 días (TEST)",
  conf: "HU014 Pide confirmar (TEST)",
  none: "HU014 Sin recordatorios (TEST)",
  change: "HU014 Cambio de config (TEST)",
  changeSent: "HU014 Cambio sobre enviado (TEST)",
} as const;
const SERVICE_NAMES: string[] = Object.values(S);

const patientIds: string[] = [];
const serviceIds: string[] = [];
const appointmentIds = new Set<string>();
const outboundIds = new Set<string>();

const days = (amount: number, asksConfirmation = false): ServiceReminder => ({ amount, unit: "DAYS", asksConfirmation });
const hours = (amount: number, asksConfirmation = false): ServiceReminder => ({ amount, unit: "HOURS", asksConfirmation });

function shiftKey(dayKey: string, n: number): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + n)).toISOString().slice(0, 10);
}

async function preCleanup(): Promise<void> {
  const existing = await prisma.patient.findMany({ where: { whatsappJid: { in: TEST_JIDS } } });
  for (const p of existing) {
    if (!p.name?.endsWith("(TEST)")) {
      throw new Error(`Existe un paciente real con el jid de prueba ${p.whatsappJid} (${p.name}). No borro nada.`);
    }
  }
  const oldPatientIds = existing.map((p) => p.id);
  const oldServices = await prisma.service.findMany({ where: { name: { in: SERVICE_NAMES } }, select: { id: true } });
  const oldServiceIds = oldServices.map((s) => s.id);
  if (oldServiceIds.length > 0) {
    const foreign = await prisma.appointment.count({
      where: { serviceId: { in: oldServiceIds }, patientId: { notIn: oldPatientIds } },
    });
    if (foreign > 0) throw new Error("Un servicio de prueba HU014 tiene turnos de pacientes que no son (TEST). No borro nada.");
  }
  if (oldPatientIds.length === 0 && oldServiceIds.length === 0) return;
  console.log(`Limpiando restos de una corrida anterior (${oldPatientIds.length} paciente(s), ${oldServiceIds.length} servicio(s))…`);
  const oldAppts = await prisma.appointment.findMany({ where: { patientId: { in: oldPatientIds } }, select: { id: true } });
  const oldApptIds = oldAppts.map((a) => a.id);
  const oldOutbound = await prisma.outboundMessage.findMany({
    where: { OR: [{ appointmentId: { in: oldApptIds } }, { toJid: { in: TEST_JIDS } }] },
    select: { id: true },
  });
  await prisma.outboundMessage.deleteMany({ where: { id: { in: oldOutbound.map((o) => o.id) } } });
  await prisma.appointment.deleteMany({ where: { id: { in: oldApptIds } } });
  await prisma.conversationState.deleteMany({ where: { patientJid: { in: TEST_JIDS } } });
  await prisma.service.deleteMany({ where: { id: { in: oldServiceIds } } });
  await prisma.patient.deleteMany({ where: { id: { in: oldPatientIds } } });
}

/** Borra por id los mensajes y turnos de un escenario (los turnos son propios). */
async function dropScenario(apptIds: string[]): Promise<void> {
  const rows = await prisma.outboundMessage.findMany({ where: { appointmentId: { in: apptIds } }, select: { id: true } });
  const ids = rows.map((r) => r.id);
  ids.forEach((id) => outboundIds.add(id));
  await prisma.outboundMessage.deleteMany({ where: { id: { in: ids } } });
  await prisma.appointment.deleteMany({ where: { id: { in: apptIds } } });
  apptIds.forEach((id) => appointmentIds.delete(id));
  ids.forEach((id) => outboundIds.delete(id));
}

async function finalCleanup(): Promise<void> {
  const apptIds = [...appointmentIds];
  const safety = await prisma.outboundMessage.findMany({
    where: { appointmentId: { in: apptIds } },
    select: { id: true },
  });
  await prisma.outboundMessage.deleteMany({ where: { id: { in: [...outboundIds, ...safety.map((r) => r.id)] } } });
  await prisma.appointment.deleteMany({ where: { id: { in: apptIds } } });
  // Solo si este script creó los pacientes (si abortó por un jid real, no toca su estado).
  if (patientIds.length > 0) {
    await prisma.conversationState.deleteMany({ where: { patientJid: { in: TEST_JIDS } } });
  }
  await prisma.service.deleteMany({ where: { id: { in: serviceIds } } });
  await prisma.patient.deleteMany({ where: { id: { in: patientIds } } });
}

async function main(): Promise<void> {
  const bot = await prisma.botStatus.findUnique({ where: { id: 1 } });
  if (bot?.connected && process.env.ALLOW_BOT_RUNNING !== "1") {
    throw new Error("Pará el bot antes de correr esta prueba (o ALLOW_BOT_RUNNING=1 si BotStatus quedó colgado)");
  }
  const tz = (await getProfessional()).timezone; // solo lectura
  await preCleanup();

  const day0 = dayKeyInTz(new Date(Date.now() + 40 * DAY), tz);
  const wall = (dayOffset: number, hhmm: string) => wallTimeToUtc(shiftKey(day0, dayOffset), hhmm, tz);
  const T0 = wall(0, "12:00");
  const at = (d: Date, delta: number) => new Date(d.getTime() + delta);

  const mkPatient = async (jid: string, name: string) => {
    const p = await prisma.patient.create({ data: { whatsappJid: jid, phone: jid.split("@")[0]!, name } });
    patientIds.push(p.id);
    return p;
  };
  const A = await mkPatient(JID_A, "Ana HU014 (TEST)");
  const B = await mkPatient(JID_B, "Bruno HU014 (TEST)");

  const services: Record<string, { id: string; price: unknown }> = {};
  const mkService = async (name: string, reminders: ServiceReminder[]) => {
    const s = await prisma.service.create({
      data: { name, durationMin: 30, price: 10000, active: false, reminders: reminders.map((r) => ({ ...r })) },
    });
    serviceIds.push(s.id);
    services[name] = s;
    return s;
  };
  await mkService(S.d7, [days(7)]);
  await mkService(S.d2h24, [days(2), hours(24)]);
  await mkService(S.d2, [days(2)]);
  await mkService(S.conf, [days(3, true), hours(24)]);
  await mkService(S.none, []);
  await mkService(S.change, [days(7)]);
  await mkService(S.changeSent, [days(3, true), hours(24)]);

  const mkAppt = async (p: {
    patientId: string;
    service: string;
    startsAt: Date;
    bookedAt: Date | null;
    status?: "CONFIRMED" | "CANCELLED" | "AWAITING_PAYMENT";
  }) => {
    const svc = services[p.service]!;
    const a = await prisma.appointment.create({
      data: {
        patientId: p.patientId,
        serviceId: svc.id,
        startsAt: p.startsAt,
        endsAt: at(p.startsAt, 30 * MIN),
        status: p.status ?? "CONFIRMED",
        createdBy: "PATIENT",
        priceSnapshot: 10000,
        needsGoogleSync: false,
        bookedAt: p.bookedAt,
      },
    });
    appointmentIds.add(a.id);
    return a;
  };
  // El reloj es inyectado pero `createdAt` lo pone la base (hora real). Para que la regla de
  // "cubierto" (SDD §15) vea el instante simulado, cada fila nueva del paciente pasa a
  // createdAt = now, por id (filas propias del script).
  const stamped = new Set<string>();
  const stamp = async (now: Date, patientId: string) => {
    const fresh = await prisma.outboundMessage.findMany({
      where: { appointment: { patientId }, id: { notIn: [...stamped] } },
      select: { id: true },
    });
    for (const { id } of fresh) {
      stamped.add(id);
      outboundIds.add(id);
      await prisma.outboundMessage.update({ where: { id }, data: { createdAt: now } });
    }
  };
  const run = async (now: Date, patientId: string) => {
    const res = await enqueueServiceReminders({ now, scope: { patientIds: [patientId] } });
    await stamp(now, patientId);
    return res;
  };
  const runA = (now: Date) => run(now, A.id);
  const runB = (now: Date) => run(now, B.id);
  const manualA = async (id: string, now: Date) => {
    const r = await enqueueReminderNow(id, { now });
    await stamp(now, A.id);
    return r;
  };
  const rows = async (appointmentId: string, kind: "REMINDER" | "CONFIRMATION_REQUEST" = "REMINDER") => {
    const r = await prisma.outboundMessage.findMany({
      where: { appointmentId, kind },
      orderBy: { createdAt: "asc" },
      select: { id: true, dedupeKey: true, body: true, status: true, toJid: true },
    });
    r.forEach((m) => outboundIds.add(m.id));
    return r;
  };

  let ok = 0;
  let failed = 0;
  const step = async (label: string, fn: () => Promise<void>) => {
    try {
      await fn();
      console.log(`✅ ${label}`);
      ok++;
    } catch (err) {
      console.log(`❌ ${label}\n   ${(err as Error).message}`);
      failed++;
    }
  };

  // 1. Control 7 días.
  {
    const startsAt = wall(7, "17:00");
    const a = await mkAppt({ patientId: A.id, service: S.d7, startsAt, bookedAt: at(T0, -5 * DAY) });
    const moment = wall(0, "17:00");
    await step("1. Control 7 días: sale en su momento con 'en una semana', no se repite, no hay otro a las 24 h", async () => {
      assert.deepEqual(await runA(at(moment, MIN)), { reminders: 1, confirmations: 0 });
      const r = await rows(a.id);
      assert.equal(r.length, 1);
      assert.equal(r[0]!.dedupeKey, "auto:168h");
      assert.equal(r[0]!.toJid, JID_A);
      assert.ok(r[0]!.body.includes("tenés turno en una semana"), r[0]!.body);
      assert.deepEqual(await runA(at(moment, MIN)), { reminders: 0, confirmations: 0 });
      assert.deepEqual(await runA(at(startsAt, -DAY)), { reminders: 0, confirmations: 0 });
      assert.equal((await rows(a.id)).length, 1);
    });
    await dropScenario([a.id]);
  }

  // 2. Primera consulta (2 días + 24 h).
  {
    const startsAt = wall(2, "10:00");
    const a = await mkAppt({ patientId: A.id, service: S.d2h24, startsAt, bookedAt: at(T0, -5 * DAY) });
    await step("2. Primera consulta: 'pasado mañana' (auto:48h) y después 'mañana' (auto:24h)", async () => {
      assert.deepEqual(await runA(at(startsAt, -2 * DAY + MIN)), { reminders: 1, confirmations: 0 });
      assert.deepEqual(await runA(at(startsAt, -DAY + MIN)), { reminders: 1, confirmations: 0 });
      const r = await rows(a.id);
      assert.deepEqual(r.map((m) => m.dedupeKey), ["auto:48h", "auto:24h"]);
      assert.ok(r[0]!.body.includes("tenés turno pasado mañana"), r[0]!.body);
      assert.ok(r[1]!.body.includes("tenés turno mañana"), r[1]!.body);
    });
    await dropScenario([a.id]);
  }

  // 3. Reserva tardía.
  {
    const startsAt = wall(3, "10:00");
    const bookedAt = at(startsAt, -46 * H);
    const a = await mkAppt({ patientId: A.id, service: S.d2h24, startsAt, bookedAt });
    await step("3. Reserva tardía (46 h antes): sin el de 2 días, sí el de 24 h", async () => {
      assert.deepEqual(await runA(at(bookedAt, MIN)), { reminders: 0, confirmations: 0 });
      assert.deepEqual(await runA(at(startsAt, -DAY + MIN)), { reminders: 1, confirmations: 0 });
      assert.deepEqual((await rows(a.id)).map((m) => m.dedupeKey), ["auto:24h"]);
    });
    await dropScenario([a.id]);
  }

  // 4. Menos anticipación que todos.
  {
    const startsAt = wall(3, "10:00");
    const a = await mkAppt({ patientId: A.id, service: S.d2h24, startsAt, bookedAt: at(startsAt, -20 * H) });
    await step("4. Reservado 20 h antes: ningún recordatorio", async () => {
      assert.deepEqual(await runA(at(startsAt, -19 * H)), { reminders: 0, confirmations: 0 });
      assert.deepEqual(await runA(at(startsAt, -H)), { reminders: 0, confirmations: 0 });
      assert.equal((await rows(a.id)).length, 0);
    });
    await dropScenario([a.id]);
  }

  // 5. Bot caído.
  {
    const startsAt = wall(4, "10:00");
    const a = await mkAppt({ patientId: A.id, service: S.d2h24, startsAt, bookedAt: at(startsAt, -5 * DAY) });
    await step("5a. Bot caído, vuelve 20 h antes: solo el de 24 h", async () => {
      assert.deepEqual(await runA(at(startsAt, -20 * H)), { reminders: 1, confirmations: 0 });
      assert.deepEqual((await rows(a.id)).map((m) => m.dedupeKey), ["auto:24h"]);
    });
    await dropScenario([a.id]);
    const b = await mkAppt({ patientId: A.id, service: S.d2h24, startsAt, bookedAt: at(startsAt, -5 * DAY) });
    await step("5b. Bot caído, vuelve 90 min antes: nada", async () => {
      assert.deepEqual(await runA(at(startsAt, -90 * MIN)), { reminders: 0, confirmations: 0 });
      assert.equal((await rows(b.id)).length, 0);
    });
    await dropScenario([b.id]);
  }

  // 6. No confirmados.
  {
    const startsAt = wall(5, "10:00");
    const c = await mkAppt({ patientId: A.id, service: S.d2h24, startsAt, bookedAt: at(T0, -5 * DAY), status: "CANCELLED" });
    const w = await mkAppt({ patientId: A.id, service: S.d2h24, startsAt: at(startsAt, H), bookedAt: null, status: "AWAITING_PAYMENT" });
    await step("6. Turnos CANCELLED y AWAITING_PAYMENT: nada", async () => {
      assert.deepEqual(await runA(at(startsAt, -DAY + MIN)), { reminders: 0, confirmations: 0 });
      assert.deepEqual(await runA(at(startsAt, -2 * DAY + MIN)), { reminders: 0, confirmations: 0 });
    });
    await dropScenario([c.id, w.id]);
  }

  // 7. Seña aprobada después del momento de 2 días.
  {
    const startsAt = wall(5, "10:00");
    const moment48 = at(startsAt, -2 * DAY);
    const a = await mkAppt({ patientId: A.id, service: S.d2h24, startsAt, bookedAt: null, status: "AWAITING_PAYMENT" });
    await prisma.appointment.update({ where: { id: a.id }, data: { status: "CONFIRMED", bookedAt: at(moment48, 30 * MIN) } });
    await step("7. Seña aprobada después del momento de 2 días: ese no, el de 24 h sí", async () => {
      assert.deepEqual(await runA(at(moment48, H)), { reminders: 0, confirmations: 0 });
      assert.deepEqual(await runA(at(startsAt, -DAY + MIN)), { reminders: 1, confirmations: 0 });
      assert.deepEqual((await rows(a.id)).map((m) => m.dedupeKey), ["auto:24h"]);
    });
    await dropScenario([a.id]);
  }

  // 8. Corrimiento nocturno (D6).
  {
    const startsAt = wall(3, "08:00");
    const a = await mkAppt({ patientId: A.id, service: S.d2, startsAt, bookedAt: at(T0, -5 * DAY) });
    await step("8. 2 días con turno a las 08:00: no a las 08:30, sí a las 09:01", async () => {
      assert.deepEqual(await runA(wall(1, "08:30")), { reminders: 0, confirmations: 0 });
      assert.deepEqual(await runA(wall(1, "09:01")), { reminders: 1, confirmations: 0 });
      assert.deepEqual((await rows(a.id)).map((m) => m.dedupeKey), ["auto:48h"]);
    });
    await dropScenario([a.id]);
  }

  // 9. Cambio de configuración.
  {
    const startsAt = wall(10, "10:00");
    const a = await mkAppt({ patientId: A.id, service: S.change, startsAt, bookedAt: at(T0, -5 * DAY) });
    await step("9. Cambio de config [7 días] → [7 días, 2 días]: sale el nuevo, el de 7 días no se repite", async () => {
      assert.deepEqual(await runA(at(startsAt, -7 * DAY + MIN)), { reminders: 1, confirmations: 0 });
      await prisma.service.update({ where: { id: services[S.change]!.id }, data: { reminders: [days(7), days(2)].map((r) => ({ ...r })) } });
      assert.deepEqual(await runA(at(startsAt, -2 * DAY + MIN)), { reminders: 1, confirmations: 0 });
      const r = await rows(a.id);
      assert.deepEqual(r.map((m) => m.dedupeKey), ["auto:168h", "auto:48h"]);
    });
    await dropScenario([a.id]);
  }

  // 10 + 13. Pide confirmar, y estado a mitad de camino.
  {
    const startsAt = wall(4, "10:00");
    const a = await mkAppt({ patientId: B.id, service: S.conf, startsAt, bookedAt: at(T0, -5 * DAY) });
    await step("10. Pide confirmar: CONFIRMATION_REQUEST, confirmationRequestedAt y CONFIRM_ATTENDANCE; sin repetir", async () => {
      const now = at(startsAt, -3 * DAY + MIN);
      assert.deepEqual(await runB(now), { reminders: 0, confirmations: 1 });
      const conf = await rows(a.id, "CONFIRMATION_REQUEST");
      assert.equal(conf.length, 1);
      assert.equal(conf[0]!.dedupeKey, "");
      assert.ok(conf[0]!.body.startsWith("¿Vas a poder venir a tu turno?"), conf[0]!.body);
      const appt = await prisma.appointment.findUniqueOrThrow({ where: { id: a.id } });
      assert.equal(appt.confirmationRequestedAt?.getTime(), now.getTime());
      const state = await prisma.conversationState.findUniqueOrThrow({ where: { patientJid: JID_B } });
      assert.equal(state.step, "CONFIRM_ATTENDANCE");
      assert.equal((state.context as { apptId?: string }).apptId, a.id);
      assert.deepEqual(await runB(now), { reminders: 0, confirmations: 0 });
      assert.deepEqual(await runB(at(now, 2 * H)), { reminders: 0, confirmations: 0 });
      // Simula el despacho (el bot está apagado): la fila propia pasa a SENT, por id.
      await prisma.outboundMessage.update({ where: { id: conf[0]!.id }, data: { status: "SENT", sentAt: now } });
    });
    await step("13. Estado a mitad de camino", async () => {
      const items = await getAppointmentReminderStatus(a.id, { now: at(startsAt, -2 * DAY) });
      assert.equal(reminderStatusText(items), "3 días antes, pide confirmar (enviado) · 24 h antes (pendiente)");
    });
    await step("10b. Después sale el de 24 h", async () => {
      assert.deepEqual(await runB(at(startsAt, -DAY + MIN)), { reminders: 1, confirmations: 0 });
      assert.deepEqual((await rows(a.id)).map((m) => m.dedupeKey), ["auto:24h"]);
      const items = await getAppointmentReminderStatus(a.id, { now: at(startsAt, -DAY + 2 * MIN) });
      assert.equal(reminderStatusText(items), "3 días antes, pide confirmar (enviado) · 24 h antes (en cola)");
    });
    await dropScenario([a.id]);
  }

  // 11. Manual.
  {
    const startsAt = wall(6, "10:00");
    const a = await mkAppt({ patientId: A.id, service: S.d2h24, startsAt, bookedAt: at(T0, -5 * DAY) });
    await step("11. Manual: queued → already_pending → (SENT) queued; el automático de 24 h sale igual", async () => {
      const now = at(startsAt, -3 * DAY);
      assert.equal(await manualA(a.id, now), "queued");
      assert.equal(await manualA(a.id, at(now, MIN)), "already_pending");
      let manual = (await rows(a.id)).filter((m) => m.dedupeKey.startsWith("manual:"));
      assert.equal(manual.length, 1);
      assert.ok(manual[0]!.body.includes("tenés turno en 3 días"), manual[0]!.body);
      await prisma.outboundMessage.update({ where: { id: manual[0]!.id }, data: { status: "SENT", sentAt: now } });
      assert.equal(await manualA(a.id, at(now, 2 * MIN)), "queued");
      manual = (await rows(a.id)).filter((m) => m.dedupeKey.startsWith("manual:"));
      assert.equal(manual.length, 2);
      assert.deepEqual(await runA(at(startsAt, -DAY + MIN)), { reminders: 1, confirmations: 0 });
      assert.deepEqual(
        (await rows(a.id)).filter((m) => m.dedupeKey.startsWith("auto:")).map((m) => m.dedupeKey),
        ["auto:24h"],
      );
      assert.equal(await manualA(a.id, at(startsAt, MIN)), "not_applicable");
    });
    await dropScenario([a.id]);
  }

  // 14. Cambio de config con avisos ya enviados (SDD §15, review_HU-014 cambio 1).
  {
    const svc = services[S.changeSent]!.id;
    const setReminders = (list: ServiceReminder[]) =>
      prisma.service.update({ where: { id: svc }, data: { reminders: list.map((r) => ({ ...r })) } });
    const startsAt = wall(9, "10:00");
    const a = await mkAppt({ patientId: B.id, service: S.changeSent, startsAt, bookedAt: at(T0, -5 * DAY) });
    await step("14a. 24 h enviado y la config pasa a 48 h: no se repite 'mañana'", async () => {
      assert.deepEqual(await runB(at(startsAt, -3 * DAY + MIN)), { reminders: 0, confirmations: 1 });
      assert.deepEqual(await runB(at(startsAt, -DAY + MIN)), { reminders: 1, confirmations: 0 });
      await setReminders([days(3, true), hours(48)]);
      assert.deepEqual(await runB(at(startsAt, -20 * H)), { reminders: 0, confirmations: 0 });
      assert.deepEqual(await runB(at(startsAt, -3 * H)), { reminders: 0, confirmations: 0 });
      assert.deepEqual((await rows(a.id)).map((m) => m.dedupeKey), ["auto:24h"]);
      const text = reminderStatusText(await getAppointmentReminderStatus(a.id, { now: at(startsAt, -20 * H) }));
      assert.ok(!text.includes("pendiente"), text);
    });
    await dropScenario([a.id]);
    await prisma.conversationState.deleteMany({ where: { patientJid: JID_B } });
    await setReminders([days(3, true), hours(24)]);
    const b = await mkAppt({ patientId: B.id, service: S.changeSent, startsAt, bookedAt: at(T0, -5 * DAY) });
    await step("14b. Pedido de confirmación enviado y se mueve 'pide confirmar' a 24 h: nada más", async () => {
      assert.deepEqual(await runB(at(startsAt, -3 * DAY + MIN)), { reminders: 0, confirmations: 1 });
      await setReminders([days(3), hours(24, true)]);
      assert.deepEqual(await runB(at(startsAt, -60 * H)), { reminders: 0, confirmations: 0 });
      assert.deepEqual(await runB(at(startsAt, -DAY + MIN)), { reminders: 0, confirmations: 0 });
      assert.equal((await rows(b.id)).length, 0);
      assert.equal((await rows(b.id, "CONFIRMATION_REQUEST")).length, 1);
    });
    await dropScenario([b.id]);
  }

  // 12. Sin recordatorios.
  {
    const startsAt = wall(8, "10:00");
    const a = await mkAppt({ patientId: A.id, service: S.none, startsAt, bookedAt: at(T0, -5 * DAY) });
    await step("12. Servicio sin recordatorios: nada", async () => {
      assert.deepEqual(await runA(at(startsAt, -DAY)), { reminders: 0, confirmations: 0 });
      assert.deepEqual(await runA(at(startsAt, -3 * DAY + MIN)), { reminders: 0, confirmations: 0 });
      assert.equal((await rows(a.id)).length, 0);
      assert.equal(reminderStatusText(await getAppointmentReminderStatus(a.id, { now: at(startsAt, -DAY) })), "Sin recordatorios");
    });
    await dropScenario([a.id]);
  }

  console.log(`\n${ok} OK, ${failed} con error.`);
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error("\n🔥 Falló la simulación:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await finalCleanup();
    await prisma.$disconnect();
  });
