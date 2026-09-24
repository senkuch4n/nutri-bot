/**
 * HU-008: datos propios para el recorrido en el navegador (pediatría, OMS 2007 y Schofield).
 *
 * Uso (desde la raíz):
 *   npm run walkthrough:hu008 --workspace packages/db -- create  <ids.json>
 *   npm run walkthrough:hu008 --workspace packages/db -- cleanup <ids.json>
 *
 * - `create` crea 2 pacientes de prueba (jids @test.invalid), sus consultas "Sin turno", mediciones
 *   y estudios ISAK con las funciones de dominio. No crea turnos ni encola WhatsApp.
 *   Escribe { patientIds, consultationIds, entryIds } en <ids.json>.
 * - `cleanup` borra SOLO por esos ids (nunca por nombre ni por fecha). Si hay mensajes encolados
 *   para esos jids, no borra nada y sale con error.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { ISAK_MEASURE_KEYS, type IsakMeasures } from "@nutri-bot/core";
import { prisma } from "../index";
import { addEvolutionEntryToConsultation } from "../domain/clinical";
import { createManualConsultation } from "../domain/consultations";
import { createIsakStudy } from "../domain/isak";

interface Ids {
  patientIds: string[];
  consultationIds: string[];
  entryIds: string[];
}

function emptyMeasures(): IsakMeasures {
  return Object.fromEntries(ISAK_MEASURE_KEYS.map((k) => [k, null])) as IsakMeasures;
}

const SKINFOLDS_A1 = {
  tricepsSkinfoldMm: 9,
  subscapularSkinfoldMm: 7,
  supraspinaleSkinfoldMm: 6,
  abdominalSkinfoldMm: 9,
  thighSkinfoldMm: 12,
  calfSkinfoldMm: 10,
} as const;

async function create(file: string): Promise<void> {
  const ids: Ids = { patientIds: [], consultationIds: [], entryIds: [] };
  const stamp = Date.now();
  try {
    // Paciente A: 8 años (96 meses) en septiembre de 2026.
    const a = await prisma.patient.create({
      data: {
        name: "Prueba HU-008 Juan (TEST)",
        whatsappJid: `test-hu008-a-${stamp}@test.invalid`,
        phone: "000",
        birthDate: new Date("2018-09-01"),
        sex: "MALE",
        activityLevel: "LIGHT",
        nutritionGoal: "MAINTAIN",
      },
    });
    ids.patientIds.push(a.id);

    // A1 (10/09/2026): medición común + ISAK.
    const a1 = await createManualConsultation({ patientId: a.id, dayKey: "2026-09-10" });
    ids.consultationIds.push(a1.id);
    const a1m = await addEvolutionEntryToConsultation(a1.id, { weightKg: 30, heightCm: 127.3 });
    ids.entryIds.push(a1m.id);
    const a1s = await createIsakStudy({
      consultationId: a1.id,
      measures: { ...emptyMeasures(), weightKg: 30, heightCm: 127.3, waistCm: 58, hipCm: 66, ...SKINFOLDS_A1 },
    });
    ids.entryIds.push(a1s.id);

    // A2 (17/09/2026): solo ISAK, 45 kg (extensión de la OMS para Z > 3).
    const a2 = await createManualConsultation({ patientId: a.id, dayKey: "2026-09-17" });
    ids.consultationIds.push(a2.id);
    const plus4 = Object.fromEntries(Object.entries(SKINFOLDS_A1).map(([k, v]) => [k, v + 4]));
    const a2s = await createIsakStudy({
      consultationId: a2.id,
      measures: { ...emptyMeasures(), weightKg: 45, heightCm: 127.3, waistCm: 75, hipCm: 80, ...plus4 },
    });
    ids.entryIds.push(a2s.id);

    // A3 (24/09/2026): solo peso 15 kg (implausible); la talla sale de A2 (D8).
    const a3 = await createManualConsultation({ patientId: a.id, dayKey: "2026-09-24" });
    ids.consultationIds.push(a3.id);
    const a3m = await addEvolutionEntryToConsultation(a3.id, { weightKg: 15 });
    ids.entryIds.push(a3m.id);

    // Paciente B: 4 años (menor de 5).
    const b = await prisma.patient.create({
      data: {
        name: "Prueba HU-008 Menor 4 (TEST)",
        whatsappJid: `test-hu008-b-${stamp}@test.invalid`,
        phone: "000",
        birthDate: new Date("2022-05-01"),
        sex: "FEMALE",
      },
    });
    ids.patientIds.push(b.id);
    const b1 = await createManualConsultation({ patientId: b.id, dayKey: "2026-09-10" });
    ids.consultationIds.push(b1.id);
    const b1m = await addEvolutionEntryToConsultation(b1.id, { weightKg: 16, heightCm: 102 });
    ids.entryIds.push(b1m.id);

    writeFileSync(file, JSON.stringify(ids, null, 2));
    console.log(JSON.stringify(ids, null, 2));
    console.log(`Paciente A: /pacientes/${a.id}`);
    console.log(`  A1 (10/09): /pacientes/${a.id}/consultas/${a1.id}`);
    console.log(`  A2 (17/09): /pacientes/${a.id}/consultas/${a2.id}`);
    console.log(`  A3 (24/09): /pacientes/${a.id}/consultas/${a3.id}`);
    console.log(`Paciente B: /pacientes/${b.id}`);
    console.log(`  B1 (10/09): /pacientes/${b.id}/consultas/${b1.id}`);
    console.log(`Ids guardados en ${file}`);
  } catch (err) {
    // Si algo falla a mitad de camino, se guardan los ids creados para poder limpiar.
    writeFileSync(file, JSON.stringify(ids, null, 2));
    console.error(`Falló la creación. Ids parciales en ${file}: corré cleanup con ese archivo.`);
    throw err;
  }
}

async function cleanup(file: string): Promise<void> {
  const ids = JSON.parse(readFileSync(file, "utf8")) as Ids;
  const patientIds = ids.patientIds ?? [];
  const consultationIds = ids.consultationIds ?? [];
  const patients = await prisma.patient.findMany({
    where: { id: { in: patientIds } },
    select: { whatsappJid: true },
  });
  const jids = patients.map((p) => p.whatsappJid);
  const queued = await prisma.outboundMessage.count({ where: { toJid: { in: jids } } });
  if (queued !== 0) {
    throw new Error(
      `Hay ${queued} mensaje(s) en OutboundMessage para los pacientes de prueba. No se borra nada: revisar a mano.`,
    );
  }
  const presc = await prisma.nutritionPrescription.deleteMany({ where: { consultationId: { in: consultationIds } } });
  const entries = await prisma.evolutionEntry.deleteMany({ where: { patientId: { in: patientIds } } });
  const consultations = await prisma.consultation.deleteMany({ where: { id: { in: consultationIds } } });
  const deletedPatients = await prisma.patient.deleteMany({ where: { id: { in: patientIds } } });
  console.log(
    `Borrados: ${presc.count} prescripciones, ${entries.count} mediciones, ${consultations.count} consultas, ${deletedPatients.count} pacientes.`,
  );
}

async function main(): Promise<void> {
  const [cmd, file] = process.argv.slice(2);
  if ((cmd !== "create" && cmd !== "cleanup") || !file) {
    console.error("Uso: hu008-walkthrough.ts create|cleanup <ids.json>");
    process.exit(2);
  }
  try {
    if (cmd === "create") await create(file);
    else await cleanup(file);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
