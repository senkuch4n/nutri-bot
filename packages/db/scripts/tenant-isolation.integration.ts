// HU-025 (10.3, 025b-1). Correr solo vía test-tenant-isolation.sh, contra su Postgres descartable.
// Dos consultorios sintéticos (A y B), cada uno con profesional, agenda principal, paciente, servicio,
// turno, ficha, consulta, medición, estudio ISAK con informe, plan con comida, ítem, receta y texto,
// y una entrada de diario. Cada función de dominio de M1–M3 se llama con { tenantId: A } e ids de B:
// una lectura devuelve lo mismo que un id inexistente (null / vacío / error de no encontrado) y una
// escritura falla o no hace nada. En todos los casos se compara una foto de la base antes y después.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { prisma } from "../index";
import {
  addDiaryEntry, addEvolutionEntryOnDay, addEvolutionEntryToConsultation, addMeal, addMealItem, addRecipeItems,
  addSection, applyTemplateToPatient, archivePatient, cancelAppointment, checkSlotAvailable, copyDay, createAppointment,
  createIsakStudy, createManualConsultation, createPlan, createPlanForConsultation, deleteConsultation,
  deleteConsultationPrescription, deleteDiaryEntry, deleteEvolutionEntry, deleteIsakStudy, deleteMeal, deleteMealItem,
  deletePlan, deleteSection, enqueueAnthropometricReportMessage, enqueuePlanPdfMessage, enqueuePrepInstructions,
  enqueueReminderNow, enqueueServiceReminders, findOrCreatePatient, findOrCreatePatientByJid, findPatientByJidOrThrow,
  getAnthropometricReportMeta, getAnthropometricReportPdf, getAppointmentReminderStatus, getAvailableSlotsForService,
  getClinicalRecord, getConsultation, getFormulaMeasurementsAsOf, getIsakStudy, getLatestFormulaMeasurements, getPlan,
  getPlanConsultationId, getPlanTarget, getPreviousIsakStudy, getReferencePrescription, getRequirementContextForConsultation,
  getRescheduleSlots, getTenantProfessional, listConsultationsOnDay, listDiaryEntries, listEvolutionEntries,
  listLatestPrescriptions, listPatientConsultations, listPatientPlans, listPlanRecipePreviews, listSections, moveMeal,
  moveSection, removeMenuItems, renameMeal, repeatMealInAllDays, rescheduleAppointment, resolveTenantSchedulingContext,
  respondToAppointmentAttendance, restoreMealSnapshots, saveAnthropometricReportPdf, saveAnthropometricReportTexts,
  saveConsultationNotes, saveConsultationPrescription, savePlanPdf, setAppointmentStatus, setConsultationPlan,
  setMealMode, setMealOptions, setMeasureItemQuantity, setRecipeItemPortions, unarchivePatient, updateAppointmentReason,
  updateIsakStudy, updateManualConsultationDate, updateMeal, updateMealItem, updatePatientFormulaData, updatePlan,
  updateSection, upsertClinicalRecord,
} from "../domain";
import { listPatientLastContacts } from "../domain/conversationState";

if (process.env.TENANT_ISOLATION_DISPOSABLE !== "1" ||
    !/^postgresql:\/\/postgres:[a-f0-9]{36}@127\.0\.0\.1:\d+\/tenant_isolation$/.test(process.env.DATABASE_URL ?? "")) {
  throw new Error("Run test-tenant-isolation.sh for disposable PostgreSQL.");
}
after(() => prisma.$disconnect());

const A = { tenantId: "iso-a" };
const B = { tenantId: "iso-b" };
const TZ = "America/Argentina/Buenos_Aires";
const DAY = 86_400_000;
const future = new Date(Date.now() + 3 * DAY);
future.setUTCHours(15, 0, 0, 0);
const futureDayKey = future.toISOString().slice(0, 10);
const pastDayKey = new Date(Date.now() - 10 * DAY).toISOString().slice(0, 10);

