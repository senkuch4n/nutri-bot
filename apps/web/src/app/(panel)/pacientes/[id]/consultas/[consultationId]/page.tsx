import { notFound } from "next/navigation";
import { CalendarDays } from "lucide-react";
import {
  CONSULTATION_TEXT,
  canDeleteConsultation,
  computeAgeYears,
  dayKeyInTz,
  formatInTimeZone,
} from "@nutri-bot/core";
import { getConsultation, listPatientPlans } from "@nutri-bot/db/domain";
import { Separator } from "@/components/primitives/separator";
import { Alert, Badge, Button, PageHeader } from "@/components/ui";
import { toEvolutionRow } from "@/lib/evolution-rows";
import { getProfessional } from "@/lib/professional";
import { ConsultationDateSheet } from "../../consultation-date-sheet";
import { ConsultationMeasurements } from "./consultation-measurements";
import { ConsultationNotes } from "./consultation-notes";
import { ConsultationPlan, type PlanOption } from "./consultation-plan";
import { DeleteConsultationButton } from "./delete-consultation-button";

export const dynamic = "force-dynamic";

const planStatusRank = { ACTIVE: 0, DRAFT: 1, ARCHIVED: 2 } as const;

/** Detalle de una consulta (HU-003): mediciones, plan indicado y notas. */
export default async function ConsultationPage({
  params,
}: {
  params: Promise<{ id: string; consultationId: string }>;
}) {
  const { id, consultationId } = await params;
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
    hasPlan: consultation.planId !== null,
  });

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
        <ConsultationMeasurements patientId={id} consultationId={consultation.id} entries={entries} />
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
