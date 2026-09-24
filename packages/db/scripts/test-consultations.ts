/**
 * Prueba contra la base de desarrollo del dominio de consultas (HU-003).
 *
 * - Usa solo datos propios (paciente, servicio, turnos, consultas, mediciones y planes que crea acá)
 *   y los borra por id en `finally`. Nunca filtra por patientId, fechas ni nombres.
 * - No usa createAppointment ni cancelAppointment (encolan WhatsApp) y verifica que no se encoló nada.
 *
 * Uso (desde packages/db): npx dotenv -e ../../.env -- tsx scripts/test-consultations.ts
 */
import assert from "node:assert/strict";
import { addDays } from "date-fns";
import { dayKeyInTz } from "@nutri-bot/core";
import { prisma } from "../index";
import {
  AppointmentConsultationDateError,
  ConsultationNotDeletableError,
  FutureConsultationDateError,
  addEvolutionEntryOnDay,
  addEvolutionEntryToConsultation,
  createManualConsultation,
  createPlanForConsultation,
  deleteConsultation,
  getProfessional,
  saveConsultationNotes,
  setAppointmentStatus,
  setConsultationPlan,
  updateManualConsultationDate,
} from "../domain";

const DAY = 86_400_000;

async function main() {
  const entryIds: string[] = [];
  const consultationIds: string[] = [];
  const planIds: string[] = [];
  const appointmentIds: string[] = [];
  let patientId: string | null = null;
  let serviceId: string | null = null;

  const step = async (label: string, fn: () => Promise<void>) => {
    try {
      await fn();
      console.log(`ok  ${label}`);
    } catch (err) {
      console.log(`ERR ${label}`);
      throw err;
    }
  };

  try {
    const pro = await getProfessional();
    const tz = pro.timezone;

    // 1) Datos propios.
    const patient = await prisma.patient.create({
      data: {
        whatsappJid: `test-hu003-${Date.now()}@test.invalid`,
        phone: "000",
        name: "Prueba HU-003 (TEST)",
        birthDate: new Date("2014-09-20"),
      },
    });
    patientId = patient.id;
    const service = await prisma.service.create({
      data: { name: "HU-003 (TEST)", price: 0, durationMin: 30, active: false },
    });
    serviceId = service.id;

    // 2) Tres turnos directos (sin createAppointment: no encola WhatsApp), en días pasados distintos.
    const now = Date.now();
    const mkAppt = async (daysAgo: number) => {
      const startsAt = new Date(now - daysAgo * DAY);
      const a = await prisma.appointment.create({
        data: {
          patientId: patient.id,
          serviceId: service.id,
          startsAt,
          endsAt: new Date(startsAt.getTime() + 30 * 60_000),
          status: "CONFIRMED",
          createdBy: "PROFESSIONAL",
          priceSnapshot: 0,
          needsGoogleSync: false,
        },
      });
      appointmentIds.push(a.id);
      return a;
    };
    const A = await mkAppt(30);
    const B = await mkAppt(31);
    const C = await mkAppt(32);

    // 3) Completar crea la consulta una sola vez.
    let consultationA = "";
    await step("COMPLETED crea la consulta y es idempotente", async () => {
      const r1 = await setAppointmentStatus({ id: A.id, status: "COMPLETED" });
      assert.equal(r1.appointment.status, "COMPLETED");
      assert.ok(r1.consultation);
      assert.equal(r1.consultation.created, true);
      consultationIds.push(r1.consultation.id);
      const c = await prisma.consultation.findUniqueOrThrow({ where: { id: r1.consultation.id } });
      assert.equal(c.appointmentId, A.id);
      assert.equal(c.consultedAt.getTime(), A.startsAt.getTime());
      const r2 = await setAppointmentStatus({ id: A.id, status: "COMPLETED" });
      assert.deepEqual(r2.consultation, { id: r1.consultation.id, created: false });
      assert.equal(await prisma.consultation.count({ where: { appointmentId: A.id } }), 1);
      consultationA = r1.consultation.id;
    });

    // 4) Revertir con la consulta vacía la borra.
    await step("CONFIRMED con consulta vacía la borra", async () => {
      const r = await setAppointmentStatus({ id: A.id, status: "CONFIRMED" });
      assert.equal(r.removedEmptyConsultation, true);
      assert.equal(r.consultation, null);
      assert.equal(await prisma.consultation.findUnique({ where: { id: consultationA } }), null);
    });

    // 5) Revertir con contenido la conserva; volver a completar reusa la misma.
    await step("CONFIRMED con contenido la conserva y COMPLETED reusa la misma", async () => {
      const r1 = await setAppointmentStatus({ id: A.id, status: "COMPLETED" });
      assert.ok(r1.consultation?.created);
      consultationIds.push(r1.consultation.id);
      consultationA = r1.consultation.id;
      const entry = await addEvolutionEntryToConsultation(consultationA, { weightKg: 66.5, bodyFatPercent: 29.4 });
      entryIds.push(entry.id);
      assert.equal(entry.consultationId, consultationA);
      assert.equal(entry.patientId, patient.id);
      assert.equal(dayKeyInTz(entry.recordedAt, tz), dayKeyInTz(A.startsAt, tz));
      const r2 = await setAppointmentStatus({ id: A.id, status: "CONFIRMED" });
      assert.equal(r2.removedEmptyConsultation, false);
      assert.ok(await prisma.consultation.findUnique({ where: { id: consultationA } }));
      assert.ok(await prisma.evolutionEntry.findUnique({ where: { id: entry.id } }));
      const r3 = await setAppointmentStatus({ id: A.id, status: "COMPLETED" });
      assert.deepEqual(r3.consultation, { id: consultationA, created: false });
    });

    // 6) NO_SHOW no crea consulta.
    await step("NO_SHOW no crea consulta", async () => {
      const r = await setAppointmentStatus({ id: B.id, status: "NO_SHOW" });
      assert.equal(r.consultation, null);
      assert.equal(await prisma.consultation.count({ where: { appointmentId: B.id } }), 0);
    });

    // 7) Consulta manual: no futura, cambio de fecha arrastra las mediciones.
    let manualId = "";
    await step("createManualConsultation / updateManualConsultationDate", async () => {
      const tomorrow = dayKeyInTz(addDays(new Date(), 1), tz);
      await assert.rejects(
        createManualConsultation({ patientId: patient.id, dayKey: tomorrow }),
        FutureConsultationDateError,
      );
      const manual = await createManualConsultation({ patientId: patient.id, dayKey: "2026-09-15" });
      consultationIds.push(manual.id);
      manualId = manual.id;
      assert.equal(manual.appointmentId, null);
      assert.equal(manual.consultedAt.toISOString(), "2026-09-15T15:00:00.000Z");
      const entry = await addEvolutionEntryToConsultation(manual.id, { weightKg: 70 });
      entryIds.push(entry.id);
      const moved = await updateManualConsultationDate({ consultationId: manual.id, dayKey: "2026-09-14" });
      assert.equal(moved.consultedAt.toISOString(), "2026-09-14T15:00:00.000Z");
      const movedEntry = await prisma.evolutionEntry.findUniqueOrThrow({ where: { id: entry.id } });
      assert.equal(movedEntry.recordedAt.toISOString(), "2026-09-14T15:00:00.000Z");
      await assert.rejects(
        updateManualConsultationDate({ consultationId: consultationA, dayKey: "2026-09-14" }),
        AppointmentConsultationDateError,
      );
    });

    // 8) Alta desde Evolución: cae en la consulta del día o crea una sin turno.
    let day20Id = "";
    await step("addEvolutionEntryOnDay", async () => {
      const r1 = await addEvolutionEntryOnDay(patient.id, "2026-09-14", { heightCm: 150, waistCm: 60 });
      entryIds.push(r1.entry.id);
      assert.equal(r1.consultationCreated, false);
      assert.equal(r1.consultation.id, manualId);
      assert.equal(r1.entry.consultationId, manualId);
      assert.equal(r1.entry.recordedAt.toISOString(), "2026-09-14T15:00:00.000Z");
      const r2 = await addEvolutionEntryOnDay(patient.id, "2026-09-20", { weightKg: 45 });
      entryIds.push(r2.entry.id);
      consultationIds.push(r2.consultation.id);
      assert.equal(r2.consultationCreated, true);
      assert.equal(r2.consultation.appointmentId, null);
      assert.equal(r2.entry.consultationId, r2.consultation.id);
      day20Id = r2.consultation.id;
      const tomorrow = dayKeyInTz(addDays(new Date(), 1), tz);
      await assert.rejects(addEvolutionEntryOnDay(patient.id, tomorrow, { weightKg: 45 }), (err: unknown) => {
        assert.ok(err instanceof FutureConsultationDateError);
        assert.equal(err.message, "La fecha de la medición no puede ser futura");
        return true;
      });
    });

    // 9) Plan: crear, quitar (no toca el plan), indicar en otra consulta.
    await step("createPlanForConsultation / setConsultationPlan", async () => {
      const plan = await createPlanForConsultation({ consultationId: day20Id });
      planIds.push(plan.id);
      assert.equal(plan.status, "DRAFT");
      assert.equal(plan.patientId, patient.id);
      assert.equal(plan.title, "Plan del 20/09/2026");
      const linked = await prisma.consultation.findUniqueOrThrow({ where: { id: day20Id } });
      assert.equal(linked.planId, plan.id);
      const before = await prisma.nutritionPlan.findUniqueOrThrow({ where: { id: plan.id } });
      const cleared = await setConsultationPlan({ consultationId: day20Id, planId: null });
      assert.equal(cleared.planId, null);
      const after = await prisma.nutritionPlan.findUniqueOrThrow({ where: { id: plan.id } });
      assert.equal(after.updatedAt.getTime(), before.updatedAt.getTime());
      await setConsultationPlan({ consultationId: day20Id, planId: plan.id });
      const other = await setConsultationPlan({ consultationId: manualId, planId: plan.id });
      assert.equal(other.planId, plan.id);
      assert.equal(await prisma.consultation.count({ where: { planId: plan.id, id: { in: consultationIds } } }), 2);
    });

    // 10) Borrado a mano.
    await step("deleteConsultation", async () => {
      await assert.rejects(deleteConsultation(consultationA), ConsultationNotDeletableError);
      const empty = await createManualConsultation({ patientId: patient.id, dayKey: "2026-09-10" });
      consultationIds.push(empty.id);
      const withNotes = await saveConsultationNotes({ consultationId: empty.id, notes: "  x  " });
      assert.equal(withNotes.notes, "x");
      const blank = await saveConsultationNotes({ consultationId: empty.id, notes: "   " });
      assert.equal(blank.notes, null);
      await saveConsultationNotes({ consultationId: empty.id, notes: "x" });
      await deleteConsultation(empty.id);
      assert.equal(await prisma.consultation.findUnique({ where: { id: empty.id } }), null);
    });

    // 11) Nada encolado para WhatsApp.
    await step("sin OutboundMessage de estos turnos", async () => {
      assert.equal(
        await prisma.outboundMessage.count({ where: { appointmentId: { in: [A.id, B.id, C.id] } } }),
        0,
      );
    });

    console.log("OK");
  } finally {
    // Limpieza, siempre por ids propios.
    if (appointmentIds.length > 0) {
      const byAppt = await prisma.consultation.findMany({
        where: { appointmentId: { in: appointmentIds } },
        select: { id: true },
      });
      for (const c of byAppt) if (!consultationIds.includes(c.id)) consultationIds.push(c.id);
    }
    await prisma.evolutionEntry.deleteMany({ where: { id: { in: entryIds } } });
    await prisma.consultation.deleteMany({ where: { id: { in: consultationIds } } });
    await prisma.nutritionPlan.deleteMany({ where: { id: { in: planIds } } });
    await prisma.appointment.deleteMany({ where: { id: { in: appointmentIds } } });
    if (serviceId) await prisma.service.delete({ where: { id: serviceId } });
    if (patientId) await prisma.patient.delete({ where: { id: patientId } });
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