type Fixture = {
  patientId: string; jid: string; phone: string; serviceId: string; appointmentId: string; consultationId: string;
  entryId: string; isakEntryId: string; reportId: string; planId: string; mealId: string; itemId: string;
  recipeItemId: string; measureItemId: string; recipeId: string; sectionId: string; diaryId: string; templateId: string;
};
const fx = {} as Record<"a" | "b", Fixture>;

async function seed(key: "a" | "b", tenantId: string, professionalId: number): Promise<Fixture> {
  const p = `iso-${key}`;
  const phone = key === "a" ? "5490000000101" : "5490000000202";
  const jid = `${phone}@s.whatsapp.net`;
  await prisma.tenant.create({ data: { id: tenantId } });
  await prisma.professional.create({
    data: { id: professionalId, tenantId, name: `Prof ${key}`, email: `${p}@example.test`, timezone: TZ, phoneJid: `pro-${key}@s.whatsapp.net` },
  });
  await prisma.agenda.create({ data: { id: `${p}-agenda`, tenantId, professionalId, isPrimary: true } });
  await prisma.availabilityRule.createMany({
    data: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ agendaId: `${p}-agenda`, weekday, startTime: "08:00", endTime: "20:00" })),
  });
  const patient = await prisma.patient.create({
    data: { id: `${p}-patient`, tenantId, whatsappJid: jid, phone, name: `Paciente ${key}`, sex: "FEMALE", birthDate: new Date("1990-01-01") },
  });
  const service = await prisma.service.create({
    data: { id: `${p}-service`, tenantId, name: `Consulta ${key}`, price: 1000, durationMin: 30, prepInstructions: "x", prepLeadHours: 96 },
  });
  const appointment = await prisma.appointment.create({
    data: {
      id: `${p}-appt`, tenantId, agendaId: `${p}-agenda`, patientId: patient.id, serviceId: service.id, startsAt: future,
      endsAt: new Date(future.getTime() + 30 * 60_000), status: "CONFIRMED", createdBy: "PROFESSIONAL", priceSnapshot: 1000,
      confirmationRequestedAt: new Date(),
    },
  });
  await prisma.clinicalRecord.create({ data: { patientId: patient.id, background: `fondo ${key}` } });
  const recipe = await prisma.recipe.create({ data: { id: `${p}-recipe`, tenantId, name: `Receta ${key}`, status: "PUBLISHED" } });
  const plan = await prisma.nutritionPlan.create({ data: { id: `${p}-plan`, tenantId, patientId: patient.id, title: `Plan ${key}`, status: "ACTIVE" } });
  const meal = await prisma.planMeal.create({ data: { id: `${p}-meal`, planId: plan.id, name: "Desayuno", order: 0, mode: "PER_DAY" } });
  const item = await prisma.planMealItem.create({ data: { id: `${p}-item`, mealId: meal.id, customLabel: "Fruta", order: 0, weekday: "MON" } });
  const recipeItem = await prisma.planMealItem.create({
    data: { id: `${p}-recipe-item`, mealId: meal.id, recipeId: recipe.id, portions: 1, order: 1, weekday: "MON" },
  });
  const food = await prisma.food.findFirst({ where: { source: "SARA2" }, select: { id: true } }) ??
    await prisma.food.create({
      data: { id: "iso-food", name: "Arroz", group: "LEGUMBRES_CEREALES", source: "SARA2", sourceKey: "iso-food", kcalPer100: 130, proteinPer100: 2, carbsPer100: 28, fatPer100: 0 },
      select: { id: true },
    });
  const measureItem = await prisma.planMealItem.create({
    data: {
      id: `${p}-measure-item`, mealId: meal.id, foodId: food.id, order: 2, weekday: "MON", quantityGrams: 180,
      measureQty: 1, measureName: "taza", measurePlural: "tazas", measureGrams: 180,
    },
  });
  const section = await prisma.planSection.create({ data: { id: `${p}-section`, planId: plan.id, title: "Texto", body: "Cuerpo", order: 0 } });
  const consultation = await prisma.consultation.create({
    data: { id: `${p}-cons`, tenantId, patientId: patient.id, consultedAt: new Date(`${pastDayKey}T15:00:00Z`), planId: plan.id },
  });
  const entry = await prisma.evolutionEntry.create({
    data: { id: `${p}-entry`, tenantId, patientId: patient.id, consultationId: consultation.id, recordedAt: consultation.consultedAt, weightKg: 60, heightCm: 165 },
  });
  const isak = await prisma.evolutionEntry.create({
    data: { id: `${p}-isak`, tenantId, patientId: patient.id, consultationId: consultation.id, recordedAt: consultation.consultedAt, study: "ISAK" },
  });
  const report = await prisma.anthropometricReport.create({
    data: { id: `${p}-report`, tenantId, isakEntryId: isak.id, conclusionsText: "ok", pdfData: Buffer.from("%PDF"), pdfFileName: "i.pdf" },
  });
  const diary = await prisma.diaryEntry.create({ data: { id: `${p}-diary`, patientId: patient.id, note: `nota ${key}` } });
  const template = await prisma.planTemplate.create({ data: { id: `${p}-template`, tenantId, title: `Plantilla ${key}`, status: "PUBLISHED" } });
  await prisma.conversationState.create({ data: { tenantId, patientJid: jid, step: "DORMANT" } });
  return {
    patientId: patient.id, jid, phone, serviceId: service.id, appointmentId: appointment.id, consultationId: consultation.id,
    entryId: entry.id, isakEntryId: isak.id, reportId: report.id, planId: plan.id, mealId: meal.id, itemId: item.id,
    recipeItemId: recipeItem.id, measureItemId: measureItem.id, recipeId: recipe.id, sectionId: section.id,
    diaryId: diary.id, templateId: template.id,
  };
}

