/**
 * HU-007: prueba del envío del informe por la cola, sin WhatsApp real.
 *
 * Todo pasa dentro de un prisma.$transaction que termina con `throw new Rollback()` a propósito:
 * nada se confirma, así que el bot no puede ver ninguna fila aunque estuviera corriendo. No importa
 * src/whatsapp.ts ni Baileys.
 *
 * Uso: npm run test:report-outbox --workspace apps/bot
 */
import assert from "node:assert/strict";
import { ISAK_REPORT_TEXT } from "@nutri-bot/core";
import { prisma } from "@nutri-bot/db";
import { enqueueAnthropometricReportMessage } from "@nutri-bot/db/domain";
import { OUTBOX_INCLUDE, resolveOutboundPayload } from "../src/outbound-payload";

class Rollback extends Error {
  constructor() {
    super("rollback a propósito");
    this.name = "Rollback";
  }
}

async function main() {
  const toJid = `test-hu007-outbox-${Date.now()}@test.invalid`;
  let patientId = "";

  try {
    await prisma.$transaction(async (tx) => {
      const patient = await tx.patient.create({
        data: { whatsappJid: toJid, phone: "000", name: "Prueba HU-007 outbox (TEST)", sex: "MALE" },
      });
      patientId = patient.id;
      const consultation = await tx.consultation.create({
        data: { patientId: patient.id, consultedAt: new Date("2026-05-08T15:00:00Z") },
      });
      const entry = await tx.evolutionEntry.create({
        data: {
          patientId: patient.id,
          consultationId: consultation.id,
          recordedAt: new Date("2026-05-08T15:00:00Z"),
          study: "ISAK",
          weightKg: 61,
          heightCm: 164,
        },
      });
      const bytes = Buffer.from("%PDF-1.4 prueba");
      const report = await tx.anthropometricReport.create({
        data: { isakEntryId: entry.id, pdfData: bytes, pdfFileName: "informe-antropometrico-2026-05-08.pdf" },
      });

      // 1) Encolar.
      const msg = await enqueueAnthropometricReportMessage(
        { reportId: report.id, toJid, caption: ISAK_REPORT_TEXT.whatsappCaption("08/05/2026") },
        tx,
      );
      assert.equal(msg.kind, "ANTHROPOMETRIC_REPORT_PDF");
      assert.equal(msg.status, "PENDING");
      assert.equal(msg.appointmentId, null);
      assert.equal(msg.anthropometricReportId, report.id);
      assert.equal(
        msg.body,
        "📄 Te comparto tu informe antropométrico del 08/05/2026. Cualquier duda lo charlamos en la próxima consulta.",
      );
      console.log("ok  encola ANTHROPOMETRIC_REPORT_PDF PENDING");

      // 2) El consumidor elige el documento del informe.
      const row = await tx.outboundMessage.findUniqueOrThrow({ where: { id: msg.id }, include: OUTBOX_INCLUDE });
      const payload = resolveOutboundPayload(row);
      assert.equal(payload.type, "document");
      if (payload.type === "document") {
        assert.equal(payload.fileName, "informe-antropometrico-2026-05-08.pdf");
        assert.ok(Buffer.from(payload.buffer).equals(bytes));
      }
      console.log("ok  el consumidor manda el documento del informe");

      // 3) Otros casos.
      const planMsg = await tx.outboundMessage.create({
        data: { toJid, body: "plan", kind: "PLAN_PDF", status: "PENDING" },
        include: OUTBOX_INCLUDE,
      });
      assert.throws(() => resolveOutboundPayload(planMsg), /El plan no tiene PDF generado: /);
      const adHoc = await tx.outboundMessage.create({
        data: { toJid, body: "hola", kind: "AD_HOC", status: "PENDING" },
        include: OUTBOX_INCLUDE,
      });
      assert.deepEqual(resolveOutboundPayload(adHoc), { type: "text", body: "hola" });
      const emptyReport = await tx.anthropometricReport.update({
        where: { id: report.id },
        data: { pdfData: null },
      });
      const noPdf = await tx.outboundMessage.findUniqueOrThrow({ where: { id: msg.id }, include: OUTBOX_INCLUDE });
      assert.throws(() => resolveOutboundPayload(noPdf), new RegExp(`El informe no tiene PDF generado: ${emptyReport.id}`));
      console.log("ok  PLAN_PDF sin plan, AD_HOC e informe sin PDF");

      throw new Rollback();
    });
  } catch (err) {
    if (!(err instanceof Rollback)) throw err;
  }

  // Fuera de la transacción: no quedó nada.
  assert.equal(await prisma.outboundMessage.count({ where: { toJid } }), 0);
  assert.equal(await prisma.patient.findUnique({ where: { whatsappJid: toJid } }), null);
  if (patientId) assert.equal(await prisma.patient.findUnique({ where: { id: patientId } }), null);
  console.log("ok  transacción revertida: sin filas");
  console.log("OK");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
