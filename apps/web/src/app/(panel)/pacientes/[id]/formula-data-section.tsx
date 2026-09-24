import type { ReactNode } from "react";
import {
  MINOR_WARNING_TEXT,
  activityLevelOption,
  bodyFrameLabel,
  formatDecimalEs,
  getMissingFormulaData,
  isMinor,
  missingFormulaDataMessage,
  nutritionGoalLabel,
  sexLabel,
} from "@nutri-bot/core";
import { Alert, Badge, Card, Quantity } from "@/components/ui";
import { FormulaDataForm, type FormulaDataValues } from "./formula-data-form";
import { FormulaDataSheet } from "./formula-data-sheet";

type SummaryMeasurement = { value: number; dateLabel: string } | null;

/** Card "Datos para cálculos" (HU-001): primero lo que se mira, la edición en un Sheet. */
export function FormulaDataSection({
  patientId,
  values,
  ageYears,
  weight,
  height,
  bodyFat,
}: {
  patientId: string;
  values: FormulaDataValues;
  ageYears: number | null;
  weight: SummaryMeasurement;
  height: SummaryMeasurement;
  bodyFat: SummaryMeasurement;
}) {
  const missingMessage = missingFormulaDataMessage(
    getMissingFormulaData({
      ...values,
      hasBirthDate: ageYears !== null,
      weightKg: weight?.value ?? null,
      heightCm: height?.value ?? null,
    }),
  );
  const frameLabel = bodyFrameLabel(values.bodyFrame);
  const activity = activityLevelOption(values.activityLevel);

  const measurement = (m: SummaryMeasurement, unit: string, emptyLabel: string): ReactNode =>
    m ? (
      <>
        <Quantity value={m.value} unit={unit} />
        <span className="ml-2 text-xs text-muted-foreground">{m.dateLabel}</span>
      </>
    ) : (
      <Badge>{emptyLabel}</Badge>
    );

  const items: Array<{ label: string; value: ReactNode }> = [
    {
      label: "Edad",
      value: ageYears !== null ? <Quantity value={ageYears} unit="años" decimals={0} /> : <Badge>Sin cargar</Badge>,
    },
    { label: "Peso", value: measurement(weight, "kg", "Sin cargar") },
    { label: "Talla", value: measurement(height, "cm", "Sin cargar") },
    { label: "Grasa", value: measurement(bodyFat, "%", "Sin dato") },
    { label: "Contextura", value: frameLabel ?? <Badge>Sin cargar, se asume Mediana</Badge> },
    { label: "Sexo", value: sexLabel(values.sex) ?? <Badge>Sin cargar</Badge> },
    {
      label: "Actividad física",
      value: activity ? `${activity.label} (×${formatDecimalEs(activity.factor)})` : <Badge>Sin cargar</Badge>,
    },
    { label: "Objetivo", value: nutritionGoalLabel(values.nutritionGoal) ?? <Badge>Sin cargar</Badge> },
  ];

  return (
    <Card
      title="Datos para cálculos"
      description="Lo que van a usar las fórmulas."
      actions={
        <FormulaDataSheet>
          <FormulaDataForm patientId={patientId} values={values} />
        </FormulaDataSheet>
      }
    >
      {missingMessage || isMinor(ageYears) ? (
        <div className="mb-4 space-y-3">
          {missingMessage ? <Alert tone="warning">{missingMessage}</Alert> : null}
          {isMinor(ageYears) ? <Alert tone="warning">{MINOR_WARNING_TEXT}</Alert> : null}
        </div>
      ) : null}
      <dl className="divide-y text-sm">
        {items.map((item) => (
          <div key={item.label} className="flex items-center justify-between gap-4 py-2">
            <dt className="text-muted-foreground">{item.label}</dt>
            <dd className="text-right">{item.value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
