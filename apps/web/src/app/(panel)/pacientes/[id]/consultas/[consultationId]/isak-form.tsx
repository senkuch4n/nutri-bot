"use client";

import { startTransition, useActionState, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import {
  ISAK_MEASURES,
  ISAK_MEASURE_GROUPS,
  ISAK_MEASURE_KEYS,
  ISAK_TEXT,
  parseIsakNumber,
  roundTo,
  sum6SkinfoldsMm,
  sum8SkinfoldsMm,
  validateIsakForm,
  type IsakFieldErrors,
  type IsakMeasureKey,
  type IsakMeasures,
} from "@nutri-bot/core";
import { useConfirm } from "@/components/confirm";
import { NumberInput } from "@/components/number-input";
import { Button, Field, FormError } from "@/components/ui";
import { useActionToast } from "@/lib/notify";
import { saveIsakStudyAction, type IsakFormState } from "../../isak-actions";

const initialState: IsakFormState = { ok: false };
const REQUIRED: ReadonlySet<IsakMeasureKey> = new Set(["weightKg", "heightCm"]);
const SKINFOLD_KEYS = ISAK_MEASURES.filter((d) => d.group === "skinfolds").map((d) => d.key);

type Raw = Partial<Record<IsakMeasureKey, string>>;

function readRaw(form: HTMLFormElement): Raw {
  const data = new FormData(form);
  const raw: Raw = {};
  for (const key of ISAK_MEASURE_KEYS) {
    const v = data.get(key);
    raw[key] = typeof v === "string" ? v : "";
  }
  return raw;
}

/** Σ6 y Σ8 en vivo: null si falta (o es inválido) alguno de sus pliegues. */
function liveSums(raw: Raw): { sum6: number | null; sum8: number | null } {
  const values: Partial<Record<IsakMeasureKey, number>> = {};
  for (const key of SKINFOLD_KEYS) {
    const n = parseIsakNumber(raw[key]);
    if (typeof n === "number") values[key] = n;
  }
  const has = (keys: readonly IsakMeasureKey[]) => keys.every((k) => values[k] !== undefined);
  const six = [
    "tricepsSkinfoldMm",
    "subscapularSkinfoldMm",
    "supraspinaleSkinfoldMm",
    "abdominalSkinfoldMm",
    "thighSkinfoldMm",
    "calfSkinfoldMm",
  ] as const;
  const sum6 = has(six) ? roundTo(sum6SkinfoldsMm(values as Record<(typeof six)[number], number>), 1) : null;
  const sum8 =
    sum6 !== null && has(["bicepsSkinfoldMm", "iliacCrestSkinfoldMm"])
      ? roundTo(sum8SkinfoldsMm(values as Parameters<typeof sum8SkinfoldsMm>[0]), 1)
      : null;
  return { sum6, sum8 };
}

/** Formulario del estudio ISAK (HU-006): 21 medidas en 4 grupos, en el orden de ISAKMetry. */
export function IsakForm({
  patientId,
  consultationId,
  entryId,
  initial,
  onDone,
}: {
  patientId: string;
  consultationId: string;
  entryId: string | null;
  initial: Partial<IsakMeasures>;
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(saveIsakStudyAction, initialState);
  useActionToast(state, { success: ISAK_TEXT.saved });
  const confirm = useConfirm();
  const formRef = useRef<HTMLFormElement>(null);
  const [errors, setErrors] = useState<IsakFieldErrors>({});
  const [dirty, setDirty] = useState(false);
  const [sums, setSums] = useState(() =>
    liveSums(
      Object.fromEntries(ISAK_MEASURE_KEYS.map((k) => [k, initial[k] == null ? "" : String(initial[k])])) as Raw,
    ),
  );
  const [focusFirstError, setFocusFirstError] = useState(0);

  // Respuesta del server: si trae errores por campo, mandan. En el render solo se ajusta estado
  // propio (patrón lastState); avisarle al padre (onDone) va en el efecto de abajo.
  const [lastState, setLastState] = useState(state);
  if (state !== lastState) {
    setLastState(state);
    if (!state.ok && state.fieldErrors) {
      setErrors(state.fieldErrors);
      setFocusFirstError((n) => n + 1);
    }
  }

  // Si guardó, se cierra el formulario. Fuera del render: onDone cambia estado de IsakCard.
  // El ref evita llamarlo dos veces por el mismo `state` (StrictMode re-ejecuta los efectos).
  const notifiedState = useRef<IsakFormState | null>(null);
  useEffect(() => {
    if (!state.ok || notifiedState.current === state) return;
    notifiedState.current = state;
    onDone();
    // Solo la identidad de `state`: cada action devuelve un objeto nuevo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  useEffect(() => {
    if (focusFirstError === 0) return;
    const first = ISAK_MEASURE_KEYS.find((k) => errors[k]);
    const el = first ? formRef.current?.elements.namedItem(first) : null;
    if (el instanceof HTMLInputElement) el.focus();
    // Solo cuando se pide enfocar (submit con errores).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusFirstError]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    // Se despacha a mano (y no con <form action>) para que React 19 no resetee los campos si el
    // server devuelve un error: la profesional no pierde las 21 medidas. Sin confirm acá.
    event.preventDefault();
    const form = event.currentTarget;
    // Síncrono: la validación de core corre antes de mandar; con errores no se manda.
    const result = validateIsakForm(readRaw(form));
    if (!result.ok) {
      setErrors(result.errors);
      setFocusFirstError((n) => n + 1);
      return;
    }
    const formData = new FormData(form);
    startTransition(() => action(formData));
  }

  function handleChange(event: ChangeEvent<HTMLFormElement>) {
    setDirty(true);
    const name = (event.target as { name?: string }).name as IsakMeasureKey | undefined;
    if (name && errors[name]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
    setSums(liveSums(readRaw(event.currentTarget)));
  }

  // Fuera de toda transición y de <form action>: el confirm espera al usuario.
  async function handleCancel() {
    if (dirty) {
      const ok = await confirm({
        title: ISAK_TEXT.discardTitle,
        description: ISAK_TEXT.discardDescription,
        confirmLabel: "Descartar",
        destructive: true,
      });
      if (!ok) return;
    }
    onDone();
  }

  return (
    <form ref={formRef} noValidate onSubmit={handleSubmit} onChange={handleChange} className="space-y-6">
      <input type="hidden" name="patientId" value={patientId} />
      <input type="hidden" name="consultationId" value={consultationId} />
      <input type="hidden" name="entryId" value={entryId ?? ""} />

      {ISAK_MEASURE_GROUPS.map((group) => (
        <fieldset key={group.key} className="space-y-3">
          <legend>
            <h3 className="text-sm font-semibold">{group.title}</h3>
          </legend>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {ISAK_MEASURES.filter((d) => d.group === group.key).map((def) => {
              const required = REQUIRED.has(def.key);
              const value = initial[def.key];
              return (
                <Field key={def.key} label={required ? `${def.label} *` : def.label} error={errors[def.key]}>
                  <NumberInput
                    name={def.key}
                    unit={def.unit}
                    step="0.1"
                    min="0"
                    autoComplete="off"
                    defaultValue={value == null ? "" : value}
                    aria-required={required || undefined}
                    aria-invalid={errors[def.key] ? true : undefined}
                  />
                </Field>
              );
            })}
          </div>
          {group.key === "skinfolds" ? (
            <p className="text-sm tabular-nums text-muted-foreground" aria-live="polite">
              {ISAK_TEXT.sumsLive(sums.sum6, sums.sum8)}
            </p>
          ) : null}
        </fieldset>
      ))}

      <p className="text-xs text-muted-foreground">* Obligatorio</p>

      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <Button type="submit" loading={pending}>
            {pending ? ISAK_TEXT.saving : ISAK_TEXT.save}
          </Button>
          <Button variant="secondary" type="button" onClick={handleCancel} disabled={pending}>
            Cancelar
          </Button>
        </div>
        <FormError message={state.error} />
      </div>
    </form>
  );
}
