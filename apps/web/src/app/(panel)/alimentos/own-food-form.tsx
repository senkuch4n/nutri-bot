"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  OWN_FOOD_ISSUE_MESSAGES,
  atwaterBreakdown,
  formatAtwaterPart,
  formatKcalOneDecimal,
  validateOwnFoodMacros,
} from "@nutri-bot/core";
import { useConfirm } from "@/components/confirm";
import { NumberInput } from "@/components/number-input";
import { Alert, Button, Field, FormError, Input, Select } from "@/components/ui";
import { FOOD_GROUP_LABELS, FOOD_GROUPS } from "@/lib/food-groups";
import { notify } from "@/lib/notify";
import type { OwnFoodState } from "./actions";

const initial: OwnFoodState = { ok: false };

export interface OwnFoodDefaults {
  name: string;
  group: string;
  reference: string;
  proteinPer100: string;
  carbsPer100: string;
  fatPer100: string;
  fiberPer100: string;
  alcoholPer100: string;
  sodiumMgPer100: string;
  addedSugarPer100: string;
  saturatedFatPer100: string;
  cholesterolMgPer100: string;
  unitHint: string;
}

const toNumber = (v: string): number | null => {
  if (v.trim() === "") return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function OwnFoodForm({
  action,
  defaults,
  submitLabel,
  usage,
}: {
  action: (prev: OwnFoodState, formData: FormData) => Promise<OwnFoodState>;
  defaults: OwnFoodDefaults;
  submitLabel: string;
  usage?: { plans: number; templates: number };
}) {
  const [state, formAction] = useActionState(action, initial);
  const [pending, startTransition] = useTransition();
  const confirm = useConfirm();
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);

  // Controlados: alimentan el cálculo de kcal en vivo.
  const [protein, setProtein] = useState(defaults.proteinPer100);
  const [carbs, setCarbs] = useState(defaults.carbsPer100);
  const [fat, setFat] = useState(defaults.fatPer100);
  const [alcohol, setAlcohol] = useState(defaults.alcoholPer100);
  const [fiber, setFiber] = useState(defaults.fiberPer100);

  useEffect(() => {
    if (!state.ok) return;
    notify.saved("Alimento guardado");
    if (state.foodId) router.push(`/alimentos/${state.foodId}`);
  }, [state, router]);

  const macros = {
    protein: toNumber(protein),
    carbs: toNumber(carbs),
    fat: toNumber(fat),
    fiber: toNumber(fiber),
    alcohol: toNumber(alcohol),
  };
  const issues = validateOwnFoodMacros(macros);
  const breakdown =
    macros.protein !== null && macros.carbs !== null && macros.fat !== null
      ? atwaterBreakdown({ protein: macros.protein, carbs: macros.carbs, fat: macros.fat, alcohol: macros.alcohol })
      : null;

  async function submit(formData: FormData) {
    // La confirmación va fuera de la transición (ver JSDoc de useConfirm).
    if (usage && usage.plans + usage.templates > 0) {
      const ok = await confirm({
        title: "¿Guardar los cambios?",
        description: `Cambiar este alimento cambia los totales de los planes que lo usan (${plural(
          usage.plans,
          "plan",
          "planes",
        )}, ${plural(usage.templates, "plantilla", "plantillas")}), incluidos los ya entregados. ¿Guardar igual?`,
        confirmLabel: "Guardar igual",
        destructive: false,
      });
      if (!ok) return;
    }
    startTransition(() => formAction(formData));
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    void submit(new FormData(e.currentTarget));
  }

  function saveAnyway() {
    if (!formRef.current) return;
    const fd = new FormData(formRef.current);
    fd.set("confirmSaraDuplicate", "1");
    void submit(fd);
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-8" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre">
          <Input name="name" defaultValue={defaults.name} required minLength={2} maxLength={200} autoComplete="off" />
        </Field>
        <Field label="Grupo">
          <Select name="group" defaultValue={defaults.group} required>
            {FOOD_GROUPS.map((g) => (
              <option key={g} value={g}>
                {FOOD_GROUP_LABELS[g]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Referencia" hint="Opcional">
          <Input
            name="reference"
            defaultValue={defaults.reference}
            maxLength={120}
            placeholder="Ej.: rótulo de la marca"
            autoComplete="off"
          />
        </Field>
      </div>

      <fieldset>
        <legend className="mb-4 text-sm font-semibold">Composición cada 100 g</legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Proteínas">
            <NumberInput
              unit="g"
              step="0.1"
              min="0"
              max="100"
              name="proteinPer100"
              value={protein}
              onChange={(e) => setProtein(e.target.value)}
              required
            />
          </Field>
          <Field label="Carbohidratos disponibles" hint="Los del rótulo argentino: sin la fibra">
            <NumberInput
              unit="g"
              step="0.1"
              min="0"
              max="100"
              name="carbsPer100"
              value={carbs}
              onChange={(e) => setCarbs(e.target.value)}
              required
            />
          </Field>
          <Field label="Grasas totales">
            <NumberInput
              unit="g"
              step="0.1"
              min="0"
              max="100"
              name="fatPer100"
              value={fat}
              onChange={(e) => setFat(e.target.value)}
              required
            />
          </Field>
        </div>

        <div className="mt-4 rounded-md border bg-muted/40 p-4" aria-live="polite">
          {breakdown === null ? (
            <p className="text-sm text-muted-foreground">Completá proteínas, carbohidratos y grasas para ver las kcal.</p>
          ) : (
            <>
              <p className="text-lg font-semibold tabular-nums">= {formatKcalOneDecimal(breakdown.totalKcal)} cada 100 g</p>
              <ul className="mt-1 space-y-0.5 text-sm tabular-nums text-muted-foreground">
                {breakdown.parts.map((p) => (
                  <li key={p.key}>{formatAtwaterPart(p)}</li>
                ))}
              </ul>
            </>
          )}
          {issues.includes("MACROS_OVER_100") ? (
            <p className="mt-2 text-sm text-destructive">{OWN_FOOD_ISSUE_MESSAGES.MACROS_OVER_100}</p>
          ) : null}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-4 text-sm font-semibold">Opcionales</legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Grasas saturadas">
            <NumberInput unit="g" step="0.01" min="0" max="100" name="saturatedFatPer100" defaultValue={defaults.saturatedFatPer100} />
          </Field>
          <Field label="Fibra">
            <NumberInput
              unit="g"
              step="0.1"
              min="0"
              max="100"
              name="fiberPer100"
              value={fiber}
              onChange={(e) => setFiber(e.target.value)}
            />
          </Field>
          <Field label="Azúcar agregado">
            <NumberInput unit="g" step="0.1" min="0" max="100" name="addedSugarPer100" defaultValue={defaults.addedSugarPer100} />
          </Field>
          <Field label="Sodio">
            <NumberInput unit="mg" step="1" min="0" max="100000" name="sodiumMgPer100" defaultValue={defaults.sodiumMgPer100} />
          </Field>
          <Field label="Colesterol">
            <NumberInput unit="mg" step="1" min="0" max="10000" name="cholesterolMgPer100" defaultValue={defaults.cholesterolMgPer100} />
          </Field>
          <Field label="Alcohol">
            <NumberInput
              unit="g"
              step="0.1"
              min="0"
              max="100"
              name="alcoholPer100"
              value={alcohol}
              onChange={(e) => setAlcohol(e.target.value)}
            />
          </Field>
        </div>
        <div className="mt-4">
          <Field label="Unidad de referencia" hint="Ej.: “1 taza ≈ 180 g”. Solo informativo.">
            <Input name="unitHint" defaultValue={defaults.unitHint} maxLength={120} autoComplete="off" />
          </Field>
        </div>
      </fieldset>

      {state.saraDuplicate ? (
        <Alert tone="warning" title={`Ya existe «${state.saraDuplicate.name}» en SARA 2.`}>
          <p>Podés usar ese o guardar el tuyo igual.</p>
          <Button type="button" variant="secondary" size="sm" className="mt-3" onClick={saveAnyway} loading={pending}>
            Guardar igual
          </Button>
        </Alert>
      ) : null}

      <div className="space-y-3 border-t pt-6">
        <div className="flex items-center gap-3">
          <Button type="submit" loading={pending}>
            {pending ? "Guardando…" : submitLabel}
          </Button>
        </div>
        <FormError message={state.error} />
      </div>
    </form>
  );
}
