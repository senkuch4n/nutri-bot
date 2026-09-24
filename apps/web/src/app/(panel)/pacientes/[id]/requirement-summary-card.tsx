import { REQUIREMENT_TEXT, formatMacroAmount, prescriptionDiffText } from "@nutri-bot/core";
import { ButtonLink, Card } from "@/components/ui";

export type RequirementSummary = {
  consultationId: string;
  dateLabel: string;
  prescribedVctKcal: number;
  proteinG: number;
  fatG: number;
  carbG: number;
};

/** Tarjeta "Requerimiento indicado" del Resumen (HU-004, 7.4). Server component, sin gráfico (D11). */
export function RequirementSummaryCard({
  patientId,
  latest,
  previous,
}: {
  patientId: string;
  latest: RequirementSummary | null;
  previous: Pick<RequirementSummary, "prescribedVctKcal" | "dateLabel"> | null;
}) {
  if (!latest) {
    return (
      <Card title="Requerimiento indicado">
        <p className="text-sm text-muted-foreground">{REQUIREMENT_TEXT.emptyInSummary}</p>
        <ButtonLink href={`/pacientes/${patientId}?tab=consultas`} variant="ghost" size="sm" className="mt-3">
          Consultas
        </ButtonLink>
      </Card>
    );
  }

  const macros = [
    { label: "Proteínas", grams: latest.proteinG },
    { label: "Grasas", grams: latest.fatG },
    { label: "Carbohidratos", grams: latest.carbG },
  ];

  return (
    <Card
      title="Requerimiento indicado"
      actions={
        <ButtonLink href={`/pacientes/${patientId}/consultas/${latest.consultationId}`} variant="secondary" size="sm">
          Ver consulta
        </ButtonLink>
      }
    >
      <p className="text-lg font-semibold tabular-nums">
        {formatMacroAmount(latest.prescribedVctKcal, "kcal")} · {latest.dateLabel}
      </p>
      {previous ? (
        <p className="mt-1 text-sm text-muted-foreground tabular-nums">
          {prescriptionDiffText(latest.prescribedVctKcal, previous.prescribedVctKcal, previous.dateLabel)}
        </p>
      ) : null}
      <dl className="mt-3 divide-y text-sm">
        {macros.map((m) => (
          <div key={m.label} className="flex items-center justify-between gap-4 py-2">
            <dt className="text-muted-foreground">{m.label}</dt>
            <dd className="tabular-nums">{formatMacroAmount(m.grams, "g")}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