const TABLES = [
  "Tenant", "Professional", "Agenda", "AvailabilityRule", "AvailabilityException", "Patient", "Service", "Appointment",
  "ClinicalRecord", "Consultation", "EvolutionEntry", "AnthropometricReport", "NutritionPrescription", "NutritionPlan",
  "PlanMeal", "PlanMealItem", "PlanSection", "DiaryEntry", "Recipe", "PlanTemplate", "OutboundMessage", "ConversationState",
] as const;

/** Foto de todas las tablas que tocan M1–M3 (como el snapshot de legacy-memberships.test.ts). */
async function snapshot(): Promise<string> {
  const parts = await Promise.all(TABLES.map(async (table) => {
    const rows = await prisma.$queryRawUnsafe<{ rows: unknown }[]>(
      `SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text), '[]'::jsonb) AS rows FROM "${table}" t`,
    );
    return [table, rows[0]?.rows] as const;
  }));
  return JSON.stringify(parts);
}

/** El intento cruzado no cambia ninguna fila. Devuelve lo que devolvió (o el error, si tiró). */
async function unchanged<T>(label: string, fn: () => Promise<T>): Promise<{ value?: T; error?: unknown }> {
  const beforeSnap = await snapshot();
  let out: { value?: T; error?: unknown };
  try {
    out = { value: await fn() };
  } catch (error) {
    out = { error };
  }
  assert.equal(await snapshot(), beforeSnap, `${label}: cambió la base`);
  return out;
}

async function rejectsUnchanged(label: string, fn: () => Promise<unknown>) {
  const { error } = await unchanged(label, fn);
  assert.ok(error, `${label}: tenía que fallar y no falló`);
}

async function sameAsMissing<T>(label: string, foreign: () => Promise<T>, missing: () => Promise<T>) {
  const f = await unchanged(label, foreign);
  const m = await unchanged(`${label} (inexistente)`, missing);
  if (m.error) {
    assert.ok(f.error, `${label}: un id inexistente falla, el de B tiene que fallar igual`);
  } else {
    assert.ok(!f.error, `${label}: un id inexistente no falla, el de B tampoco tiene que fallar`);
    assert.deepEqual(f.value, m.value, `${label}: distinto de un id inexistente`);
  }
}

before(async () => {
  fx.a = await seed("a", A.tenantId, 501);
  fx.b = await seed("b", B.tenantId, 502);
});

