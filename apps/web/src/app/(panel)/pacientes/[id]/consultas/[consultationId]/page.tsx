import { notFound } from "next/navigation";
import { CalendarDays } from "lucide-react";
import {
  CONSULTATION_TEXT,
  buildAnthropometricDiagnosis,
  buildIsakStudy,
  buildIsakSummary,
  canDeleteConsultation,
  computeAgeYears,
  dayKeyInTz,
  formatInTimeZone,
  getRequirementBlockingMissing,
  initialRequirementDraft,
  missingFormulaDataMessage,
  type SourcedMeasurement,
} from "@nutri-bot/core";
import {
  getConsultation,
  getPreviousIsakStudy,
  getReferencePrescription,
  getRequirementContextForConsultation,
  listPatientPlans,
  toIsakMeasures,
  toPrescriptionSnapshot,
} from "@nutri-bot/db/domain";
import { Separator } from "@/components/primitives/separator";
import { Alert, Badge, Button, PageHeader } from "@/components/ui";
import { toEvolutionRow } from "@/lib/evolution-rows";
import { getProfessional } from "@/lib/professional";
import { ConsultationDateSheet } from "../../consultation-date-sheet";
import { AnthropometricDiagnosisCard, type DiagnosisSourceKey } from "./anthropometric-diagnosis";
import { ConsultationMeasurements } from "./consultation-measurements";
import { ConsultationNotes } from "./consultation-notes";
import { ConsultationPlan, type PlanOption } from "./consultation-plan";
import { DeleteConsultationButton } from "./delete-consultation-button";
import { IsakCard } from "./isak-card";
import type { CalculatorProps } from "./requirement-calculator";
import { RequirementSection } from "./requirement-section";

export const dynamic = "force-dynamic";

const planStatusRank = { ACTIVE: 0, DRAFT: 1, ARCHIVED: 2 } as const;

