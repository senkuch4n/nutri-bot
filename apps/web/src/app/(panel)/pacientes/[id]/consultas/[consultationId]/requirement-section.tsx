"use client";

import { useState } from "react";
import { Calculator, Pencil, Trash2 } from "lucide-react";
import {
  REQUIREMENT_TEXT,
  draftFromPrescription,
  formatDecimalEs,
  formatMacroAmount,
  prescriptionFormulaLine,
  prescriptionWeightLine,
  type PrescriptionSnapshot,
} from "@nutri-bot/core";
import { useConfirm } from "@/components/confirm";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { MoreActionsMenu } from "@/components/more-actions-menu";
import { Alert, Button, ButtonLink, Card } from "@/components/ui";
import { UNDO_TEXT, useDeferredDelete, usePendingDeletion } from "@/lib/deferred-delete";
import { FormulaDataForm, type FormulaDataValues } from "../../formula-data-form";
import { FormulaDataSheet } from "../../formula-data-sheet";
import { deletePrescriptionAction } from "../../prescription-actions";
import { RequirementCalculator, type CalculatorProps } from "./requirement-calculator";

const TITLE = "Calorías y nutrientes";

/** Sección "Calorías y nutrientes" del detalle de la consulta (HU-004, 7.3; nombre de HU-017c): vacío,
 *  calculando o resumen. Adentro, la calculadora conserva sus términos clínicos (D11a). */
export function RequirementSection({
  patientId,
  consultationId,
  blockingMessage,
  missingSex,
  missingBirthDate,
  formulaValues,
  calculator,
  prescription,
  bodyFatDateLabel,
}: {
  patientId: string;
  consultationId: string;
  blockingMessage: string | null;
  missingSex: boolean;
  missingBirthDate: boolean;
  formulaValues: FormulaDataValues;
  calculator: CalculatorProps | null;
  prescription: PrescriptionSnapshot | null;
  bodyFatDateLabel: string | null;
}) {
  const [mode, setMode] = useState<"view" | "edit">("view");
  const confirm = useConfirm();
  const deferDelete = useDeferredDelete();
  // HU-017c-3: mientras corre el plazo de "Deshacer", el cálculo se ve como borrado.
  const deleting = usePendingDeletion(`prescription:${consultationId}`);

  // Confirmación en el handler, fuera de toda transición (React 19: si no, deadlock).
  async function handleDelete() {
    const ok = await confirm({
      title: REQUIREMENT_TEXT.deleteConfirmTitle,
      description: REQUIREMENT_TEXT.deleteConfirmDescription,
      confirmLabel: UNDO_TEXT.calculation.confirmLabel,
    });
    if (!ok) return;
    deferDelete({
      key: `prescription:${consultationId}`,
      message: REQUIREMENT_TEXT.deleted,
      undoneMessage: UNDO_TEXT.calculation.undone,
      commit: () => deletePrescriptionAction(patientId, consultationId),
    });
  }

  const blocking = blockingMessage ? (
    <div className="space-y-3">
      <Alert tone="warning">{blockingMessage}</Alert>
      {missingSex || missingBirthDate ? (
        <div className="flex flex-wrap gap-2">
          {missingSex ? (
            <FormulaDataSheet
              trigger={
                <Button type="button" variant="secondary" size="sm">
                  Completar datos para cálculos
                </Button>
              }
            >
              <FormulaDataForm patientId={patientId} values={formulaValues} />
            </FormulaDataSheet>
          ) : null}
          {missingBirthDate ? (
            <ButtonLink href={`/pacientes/${patientId}?editar=datos`} variant="secondary" size="sm">
              Editar datos
            </ButtonLink>
          ) : null}
        </div>
      ) : null}
    </div>
  ) : null;

  if (mode === "edit" && calculator) {
    const editing = prescription !== null;
    return (
      <Card title={TITLE} description="Se recalcula al cambiar cualquier dato.">
        <RequirementCalculator
          patientId={patientId}
          consultationId={consultationId}
          calculator={calculator}
          initialDraft={editing ? draftFromPrescription(prescription, calculator.ctx) : calculator.initialDraft}
          vctInitiallyTouched={editing}
          onDone={() => setMode("view")}
        />
      </Card>
    );
  }

  if (prescription === null || deleting) {
    const waitId = `${consultationId}-calculo-espera`;
    // R5 (017c-4): la key sigue oculta unos segundos después del commit (`releaseAfterMs`), pero si la
    // página revalidada ya trae `prescription === null` el cálculo se borró de verdad: se puede calcular.
    const waitingUndo = deleting && prescription !== null;
    return (
      <Card title={TITLE}>
        <div className="space-y-4">
          <p className="text-body text-muted-foreground">{REQUIREMENT_TEXT.emptyInConsultation}</p>
          {blocking}
          {/* Mientras corre el "Deshacer" el cálculo todavía existe: uno nuevo se borraría con él. */}
          <Button
            type="button"
            size="lg"
            disabled={calculator === null || waitingUndo}
            aria-describedby={waitingUndo ? waitId : undefined}
            onClick={() => setMode("edit")}
          >
            <Calculator aria-hidden />
            Calcular requerimiento
          </Button>
          {waitingUndo ? (
            <p id={waitId} className="text-footnote text-muted-foreground">
              Vas a poder calcular de nuevo cuando se cierre el aviso de “Deshacer”.
            </p>
          ) : null}
        </div>
      </Card>
    );
  }

  return (
    <Card
      title={TITLE}
      actions={
        <>
          <Button
            type="button"
            variant="secondary"
            size="lg"
            disabled={calculator === null}
            onClick={() => setMode("edit")}
          >
            <Pencil aria-hidden />
            Editar cálculo
          </Button>
          <MoreActionsMenu
            label="Más opciones del cálculo"
            actions={[
              {
                key: "borrar",
                label: UNDO_TEXT.calculation.confirmLabel,
                icon: <Trash2 />,
                destructive: true,
                onSelect: handleDelete,
              },
            ]}
          />
        </>
      }
    >
      {blocking ? <div className="mb-4">{blocking}</div> : null}
      <PrescriptionSummary prescription={prescription} bodyFatDateLabel={bodyFatDateLabel} />
    </Card>
  );
}

