"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { NumberInput } from "@/components/number-input";
import { Button, Field, Textarea } from "@/components/ui";
import { cn } from "@/lib/utils";

/**
 * Campos de una medición (HU-003): peso, nota, los dos desplegables y sus grillas, con los mismos
 * `name`, `step`, `min` y `placeholder` de siempre. Lo usan `EvolutionForm` (con "Fecha" en
 * `leading`) y el formulario del detalle de la consulta (sin fecha).
 */
export function MeasurementFields({ leading, submit }: { leading?: ReactNode; submit: ReactNode }) {
  const [showMore, setShowMore] = useState(false);
  const [showBio, setShowBio] = useState(false);
  const moreId = useId();
  const bioId = useId();

  return (
    <>
      <div
        className={cn(
          "grid gap-4 sm:items-end",
          leading
            ? "sm:grid-cols-[10rem_9rem_minmax(0,1fr)_auto]"
            : "sm:grid-cols-[9rem_minmax(0,1fr)_auto]",
        )}
      >
        {leading}
        <Field label="Peso">
          <NumberInput unit="kg" step="0.1" min="0" name="weightKg" placeholder="70,5" />
        </Field>
        <Field label="Nota">
          <Textarea
            name="note"
            rows={1}
            placeholder="Observaciones de la consulta…"
            className="min-h-9"
          />
        </Field>
        {submit}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-expanded={showMore}
          aria-controls={moreId}
          onClick={() => setShowMore((v) => !v)}
        >
          <ChevronDown className={cn("transition-transform", showMore && "rotate-180")} aria-hidden />
          {showMore ? "Ocultar medidas antropométricas" : "Agregar medidas antropométricas"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-expanded={showBio}
          aria-controls={bioId}
          onClick={() => setShowBio((v) => !v)}
        >
          <ChevronDown className={cn("transition-transform", showBio && "rotate-180")} aria-hidden />
          {showBio ? "Ocultar datos de bioimpedancia" : "Agregar datos de bioimpedancia"}
        </Button>
      </div>

      {showMore ? (
        <div id={moreId} className="grid gap-4 rounded-lg bg-muted/60 p-4 sm:grid-cols-3 lg:grid-cols-4">
          <Field label="Talla">
            <NumberInput unit="cm" step="0.1" min="0" name="heightCm" placeholder="170" />
          </Field>
          <Field label="Cintura">
            <NumberInput unit="cm" step="0.1" min="0" name="waistCm" placeholder="90" />
          </Field>
          <Field label="Cadera">
            <NumberInput unit="cm" step="0.1" min="0" name="hipCm" placeholder="100" />
          </Field>
          <Field label="Brazo relajado">
            <NumberInput unit="cm" step="0.1" min="0" name="armCm" />
          </Field>
          <Field label="Muslo medio">
            <NumberInput unit="cm" step="0.1" min="0" name="thighCm" />
          </Field>
          <Field label="Pierna (pantorrilla)">
            <NumberInput unit="cm" step="0.1" min="0" name="calfCm" />
          </Field>
          <Field label="Pliegue tricipital">
            <NumberInput unit="mm" step="0.1" min="0" name="tricepsSkinfoldMm" />
          </Field>
          <Field label="Pliegue subescapular">
            <NumberInput unit="mm" step="0.1" min="0" name="subscapularSkinfoldMm" />
          </Field>
          <Field label="Pliegue abdominal">
            <NumberInput unit="mm" step="0.1" min="0" name="abdominalSkinfoldMm" />
          </Field>
        </div>
      ) : null}

      {showBio ? (
        <div id={bioId} className="grid gap-4 rounded-lg bg-muted/60 p-4 sm:grid-cols-3 lg:grid-cols-4">
          <Field label="Grasa corporal">
            <NumberInput unit="%" step="0.1" min="0" name="bodyFatPercent" placeholder="22,5" />
          </Field>
          <Field label="Masa muscular">
            <NumberInput unit="kg" step="0.1" min="0" name="muscleMassKg" placeholder="55" />
          </Field>
          <Field label="Agua corporal">
            <NumberInput unit="%" step="0.1" min="0" name="bodyWaterPercent" placeholder="55" />
          </Field>
          <Field label="Grasa visceral">
            <NumberInput unit="nivel" step="0.1" min="0" name="visceralFatLevel" placeholder="8" />
          </Field>
          <Field label="Masa ósea">
            <NumberInput unit="kg" step="0.1" min="0" name="boneMassKg" placeholder="2,8" />
          </Field>
          <Field label="Metabolismo basal">
            <NumberInput unit="kcal" step="1" min="0" name="basalMetabolicRateKcal" placeholder="1500" />
          </Field>
        </div>
      ) : null}

    </>
  );
}
