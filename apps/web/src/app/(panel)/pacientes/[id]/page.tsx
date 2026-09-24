import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@nutri-bot/db";
import {
  computeAgeYears,
  consultationChips,
  dayKeyInTz,
  formatDate,
  formatDateTime,
  formatInTimeZone,
  formatPrice,
} from "@nutri-bot/core";
import {
  getLatestFormulaMeasurements,
  listPatientConsultations,
  listPatientPlans,
  listTemplates,
  listDiaryEntries,
  type LatestMeasurement,
} from "@nutri-bot/db/domain";
import { Card, SectionLabel, StatTile } from "@/components/ui";
import { getProfessional } from "@/lib/professional";
import { toEvolutionRow } from "@/lib/evolution-rows";
import { AppointmentsSection } from "./appointments-section";
import { ClinicalAlert } from "./clinical-alert";
import { ClinicalRecordForm } from "./clinical-record-form";
import { ConsultationsSection } from "./consultations-section";
import { DiarySection } from "./diary-section";
import { EvolutionSection } from "./evolution-section";
import { EvolutionSummary } from "./evolution-summary";
import { FormulaDataSection } from "./formula-data-section";
import { PatientForm } from "./patient-form";
import { PatientHeader } from "./patient-header";
import { PatientTabs } from "./patient-tabs";
import { PlansSection } from "./plans-section";

export const dynamic = "force-dynamic";

const statusMeta = {
  CONFIRMED: { tone: "info", label: "Confirmado" },
  AWAITING_PAYMENT: { tone: "warning", label: "Esperando pago" },
  COMPLETED: { tone: "success", label: "Completado" },
  CANCELLED: { tone: "neutral", label: "Cancelado" },
  NO_SHOW: { tone: "danger", label: "Ausente" },
} as const;

