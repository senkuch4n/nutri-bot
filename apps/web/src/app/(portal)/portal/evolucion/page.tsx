import Link from "next/link";
import { prisma } from "@nutri-bot/db";
import { formatDate } from "@nutri-bot/core";
import { Card, SectionLabel } from "@/components/ui";
import { EvolutionChart } from "@/components/evolution-chart";
import { getPortalPatient } from "@/lib/patient-session";
import { getProfessional } from "@/lib/professional";

export const dynamic = "force-dynamic";

export default async function PortalEvolutionPage() {
  const patient = await getPortalPatient();
  if (!patient) return null;

  const [pro, entries] = await Promise.all([
    getProfessional(),
    prisma.evolutionEntry.findMany({
      where: { patientId: patient.id },
      orderBy: { recordedAt: "desc" },
    }),
  ]);

  const weightPoints = entries
    .filter((e) => e.weightKg !== null)
    .map((e) => ({ date: e.recordedAt, value: Number(e.weightKg) }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  return (
    <div className="space-y-6">
      <div>
        <Link href="/portal" className="text-sm text-ink-soft transition-colors hover:text-ink">
          ← Volver
        </Link>
        <h1 className="mt-2 font-display text-2xl font-bold text-ink">Tu evolución</h1>
      </div>

      <Card>
        <SectionLabel>Peso (kg)</SectionLabel>
        {weightPoints.length < 2 ? (
          <p className="text-sm text-ink-faint">Todavía no hay suficientes registros para el gráfico.</p>
        ) : (
          <EvolutionChart points={weightPoints} seriesLabel="Peso (kg)" height={220} />
        )}
      </Card>

      <Card>
        <SectionLabel>Historial</SectionLabel>
        {entries.length === 0 ? (
          <p className="text-sm text-ink-faint">Todavía no hay registros.</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {entries.map((e) => (
              <li key={e.id} className="py-2.5">
                <p className="font-medium text-ink">
                  {formatDate(e.recordedAt, pro.timezone)}
                  {e.weightKg !== null ? (
                    <span className="ml-2 font-normal text-ink-soft">{e.weightKg.toString()} kg</span>
                  ) : null}
                </p>
                {e.note ? <p className="mt-0.5 text-ink-faint">{e.note}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
