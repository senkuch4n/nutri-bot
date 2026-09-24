/**
 * Prueba contra la base de desarrollo del estudio ISAK (HU-006).
 *
 * - Usa solo datos propios (paciente, consultas y mediciones que crea acá) y los borra por id en
 *   `finally`. Nunca filtra por patientId, fechas ni nombres.
 * - No encola WhatsApp y verifica que no se encoló nada para su jid.
 *
 * Uso: npm run test:isak --workspace packages/db
 */
import assert from "node:assert/strict";
import { dayKeyInTz, dayKeyToNoonUtc, type IsakMeasures } from "@nutri-bot/core";
import { prisma } from "../index";
import {
  ConsultationNotDeletableError,
  IsakStudyExistsError,
  IsakStudyNotFoundError,
  addEvolutionEntryToConsultation,
  createIsakStudy,
  createManualConsultation,
  deleteConsultation,
  deleteIsakStudy,
  getIsakStudy,
  getPreviousIsakStudy,
  getProfessional,
  toIsakMeasures,
  updateIsakStudy,
} from "../domain";

// Casos de la HU-006 (solo números).
const CASE_A: IsakMeasures = {
  weightKg: 61, heightCm: 164, sittingHeightCm: 83, armSpanCm: 166.7,
  tricepsSkinfoldMm: 11, subscapularSkinfoldMm: 11, bicepsSkinfoldMm: 4, iliacCrestSkinfoldMm: 19,
  supraspinaleSkinfoldMm: 16, abdominalSkinfoldMm: 16, thighSkinfoldMm: 11, calfSkinfoldMm: 6,
  armCm: 30.2, armFlexedCm: 32, waistCm: 73, hipCm: 88, thighCm: 52, calfCm: 34.5,
  humerusBreadthCm: 6.5, bistyloidBreadthCm: 5.4, femurBreadthCm: 9.7,
};
const CASE_B: IsakMeasures = {
  weightKg: 67.6, heightCm: 164, sittingHeightCm: 83, armSpanCm: 166.7,
  tricepsSkinfoldMm: 12, subscapularSkinfoldMm: 14, bicepsSkinfoldMm: 4, iliacCrestSkinfoldMm: 30,
  supraspinaleSkinfoldMm: 21.5, abdominalSkinfoldMm: 18, thighSkinfoldMm: 8, calfSkinfoldMm: 7,
  armCm: 32.3, armFlexedCm: 33.1, waistCm: 82.1, hipCm: 94, thighCm: 54, calfCm: 34,
  humerusBreadthCm: 6.5, bistyloidBreadthCm: 5.3, femurBreadthCm: 9.6,
};

