import "server-only";
import {
  buildIsakReportDrafts,
  buildIsakReportModel,
  buildIsakStudy,
  computeAgeYears,
  dayKeyInTz,
  formatInTimeZone,
  isakReportFileName,
  isakReportSourceKey,
  resolveIsakReportTexts,
  type IsakReportInput,
  type IsakReportModel,
  type IsakReportTexts,
} from "@nutri-bot/core";
import type { EvolutionEntry, Patient } from "@nutri-bot/db";
import {
  getAnthropometricReportMeta,
  getConsultation,
  getIsakStudy,
  getPreviousIsakStudy,
  toIsakMeasures,
  type AnthropometricReportMeta,
} from "@nutri-bot/db/domain";
import { getProfessional, type Professional } from "@/lib/professional";

// HU-007: todo lo que necesitan la página del informe, las actions y el route handler del PDF.
// Arma lo mismo que la página del estudio (HU-006) y no recalcula nada por su cuenta.

export type IsakReportContext = {
  patientId: string;
  consultationId: string;
  consultationHref: string;
  studyHref: string;
  reportHref: string;
  patient: Patient;
  pro: Professional;
  /** Fila ISAK. */
  entry: EvolutionEntry;
  input: IsakReportInput;
  model: IsakReportModel;
  drafts: IsakReportTexts;
  report: AnthropometricReportMeta | null;
  /** resolveIsakReportTexts(report?.texts ?? null, drafts) */
  texts: IsakReportTexts;
  sourceKey: string;
  /** isakReportFileName(dayKey de la consulta) */
  fileName: string;
  currentDateLabel: string;
  /** Hay PDF y la huella de los datos cambió desde que se generó. */
  stale: boolean;
};

export async function loadIsakReportContext(
  patientId: string,
  consultationId: string,
): Promise<{ status: "ok"; ctx: IsakReportContext } | { status: "not_found" } | { status: "no_study"; consultationHref: string }> {
  const [consultation, pro, entry] = await Promise.all([
    getConsultation(consultationId),
    getProfessional(),
    getIsakStudy(consultationId),
  ]);
  if (!consultation || consultation.patientId !== patientId) return { status: "not_found" };
  const consultationHref = `/pacientes/${patientId}/consultas/${consultationId}`;
  if (!entry) return { status: "no_study", consultationHref };

  const tz = pro.timezone;
  const { patient } = consultation;
  const ageAt = (at: Date) => (patient.birthDate ? computeAgeYears(patient.birthDate, at, tz) : null);
  const dateLabel = (d: Date) => formatInTimeZone(d, tz, "dd/MM/yyyy");

  const currentAge = ageAt(consultation.consultedAt);
  const currentMeasures = toIsakMeasures(entry);
  const currentDateLabel = dateLabel(consultation.consultedAt);

  const previousEntry = await getPreviousIsakStudy({ patientId, before: consultation.consultedAt });
  const previousAt = previousEntry?.consultation?.consultedAt ?? null;
  const previous =
    previousEntry && previousAt
      ? {
          entryId: previousEntry.id,
          measures: toIsakMeasures(previousEntry),
          dateLabel: dateLabel(previousAt),
          ageYears: ageAt(previousAt),
        }
      : null;

  const input: IsakReportInput = {
    patientName: patient.name ?? patient.phone,
    current: {
      result: buildIsakStudy({ measures: currentMeasures, sex: patient.sex, ageYears: currentAge }),
      dateLabel: currentDateLabel,
      ageYears: currentAge,
    },
    previous: previous
      ? {
          result: buildIsakStudy({ measures: previous.measures, sex: patient.sex, ageYears: previous.ageYears }),
          dateLabel: previous.dateLabel,
          ageYears: previous.ageYears,
        }
      : null,
  };

  const model = buildIsakReportModel(input);
  const drafts = buildIsakReportDrafts(input);
  const report = await getAnthropometricReportMeta(entry.id);
  const sourceKey = isakReportSourceKey({
    sex: patient.sex,
    current: { entryId: entry.id, measures: currentMeasures, dateLabel: currentDateLabel, ageYears: currentAge },
    previous,
  });
  const studyHref = `${consultationHref}/antropometria`;

  return {
    status: "ok",
    ctx: {
      patientId,
      consultationId,
      consultationHref,
      studyHref,
      reportHref: `${studyHref}/informe`,
      patient,
      pro,
      entry,
      input,
      model,
      drafts,
      report,
      texts: resolveIsakReportTexts(report?.texts ?? null, drafts),
      sourceKey,
      fileName: isakReportFileName(dayKeyInTz(consultation.consultedAt, tz)),
      currentDateLabel,
      stale: report?.pdfGeneratedAt != null && report.pdfSourceKey !== sourceKey,
    },
  };
}