export default async function PatientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [pro, patient, plans, templates, diaryEntries, measurements, consultations] = await Promise.all([
    getProfessional(),
    prisma.patient.findUnique({
      where: { id },
      include: {
        appointments: {
          include: { service: true, consultation: { select: { id: true } } },
          orderBy: { startsAt: "desc" },
        },
        clinicalRecord: true,
        evolutionEntries: { orderBy: { recordedAt: "desc" } },
      },
    }),
    listPatientPlans(id),
    listTemplates(),
    listDiaryEntries(id),
    getLatestFormulaMeasurements(id),
    listPatientConsultations(id),
  ]);
  if (!patient) notFound();

  const summaryMeasurement = (m: LatestMeasurement | null) =>
    m ? { value: m.value, dateLabel: formatInTimeZone(m.recordedAt, pro.timezone, "dd/MM/yyyy") } : null;

  const now = new Date();
  const appts = patient.appointments;
  const count = (s: keyof typeof statusMeta) => appts.filter((a) => a.status === s).length;
  const ageYears = patient.birthDate ? computeAgeYears(patient.birthDate, now, pro.timezone) : null;

  // `appts` viene ordenado por startsAt desc: el próximo turno es el último de los futuros.
  const next = appts
    .filter((a) => (a.status === "CONFIRMED" || a.status === "AWAITING_PAYMENT") && a.startsAt >= now)
    .at(-1);
  const nextAppointment = next
    ? {
        label: formatDateTime(next.startsAt, pro.timezone),
        serviceName: next.service.name,
        awaitingPayment: next.status === "AWAITING_PAYMENT",
      }
    : null;
  const riskBackground =
    patient.clinicalRecord?.riskFlag && patient.clinicalRecord.background
      ? patient.clinicalRecord.background
      : null;

  const evolutionRows = patient.evolutionEntries.map((e) => toEvolutionRow(e, pro.timezone));
  // Hoy en la zona de la profesional (no en UTC: después de las 21 hs en ART ya sería mañana).
  const todayKey = dayKeyInTz(now, pro.timezone);

  const consultationRows = consultations.map((c) => ({
    id: c.id,
    consultedAtISO: c.consultedAt.toISOString(),
    dateLabel: formatInTimeZone(c.consultedAt, pro.timezone, "dd/MM/yyyy"),
    timeLabel: c.appointment ? formatInTimeZone(c.consultedAt, pro.timezone, "HH:mm") : null,
    originLabel: c.appointment ? c.appointment.service.name : null,
    chips: consultationChips({
      measurements: c.evolutionEntries.map((e) => toEvolutionRow(e, pro.timezone)),
      hasPlan: c.planId !== null,
      notes: c.notes,
    }),
  }));

  const diaryRows = diaryEntries.map((e) => ({
    id: e.id,
    createdAtLabel: formatDateTime(e.createdAt, pro.timezone),
    isRecent: Date.now() - e.createdAt.getTime() < 24 * 60 * 60 * 1000,
    note: e.note,
    hasPhoto: Boolean(e.photoData),
  }));

  const formulaValues = {
    sex: patient.sex,
    activityLevel: patient.activityLevel,
    nutritionGoal: patient.nutritionGoal,
    bodyFrame: patient.bodyFrame,
  };

  return (
    <div>
      <Link
        href="/pacientes"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Pacientes
      </Link>

      <PatientTabs
        header={
          <PatientHeader
            name={patient.name}
            phone={patient.phone}
            ageYears={ageYears}
            nextAppointment={nextAppointment}
            riskBackground={riskBackground}
          />
        }
        counts={{
          consultas: consultationRows.length,
          evolucion: evolutionRows.length,
          planes: plans.length,
          diario: diaryRows.length,
          turnos: appts.length,
        }}
        diaryHasRecent={diaryRows.some((e) => e.isRecent)}
        panels={{
          resumen: (
            <div className="space-y-8">
              <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] xl:items-start">
                <EvolutionSummary entries={evolutionRows} />
                <FormulaDataSection
                  patientId={patient.id}
                  values={formulaValues}
                  ageYears={ageYears}
                  weight={summaryMeasurement(measurements.weightKg)}
                  height={summaryMeasurement(measurements.heightCm)}
                  bodyFat={summaryMeasurement(measurements.bodyFatPercent)}
                />
              </div>
              <section aria-labelledby="turnos-resumen">
                <SectionLabel>
                  <span id="turnos-resumen">Turnos</span>
                </SectionLabel>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <StatTile label="Turnos totales" value={appts.length} />
                  <StatTile label="Completados" value={count("COMPLETED")} />
                  <StatTile label="Cancelados" value={count("CANCELLED")} />
                  <StatTile label="Ausencias" value={count("NO_SHOW")} />
                </div>
              </section>
            </div>
          ),
          consultas: (
            <ConsultationsSection patientId={patient.id} todayKey={todayKey} consultations={consultationRows} />
          ),
          datos: (
            <div>
              {riskBackground ? (
                <div className="mb-6">
                  <ClinicalAlert background={riskBackground} />
                </div>
              ) : null}
              <div className="grid gap-6 xl:grid-cols-2 xl:items-start">
                <Card title="Datos del paciente">
                  <PatientForm
                    patient={{
                      id: patient.id,
                      name: patient.name,
                      notes: patient.notes,
                      birthDateISO: patient.birthDate ? patient.birthDate.toISOString().slice(0, 10) : null,
                    }}
                  />
                </Card>
                <Card title="Ficha clínica">
                  <ClinicalRecordForm
                    patientId={patient.id}
                    record={
                      patient.clinicalRecord
                        ? {
                            background: patient.clinicalRecord.background,
                            goals: patient.clinicalRecord.goals,
                            riskFlag: patient.clinicalRecord.riskFlag,
                          }
                        : null
                    }
                  />
                </Card>
              </div>
            </div>
          ),
          evolucion: <EvolutionSection patientId={patient.id} entries={evolutionRows} todayKey={todayKey} />,
          planes: (
            <PlansSection
              patientId={patient.id}
              plans={plans.map((p) => ({
                id: p.id,
                title: p.title,
                status: p.status,
                updatedAtLabel: formatDate(p.updatedAt, pro.timezone),
                consultationLabel: p.consultations[0]
                  ? `Indicado en la consulta del ${formatInTimeZone(p.consultations[0].consultedAt, pro.timezone, "dd/MM")}`
                  : null,
              }))}
              templates={templates.map((t) => ({ id: t.id, title: t.title }))}
            />
          ),
          diario: <DiarySection entries={diaryRows} />,
          turnos: (
            <AppointmentsSection
              appointments={appts.map((a) => ({
                id: a.id,
                startsAtLabel: `${formatInTimeZone(a.startsAt, pro.timezone, "dd/MM/yyyy · HH:mm")} hs`,
                serviceName: a.service.name,
                priceLabel: formatPrice(a.priceSnapshot.toString(), pro.currency),
                status: statusMeta[a.status],
                consultationHref: a.consultation ? `/pacientes/${patient.id}/consultas/${a.consultation.id}` : null,
              }))}
            />
          ),
        }}
      />
    </div>
  );
}
