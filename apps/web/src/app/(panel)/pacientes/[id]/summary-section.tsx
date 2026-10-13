import { CalendarClock, ClipboardList, Plus, Scale, Stethoscope } from "lucide-react";
import { PATIENT_SUMMARY_TEXT, type WeightTrend } from "@nutri-bot/core";
import { Button, ButtonLink, Metric } from "@/components/ui";
import { NewConsultationButton } from "./consultation-date-sheet";
import { EditPatientProvider, type EditablePatientData } from "./edit-patient-sheet";
import { PatientDataSection, type PatientDataSectionProps } from "./patient-data-section";
import { PatientTabButton } from "./patient-tabs";
import { SummaryCard, SummaryCardText } from "./summary-card";
import { WeightSparkline } from "./weight-sparkline";

const T = PATIENT_SUMMARY_TEXT;

export interface SummarySectionProps {
  patientId: string;
  todayKey: string;
  /** Consulta de hoy (pickConsultationForDay entre las de hoy), o null. */
  todayConsultationId: string | null;
  nextAppointment: { whenLabel: string; serviceName: string; awaitingPayment: boolean; dayKey: string } | null;
  lastConsultation: { id: string; whenLabel: string; recordedText: string } | null;
  activePlan: { id: string; title: string; sinceLabel: string } | null;
  weight: WeightTrend | null;
  data: PatientDataSectionProps;
  editable: EditablePatientData;
}

/**
 * Pestaña Resumen (HU-017c-2): una sola acción principal, cuatro tarjetas en el orden de la HU
 * (Próximo turno, Última consulta, Plan, Peso) y "Datos de la paciente". Server component; las piezas
 * interactivas (tarjetas que cambian de pestaña, Sheet "Editar datos") son cliente.
 */
export function SummarySection({
  patientId,
  todayKey,
  todayConsultationId,
  nextAppointment,
  lastConsultation,
  activePlan,
  weight,
  data,
  editable,
}: SummarySectionProps) {
  const primaryClass = "w-full sm:w-auto";
  return (
    <EditPatientProvider patient={editable} todayKey={todayKey}>
      <div className="space-y-6">
        <div>
          {todayConsultationId ? (
            <ButtonLink
              href={`/pacientes/${patientId}/consultas/${todayConsultationId}`}
              size="lg"
              className={primaryClass}
            >
              <Stethoscope aria-hidden />
              {T.openTodayConsultation}
            </ButtonLink>
          ) : (
            <NewConsultationButton
              patientId={patientId}
              todayKey={todayKey}
              trigger={
                <Button type="button" size="lg" className={primaryClass}>
                  <Plus aria-hidden />
                  {T.newConsultation}
                </Button>
              }
            />
          )}
        </div>

        <div className="grid gap-8 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] xl:items-start">
          <div className="grid gap-4 sm:grid-cols-2">
            {nextAppointment ? (
              <SummaryCard title="Próximo turno" icon={<CalendarClock />} href={`/?fecha=${nextAppointment.dayKey}`}>
                <SummaryCardText
                  primary={nextAppointment.whenLabel}
                  secondary={
                    <>
                      {nextAppointment.serviceName}
                      {nextAppointment.awaitingPayment ? (
                        <span className="font-medium text-warning"> · {T.awaitingPayment}</span>
                      ) : null}
                    </>
                  }
                />
              </SummaryCard>
            ) : (
              <SummaryCard title="Próximo turno" icon={<CalendarClock />}>
                <SummaryCardText primary={<span className="text-muted-foreground">{T.noAppointment}</span>} />
              </SummaryCard>
            )}

            {lastConsultation ? (
              <SummaryCard
                title="Última consulta"
                icon={<Stethoscope />}
                href={`/pacientes/${patientId}/consultas/${lastConsultation.id}`}
              >
                <SummaryCardText primary={lastConsultation.whenLabel} secondary={lastConsultation.recordedText} />
              </SummaryCard>
            ) : (
              <SummaryCard title="Última consulta" icon={<Stethoscope />}>
                <SummaryCardText primary={<span className="text-muted-foreground">Todavía no hay consultas</span>} />
              </SummaryCard>
            )}

            {activePlan ? (
              <SummaryCard title="Plan" icon={<ClipboardList />} href={`/pacientes/${patientId}/planes/${activePlan.id}`}>
                <SummaryCardText primary={activePlan.title} secondary={activePlan.sinceLabel} />
              </SummaryCard>
            ) : (
              <SummaryCard
                title="Plan"
                icon={<ClipboardList />}
                footer={
                  <PatientTabButton tab="planes">
                    <ClipboardList aria-hidden />
                    {T.seePlans}
                  </PatientTabButton>
                }
              >
                <SummaryCardText primary={<span className="text-muted-foreground">{T.noActivePlan}</span>} />
              </SummaryCard>
            )}

            {weight ? (
              <SummaryCard title="Peso" icon={<Scale />} tab={{ tab: "historial", view: "medidas" }}>
                <div className="flex items-end justify-between gap-3">
                  <Metric
                    label={`Medido el ${weight.latestDateLabel}`}
                    value={weight.latestKg}
                    unit="kg"
                    size="lg"
                    trend={
                      weight.deltaKg !== null && weight.text
                        ? { delta: weight.deltaKg, unit: "kg", sentiment: "neutral", label: weight.text, display: "label" }
                        : undefined
                    }
                  />
                  <WeightSparkline series={weight.series} className="mb-1" />
                </div>
              </SummaryCard>
            ) : (
              <SummaryCard
                title="Peso"
                icon={<Scale />}
                footer={
                  <PatientTabButton tab="historial" view="medidas">
                    <Scale aria-hidden />
                    {T.loadWeight}
                  </PatientTabButton>
                }
              >
                <SummaryCardText primary={<span className="text-muted-foreground">{T.noMeasurements}</span>} />
              </SummaryCard>
            )}
          </div>

          <PatientDataSection {...data} />
        </div>
      </div>
    </EditPatientProvider>
  );
}