describe("M0: agenda principal por consultorio", () => {
  test("cada tenant resuelve su agenda y su profesional", async () => {
    assert.deepEqual((await resolveTenantSchedulingContext(prisma, A.tenantId)).scope, { tenantId: "iso-a", agendaId: "iso-a-agenda" });
    assert.equal((await getTenantProfessional(B.tenantId)).name, "Prof b");
  });
});

describe("controles positivos (las funciones sí funcionan para A)", () => {
  test("lecturas propias", async () => {
    assert.ok(await getPlan(A, fx.a.planId));
    assert.ok(await getConsultation(A, fx.a.consultationId));
    assert.ok(await getClinicalRecord(A, fx.a.patientId));
    assert.ok(await getIsakStudy(A, fx.a.consultationId));
    assert.ok(await getAnthropometricReportMeta(A, fx.a.isakEntryId));
    assert.equal((await listDiaryEntries(A, fx.a.patientId)).length, 1);
    assert.equal((await listPatientPlans(A, fx.a.patientId)).length, 1);
    assert.equal((await listSections("plan", fx.a.planId, A.tenantId)).length, 1);
    assert.equal((await listPlanRecipePreviews(A, fx.a.planId)).length, 1);
    assert.ok((await getAvailableSlotsForService(A, { serviceId: fx.a.serviceId, from: new Date(), to: new Date(Date.now() + 7 * DAY) })).length > 0);
    assert.equal((await findPatientByJidOrThrow(A, fx.a.jid)).id, fx.a.patientId);
  });
});

describe("M1 agenda: lecturas con ids de B = inexistente", () => {
  test("slots, reprogramación, disponibilidad y recordatorios", async () => {
    const range = { from: new Date(), to: new Date(Date.now() + 7 * DAY) };
    await sameAsMissing("getAvailableSlotsForService",
      () => getAvailableSlotsForService(A, { serviceId: fx.b.serviceId, ...range }),
      () => getAvailableSlotsForService(A, { serviceId: "no-existe", ...range }));
    await sameAsMissing("getRescheduleSlots",
      () => getRescheduleSlots(A, { appointmentId: fx.b.appointmentId, dayKey: futureDayKey }),
      () => getRescheduleSlots(A, { appointmentId: "no-existe", dayKey: futureDayKey }));
    await sameAsMissing("checkSlotAvailable",
      () => checkSlotAvailable(A, { serviceId: fx.b.serviceId, startsAt: future }),
      () => checkSlotAvailable(A, { serviceId: "no-existe", startsAt: future }));
    await sameAsMissing("getAppointmentReminderStatus",
      () => getAppointmentReminderStatus(A, fx.b.appointmentId),
      () => getAppointmentReminderStatus(A, "no-existe"));
  });
});

describe("M1 agenda: escrituras con ids de B se rechazan sin cambiar filas", () => {
  test("turnos", async () => {
    await rejectsUnchanged("createAppointment paciente B", () => createAppointment(A, {
      patientId: fx.b.patientId, serviceId: fx.a.serviceId, startsAt: future, createdBy: "PROFESSIONAL", notifyPatient: false,
    }));
    await rejectsUnchanged("createAppointment servicio B", () => createAppointment(A, {
      patientId: fx.a.patientId, serviceId: fx.b.serviceId, startsAt: future, createdBy: "PROFESSIONAL", notifyPatient: false,
    }));
    await rejectsUnchanged("updateAppointmentReason", () => updateAppointmentReason(A, { id: fx.b.appointmentId, reason: "x" }));
    await rejectsUnchanged("rescheduleAppointment", () => rescheduleAppointment(A, { id: fx.b.appointmentId, startsAt: new Date(future.getTime() + DAY) }));
    await rejectsUnchanged("cancelAppointment", () => cancelAppointment(A, { id: fx.b.appointmentId, by: "PROFESSIONAL", notifyPatient: false }));
    await rejectsUnchanged("setAppointmentStatus", () => setAppointmentStatus(A, { id: fx.b.appointmentId, status: "COMPLETED" }));
    await rejectsUnchanged("enqueueReminderNow", () => enqueueReminderNow(A, fx.b.appointmentId));
    const attendance = await unchanged("respondToAppointmentAttendance", () => respondToAppointmentAttendance(A, {
      id: fx.b.appointmentId, whatsappJid: fx.b.jid, attending: false, now: new Date(), promptUpdatedAt: new Date(),
    }));
    assert.equal(attendance.value, null);
  });

  test("crons acotados a pacientes de B no encolan nada", async () => {
    const reminders = await unchanged("enqueueServiceReminders", () => enqueueServiceReminders(A, { scope: { patientIds: [fx.b.patientId] } }));
    assert.deepEqual(reminders.value, { reminders: 0, confirmations: 0 });
    const prep = await unchanged("enqueuePrepInstructions", () => enqueuePrepInstructions(A, 20, { patientIds: [fx.b.patientId] }));
    assert.equal(prep.value, 0);
  });
});

