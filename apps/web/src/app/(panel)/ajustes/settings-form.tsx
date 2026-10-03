"use client";

import { createContext, useActionState, useContext, type ReactNode } from "react";
import Link from "next/link";
import { Button, Field, FormError, Input, Textarea } from "@/components/ui";
import { useActionToast } from "@/lib/notify";
import { DEFAULT_PDF_ACCENT } from "@/lib/pdf-theme";
import { saveSettingsAction, type SettingsState } from "./actions";

const initial: SettingsState = { ok: false };

export const SETTINGS_FORM_ID = "ajustes-generales";

export type SettingsDefaults = {
  timezone: string;
  currency: string;
  phone: string;
  acceptedInsurances: string;
  pdfAccentColor: string;
  pdfFooterText: string;
  /** HU-007 (D1). */
  title: string;
  licenseNumber: string;
};

const SettingsContext = createContext<{ pending: boolean; error?: string } | null>(null);

function useSettingsState() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("Los campos de ajustes necesitan <SettingsFormProvider>");
  return ctx;
}

/**
 * Un solo `<form>` para los 7 campos de `saveSettingsAction`, aunque vivan en pestañas distintas:
 * los controles se asocian por el atributo HTML `form="ajustes-generales"`, así `new FormData(form)`
 * los incluye a todos y el envío es el mismo que antes (mismos `name`, misma action).
 */
export function SettingsFormProvider({ children }: { children: ReactNode }) {
  const [state, action, pending] = useActionState(saveSettingsAction, initial);
  useActionToast(state, { success: "Ajustes guardados" });
  return (
    <SettingsContext.Provider value={{ pending, error: state.error }}>
      <form id={SETTINGS_FORM_ID} action={action} className="hidden" />
      {children}
    </SettingsContext.Provider>
  );
}

function SettingsSubmit() {
  const { pending, error } = useSettingsState();
  return (
    <>
      <div className="flex items-center justify-end gap-3 sm:col-span-2">
        <Button type="submit" form={SETTINGS_FORM_ID} loading={pending}>
          {pending ? "Guardando…" : "Guardar ajustes"}
        </Button>
      </div>
      {error ? (
        <div className="sm:col-span-2">
          <FormError message={error} />
        </div>
      ) : null}
    </>
  );
}

export function SettingsGeneralFields({ defaults }: { defaults: SettingsDefaults }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Zona horaria" hint="Formato IANA, ej: America/Argentina/Buenos_Aires">
        <Input name="timezone" form={SETTINGS_FORM_ID} defaultValue={defaults.timezone} required />
      </Field>
      <Field label="Moneda" hint="Código ISO de 3 letras, ej: ARS">
        <Input name="currency" form={SETTINGS_FORM_ID} defaultValue={defaults.currency} maxLength={3} required />
      </Field>
      <Field
        label="Tu WhatsApp (para las alertas)"
        hint="Con código de país, solo números. El bot te avisa acá cuando un paciente saca o cancela un turno."
      >
        <Input
          name="phone"
          form={SETTINGS_FORM_ID}
          type="tel"
          inputMode="tel"
          defaultValue={defaults.phone}
          placeholder="549XXXXXXXXXX"
        />
      </Field>
      {/* HU-014 (D4): el aviso previo pasó a configurarse por servicio. */}
      <p className="text-sm text-muted-foreground sm:self-center">
        Los recordatorios se configuran en{" "}
        <Link href="/servicios" className="underline underline-offset-2">
          cada servicio
        </Link>
        .
      </p>

      <div className="sm:col-span-2">
        <Field
          label="Obras sociales"
          hint='Una por línea o separadas por coma — el bot las muestra como lista al mostrar precios. Ej: "OSDE, Swiss Medical, Galeno, Particular"'
        >
          <Textarea
            name="acceptedInsurances"
            form={SETTINGS_FORM_ID}
            rows={2}
            defaultValue={defaults.acceptedInsurances}
          />
        </Field>
      </div>

      <SettingsSubmit />
    </div>
  );
}

export function SettingsPdfFields({ defaults }: { defaults: SettingsDefaults }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Color de acento del PDF" hint="Se usa en los títulos, separadores y gráficos de los PDFs">
        <input
          type="color"
          name="pdfAccentColor"
          form={SETTINGS_FORM_ID}
          defaultValue={defaults.pdfAccentColor || DEFAULT_PDF_ACCENT}
          className="h-9 w-16 cursor-pointer rounded-md border border-input bg-background p-1"
        />
      </Field>

      <div className="sm:col-span-2">
        <Field
          label="Pie de página del PDF"
          hint='Reemplaza el texto default ("Generado el ... · NutriBot"). Ej: "Lic. en Nutrición · Mat. 1234 · +54 9 11 XXXX-XXXX"'
        >
          <Textarea name="pdfFooterText" form={SETTINGS_FORM_ID} rows={2} defaultValue={defaults.pdfFooterText} />
        </Field>
      </div>

      <SettingsSubmit />
      <p className="text-xs text-muted-foreground sm:col-span-2">Se guarda junto con los ajustes generales.</p>
    </div>
  );
}

/** HU-007 (D1), HU-016: título y matrícula (PDF y portal). */
export function SettingsSignatureFields({ defaults }: { defaults: SettingsDefaults }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Título" hint='Va antes de tu nombre. Ej: "Lic."'>
        <Input
          name="title"
          form={SETTINGS_FORM_ID}
          maxLength={20}
          placeholder="Lic."
          autoComplete="honorific-prefix"
          defaultValue={defaults.title}
        />
      </Field>
      <Field label="Matrícula">
        <Input
          name="licenseNumber"
          form={SETTINGS_FORM_ID}
          maxLength={40}
          placeholder="M.P. 852"
          autoComplete="off"
          defaultValue={defaults.licenseNumber}
        />
      </Field>
      <SettingsSubmit />
    </div>
  );
}
