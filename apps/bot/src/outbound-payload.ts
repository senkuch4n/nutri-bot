import type { Prisma } from "@nutri-bot/db";

/**
 * HU-007: qué manda el consumidor de la cola para cada OutboundMessage. Sin Baileys (no importa
 * whatsapp.ts), así se prueba sin WhatsApp real.
 */

export const OUTBOX_INCLUDE = {
  plan: { select: { pdfData: true, pdfFileName: true } },
  anthropometricReport: { select: { pdfData: true, pdfFileName: true } },
} satisfies Prisma.OutboundMessageInclude;

export type OutboxRow = Prisma.OutboundMessageGetPayload<{ include: typeof OUTBOX_INCLUDE }>;

export type OutboundPayload =
  | { type: "document"; buffer: Buffer; fileName: string }
  | { type: "text"; body: string };

/** PLAN_PDF → documento del plan; ANTHROPOMETRIC_REPORT_PDF → documento del informe; el resto,
 *  texto. Sin PDF → Error (el consumidor reintenta y lo marca FAILED). El caption no se manda (D7). */
export function resolveOutboundPayload(msg: OutboxRow): OutboundPayload {
  if (msg.kind === "PLAN_PDF") {
    if (!msg.plan?.pdfData) throw new Error(`El plan no tiene PDF generado: ${msg.planId ?? msg.id}`);
    return { type: "document", buffer: msg.plan.pdfData, fileName: msg.plan.pdfFileName ?? "plan-alimentario.pdf" };
  }
  if (msg.kind === "ANTHROPOMETRIC_REPORT_PDF") {
    const report = msg.anthropometricReport;
    if (!report?.pdfData) {
      throw new Error(`El informe no tiene PDF generado: ${msg.anthropometricReportId ?? msg.id}`);
    }
    return {
      type: "document",
      buffer: report.pdfData,
      fileName: report.pdfFileName ?? "informe-antropometrico.pdf",
    };
  }
  return { type: "text", body: msg.body };
}
