import type { ReactNode } from "react";
import {
  MINOR_WARNING_TEXT,
  bodyFrameLabel,
  formatDecimalEs,
  getMissingFormulaData,
  isMinor,
  missingFormulaDataMessage,
} from "@nutri-bot/core";
import { Badge } from "@/components/ui";
import { FormulaDataForm, type FormulaDataValues } from "./formula-data-form";

type SummaryMeasurement = { value: number; dateLabel: string } | null;

const warningClass = "bg-amber-50 px-3 py-2 text-sm text-amber-700";

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

  const measurement = (m: SummaryMeasurement, unit: string, emptyLabel: string): ReactNode =>
    m ? (
      `${formatDecimalEs(m.value)}\u00a0${unit} (${m.dateLabel})`
    ) : (
      <Badge>{emptyLabel}</Badge>
    );

  const items: Array<{ label: string; value: ReactNode }> = [
    { label: "Edad", value: ageYears !== null ? `${ageYears}\u00a0años` : <Badge>Sin cargar</Badge> },
    { label: "Peso", value: measurement(weight, "kg", "Sin cargar") },
    { label: "Talla", value: measurement(height, "cm", "Sin cargar") },
    { label: "Grasa", value: measurement(bodyFat, "%", "Sin dato") },
    {
      label: "Contextura",
      value: frameLabel ?? <Badge>Sin cargar, se asume Mediana</Badge>,
    },
  ];

  return (
    <div className="space-y-4">
      {missingMessage ? <p className={warningClass}>{missingMessage}</p> : null}
      {isMinor(ageYears) ? <p className={warningClass}>{MINOR_WARNING_TEXT}</p> : null}

      <FormulaDataForm patientId={patientId} values={values} />

      <div className="border-t border-line pt-4">
        <h3 className="text-sm font-medium text-ink">Lo que van a usar las fórmulas</h3>
        <ul className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-soft">
          {items.map((item, i) => (
            <li key={item.label} className="flex items-center gap-x-2">
              {i > 0 ? (
                <span aria-hidden="true" className="text-ink-faint">
                  ·
                </span>
              ) : null}
              <span className="inline-flex items-center gap-1.5">
                {item.label} {item.value}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
