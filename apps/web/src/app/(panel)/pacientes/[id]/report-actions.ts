"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  ISAK_REPORT_TEXT,
  professionalSignature,
  type IsakReportTextKey,
  type IsakReportTexts,
} from "@nutri-bot/core";
import { prisma } from "@nutri-bot/db";
import {
  enqueueAnthropometricReportMessage,
  saveAnthropometricReportPdf,
  saveAnthropometricReportTexts,
} from "@nutri-bot/db/domain";
import { renderAnthropometricReportPdf } from "@/lib/anthropometric-report-pdf";
import { loadIsakReportContext, type IsakReportContext } from "@/lib/anthropometric-report";
import { belongsToPatient } from "@/lib/consultation-guard";

// HU-007: informe antropométrico. Se llaman directo desde el cliente (no como <form action>).
// La lógica vive en packages/core; las lecturas y escrituras, en packages/db/domain.

export type ReportActionState =
  | { ok: true }
  | { ok: false; error?: string; fieldErrors?: Partial<Record<IsakReportTextKey, string>> };

type ReportActionInput = { patientId: string; consultationId: string; texts: IsakReportTexts };

const INVALID: ReportActionState = { ok: false, error: "Datos inválidos" };
const text = z.string().max(4000);
const inputSchema = z.object({
  patientId: z.string().min(1),
  consultationId: z.string().min(1),
  texts: z.object({
    girths: text,
    distribution: text,
    adiposeMuscle: text,
    muscleBone: text,
    waistHip: text,
    somatotype: text,
    conclusions: z.string().max(6000),
  }),
});

function revalidateReport(patientId: string, consultationId: string) {
  const base = `/pacientes/${patientId}/consultas/${consultationId}`;
  revalidatePath(base);
  revalidatePath(`${base}/antropometria`);
  revalidatePath(`${base}/antropometria/informe`);
}

/** Valida, chequea que la consulta sea del paciente y carga el contexto. null = datos inválidos. */
async function prepare(input: ReportActionInput): Promise<{ data: z.infer<typeof inputSchema>; ctx: IsakReportContext } | null> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return null;
  const { patientId, consultationId } = parsed.data;
  if (!(await belongsToPatient(patientId, consultationId))) return null;
  const loaded = await loadIsakReportContext(patientId, consultationId);
  if (loaded.status !== "ok") return null;
  return { data: parsed.data, ctx: loaded.ctx };
}

/** Guarda los textos, genera el PDF con los textos guardados y lo guarda. Devuelve el id del informe. */
async function generateAndSave(ctx: IsakReportContext, texts: IsakReportTexts): Promise<string> {
  const saved = await saveAnthropometricReportTexts({ isakEntryId: ctx.entry.id, texts });
  const savedTexts = { ...texts };
  for (const k of Object.keys(saved.texts) as IsakReportTextKey[]) savedTexts[k] = saved.texts[k] ?? "";
  const logoRow = await prisma.professional.findUnique({
    where: { id: 1 },
    select: { logoData: true, logoMimeType: true },
  });
  const data = await renderAnthropometricReportPdf({
    model: ctx.model,
    texts: savedTexts,
    professionalName: ctx.pro.name,
    signature: professionalSignature({ title: ctx.pro.title, name: ctx.pro.name, licenseNumber: ctx.pro.licenseNumber }),
    logo: logoRow?.logoData && logoRow.logoMimeType ? { data: logoRow.logoData, mimeType: logoRow.logoMimeType } : null,
    accentColor: ctx.pro.pdfAccentColor,
  });
  const { id } = await saveAnthropometricReportPdf({
    isakEntryId: ctx.entry.id,
    data,
    fileName: ctx.fileName,
    sourceKey: ctx.sourceKey,
  });
  return id;
}

const conclusionsMissing = (texts: IsakReportTexts): ReportActionState | null =>
  texts.conclusions.trim() === ""
    ? { ok: false, fieldErrors: { conclusions: ISAK_REPORT_TEXT.conclusionsRequired } }
    : null;

export async function saveIsakReportTextsAction(input: ReportActionInput): Promise<ReportActionState> {
  const prepared = await prepare(input);
  if (!prepared) return INVALID;
  const { data, ctx } = prepared;
  try {
    await saveAnthropometricReportTexts({ isakEntryId: ctx.entry.id, texts: data.texts });
  } catch (err) {
    console.error("saveIsakReportTextsAction", err);
    return { ok: false, error: ISAK_REPORT_TEXT.saveError };
  }
  revalidateReport(data.patientId, data.consultationId);
  return { ok: true };
}

export async function generateIsakReportPdfAction(input: ReportActionInput): Promise<ReportActionState> {
  const prepared = await prepare(input);
  if (!prepared) return INVALID;
  const { data, ctx } = prepared;
  const missing = conclusionsMissing(data.texts);
  if (missing) return missing;
  try {
    await generateAndSave(ctx, data.texts);
  } catch (err) {
    console.error("generateIsakReportPdfAction", err);
    return { ok: false, error: ISAK_REPORT_TEXT.generateError };
  }
  revalidateReport(data.patientId, data.consultationId);
  return { ok: true };
}

export async function sendIsakReportWhatsAppAction(input: ReportActionInput): Promise<ReportActionState> {
  const prepared = await prepare(input);
  if (!prepared) return INVALID;
  const { data, ctx } = prepared;
  const missing = conclusionsMissing(data.texts);
  if (missing) return missing;
  try {
    // Siempre regenera antes de encolar (D13).
    const reportId = await generateAndSave(ctx, data.texts);
    await enqueueAnthropometricReportMessage({
      reportId,
      toJid: ctx.patient.whatsappJid,
      caption: ISAK_REPORT_TEXT.whatsappCaption(ctx.currentDateLabel),
    });
  } catch (err) {
    console.error("sendIsakReportWhatsAppAction", err);
    return { ok: false, error: ISAK_REPORT_TEXT.sendError };
  }
  revalidateReport(data.patientId, data.consultationId);
  return { ok: true };
}
