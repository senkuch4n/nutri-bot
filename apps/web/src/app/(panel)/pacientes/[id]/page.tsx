import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { prisma } from "@nutri-bot/db";
import {
  capitalizeFirst,
  computeAgeYears,
  appointmentHistoryText,
  consultationRecordedItems,
  dayKeyInTz,
  formatAppointmentWhen,
  formatConsultationDay,
  formatDate,
  formatDateTime,
  formatInTimeZone,
  formatPrice,
  formatShortDate,
  formatTimeAgo,
  pickConsultationForDay,
  recordedItemsText,
  weightTrend,
} from "@nutri-bot/core";
import {
  getLatestFormulaMeasurements,
  listLatestPrescriptions,
  listPatientConsultations,
  listPatientPlans,
  listTemplates,
  listDiaryEntries,
  type LatestMeasurement,
} from "@nutri-bot/db/domain";
import { getProfessional } from "@/lib/professional";
import { toEvolutionRow } from "@/lib/evolution-rows";
import { AppointmentsSection } from "./appointments-section";
import { ConsultationsSection } from "./consultations-section";
import { DiarySection } from "./diary-section";
import { EvolutionSection } from "./evolution-section";
import { HistorySection } from "./history-section";
import { PatientHeader } from "./patient-header";
import { PatientTabs } from "./patient-tabs";
import { PlansSection } from "./plans-section";
import { SummarySection } from "./summary-section";

export const dynamic = "force-dynamic";

