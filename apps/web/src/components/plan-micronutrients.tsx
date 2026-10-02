import { DRI_SOURCES, formatDecimalEs, type PlanMicronutrients } from "@nutri-bot/core";
import { Card } from "@/components/ui";

export function PlanMicronutrientsSection({ result }: { result: PlanMicronutrients }) {
  return (
    <Card title="Micronutrientes" description="Aporte estimado del plan frente a recomendaciones diarias para adultos sanos.">
      <div className="mb-4 space-y-2 text-sm text-muted-foreground">
        {result.comparisonStatus === "MISSING_PATIENT_DATA" ? (
          <p>Se necesitan la fecha de nacimiento y el sexo biológico para comparar con las recomendaciones. El aporte conocido se muestra igualmente.</p>
        ) : result.comparisonStatus === "UNDER_19" ? (
          <p>Esta versión de la comparación está disponible solo para adultos de 19 años o más. Se muestra únicamente el aporte conocido.</p>
        ) : null}
        <p>RDA: ingesta recomendada. AI: ingesta adecuada. Estos porcentajes no son un diagnóstico ni indican límites de seguridad; superar el 100 % no implica un beneficio adicional.</p>
      </div>
      <ul className="grid gap-x-6 sm:grid-cols-2">
        {result.nutrients.map((nutrient) => (
          <li key={nutrient.key} className="min-w-0 border-t py-4 text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-medium">{nutrient.label}</h3>
              <span className="tabular-nums">
                {nutrient.knownAmount === null ? "Sin datos" : `${formatDecimalEs(nutrient.knownAmount, 2)} ${nutrient.unit}`}
                {nutrient.reference ? ` / ${formatDecimalEs(nutrient.reference.amount, 2)} ${nutrient.unit} (${nutrient.reference.kind})` : null}
              </span>
            </div>
            {nutrient.adequacyPercent !== null ? (
              <>
                <p className="mt-1 text-muted-foreground tabular-nums">
                  {formatDecimalEs(nutrient.adequacyPercent, 0)} % de la recomendación{!nutrient.coverage.complete ? " (aporte conocido)" : ""}
                </p>
                <div aria-hidden="true" className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary/60" style={{ width: `${Math.min(100, Math.max(0, nutrient.adequacyPercent))}%` }} />
                </div>
              </>
            ) : null}
            {!nutrient.coverage.complete ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Datos incompletos · {nutrient.coverage.knownItems} de {nutrient.coverage.totalItems} ítems con datos utilizables. El aporte total puede ser mayor.
              </p>
            ) : null}
            {nutrient.key === "niacina" ? (
              <p className="mt-2 text-xs text-muted-foreground">Sin comparación: la DRI usa equivalentes de niacina (NE); los datos disponibles contienen niacina en mg y no incluyen triptófano.</p>
            ) : null}
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-muted-foreground">
        Referencias DRI oficiales de Health Canada: <a href={DRI_SOURCES.elements} className="underline">minerales</a> y <a href={DRI_SOURCES.vitamins} className="underline">vitaminas</a>. No contempla embarazo, lactancia ni necesidades específicas por enfermedad.
      </p>
    </Card>
  );
}
