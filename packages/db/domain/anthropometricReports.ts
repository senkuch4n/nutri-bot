import { ISAK_REPORT_TEXT_KEYS, type IsakReportTextKey, type IsakReportTexts } from "@nutri-bot/core";
import { Prisma, prisma, type OutboundMessage } from "../index";

/**
 * HU-007: informe antropométrico de un estudio ISAK (1:1 con la fila ISAK de EvolutionEntry).
 * Guarda los textos y el último PDF. Si se borra el estudio, la FK borra el informe en cascada.
 */

export interface AnthropometricReportMeta {
  id: string;
  isakEntryId: string;
  /** null = nunca guardado. */
  texts: Record<IsakReportTextKey, string | null>;
  pdfFileName: string | null;
  pdfGeneratedAt: Date | null;
  pdfSourceKey: string | null;
}

type TextColumn =
  | "girthsText"
  | "distributionText"
  | "adiposeMuscleText"
  | "muscleBoneText"
  | "waistHipText"
  | "somatotypeText"
  | "conclusionsText";

/** Mapeo fijo clave → columna (girths → girthsText, …). */
export const REPORT_TEXT_COLUMNS: Record<IsakReportTextKey, TextColumn> = {
  girths: "girthsText",
  distribution: "distributionText",
  adiposeMuscle: "adiposeMuscleText",
  muscleBone: "muscleBoneText",
  waistHip: "waistHipText",
  somatotype: "somatotypeText",
  conclusions: "conclusionsText",
};

/** Todo menos pdfData. */
const META_SELECT = {
  id: true,
  isakEntryId: true,
  girthsText: true,
  distributionText: true,
  adiposeMuscleText: true,
  muscleBoneText: true,
  waistHipText: true,
  somatotypeText: true,
  conclusionsText: true,
  pdfFileName: true,
  pdfGeneratedAt: true,
  pdfSourceKey: true,
} satisfies Prisma.AnthropometricReportSelect;

type MetaRow = Prisma.AnthropometricReportGetPayload<{ select: typeof META_SELECT }>;

function toMeta(row: MetaRow): AnthropometricReportMeta {
  const texts = {} as Record<IsakReportTextKey, string | null>;
  for (const k of ISAK_REPORT_TEXT_KEYS) texts[k] = row[REPORT_TEXT_COLUMNS[k]];
  return {
    id: row.id,
    isakEntryId: row.isakEntryId,
    texts,
    pdfFileName: row.pdfFileName,
    pdfGeneratedAt: row.pdfGeneratedAt,
    pdfSourceKey: row.pdfSourceKey,
  };
}

/** Sin pdfData (select explícito). null si no hay informe. */
export async function getAnthropometricReportMeta(isakEntryId: string): Promise<AnthropometricReportMeta | null> {
  const row = await prisma.anthropometricReport.findUnique({ where: { isakEntryId }, select: META_SELECT });
  return row ? toMeta(row) : null;
}

/** Upsert por isakEntryId con los 7 textos tal cual (strings, "" incluido). No toca el PDF. */
export async function saveAnthropometricReportTexts(params: {
  isakEntryId: string;
  texts: IsakReportTexts;
}): Promise<AnthropometricReportMeta> {
  const data = {} as Record<TextColumn, string>;
  for (const k of ISAK_REPORT_TEXT_KEYS) data[REPORT_TEXT_COLUMNS[k]] = params.texts[k];
  const row = await prisma.anthropometricReport.upsert({
    where: { isakEntryId: params.isakEntryId },
    create: { isakEntryId: params.isakEntryId, ...data },
    update: data,
    select: META_SELECT,
  });
  return toMeta(row);
}

/** Guarda el último PDF (el informe tiene que existir: la action guarda los textos antes). */
export async function saveAnthropometricReportPdf(params: {
  isakEntryId: string;
  data: Buffer;
  fileName: string;
  sourceKey: string;
}): Promise<{ id: string }> {
  return prisma.anthropometricReport.update({
    where: { isakEntryId: params.isakEntryId },
    data: {
      pdfData: params.data,
      pdfFileName: params.fileName,
      pdfGeneratedAt: new Date(),
      pdfSourceKey: params.sourceKey,
    },
    select: { id: true },
  });
}

/** Bytes para el route handler de descarga. null si no hay informe o no tiene PDF. */
export async function getAnthropometricReportPdf(isakEntryId: string): Promise<{ data: Buffer; fileName: string } | null> {
  const row = await prisma.anthropometricReport.findUnique({
    where: { isakEntryId },
    select: { pdfData: true, pdfFileName: true },
  });
  if (!row?.pdfData) return null;
  return { data: Buffer.from(row.pdfData), fileName: row.pdfFileName ?? "informe-antropometrico.pdf" };
}

/** Crea el OutboundMessage PENDING de kind ANTHROPOMETRIC_REPORT_PDF. `db` permite usarlo dentro
 *  de una transacción (la prueba del bot la revierte). */
export function enqueueAnthropometricReportMessage(
  params: { reportId: string; toJid: string; caption: string },
  db: Prisma.TransactionClient = prisma,
): Promise<OutboundMessage> {
  return db.outboundMessage.create({
    data: {
      anthropometricReportId: params.reportId,
      toJid: params.toJid,
      body: params.caption,
      kind: "ANTHROPOMETRIC_REPORT_PDF",
      status: "PENDING",
    },
  });
}
