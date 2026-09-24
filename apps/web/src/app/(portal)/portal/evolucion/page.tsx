import { TrendingUp } from "lucide-react";
import { prisma } from "@nutri-bot/db";
import { formatDate } from "@nutri-bot/core";
import { Card, EmptyState, Quantity } from "@/components/ui";
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
      <h1 className="text-balance text-2xl font-semibold tracking-tight">Tu evolución</h1>

      <Card title="Peso">
        {weightPoints.length < 2 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay suficientes registros para el gráfico.</p>
        ) : (
          <EvolutionChart points={weightPoints} seriesLabel="Peso (kg)" height={220} unit="kg" />
        )}
      </Card>

      <Card title="Historial" padding="none">
        {entries.length === 0 ? (
          <EmptyState icon={TrendingUp} title="Todavía no hay registros." />
        ) : (
          <ul className="divide-y">
            {entries.map((e) => (
              <li key={e.id} className="flex items-start justify-between gap-4 px-4 py-3 sm:px-6">
                <div className="min-w-0">
                  <p className="text-sm font-medium first-letter:uppercase">{formatDate(e.recordedAt, pro.timezone)}</p>
                  {e.note ? <p className="mt-0.5 text-sm text-muted-foreground">{e.note}</p> : null}
                </div>
                {e.weightKg !== null ? (
                  <Quantity value={Number(e.weightKg)} unit="kg" className="shrink-0 text-sm font-medium" />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
