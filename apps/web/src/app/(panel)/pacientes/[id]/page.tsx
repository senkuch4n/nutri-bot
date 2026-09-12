import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@nutri-bot/db";
import { formatDate, formatInTimeZone, formatPrice } from "@nutri-bot/core";
import { listPatientPlans, listTemplates } from "@nutri-bot/db/domain";
import { Badge, Card, SectionLabel, StatTile } from "@/components/ui";
import { getProfessional } from "@/lib/professional";
import { PatientForm } from "./patient-form";
import { ClinicalRecordForm } from "./clinical-record-form";
import { EvolutionSection } from "./evolution-section";
import { PlansSection } from "./plans-section";

export const dynamic = "force-dynamic";

const statusMeta = {
  CONFIRMED: { tone: "blue", label: "Confirmado" },
  AWAITING_PAYMENT: { tone: "amber", label: "Esperando pago" },
  COMPLETED: { tone: "green", label: "Completado" },
  CANCELLED: { tone: "slate", label: "Cancelado" },
  NO_SHOW: { tone: "red", label: "Ausente" },
} as const;

export default async function PatientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [pro, patient, plans, templates] = await Promise.all([
    getProfessional(),
    prisma.patient.findUnique({
      where: { id },
      include: {
        appointments: { include: { service: true }, orderBy: { startsAt: "desc" } },
        clinicalRecord: true,
        evolutionEntries: { orderBy: { recordedAt: "desc" } },
      },
    }),
    listPatientPlans(id),
    listTemplates(),
  ]);
  if (!patient) notFound();

  const appts = patient.appointments;
  const count = (s: keyof typeof statusMeta) => appts.filter((a) => a.status === s).length;

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/pacientes"
          className="text-sm text-ink-soft transition-colors hover:text-ink"
        >
          ← Volver a pacientes
        </Link>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight text-ink">
              {patient.name ?? "Paciente sin nombre"}
            </h1>
            <p className="mt-1 text-sm text-ink-soft">WhatsApp · {patient.phone}</p>
          </div>
          <a
            href={`https://wa.me/${patient.phone}`}
            target="_blank"
            rel="noopener noreferrer"
            className="press inline-flex items-center gap-2 border-2 border-ink px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-ink hover:text-white"
          >
            Abrir chat de WhatsApp
          </a>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <StatTile label="Turnos totales" value={appts.length} />
        <StatTile label="Completados" value={count("COMPLETED")} />
        <StatTile label="Cancelados" value={count("CANCELLED")} />
        <StatTile label="Ausencias" value={count("NO_SHOW")} />
      </div>

      <Card>
        <SectionLabel>Datos</SectionLabel>
        <PatientForm patient={{ id: patient.id, name: patient.name, notes: patient.notes }} />
      </Card>

      <Card>
        <SectionLabel>Ficha clínica</SectionLabel>
        <ClinicalRecordForm
          patientId={patient.id}
          record={
            patient.clinicalRecord
              ? { background: patient.clinicalRecord.background, goals: patient.clinicalRecord.goals }
              : null
          }
        />
      </Card>

      <Card>
        <SectionLabel>Evolución</SectionLabel>
        <EvolutionSection
          patientId={patient.id}
          entries={patient.evolutionEntries.map((e) => ({
            id: e.id,
            recordedAtISO: e.recordedAt.toISOString(),
            recordedAtLabel: formatDate(e.recordedAt, pro.timezone),
            weightKg: e.weightKg !== null ? Number(e.weightKg) : null,
            heightCm: e.heightCm !== null ? Number(e.heightCm) : null,
            waistCm: e.waistCm !== null ? Number(e.waistCm) : null,
            hipCm: e.hipCm !== null ? Number(e.hipCm) : null,
            armCm: e.armCm !== null ? Number(e.armCm) : null,
            thighCm: e.thighCm !== null ? Number(e.thighCm) : null,
            calfCm: e.calfCm !== null ? Number(e.calfCm) : null,
            tricepsSkinfoldMm: e.tricepsSkinfoldMm !== null ? Number(e.tricepsSkinfoldMm) : null,
            subscapularSkinfoldMm:
              e.subscapularSkinfoldMm !== null ? Number(e.subscapularSkinfoldMm) : null,
            abdominalSkinfoldMm:
              e.abdominalSkinfoldMm !== null ? Number(e.abdominalSkinfoldMm) : null,
            note: e.note,
          }))}
        />
      </Card>

      <Card>
        <SectionLabel>Planes nutricionales</SectionLabel>
        <PlansSection
          patientId={patient.id}
          plans={plans.map((p) => ({
            id: p.id,
            title: p.title,
            status: p.status,
            updatedAtLabel: formatDate(p.updatedAt, pro.timezone),
          }))}
          templates={templates.map((t) => ({ id: t.id, title: t.title }))}
        />
      </Card>

      <Card>
        <SectionLabel>Historial de turnos</SectionLabel>
        {appts.length === 0 ? (
          <p className="text-sm text-ink-faint">Sin turnos registrados.</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {appts.map((a) => {
              const meta = statusMeta[a.status];
              return (
                <li key={a.id} className="flex items-center justify-between gap-4 py-3">
                  <span className="min-w-0 truncate text-ink">
                    {formatInTimeZone(a.startsAt, pro.timezone, "dd/MM/yyyy · HH:mm")} hs
                    <span className="mx-1.5 text-ink-faint">·</span>
                    {a.service.name}
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <span className="text-ink-soft">
                      {formatPrice(a.priceSnapshot.toString(), pro.currency)}
                    </span>
                    <Badge tone={meta.tone}>{meta.label}</Badge>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
