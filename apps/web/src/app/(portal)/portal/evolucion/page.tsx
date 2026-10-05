import { TrendingUp } from "lucide-react";
import { prisma } from "@nutri-bot/db";
import {
  PORTAL_TEXT,
  isMinorOn,
  portalEvolutionRows,
  portalHeightSummary,
  portalWeightSummary,
} from "@nutri-bot/core";
import { Card, EmptyState, Metric, cn } from "@/components/ui";
import { EvolutionChart } from "@/components/evolution-chart";
import { GroupedList, GroupedListRow } from "@/components/grouped-list";
import { getPortalPatient } from "@/lib/patient-session";
import { getProfessional } from "@/lib/professional";

export const dynamic = "force-dynamic";

// HU-017d-1 (SDD 4.6 y 5.2). D2: la consulta no lee `note` (las notas clínicas no llegan ni al payload).
export default async function PortalEvolutionPage() {
  const patient = await getPortalPatient();
  if (!patient) return null;

  const now = new Date();
  const [pro, entries] = await Promise.all([
    getProfessional(),
    prisma.evolutionEntry.findMany({
      where: { patientId: patient.id },
      orderBy: { recordedAt: "desc" },
      select: { id: true, recordedAt: true, weightKg: true, heightCm: true },
    }),
  ]);
  const tz = pro.timezone;

  const pts = entries.map((e) => ({
    id: e.id,
    recordedAt: e.recordedAt,
    weightKg: e.weightKg === null ? null : Number(e.weightKg),
    heightCm: e.heightCm === null ? null : Number(e.heightCm),
  }));
  const hideChange = isMinorOn(patient.birthDate, now, tz);
  const weight = portalWeightSummary(pts, now, tz, { hideChange });
  const height = portalHeightSummary(pts, now, tz);
  const rows = portalEvolutionRows(pts, now, tz);
  const chartPoints = pts.flatMap((p) => (p.weightKg === null ? [] : [{ date: p.recordedAt, value: p.weightKg }]));

  if (!weight && !height) {
    return (
      <div className="space-y-6">
        <h1 className="text-balance text-title-1">{PORTAL_TEXT.evolutionTitle}</h1>
        <Card padding="none">
          <EmptyState icon={TrendingUp} title={PORTAL_TEXT.noRecordsTitle} description={PORTAL_TEXT.noRecordsBody} />
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-balance text-title-1">{PORTAL_TEXT.evolutionTitle}</h1>

      <Card className="p-5">
        <div className={cn("grid gap-4", weight && height ? "grid-cols-2" : "grid-cols-1")}>
          {weight ? (
            <Metric
              label={PORTAL_TEXT.weightLabel}
              value={weight.latestKg}
              unit="kg"
              size="lg"
              caption={weight.latestAgoText}
            />
          ) : null}
          {height ? (
            <Metric
              label={PORTAL_TEXT.heightLabel}
              value={height.cm}
              valueText={height.text}
              size="lg"
              caption={height.agoText}
            />
          ) : null}
          {/* D3: el cambio va en palabras, gris, sin ícono ni color. */}
          {weight?.changeText ? (
            <p className="col-span-full text-callout text-muted-foreground">{weight.changeText}</p>
          ) : null}
        </div>
      </Card>

      {chartPoints.length > 0 ? (
        <Card title={PORTAL_TEXT.weightLabel} className="p-5">
          {chartPoints.length >= 2 ? (
            <EvolutionChart points={chartPoints} seriesLabel="Peso (kg)" height={220} unit="kg" />
          ) : (
            <p className="text-pretty text-body-lg text-muted-foreground">{PORTAL_TEXT.chartSingle}</p>
          )}
        </Card>
      ) : null}

      {rows.length > 0 ? (
        <GroupedList header={PORTAL_TEXT.historyTitle}>
          {rows.map((r) => (
            <GroupedListRow
              key={r.id}
              label={r.dateLabel}
              value={[r.weightText, r.heightText].filter(Boolean).join(" · ")}
            />
          ))}
        </GroupedList>
      ) : null}
    </div>
  );
}
