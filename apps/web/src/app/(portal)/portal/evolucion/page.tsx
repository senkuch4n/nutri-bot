import Link from "next/link";
import { prisma } from "@nutri-bot/db";
import { formatDate } from "@nutri-bot/core";
import { Card, SectionLabel } from "@/components/ui";
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
    .map((e) => ({ x: e.recordedAt.getTime(), y: Number(e.weightKg) }))
    .sort((a, b) => a.x - b.x);

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
          <Chart points={weightPoints} />
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

function Chart({ points }: { points: { x: number; y: number }[] }) {
  const width = 520;
  const height = 140;
  const padding = 12;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys) - 1;
  const maxY = Math.max(...ys) + 1;

  const scaleX = (x: number) => padding + ((x - minX) / (maxX - minX || 1)) * (width - padding * 2);
  const scaleY = (y: number) =>
    height - padding - ((y - minY) / (maxY - minY || 1)) * (height - padding * 2);

  const path = points.map((p) => `${scaleX(p.x)},${scaleY(p.y)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="Evolución de peso">
      <polyline points={path} fill="none" stroke="currentColor" strokeWidth="2" className="text-leaf" />
      {points.map((p, i) => (
        <circle key={i} cx={scaleX(p.x)} cy={scaleY(p.y)} r="3" className="fill-leaf-deep" />
      ))}
    </svg>
  );
}
