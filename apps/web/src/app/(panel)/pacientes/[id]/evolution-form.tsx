"use client";

import { useActionState, useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { NumberInput } from "@/components/number-input";
import { Button, Field, FormError, Input, Textarea } from "@/components/ui";
import { cn } from "@/lib/utils";
import { useActionToast } from "@/lib/notify";
import { addEvolutionEntryAction, type ActionState } from "./clinical-actions";

const initial: ActionState = { ok: false };

/** Alta de una medición. Misma action, mismos 18 `name`, `step`, `min`, `required` y `placeholder`. */
export function EvolutionForm({ patientId }: { patientId: string }) {
  const [state, action, pending] = useActionState(addEvolutionEntryAction, initial);
  const [showMore, setShowMore] = useState(false);
  const [showBio, setShowBio] = useState(false);
  const moreId = useId();
  const bioId = useId();
  const today = new Date().toISOString().slice(0, 10);

  useActionToast(state, { success: "Medición agregada" });

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="patientId" value={patientId} />
      <div className="grid gap-4 sm:grid-cols-[10rem_9rem_minmax(0,1fr)_auto] sm:items-end">
        <Field label="Fecha">
          <Input type="date" name="recordedAt" defaultValue={today} required />
        </Field>
        <Field label="Peso">
          <NumberInput unit="kg" step="0.1" min="0" name="weightKg" placeholder="70.5" />
        </Field>
        <Field label="Nota">
          <Textarea
            name="note"
            rows={1}
            placeholder="Observaciones de la consulta…"
            className="min-h-9"
          />
        </Field>
        <Button type="submit" loading={pending}>
          {pending ? "Agregando…" : "Agregar"}
        </Button>
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
          <Field label="Brazo">
            <NumberInput unit="cm" step="0.1" min="0" name="armCm" />
          </Field>
          <Field label="Muslo">
            <NumberInput unit="cm" step="0.1" min="0" name="thighCm" />
          </Field>
          <Field label="Pantorrilla">
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
            <NumberInput unit="%" step="0.1" min="0" name="bodyFatPercent" placeholder="22.5" />
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
            <NumberInput unit="kg" step="0.1" min="0" name="boneMassKg" placeholder="2.8" />
          </Field>
          <Field label="Metabolismo basal">
            <NumberInput unit="kcal" step="1" min="0" name="basalMetabolicRateKcal" placeholder="1500" />
          </Field>
        </div>
      ) : null}

      <FormError message={state.error} />
    </form>
  );
}
