/**
 * Prueba contra la base de desarrollo del dominio de prescripciones (HU-004).
 *
 * - Usa solo datos propios (pacientes, servicio, turno, consultas, mediciones y prescripciones que
 *   crea acá) y los borra por id en `finally`. Nunca filtra por patientId, fechas ni nombres.
 * - No usa createAppointment (encola WhatsApp) y verifica que no se encoló nada.
 *
 * Uso (desde packages/db): npx dotenv -e ../../.env -- tsx scripts/test-prescriptions.ts
 */
import assert from "node:assert/strict";
import { dayKeyInTz, dayRangeUtc, type PrescriptionChoices } from "@nutri-bot/core";
import { prisma } from "../index";
import {
  ConsultationNotDeletableError,
  InvalidPrescriptionError,
  addEvolutionEntryToConsultation,
  createManualConsultation,
  deleteConsultation,
  deleteConsultationPrescription,
  getFormulaMeasurementsAsOf,
  getProfessional,
  getReferencePrescription,
  getRequirementContextForConsultation,
  listLatestPrescriptions,
  saveConsultationPrescription,
  setAppointmentStatus,
  toPrescriptionSnapshot,
} from "../domain";

const baseChoices: PrescriptionChoices = {
  bmrFormula: "MIFFLIN_ST_JEOR",
  weightBasis: "ACTUAL",
  bodyFatSource: "MEASURED",
  activityLevel: "LIGHT",
  nutritionGoal: "LOSE_WEIGHT",
  adjustmentRange: "MODERATE_DEFICIT",
  adjustmentPercent: -20,
  prescribedVctKcal: 1481,
  macros: { mode: "PERCENT_OF_VCT", proteinPercent: 20, fatPercent: 30, carbPercent: 50 },
};