describe("M2 pacientes y clínica: lecturas con ids de B = inexistente", () => {
  test("ficha, mediciones, consultas, ISAK, prescripciones, informe y diario", async () => {
    const pairs: [string, () => Promise<unknown>, () => Promise<unknown>][] = [
      ["getClinicalRecord", () => getClinicalRecord(A, fx.b.patientId), () => getClinicalRecord(A, "no-existe")],
      ["listEvolutionEntries", () => listEvolutionEntries(A, fx.b.patientId), () => listEvolutionEntries(A, "no-existe")],
      ["getLatestFormulaMeasurements", () => getLatestFormulaMeasurements(A, fx.b.patientId), () => getLatestFormulaMeasurements(A, "no-existe")],
      ["getFormulaMeasurementsAsOf", () => getFormulaMeasurementsAsOf(A, { patientId: fx.b.patientId, consultationId: fx.b.consultationId, until: null }),
        () => getFormulaMeasurementsAsOf(A, { patientId: "no-existe", consultationId: "no-existe", until: null })],
      ["listPatientConsultations", () => listPatientConsultations(A, fx.b.patientId), () => listPatientConsultations(A, "no-existe")],
      ["getConsultation", () => getConsultation(A, fx.b.consultationId), () => getConsultation(A, "no-existe")],
      ["listConsultationsOnDay", () => listConsultationsOnDay(A, fx.b.patientId, pastDayKey), () => listConsultationsOnDay(A, "no-existe", pastDayKey)],
      ["getIsakStudy", () => getIsakStudy(A, fx.b.consultationId), () => getIsakStudy(A, "no-existe")],
      ["getPreviousIsakStudy", () => getPreviousIsakStudy(A, { patientId: fx.b.patientId, before: new Date() }),
        () => getPreviousIsakStudy(A, { patientId: "no-existe", before: new Date() })],
      ["getRequirementContextForConsultation", () => getRequirementContextForConsultation(A, fx.b.consultationId),
        () => getRequirementContextForConsultation(A, "no-existe")],
      ["getReferencePrescription", () => getReferencePrescription(A, { patientId: fx.b.patientId, consultationId: fx.b.consultationId, consultedAt: new Date() }),
        () => getReferencePrescription(A, { patientId: "no-existe", consultationId: "no-existe", consultedAt: new Date() })],
      ["listLatestPrescriptions", () => listLatestPrescriptions(A, fx.b.patientId, 5), () => listLatestPrescriptions(A, "no-existe", 5)],
      ["getAnthropometricReportMeta", () => getAnthropometricReportMeta(A, fx.b.isakEntryId), () => getAnthropometricReportMeta(A, "no-existe")],
      ["getAnthropometricReportPdf", () => getAnthropometricReportPdf(A, fx.b.isakEntryId), () => getAnthropometricReportPdf(A, "no-existe")],
      ["listDiaryEntries", () => listDiaryEntries(A, fx.b.patientId), () => listDiaryEntries(A, "no-existe")],
      ["findPatientByJidOrThrow", () => findPatientByJidOrThrow(A, fx.b.jid), () => findPatientByJidOrThrow(A, "no-existe@s.whatsapp.net")],
      ["listPatientLastContacts", () => listPatientLastContacts(A, [fx.b.jid]), () => listPatientLastContacts(A, ["no-existe@s.whatsapp.net"])],
    ];
    for (const [label, foreign, missing] of pairs) await sameAsMissing(label, foreign, missing);
  });
});