export default async function PatientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [pro, patient, plans, templates, diaryEntries, measurements, consultations, prescriptions] = await Promise.all([
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
    listLatestPrescriptions(id, 1),
  ]);
  if (!patient) notFound();

  const tz = pro.timezone;
  const now = new Date();
  // Hoy en la zona de la profesional (no en UTC: después de las 21 hs en ART ya sería mañana).
  const todayKey = dayKeyInTz(now, tz);
  const appts = patient.appointments;
  const ageYears = patient.birthDate ? computeAgeYears(patient.birthDate, now, tz) : null;
  const record = patient.clinicalRecord;
  const riskBackground = record?.riskFlag && record.background ? record.background : null;
  const evolutionRows = patient.evolutionEntries.map((e) => toEvolutionRow(e, tz));

  // ── Resumen ──
  const todayConsultation = pickConsultationForDay(consultations.filter((c) => dayKeyInTz(c.consultedAt, tz) === todayKey));
  // `appts` viene ordenado por startsAt desc: el próximo turno es el último de los futuros.
  const next = appts
    .filter((a) => (a.status === "CONFIRMED" || a.status === "AWAITING_PAYMENT") && a.startsAt >= now)
    .at(-1);
  const last = consultations[0];
  // Plan activo más reciente; "desde" = la primera consulta que lo indicó o, si ninguna, su alta.
  const activePlan = plans
    .filter((p) => p.status === "ACTIVE")
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0];
  const [latestPrescription] = prescriptions;
  const dated = (m: LatestMeasurement | null) => (m ? { value: m.value, dateLabel: formatShortDate(m.recordedAt, tz) } : null);

  const consultationRows = consultations.map((c) => ({
    id: c.id,
    dayLabel: formatConsultationDay(c.consultedAt, now, tz),
    originLabel: c.appointment
      ? `Con turno (${c.appointment.service.name}) · ${formatInTimeZone(c.consultedAt, tz, "H:mm")}`
      : "Sin turno",
    recordedText: recordedItemsText(
      consultationRecordedItems({
        measurements: c.evolutionEntries.map((e) => toEvolutionRow(e, tz)),
        hasPrescription: c.prescription !== null,
        hasPlan: c.planId !== null,
        notes: c.notes,
      }),
      "sentence",
    ),
  }));

  const diaryRows = diaryEntries.map((e) => ({
    id: e.id,
    createdAtLabel: formatDateTime(e.createdAt, tz),
    isRecent: now.getTime() - e.createdAt.getTime() < 24 * 60 * 60 * 1000,
    note: e.note,
    hasPhoto: Boolean(e.photoData),
  }));
  const diaryHasRecent = diaryRows.some((e) => e.isRecent);

  return (
    <div>
      <Link
        href="/pacientes"
        className="-ml-1 inline-flex min-h-11 items-center gap-0.5 rounded-md text-callout text-primary press-none pressed:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <ChevronLeft className="size-4" strokeWidth={2} aria-hidden />
        Pacientes
      </Link>

      <PatientTabs
        header={
          <PatientHeader
            patientId={patient.id}
            name={patient.name}
            phone={patient.phone}
            whatsappJid={patient.whatsappJid}
            ageYears={ageYears}
            riskBackground={riskBackground}
          />
        }
        consultationCount={consultations.length}
        diaryHasRecent={diaryHasRecent}
        panels={{
          resumen: (
            <SummarySection
              patientId={patient.id}
              todayKey={todayKey}
              todayConsultationId={todayConsultation?.id ?? null}
              nextAppointment={
                next
                  ? {
                      whenLabel: formatAppointmentWhen(next.startsAt, now, tz),
                      serviceName: next.service.name,
                      awaitingPayment: next.status === "AWAITING_PAYMENT",
                      dayKey: dayKeyInTz(next.startsAt, tz),
                    }
                  : null
              }
              lastConsultation={
                last
                  ? {
                      id: last.id,
                      whenLabel: `${capitalizeFirst(formatTimeAgo(last.consultedAt, now, tz))} · ${formatShortDate(last.consultedAt, tz)}`,
                      recordedText: recordedItemsText(
                        consultationRecordedItems({
                          measurements: last.evolutionEntries.map((e) => toEvolutionRow(e, tz)),
                          hasPrescription: last.prescription !== null,
                          hasPlan: last.planId !== null,
                          notes: last.notes,
                        }),
                        "short",
                      ),
                    }
                  : null
              }
              activePlan={
                activePlan
                  ? {
                      id: activePlan.id,
                      title: activePlan.title,
                      sinceLabel: `desde el ${formatShortDate(activePlan.consultations[0]?.consultedAt ?? activePlan.createdAt, tz)}`,
                    }
                  : null
              }
              weight={weightTrend(
                patient.evolutionEntries.map((e) => ({
                  weightKg: e.weightKg !== null ? Number(e.weightKg) : null,
                  recordedAt: e.recordedAt,
                })),
                tz,
              )}
              data={{
                ageYears,
                values: {
                  sex: patient.sex,
                  activityLevel: patient.activityLevel,
                  nutritionGoal: patient.nutritionGoal,
                  bodyFrame: patient.bodyFrame,
                },
                background: record?.background ?? null,
                goals: record?.goals ?? null,
                riskFlag: record?.riskFlag ?? false,
                weight: dated(measurements.weightKg),
                height: dated(measurements.heightCm),
                bodyFat: dated(measurements.bodyFatPercent),
                prescription: latestPrescription
                  ? {
                      kcal: latestPrescription.prescribedVctKcal,
                      proteinG: latestPrescription.proteinG,
                      fatG: latestPrescription.fatG,
                      carbG: latestPrescription.carbG,
                      dateLabel: formatShortDate(latestPrescription.consultation.consultedAt, tz),
                    }
                  : null,
              }}
              editable={{
                id: patient.id,
                name: patient.name,
                birthDate: patient.birthDate ? patient.birthDate.toISOString().slice(0, 10) : null,
                notes: patient.notes,
                sex: patient.sex,
                activityLevel: patient.activityLevel,
                nutritionGoal: patient.nutritionGoal,
                bodyFrame: patient.bodyFrame,
                background: record?.background ?? null,
                goals: record?.goals ?? null,
                riskFlag: record?.riskFlag ?? false,
              }}
            />
          ),
          consultas: <ConsultationsSection patientId={patient.id} todayKey={todayKey} consultations={consultationRows} />,
          planes: (
            <PlansSection
              patientId={patient.id}
              plans={plans.map((p) => ({
                id: p.id,
                title: p.title,
                status: p.status,
                updatedAtLabel: formatDate(p.updatedAt, tz),
                consultationLabel: p.consultations[0]
                  ? `Indicado en la consulta del ${formatInTimeZone(p.consultations[0].consultedAt, tz, "dd/MM")}`
                  : null,
              }))}
              templates={templates.map((t) => ({ id: t.id, title: t.title }))}
            />
          ),
          historial: (
            <HistorySection
              diaryHasRecent={diaryHasRecent}
              panels={{
                medidas: <EvolutionSection patientId={patient.id} entries={evolutionRows} todayKey={todayKey} />,
                turnos: (
                  <AppointmentsSection
                    summary={appointmentHistoryText(appts, now)}
                    appointments={appts.map((a) => ({
                      id: a.id,
                      whenLabel: formatAppointmentWhen(a.startsAt, now, tz),
                      serviceName: a.service.name,
                      priceLabel: formatPrice(a.priceSnapshot.toString(), pro.currency),
                      status: a.status,
                      consultationHref: a.consultation ? `/pacientes/${patient.id}/consultas/${a.consultation.id}` : null,
                      reason: a.reason,
                    }))}
                  />
                ),
                diario: <DiarySection entries={diaryRows} />,
              }}
            />
          ),
        }}
      />
    </div>
  );
}
