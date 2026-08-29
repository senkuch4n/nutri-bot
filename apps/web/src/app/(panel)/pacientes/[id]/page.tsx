import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@nutri-bot/db";
import { formatInTimeZone, formatPrice } from "@nutri-bot/core";
import { Badge, Card, PageHeader } from "@/components/ui";
import { getProfessional } from "@/lib/professional";
import { PatientForm } from "./patient-form";

export const dynamic = "force-dynamic";

const statusTone = {
  CONFIRMED: "blue",
  COMPLETED: "green",
  CANCELLED: "slate",
  NO_SHOW: "red",
} as const;

export default async function PatientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [pro, patient] = await Promise.all([
    getProfessional(),
    prisma.patient.findUnique({
      where: { id },
      include: { appointments: { include: { service: true }, orderBy: { startsAt: "desc" } } },
    }),
  ]);
  if (!patient) notFound();

  return (
    <div className="space-y-6">
      <PageHeader title={patient.name ?? patient.phone} description={`WhatsApp: ${patient.phone}`} />
      <Link href="/pacientes" className="text-sm text-brand hover:underline">
        ← Volver a pacientes
      </Link>

      <Card>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">Datos</h2>
        <PatientForm patient={{ id: patient.id, name: patient.name, notes: patient.notes }} />
      </Card>

      <Card>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">
          Historial de turnos
        </h2>
        {patient.appointments.length === 0 ? (
          <p className="text-sm text-slate-500">Sin turnos.</p>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {patient.appointments.map((a) => (
              <li key={a.id} className="flex items-center justify-between py-2">
                <span>
                  {formatInTimeZone(a.startsAt, pro.timezone, "dd/MM/yyyy HH:mm")} hs · {a.service.name}
                </span>
                <span className="flex items-center gap-3">
                  <span className="text-slate-500">
                    {formatPrice(a.priceSnapshot.toString(), pro.currency)}
                  </span>
                  <Badge tone={statusTone[a.status]}>{a.status}</Badge>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