describe("M2 pacientes y clínica: escrituras con ids de B se rechazan sin cambiar filas", () => {
  test("paciente", async () => {
    await rejectsUnchanged("updatePatientFormulaData", () => updatePatientFormulaData(A, fx.b.patientId, {
      sex: "MALE", activityLevel: null, nutritionGoal: null, bodyFrame: null,
    }));
    assert.deepEqual((await unchanged("archivePatient", () => archivePatient(A, fx.b.patientId))).value, { ok: false, reason: "not_found" });
    assert.deepEqual((await unchanged("unarchivePatient", () => unarchivePatient(A, fx.b.patientId))).value, { ok: false, reason: "not_found" });
    await rejectsUnchanged("upsertClinicalRecord", () => upsertClinicalRecord(A, fx.b.patientId, { background: "pisado" }));
  });

  test("el mismo teléfono en A crea un paciente propio de A y no toca al de B", async () => {
    const beforeB = await prisma.patient.findUniqueOrThrow({ where: { id: fx.b.patientId } });
    const created = await findOrCreatePatient(A, { phone: fx.b.phone, name: "Homónimo" });
    try {
      assert.equal(created.tenantId, A.tenantId);
      assert.notEqual(created.id, fx.b.patientId);
      assert.deepEqual(await prisma.patient.findUniqueOrThrow({ where: { id: fx.b.patientId } }), beforeB);
      const byJid = await findOrCreatePatientByJid(A, fx.b.jid);
      assert.equal(byJid.id, created.id);
    } finally {
      await prisma.patient.delete({ where: { id: created.id } });
    }
  });

  test("mediciones, consultas, ISAK, prescripción, informe y diario", async () => {
    const measures = { weightKg: 99 };
    await rejectsUnchanged("addEvolutionEntryOnDay", () => addEvolutionEntryOnDay(A, fx.b.patientId, pastDayKey, measures));
    await rejectsUnchanged("addEvolutionEntryToConsultation", () => addEvolutionEntryToConsultation(A, fx.b.consultationId, measures));
    await rejectsUnchanged("deleteEvolutionEntry", () => deleteEvolutionEntry(A, fx.b.entryId));
    await rejectsUnchanged("createManualConsultation", () => createManualConsultation(A, { patientId: fx.b.patientId, dayKey: pastDayKey }));
    await rejectsUnchanged("updateManualConsultationDate", () => updateManualConsultationDate(A, { consultationId: fx.b.consultationId, dayKey: pastDayKey }));
    await rejectsUnchanged("saveConsultationNotes", () => saveConsultationNotes(A, { consultationId: fx.b.consultationId, notes: "pisado" }));
    await rejectsUnchanged("setConsultationPlan quitar", () => setConsultationPlan(A, { consultationId: fx.b.consultationId, planId: null }));
    await rejectsUnchanged("setConsultationPlan plan de B en consulta de A", () => setConsultationPlan(A, { consultationId: fx.a.consultationId, planId: fx.b.planId }));
    await rejectsUnchanged("createPlanForConsultation", () => createPlanForConsultation(A, { consultationId: fx.b.consultationId }));
    await rejectsUnchanged("deleteConsultation", () => deleteConsultation(A, fx.b.consultationId));
    await rejectsUnchanged("createIsakStudy", () => createIsakStudy(A, { consultationId: fx.b.consultationId, measures: {} as never }));
    await rejectsUnchanged("updateIsakStudy", () => updateIsakStudy(A, { consultationId: fx.b.consultationId, entryId: fx.b.isakEntryId, measures: {} as never }));
    await rejectsUnchanged("deleteIsakStudy", () => deleteIsakStudy(A, { consultationId: fx.b.consultationId, entryId: fx.b.isakEntryId }));
    await rejectsUnchanged("saveConsultationPrescription", () => saveConsultationPrescription(A, { consultationId: fx.b.consultationId, choices: {} as never }));
    await unchanged("deleteConsultationPrescription (idempotente)", () => deleteConsultationPrescription(A, fx.b.consultationId));
    await rejectsUnchanged("saveAnthropometricReportTexts", () => saveAnthropometricReportTexts(A, {
      isakEntryId: fx.b.isakEntryId,
      texts: { girths: "", distribution: "", adiposeMuscle: "", muscleBone: "", waistHip: "", somatotype: "", conclusions: "pisado" },
    }));
    await rejectsUnchanged("saveAnthropometricReportPdf", () => saveAnthropometricReportPdf(A, {
      isakEntryId: fx.b.isakEntryId, data: Buffer.from("x"), fileName: "x.pdf", sourceKey: "k",
    }));
    await rejectsUnchanged("enqueueAnthropometricReportMessage", () => enqueueAnthropometricReportMessage(A, {
      reportId: fx.b.reportId, toJid: "x@s.whatsapp.net", caption: "c",
    }));
    await rejectsUnchanged("addDiaryEntry", () => addDiaryEntry(A, fx.b.patientId, { note: "pisado" }));
    await rejectsUnchanged("deleteDiaryEntry", () => deleteDiaryEntry(A, fx.b.diaryId));
  });
});