async function main() {
  const entryIds: string[] = [];
  const consultationIds: string[] = [];
  const patientIds: string[] = [];
  const jid = `test-hu006-${Date.now()}@test.invalid`;

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
    // 1) Paciente propio.
    const patient = await prisma.patient.create({
      data: { whatsappJid: jid, phone: "000", name: "Prueba HU-006 (TEST)", sex: "MALE", birthDate: new Date("2004-01-15") },
    });
    patientIds.push(patient.id);

    // 2) Dos consultas "Sin turno".
    const c05 = await createManualConsultation({ patientId: patient.id, dayKey: "2025-11-05" });
    consultationIds.push(c05.id);
    const c08 = await createManualConsultation({ patientId: patient.id, dayKey: "2026-05-08" });
    consultationIds.push(c08.id);
    const pro = await getProfessional();

    // 3) Bioimpedancia propia + estudio A en la del 08/05.
    let bioId = "";
    let studyA = "";
    await step("alta del estudio A y bioimpedancia en la misma consulta", async () => {
      const bio = await addEvolutionEntryToConsultation(c08.id, { weightKg: 61, bodyFatPercent: 17 });
      bioId = bio.id;
      entryIds.push(bio.id);
      const created = await createIsakStudy({ consultationId: c08.id, measures: CASE_A });
      studyA = created.id;
      entryIds.push(created.id);
      const got = await getIsakStudy(c08.id);
      assert.ok(got);
      assert.equal(got.id, created.id);
      assert.equal(got.study, "ISAK");
      assert.equal(got.note, null);
      assert.equal(got.patientId, patient.id);
      assert.equal(
        got.recordedAt.toISOString(),
        dayKeyToNoonUtc(dayKeyInTz(c08.consultedAt, pro.timezone), pro.timezone).toISOString(),
      );
      assert.deepEqual(toIsakMeasures(got), CASE_A);
    });

    // 4) Un solo estudio por consulta.
    await step("segundo estudio en la misma consulta → IsakStudyExistsError", async () => {
      await assert.rejects(createIsakStudy({ consultationId: c08.id, measures: CASE_B }), IsakStudyExistsError);
    });

    // 5) Estudio B en la del 05/11 y estudio anterior.
    await step("getPreviousIsakStudy", async () => {
      const b = await createIsakStudy({ consultationId: c05.id, measures: CASE_B });
      entryIds.push(b.id);
      const prev = await getPreviousIsakStudy({ patientId: patient.id, before: c08.consultedAt });
      assert.ok(prev);
      assert.equal(prev.id, b.id);
      assert.equal(prev.consultation?.id, c05.id);
      assert.deepEqual(toIsakMeasures(prev), CASE_B);
      assert.equal(await getPreviousIsakStudy({ patientId: patient.id, before: c05.consultedAt }), null);
    });

    // 6) Edición.
    await step("updateIsakStudy", async () => {
      await updateIsakStudy({ consultationId: c08.id, entryId: studyA, measures: { ...CASE_A, tricepsSkinfoldMm: 12, femurBreadthCm: null } });
      const got = await getIsakStudy(c08.id);
      assert.equal(Number(got?.tricepsSkinfoldMm), 12);
      assert.equal(got?.femurBreadthCm, null);
      const bioBefore = await prisma.evolutionEntry.findUniqueOrThrow({ where: { id: bioId } });
      await assert.rejects(
        updateIsakStudy({ consultationId: c08.id, entryId: bioId, measures: CASE_B }),
        IsakStudyNotFoundError,
      );
      const bioAfter = await prisma.evolutionEntry.findUniqueOrThrow({ where: { id: bioId } });
      assert.deepEqual(bioAfter, bioBefore);
      // Otra consulta: tampoco.
      await assert.rejects(
        updateIsakStudy({ consultationId: c05.id, entryId: studyA, measures: CASE_B }),
        IsakStudyNotFoundError,
      );
    });

    // 7) Borrado: solo la fila ISAK.
    await step("deleteIsakStudy no borra la bioimpedancia", async () => {
      await assert.rejects(deleteIsakStudy({ consultationId: c08.id, entryId: bioId }), IsakStudyNotFoundError);
      await deleteIsakStudy({ consultationId: c08.id, entryId: studyA });
      assert.equal(await getIsakStudy(c08.id), null);
      assert.ok(await prisma.evolutionEntry.findUnique({ where: { id: bioId } }));
    });

    // 8) La consulta con la bioimpedancia no se puede borrar.
    await step("deleteConsultation → ConsultationNotDeletableError", async () => {
      await assert.rejects(deleteConsultation(c08.id), ConsultationNotDeletableError);
    });

    // 9) Nada encolado.
    await step("sin mensajes encolados", async () => {
      assert.equal(await prisma.outboundMessage.count({ where: { toJid: jid } }), 0);
    });

    console.log("OK");
  } finally {
    // Limpieza, siempre por ids propios.
    if (consultationIds.length > 0) {
      const byConsultation = await prisma.evolutionEntry.findMany({
        where: { consultationId: { in: consultationIds } },
        select: { id: true },
      });
      for (const e of byConsultation) if (!entryIds.includes(e.id)) entryIds.push(e.id);
    }
    await prisma.evolutionEntry.deleteMany({ where: { id: { in: entryIds } } });
    await prisma.consultation.deleteMany({ where: { id: { in: consultationIds } } });
    await prisma.patient.deleteMany({ where: { id: { in: patientIds } } });
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