async function main() {
  const entryIds: string[] = [];
  const consultationIds: string[] = [];
  const prescriptionIds: string[] = [];
  const appointmentIds: string[] = [];
  const patientIds: string[] = [];
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

  const until = async (consultedAt: Date) => {
    const pro = await getProfessional();
    return dayRangeUtc(dayKeyInTz(consultedAt, pro.timezone), pro.timezone).end;
  };

  try {
    // 1) Datos propios.
    const stamp = Date.now();
    const patient = await prisma.patient.create({
      data: {
        whatsappJid: `test-hu004-${stamp}@test.invalid`,
        phone: "000",
        name: "Prueba HU-004 (TEST)",
        birthDate: new Date("1992-03-20"),
        sex: "FEMALE",
        activityLevel: "LIGHT",
        nutritionGoal: "LOSE_WEIGHT",
      },
    });
    patientIds.push(patient.id);
    const minor = await prisma.patient.create({
      data: {
        whatsappJid: `test-hu004-minor-${stamp}@test.invalid`,
        phone: "000",
        name: "Prueba HU-004 menor (TEST)",
        birthDate: new Date("2014-01-10"),
        sex: "MALE",
      },
    });
    patientIds.push(minor.id);
    const service = await prisma.service.create({
      data: { name: "HU-004 (TEST)", price: 0, durationMin: 30, active: false },
    });
    serviceId = service.id;

    // 2–3) Consultas y mediciones.
    const c12 = await createManualConsultation({ patientId: patient.id, dayKey: "2026-09-12" });
    consultationIds.push(c12.id);
    const e12 = await addEvolutionEntryToConsultation(c12.id, {
      weightKg: 66.5,
      heightCm: 162,
      waistCm: 82,
      hipCm: 100,
      bodyFatPercent: 29.4,
    });
    entryIds.push(e12.id);
    const c20 = await createManualConsultation({ patientId: patient.id, dayKey: "2026-09-20" });
    consultationIds.push(c20.id);
    const e20 = await addEvolutionEntryToConsultation(c20.id, { weightKg: 60 });
    entryIds.push(e20.id);
    const c22 = await createManualConsultation({ patientId: patient.id, dayKey: "2026-09-22" });
    consultationIds.push(c22.id);

    // 4) D4: nunca una medición posterior; cada dato por separado.
    await step("mediciones D4 de la consulta del 12/09 y del 22/09", async () => {
      const m12 = await getFormulaMeasurementsAsOf({
        patientId: patient.id,
        consultationId: c12.id,
        until: await until(c12.consultedAt),
      });
      assert.equal(m12.weightKg?.value, 66.5);
      assert.equal(m12.heightCm?.value, 162);
      const m22 = await getFormulaMeasurementsAsOf({
        patientId: patient.id,
        consultationId: c22.id,
        until: await until(c22.consultedAt),
      });
      assert.equal(m22.weightKg?.value, 60);
      assert.equal(m22.weightKg?.consultationId, c20.id);
      assert.equal(m22.heightCm?.value, 162);
      assert.equal(m22.heightCm?.consultationId, c12.id);
      const ctx = await getRequirementContextForConsultation(c12.id);
      assert.equal(ctx.ageYears, 34);
      assert.deepEqual(ctx.ctx, {
        sex: "FEMALE",
        ageYears: 34,
        heightCm: 162,
        actualWeightKg: 66.5,
        measuredBodyFatPercent: 29.4,
      });
    });

    // 5) Guardar.
    await step("guardar la prescripción del 12/09 (1481 kcal)", async () => {
      const p = await saveConsultationPrescription({ consultationId: c12.id, choices: baseChoices });
      prescriptionIds.push(p.id);
      assert.equal(p.prescribedVctKcal, 1481);
      assert.equal(p.calculatedVctKcal, 1481);
      assert.equal(p.bmrKcal, 1347);
      assert.equal(p.totalExpenditureKcal, 1851);
      assert.equal(p.proteinG, 74);
      assert.equal(p.fatG, 49);
      assert.equal(p.carbG, 185);
      assert.equal(p.activityLevel, "LIGHT");
      assert.equal(p.bodyFatSource, "MEASURED");
      assert.equal(p.bodyFatRecordedAt?.getTime(), e12.recordedAt.getTime());
      assert.equal(Number(p.idealWeightDevineKg), 54.19);
      const snap = toPrescriptionSnapshot(p);
      assert.equal(snap.activityFactor, 1.375);
      assert.equal(snap.bodyFatPercent, 29.4);
    });

    // 6) Cambiar el paciente no cambia la prescripción.
    await step("cambiar la actividad del paciente no toca la prescripción", async () => {
      await prisma.patient.update({ where: { id: patient.id }, data: { activityLevel: "MODERATE" } });
      const p = await prisma.nutritionPrescription.findUniqueOrThrow({ where: { consultationId: c12.id } });
      assert.equal(p.activityLevel, "LIGHT");
      assert.equal(p.prescribedVctKcal, 1481);
    });

    // 7) Editar reemplaza.
    await step("guardar de nuevo con −15 % reemplaza (una sola fila, 1574)", async () => {
      const p = await saveConsultationPrescription({
        consultationId: c12.id,
        choices: { ...baseChoices, adjustmentPercent: -15, prescribedVctKcal: 1574 },
      });
      if (!prescriptionIds.includes(p.id)) prescriptionIds.push(p.id);
      assert.equal(await prisma.nutritionPrescription.count({ where: { consultationId: c12.id } }), 1);
      assert.equal(p.calculatedVctKcal, 1574);
      const patientNow = await prisma.patient.findUniqueOrThrow({ where: { id: patient.id } });
      assert.equal(patientNow.activityLevel, "MODERATE");
    });

    // 8) Inválidos: no se guarda nada.
    await step("valores inválidos tiran InvalidPrescriptionError y no cambian la fila", async () => {
      await assert.rejects(
        saveConsultationPrescription({ consultationId: c12.id, choices: { ...baseChoices, adjustmentPercent: -35 } }),
        InvalidPrescriptionError,
      );
      await assert.rejects(
        saveConsultationPrescription({ consultationId: c12.id, choices: { ...baseChoices, prescribedVctKcal: 7000 } }),
        InvalidPrescriptionError,
      );
      await assert.rejects(
        saveConsultationPrescription({
          consultationId: c12.id,
          choices: { ...baseChoices, bmrFormula: "KATCH_MCARDLE", bodyFatSource: null },
        }),
        InvalidPrescriptionError,
      );
      await assert.rejects(
        saveConsultationPrescription({
          consultationId: c12.id,
          choices: { ...baseChoices, macros: { mode: "PERCENT_OF_VCT", proteinPercent: 20, fatPercent: 30, carbPercent: 45 } },
        }),
        InvalidPrescriptionError,
      );
      const p = await prisma.nutritionPrescription.findUniqueOrThrow({ where: { consultationId: c12.id } });
      assert.equal(p.calculatedVctKcal, 1574);
    });

    // 9) La prescripción impide borrar la consulta.
    await step("deleteConsultation con prescripción → ConsultationNotDeletableError", async () => {
      await assert.rejects(deleteConsultation(c12.id), ConsultationNotDeletableError);
      const c15 = await createManualConsultation({ patientId: patient.id, dayKey: "2026-09-15" });
      consultationIds.push(c15.id);
      const p = await saveConsultationPrescription({ consultationId: c15.id, choices: baseChoices });
      prescriptionIds.push(p.id);
      await assert.rejects(deleteConsultation(c15.id), ConsultationNotDeletableError);
      assert.ok(await prisma.consultation.findUnique({ where: { id: c15.id } }));
      const ref = await getReferencePrescription({
        patientId: patient.id,
        consultationId: c22.id,
        consultedAt: c22.consultedAt,
      });
      assert.equal(ref?.adjustmentPercent, -20); // la del 15/09 (más reciente que la del 12/09)
    });

    // 10) Volver un turno a confirmado no se lleva una consulta con prescripción.
    await step("turno COMPLETED → prescripción → CONFIRMED conserva la consulta", async () => {
      const startsAt = new Date("2026-09-23T13:00:00Z");
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
      const done = await setAppointmentStatus({ id: a.id, status: "COMPLETED" });
      assert.ok(done.consultation);
      consultationIds.push(done.consultation.id);
      const ctx = await getRequirementContextForConsultation(done.consultation.id);
      assert.equal(ctx.ctx?.actualWeightKg, 60); // la del 20/09
      assert.equal(ctx.ctx?.heightCm, 162); // la del 12/09
      const p = await saveConsultationPrescription({ consultationId: done.consultation.id, choices: baseChoices });
      prescriptionIds.push(p.id);
      const back = await setAppointmentStatus({ id: a.id, status: "CONFIRMED" });
      assert.equal(back.removedEmptyConsultation, false);
      assert.ok(await prisma.consultation.findUnique({ where: { id: done.consultation.id } }));
    });

    // 11) Menor: sin contexto y sin guardar.
    await step("menor: ctx null y no se guarda", async () => {
      const cm = await createManualConsultation({ patientId: minor.id, dayKey: "2026-09-12" });
      consultationIds.push(cm.id);
      const em = await addEvolutionEntryToConsultation(cm.id, { weightKg: 40, heightCm: 150 });
      entryIds.push(em.id);
      const r = await getRequirementContextForConsultation(cm.id);
      assert.equal(r.ctx, null);
      assert.equal(r.ageYears, 12);
      await assert.rejects(
        saveConsultationPrescription({ consultationId: cm.id, choices: baseChoices }),
        InvalidPrescriptionError,
      );
      assert.equal(await prisma.nutritionPrescription.count({ where: { consultationId: cm.id } }), 0);
    });

    // 12) Borrar la prescripción.
    await step("deleteConsultationPrescription (idempotente)", async () => {
      await deleteConsultationPrescription(c12.id);
      await deleteConsultationPrescription(c12.id);
      assert.equal(await prisma.nutritionPrescription.count({ where: { consultationId: c12.id } }), 0);
      assert.ok(await prisma.consultation.findUnique({ where: { id: c12.id } }));
    });

    // 13) Orden del Resumen.
    await step("listLatestPrescriptions ordena por fecha de consulta desc", async () => {
      const list = await listLatestPrescriptions(patient.id, 2);
      assert.equal(list.length, 2);
      assert.ok(list[0]!.consultation.consultedAt.getTime() > list[1]!.consultation.consultedAt.getTime());
      assert.equal(dayKeyInTz(list[1]!.consultation.consultedAt, (await getProfessional()).timezone), "2026-09-15");
    });

    // 14) Nada encolado.
    await step("no se encoló ningún mensaje", async () => {
      assert.equal(await prisma.outboundMessage.count({ where: { appointmentId: { in: appointmentIds } } }), 0);
      const jids = (await prisma.patient.findMany({ where: { id: { in: patientIds } }, select: { whatsappJid: true } })).map(
        (p) => p.whatsappJid,
      );
      assert.equal(await prisma.outboundMessage.count({ where: { toJid: { in: jids } } }), 0);
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
    const byConsultation = await prisma.nutritionPrescription.findMany({
      where: { consultationId: { in: consultationIds } },
      select: { id: true },
    });
    for (const p of byConsultation) if (!prescriptionIds.includes(p.id)) prescriptionIds.push(p.id);
    await prisma.nutritionPrescription.deleteMany({ where: { id: { in: prescriptionIds } } });
    await prisma.evolutionEntry.deleteMany({ where: { id: { in: entryIds } } });
    await prisma.consultation.deleteMany({ where: { id: { in: consultationIds } } });
    await prisma.appointment.deleteMany({ where: { id: { in: appointmentIds } } });
    if (serviceId) await prisma.service.delete({ where: { id: serviceId } });
    await prisma.patient.deleteMany({ where: { id: { in: patientIds } } });
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