/** Detalle de una consulta (HU-003): mediciones, diagnóstico y requerimiento (HU-004), plan indicado y notas. */
export default async function ConsultationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; consultationId: string }>;
  searchParams: Promise<{ isak?: string | string[] }>;
}) {
  const [{ id, consultationId }, { isak }] = await Promise.all([params, searchParams]);
  const [consultation, pro, plans] = await Promise.all([
    getConsultation(consultationId),
    getProfessional(),
    listPatientPlans(id),
  ]);
  if (!consultation || consultation.patientId !== id) notFound();

  const tz = pro.timezone;
  const { patient, appointment } = consultation;
  const patientName = patient.name ?? patient.phone;
  const age = patient.birthDate ? computeAgeYears(patient.birthDate, consultation.consultedAt, tz) : null;
  const description = [patientName, age !== null ? `${age} años` : null].filter(Boolean).join(" · ");
  const todayKey = dayKeyInTz(new Date(), tz);

  const entries = consultation.evolutionEntries.map((e) => toEvolutionRow(e, tz));
  const canDelete = canDeleteConsultation({
    measurementCount: consultation.evolutionEntries.length,
    hasPrescription: consultation.prescription !== null,
    hasPlan: consultation.planId !== null,
  });

  // ── HU-004: diagnóstico y requerimiento, con las mediciones D4 (de la consulta o anteriores) ──
  const requirement = await getRequirementContextForConsultation(consultation.id);
  const m = requirement.measurements;
  const dateLabel = (d: Date) => formatInTimeZone(d, tz, "dd/MM/yyyy");
  const fromOther = (s: SourcedMeasurement | null) => s !== null && s.consultationId !== consultation.id;
  const otherDates: Partial<Record<DiagnosisSourceKey, string>> = {};
  for (const key of ["weightKg", "heightCm", "waistCm", "hipCm"] as const) {
    const source = m[key];
    if (source && fromOther(source)) otherDates[key] = dateLabel(source.recordedAt);
  }
  const diagnosis = buildAnthropometricDiagnosis({
    sex: patient.sex,
    ageYears: requirement.ageYears,
    bodyFrame: patient.bodyFrame,
    weightKg: m.weightKg?.value ?? null,
    heightCm: m.heightCm?.value ?? null,
    waistCm: m.waistCm?.value ?? null,
    hipCm: m.hipCm?.value ?? null,
  });
  const measuredBodyFat = m.bodyFatPercent
    ? { percent: m.bodyFatPercent.value, dateLabel: dateLabel(m.bodyFatPercent.recordedAt) }
    : null;

  const blockingItems = getRequirementBlockingMissing({
    sex: patient.sex,
    activityLevel: patient.activityLevel,
    nutritionGoal: patient.nutritionGoal,
    hasBirthDate: patient.birthDate !== null,
    weightKg: m.weightKg?.value ?? null,
    heightCm: m.heightCm?.value ?? null,
  });
  const prescription = consultation.prescription ? toPrescriptionSnapshot(consultation.prescription) : null;
  const ctx = requirement.ctx;
  const reference =
    ctx && !prescription
      ? await getReferencePrescription({
          patientId: id,
          consultationId: consultation.id,
          consultedAt: consultation.consultedAt,
        })
      : null;
  const calculator: CalculatorProps | null = ctx
    ? {
        ctx,
        initialDraft: initialRequirementDraft({
          ctx,
          patientActivityLevel: patient.activityLevel,
          patientNutritionGoal: patient.nutritionGoal,
          reference,
        }),
        editing: prescription !== null,
        measuredBodyFat,
        measuredBmr: m.basalMetabolicRateKcal
          ? {
              kcal: m.basalMetabolicRateKcal.value,
              dateLabel: dateLabel(m.basalMetabolicRateKcal.recordedAt),
              fromOtherConsultation: fromOther(m.basalMetabolicRateKcal),
            }
          : null,
        patientActivityLevel: patient.activityLevel,
        patientNutritionGoal: patient.nutritionGoal,
      }
    : null;

  // ── HU-006: estudio antropométrico ISAK de la consulta (una fila de EvolutionEntry con study) ──
  const isakEntry = consultation.evolutionEntries.find((e) => e.study === "ISAK") ?? null;
  let isakStudy: Parameters<typeof IsakCard>[0]["study"] = null;
  if (isakEntry) {
    const values = toIsakMeasures(isakEntry);
    const result = buildIsakStudy({ measures: values, sex: patient.sex, ageYears: age });
    const previousEntry = await getPreviousIsakStudy({ patientId: id, before: consultation.consultedAt });
    const previousAt = previousEntry?.consultation?.consultedAt ?? null;
    const previous =
      previousEntry && previousAt
        ? {
            result: buildIsakStudy({
              measures: toIsakMeasures(previousEntry),
              sex: patient.sex,
              ageYears: patient.birthDate ? computeAgeYears(patient.birthDate, previousAt, tz) : null,
            }),
            dateLabel: dateLabel(previousAt),
          }
        : null;
    isakStudy = { entryId: isakEntry.id, values, summary: buildIsakSummary(result, previous) };
  }
  // Precarga del alta: el peso y la talla más recientes de las mediciones comunes de la consulta.
  const commonByNewest = consultation.evolutionEntries
    .filter((e) => e.study !== "ISAK")
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const latestOf = (key: "weightKg" | "heightCm") => {
    const found = commonByNewest.find((e) => e[key] !== null)?.[key];
    return found == null ? null : Number(found);
  };
  const isakPrefill = { weightKg: latestOf("weightKg"), heightCm: latestOf("heightCm") };

  // listPatientPlans viene por createdAt desc; el sort es estable, así que cada grupo lo conserva.
  const planOptions: PlanOption[] = [...plans]
    .sort((a, b) => planStatusRank[a.status] - planStatusRank[b.status])
    .map((p) => ({ id: p.id, title: p.title, status: p.status }));

  return (
    <div>
      <PageHeader
        title={`Consulta del ${formatInTimeZone(consultation.consultedAt, tz, "dd/MM/yyyy")}`}
        description={description}
        back={{ href: `/pacientes/${id}?tab=consultas`, label: `Volver a ${patientName}` }}
        action={
          appointment ? null : (
            <ConsultationDateSheet
              mode="edit"
              patientId={id}
              consultationId={consultation.id}
              todayKey={todayKey}
              currentDayKey={dayKeyInTz(consultation.consultedAt, tz)}
              trigger={
                <Button type="button" variant="secondary" size="sm">
                  <CalendarDays aria-hidden />
                  Cambiar fecha
                </Button>
              }
            />
          )
        }
      />

      <div className="-mt-4 mb-6 flex flex-wrap items-center gap-2 text-sm">
        {appointment ? (
          <>
            <span className="font-medium">
              Turno · {appointment.service.name} · {formatInTimeZone(appointment.startsAt, tz, "HH:mm")} hs
            </span>
            <span className="text-muted-foreground">Fecha del turno</span>
          </>
        ) : (
          <Badge tone="neutral">Sin turno</Badge>
        )}
      </div>

      {appointment && appointment.status !== "COMPLETED" ? (
        <Alert tone="warning" className="mb-6">
          {CONSULTATION_TEXT.appointmentNotCompleted}
        </Alert>
      ) : null}

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start">
        <div className="space-y-6">
          <ConsultationMeasurements patientId={id} consultationId={consultation.id} entries={entries} />
          <IsakCard
            patientId={id}
            consultationId={consultation.id}
            study={isakStudy}
            prefill={isakPrefill}
            startEditing={isak === "editar"}
          />
          <AnthropometricDiagnosisCard
            diagnosis={diagnosis}
            consultationDateLabel={dateLabel(consultation.consultedAt)}
            otherDates={otherDates}
            measuredBodyFat={measuredBodyFat}
          />
          {diagnosis.minor ? null : (
            <RequirementSection
              patientId={id}
              consultationId={consultation.id}
              blockingMessage={missingFormulaDataMessage(blockingItems)}
              missingSex={blockingItems.some((i) => i.key === "sex")}
              missingBirthDate={blockingItems.some((i) => i.key === "birthDate")}
              formulaValues={{
                sex: patient.sex,
                activityLevel: patient.activityLevel,
                nutritionGoal: patient.nutritionGoal,
                bodyFrame: patient.bodyFrame,
              }}
              calculator={calculator}
              prescription={prescription}
              bodyFatDateLabel={
                consultation.prescription?.bodyFatRecordedAt
                  ? dateLabel(consultation.prescription.bodyFatRecordedAt)
                  : null
              }
            />
          )}
        </div>
        <div className="space-y-6">
          <ConsultationPlan
            patientId={id}
            consultationId={consultation.id}
            plan={consultation.plan}
            options={planOptions}
          />
          <ConsultationNotes patientId={id} consultationId={consultation.id} notes={consultation.notes} />
        </div>
      </div>

      <Separator className="my-8" />
      <DeleteConsultationButton patientId={id} consultationId={consultation.id} canDelete={canDelete} />
    </div>
  );
}