type MacroRow = { key: string; label: string; percent: number; grams: number; gramsPerKg: number };

function PrescriptionSummary({
  prescription: p,
  bodyFatDateLabel,
}: {
  prescription: PrescriptionSnapshot;
  bodyFatDateLabel: string | null;
}) {
  const usesBodyFat = p.bmrFormula === "KATCH_MCARDLE" || p.bmrFormula === "CUNNINGHAM";
  const bodyFatLine =
    usesBodyFat && p.bodyFatPercent !== null
      ? `con ${formatDecimalEs(p.bodyFatPercent, 1)} % de grasa ${
          p.bodyFatSource === "DEURENBERG" ? "(estimado, Deurenberg)" : `(bioimpedancia ${bodyFatDateLabel ?? ""})`
        }`
      : null;

  const weight = p.weightUsedKg;
  const rows: MacroRow[] = [
    { key: "protein", label: "Proteínas", percent: p.proteinPercent, grams: p.proteinG, gramsPerKg: p.proteinG / weight },
    { key: "fat", label: "Grasas", percent: p.fatPercent, grams: p.fatG, gramsPerKg: p.fatG / weight },
    { key: "carb", label: "Carbohidratos", percent: p.carbPercent, grams: p.carbG, gramsPerKg: p.carbG / weight },
  ];
  const columns: DataTableColumn<MacroRow>[] = [
    { id: "macro", header: "Macro", cell: (r) => r.label },
    { id: "percent", header: "%", numeric: true, cell: (r) => `${formatDecimalEs(r.percent, 1)} %` },
    { id: "grams", header: "g por día", numeric: true, cell: (r) => formatMacroAmount(r.grams, "g") },
    {
      id: "gPerKg",
      header: p.weightBasis === "ADJUSTED" ? "g/kg de peso ajustado" : "g/kg",
      numeric: true,
      cell: (r) => formatDecimalEs(Math.round(r.gramsPerKg * 10) / 10, 1),
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <p className="text-2xl font-semibold tabular-nums">
          VCT {formatMacroAmount(p.prescribedVctKcal, "kcal")}
          {p.prescribedVctKcal !== p.calculatedVctKcal ? (
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              (calculado {formatMacroAmount(p.calculatedVctKcal, "kcal")})
            </span>
          ) : null}
        </p>
        <p className="mt-2 text-sm tabular-nums">{prescriptionFormulaLine(p)}</p>
        <p className="text-sm tabular-nums">{prescriptionWeightLine(p)}</p>
        {bodyFatLine ? <p className="text-sm text-muted-foreground">{bodyFatLine}</p> : null}
      </div>
      <DataTable columns={columns} rows={rows} getRowId={(r) => r.key} caption="Macronutrientes indicados" />
    </div>
  );
}
