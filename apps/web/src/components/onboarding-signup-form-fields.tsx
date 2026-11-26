"use client";

import { useActionState } from "react";
import type { OnboardingSignupFormState } from "@/app/inicio/actions";
import { Button } from "@/components/ui";

const fieldClass = "mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-body";

export type OnboardingSignupFormAction = (
  prev: OnboardingSignupFormState | null,
  formData: FormData,
) => Promise<OnboardingSignupFormState>;

export function OnboardingSignupFormFields({
  action,
  timeZones,
  initialState = null,
}: {
  action: OnboardingSignupFormAction;
  timeZones: readonly string[];
  initialState?: OnboardingSignupFormState | null;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="mt-6 space-y-4">
      {state?.error ? (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-footnote text-destructive">
          {state.error}
        </p>
      ) : null}
      <div>
        <label htmlFor="onboarding-clinic-name" className="text-body font-semibold">Nombre del consultorio</label>
        <input
          id="onboarding-clinic-name"
          name="name"
          autoComplete="organization"
          defaultValue={state?.values?.name ?? ""}
          required
          className={fieldClass}
        />
      </div>
      <div>
        <label htmlFor="onboarding-professional-name" className="text-body font-semibold">Nombre profesional que querés mostrar</label>
        <input
          id="onboarding-professional-name"
          name="professionalName"
          autoComplete="name"
          defaultValue={state?.values?.professionalName ?? ""}
          required
          className={fieldClass}
        />
      </div>
      <div>
        <label htmlFor="onboarding-time-zone" className="text-body font-semibold">Zona horaria del consultorio</label>
        <select
          id="onboarding-time-zone"
          name="timeZone"
          defaultValue={state?.values?.timeZone ?? ""}
          required
          className={fieldClass}
        >
          <option value="" disabled>Elegí una zona horaria</option>
          {timeZones.map((timeZone) => (
            <option key={timeZone} value={timeZone}>{timeZone.replaceAll("_", " ")}</option>
          ))}
        </select>
      </div>
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "Guardando…" : "Guardar y continuar"}
      </Button>
    </form>
  );
}
