/**
 * Prueba contra la base de desarrollo del informe antropométrico (HU-007).
 *
 * - Usa solo datos propios (paciente, consulta, estudio e informe que crea acá) y los borra por id
 *   en `finally`. Nunca filtra por patientId, fechas ni nombres.
 * - No encola WhatsApp (el enqueue se prueba en apps/bot, dentro de una transacción revertida) y
 *   verifica que no se encoló nada para su jid.
 *
 * Uso: npm run test:report --workspace packages/db
 */
import assert from "node:assert/strict";
import type { IsakMeasures, IsakReportTexts } from "@nutri-bot/core";
import { prisma } from "../index";
import {
  createIsakStudy,
  createManualConsultation,
  deleteIsakStudy,
  getAnthropometricReportMeta,
  getAnthropometricReportPdf,
  getIsakStudy,
  saveAnthropometricReportPdf,
  saveAnthropometricReportTexts,
} from "../domain";

const CASE_A: IsakMeasures = {
  weightKg: 61, heightCm: 164, sittingHeightCm: 83, armSpanCm: 166.7,
  tricepsSkinfoldMm: 11, subscapularSkinfoldMm: 11, bicepsSkinfoldMm: 4, iliacCrestSkinfoldMm: 19,
  supraspinaleSkinfoldMm: 16, abdominalSkinfoldMm: 16, thighSkinfoldMm: 11, calfSkinfoldMm: 6,
  armCm: 30.2, armFlexedCm: 32, waistCm: 73, hipCm: 88, thighCm: 52, calfCm: 34.5,
  humerusBreadthCm: 6.5, bistyloidBreadthCm: 5.4, femurBreadthCm: 9.7,
};

const TEXTS: IsakReportTexts = {
  girths: "Texto de perímetros",
  distribution: "",
  adiposeMuscle: "IAM",
  muscleBone: "IMO",
  waistHip: "ICC",
  somatotype: "Somatotipo",
  conclusions: "Conclusiones de prueba",
};

async function main() {
  const entryIds: string[] = [];
  const consultationIds: string[] = [];
  const patientIds: string[] = [];
  const reportIds: string[] = [];
  const jid = `test-hu007-${Date.now()}@test.invalid`;

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
    const patient = await prisma.patient.create({
      data: { whatsappJid: jid, phone: "000", name: "Prueba HU-007 (TEST)", sex: "MALE", birthDate: new Date("2004-01-15") },
    });
    patientIds.push(patient.id);
    const c08 = await createManualConsultation({ patientId: patient.id, dayKey: "2026-05-08" });
    consultationIds.push(c08.id);
    const study = await createIsakStudy({ consultationId: c08.id, measures: CASE_A });
    entryIds.push(study.id);

    await step("sin informe → null", async () => {
      assert.equal(await getAnthropometricReportMeta(study.id), null);
      assert.equal(await getAnthropometricReportPdf(study.id), null);
    });

    let reportId = "";
    await step("guardar textos crea y actualiza la misma fila", async () => {
      const first = await saveAnthropometricReportTexts({ isakEntryId: study.id, texts: TEXTS });
      reportId = first.id;
      reportIds.push(first.id);
      assert.deepEqual(first.texts, TEXTS);
      assert.equal(first.pdfGeneratedAt, null);
      const second = await saveAnthropometricReportTexts({
        isakEntryId: study.id,
        texts: { ...TEXTS, somatotype: "Editado", conclusions: "Otras conclusiones" },
      });
      assert.equal(second.id, first.id);
      assert.equal(await prisma.anthropometricReport.count({ where: { isakEntryId: study.id } }), 1);
      const meta = await getAnthropometricReportMeta(study.id);
      assert.ok(meta);
      assert.equal(meta.texts.distribution, "");
      assert.equal(meta.texts.somatotype, "Editado");
      assert.equal(meta.texts.conclusions, "Otras conclusiones");
    });

    await step("guardar y leer el PDF", async () => {
      const bytes = Buffer.from("%PDF-test");
      const saved = await saveAnthropometricReportPdf({
        isakEntryId: study.id,
        data: bytes,
        fileName: "informe-antropometrico-2026-05-08.pdf",
        sourceKey: "abcd1234",
      });
      assert.equal(saved.id, reportId);
      const pdf = await getAnthropometricReportPdf(study.id);
      assert.ok(pdf);
      assert.ok(pdf.data.equals(bytes));
      assert.equal(pdf.fileName, "informe-antropometrico-2026-05-08.pdf");
      const meta = await getAnthropometricReportMeta(study.id);
      assert.ok(meta?.pdfGeneratedAt instanceof Date);
      assert.equal(meta?.pdfSourceKey, "abcd1234");
      // Guardar textos no toca el PDF.
      await saveAnthropometricReportTexts({ isakEntryId: study.id, texts: TEXTS });
      assert.ok((await getAnthropometricReportPdf(study.id))?.data.equals(bytes));
    });

    await step("borrar el estudio borra el informe (cascada)", async () => {
      await deleteIsakStudy({ consultationId: c08.id, entryId: study.id });
      assert.equal(await getIsakStudy(c08.id), null);
      assert.equal(await prisma.anthropometricReport.findUnique({ where: { id: reportId } }), null);
      assert.equal(await getAnthropometricReportMeta(study.id), null);
    });

    await step("sin mensajes encolados", async () => {
      assert.equal(await prisma.outboundMessage.count({ where: { toJid: jid } }), 0);
    });

    console.log("OK");
  } finally {
    // Limpieza, siempre por ids propios.
    await prisma.outboundMessage.deleteMany({ where: { toJid: jid } });
    await prisma.anthropometricReport.deleteMany({ where: { id: { in: reportIds } } });
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