describe("M3 planes: lecturas con ids de B = inexistente", () => {
  test("plan, objetivo, consulta del plan, recetas y textos", async () => {
    const pairs: [string, () => Promise<unknown>, () => Promise<unknown>][] = [
      ["listPatientPlans", () => listPatientPlans(A, fx.b.patientId), () => listPatientPlans(A, "no-existe")],
      ["getPlan", () => getPlan(A, fx.b.planId), () => getPlan(A, "no-existe")],
      ["getPlanTarget", () => getPlanTarget(A, fx.b.planId), () => getPlanTarget(A, "no-existe")],
      ["getPlanConsultationId", () => getPlanConsultationId(A, fx.b.planId), () => getPlanConsultationId(A, "no-existe")],
      ["listPlanRecipePreviews", () => listPlanRecipePreviews(A, fx.b.planId), () => listPlanRecipePreviews(A, "no-existe")],
      ["listSections", () => listSections("plan", fx.b.planId, A.tenantId), () => listSections("plan", "no-existe", A.tenantId)],
    ];
    for (const [label, foreign, missing] of pairs) await sameAsMissing(label, foreign, missing);
  });
});

describe("M3 planes: escrituras con ids de B se rechazan sin cambiar filas", () => {
  test("plan, comidas, ítems, PDF y envío", async () => {
    await rejectsUnchanged("createPlan", () => createPlan(A, fx.b.patientId, { title: "pisado" }));
    await rejectsUnchanged("updatePlan", () => updatePlan(A, fx.b.planId, { title: "pisado" }));
    await rejectsUnchanged("deletePlan", () => deletePlan(A, fx.b.planId));
    await rejectsUnchanged("addMeal", () => addMeal(A, fx.b.planId, { name: "x", order: 9 }));
    await rejectsUnchanged("updateMeal", () => updateMeal(A, fx.b.mealId, { name: "pisado" }));
    await rejectsUnchanged("deleteMeal", () => deleteMeal(A, fx.b.mealId));
    await rejectsUnchanged("addMealItem", () => addMealItem(A, fx.b.mealId, { customLabel: "x", order: 9, weekday: "MON" }));
    await rejectsUnchanged("updateMealItem", () => updateMealItem(A, fx.b.itemId, { notes: "pisado" }));
    await rejectsUnchanged("deleteMealItem", () => deleteMealItem(A, fx.b.itemId));
    await rejectsUnchanged("savePlanPdf", () => savePlanPdf(A, fx.b.planId, { data: Buffer.from("x"), fileName: "x.pdf" }));
    await rejectsUnchanged("enqueuePlanPdfMessage", () => enqueuePlanPdfMessage(A, { planId: fx.b.planId, toJid: "x@s.whatsapp.net", caption: "c" }));
    await rejectsUnchanged("applyTemplateToPatient plantilla de A en paciente de B", () => applyTemplateToPatient(fx.a.templateId, fx.b.patientId, A.tenantId));
    await rejectsUnchanged("applyTemplateToPatient plantilla de B", () => applyTemplateToPatient(fx.b.templateId, fx.a.patientId, A.tenantId));
  });

  test("menú semanal y textos del plan (tenantId de A, plan de B)", async () => {
    const t = A.tenantId;
    const planB = fx.b.planId;
    await rejectsUnchanged("setMealMode", () => setMealMode("plan", planB, fx.b.mealId, { mode: "EVERY_DAY" }, t));
    await rejectsUnchanged("setMealOptions", () => setMealOptions("plan", planB, fx.b.mealId, false, t));
    await rejectsUnchanged("copyDay", () => copyDay("plan", planB, { from: "MON", to: ["TUE"] }, t));
    await rejectsUnchanged("repeatMealInAllDays", () => repeatMealInAllDays("plan", planB, fx.b.mealId, "MON", t));
    await rejectsUnchanged("renameMeal", () => renameMeal("plan", planB, fx.b.mealId, "pisado", t));
    await rejectsUnchanged("moveMeal", () => moveMeal("plan", planB, fx.b.mealId, "down", t));
    await rejectsUnchanged("restoreMealSnapshots", () => restoreMealSnapshots("plan", planB, [{ mealId: fx.b.mealId, mode: "EVERY_DAY", isOptions: false, items: [] }], t));
    await rejectsUnchanged("addRecipeItems", () => addRecipeItems("plan", planB, { mealId: fx.b.mealId, recipeId: fx.a.recipeId, weekdays: ["MON"] }, t));
    await rejectsUnchanged("setRecipeItemPortions", () => setRecipeItemPortions("plan", planB, fx.b.recipeItemId, 2, t));
    await rejectsUnchanged("setMeasureItemQuantity", () => setMeasureItemQuantity("plan", planB, fx.b.measureItemId, 2, t));
    assert.equal((await unchanged("removeMenuItems", () => removeMenuItems("plan", planB, [fx.b.recipeItemId], t))).value, 0);
    await rejectsUnchanged("addSection", () => addSection("plan", planB, { title: "x", body: "y" }, t));
    await rejectsUnchanged("updateSection", () => updateSection("plan", planB, fx.b.sectionId, { title: "x", body: "y" }, t));
    await rejectsUnchanged("deleteSection", () => deleteSection("plan", planB, fx.b.sectionId, t));
    await rejectsUnchanged("moveSection", () => moveSection("plan", planB, fx.b.sectionId, 1, t));
    // Un plan sin tenant ya no se toca (antes de 025b-1 este camino no filtraba).
    await rejectsUnchanged("setMealMode sin tenant", () => setMealMode("plan", fx.a.planId, fx.a.mealId, { mode: "EVERY_DAY" }));
  });
});

describe("listados con A traen solo filas de A", () => {
  test("planes, consultas, mediciones, diario y slots", async () => {
    const plans = await listPatientPlans(A, fx.a.patientId);
    assert.deepEqual(plans.map((p) => p.tenantId), ["iso-a"]);
    const consultations = await listPatientConsultations(A, fx.a.patientId);
    assert.deepEqual(consultations.map((c) => c.tenantId), ["iso-a"]);
    const entries = await listEvolutionEntries(A, fx.a.patientId);
    assert.ok(entries.length > 0 && entries.every((e) => e.tenantId === "iso-a"));
    const diary = await listDiaryEntries(A, fx.a.patientId);
    assert.deepEqual(diary.map((d) => d.id), [fx.a.diaryId]);
    const contacts = await listPatientLastContacts(A, [fx.a.jid, fx.b.jid]);
    assert.deepEqual(contacts.map((c) => c.patientJid), [fx.a.jid]);
  });
});
