"use client";

import {
  startTransition,
  useActionState,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { DEFAULT_SERVICE_REMINDERS, SERVICE_TEXT, validateServiceReminders, type ServiceReminder } from "@nutri-bot/core";
import { useConfirm } from "@/components/confirm";
import { NumberInput } from "@/components/number-input";
import { Label } from "@/components/primitives/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/primitives/sheet";
import { Switch } from "@/components/primitives/switch";
import { SegmentedControl } from "@/components/segmented-control";
import { Button, Field, FormError, Input, Textarea, cn } from "@/components/ui";
import { notify } from "@/lib/notify";
import { useMediaQuery } from "@/lib/use-media-query";
import { useUnsavedChangesGuard } from "@/lib/use-unsaved-changes-guard";
import { saveServiceAction, type ServiceFormState } from "./actions";
import { RemindersEditor, reminderAmountSelector } from "./reminders-editor";

const T = SERVICE_TEXT;

export interface EditableService {
  id: string;
  name: string;
  description: string | null;
  price: string;
  durationMin: number;
  color: string;
  active: boolean;
  requiresDeposit: boolean;
  depositKind: "FIXED" | "PERCENT" | null;
  depositValue: string | null;
  prepInstructions: string | null;
  prepLeadHours: number | null;
  /** HU-013 (D4): el bot pide el motivo al reservar. */
  asksReason: boolean;
  /** HU-014: recordatorios del servicio (ya parseados con parseServiceReminders). */
  reminders: ServiceReminder[];
}

const LEAVE_OPTIONS = {
  title: T.leaveTitle,
  description: T.leaveDescription,
  confirmLabel: T.leave,
  cancelLabel: T.keepEditing,
};

/**
 * Panel del formulario de servicio (HU-017b-2): lateral derecho; desde abajo en < 640 px. Si hay
 * cambios sin guardar, cerrarlo (X, Esc, tocar afuera, arrastrar) pregunta "¿Salir sin guardar?" con
 * "Seguir editando" como opción segura; salir de la página o recargar también avisa.
 */
export function ServiceSheet({
  open,
  onOpenChange,
  editing,
  title,
  description,
  currency,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing?: EditableService;
  title: string;
  description: string;
  currency: string;
}) {
  const compact = useMediaQuery("(max-width: 639px)");
  const confirm = useConfirm();
  const [dirty, setDirty] = useState(false);
  const [formKey, setFormKey] = useState(0);
  useUnsavedChangesGuard(open && dirty, LEAVE_OPTIONS);

  // Cada apertura remonta el formulario: arranca con los datos guardados y sin cambios.
  useEffect(() => {
    if (open) {
      setFormKey((k) => k + 1);
      setDirty(false);
    }
  }, [open]);

  const requestOpenChange = useCallback(
    async (next: boolean) => {
      if (next || !dirty) {
        onOpenChange(next);
        return;
      }
      // `confirm` desde un handler (nunca dentro de una transición): ver useConfirm.
      if (await confirm({ ...LEAVE_OPTIONS, destructive: true })) onOpenChange(false);
    },
    [confirm, dirty, onOpenChange],
  );

  return (
    <Sheet open={open} onOpenChange={(next) => void requestOpenChange(next)}>
      <SheetContent
        side={compact ? "bottom" : "right"}
        className={compact ? undefined : "w-full sm:max-w-xl"}
        onOpenAutoFocus={(e) => {
          // En el celular el foco va al panel, no al primer campo: que no se abra el teclado solo.
          if (!compact) return;
          e.preventDefault();
          (e.currentTarget as HTMLElement | null)?.focus();
        }}
      >
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        <ServiceForm
          key={formKey}
          editing={editing}
          currency={currency}
          onDirtyChange={setDirty}
          onDone={() => {
            setDirty(false);
            onOpenChange(false);
          }}
        />
      </SheetContent>
    </Sheet>
  );
}

const initial: ServiceFormState = { ok: false };

// Colores del servicio (datos que se guardan, no tokens del sistema).
const PRESET_COLORS = ["#5aa832", "#2563eb", "#db2777", "#d97706", "#7c3aed", "#0891b2"];

/** Símbolo de la moneda para el campo de precio ("$", "US$", "€"). */
function currencySymbol(currency: string): string {
  try {
    const part = new Intl.NumberFormat("es-AR", { style: "currency", currency })
      .formatToParts(0)
      .find((p) => p.type === "currency");
    return part?.value ?? currency;
  } catch {
    return currency;
  }
}

/** Lo que hay en el form, en un string comparable (para saber si hay cambios sin guardar). */
function snapshot(form: HTMLFormElement): string {
  return JSON.stringify([...new FormData(form).entries()].map(([k, v]) => [k, String(v)]));
}

function Group({ legend, children }: { legend: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-4">
      <legend className="mb-3 text-headline text-foreground">{legend}</legend>
      <div className="space-y-4 rounded-xl bg-secondary/50 p-4 more-contrast:border more-contrast:border-input">
        {children}
      </div>
    </fieldset>
  );
}

/** Fila con un switch: el texto a la izquierda, el switch a la derecha (44 px de alto). */
function SwitchRow({
  id,
  label,
  hint,
  checked,
  onCheckedChange,
}: {
  id: string;
  label: string;
  hint?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-4">
      <div className="min-w-0">
        <Label htmlFor={id} className="text-callout font-medium">
          {label}
        </Label>
        {hint ? (
          <p id={`${id}-desc`} className="mt-0.5 text-footnote text-muted-foreground">
            {hint}
          </p>
        ) : null}
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        aria-describedby={hint ? `${id}-desc` : undefined}
      />
    </div>
  );
}

export function ServiceForm({
  editing,
  currency,
  onDone,
  onDirtyChange,
}: {
  editing?: EditableService;
  currency: string;
  onDone?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [state, action, pending] = useActionState(saveServiceAction, initial);
  const formRef = useRef<HTMLFormElement>(null);
  const initialSnapshot = useRef<string | null>(null);
  const [color, setColor] = useState(editing?.color ?? PRESET_COLORS[0]!);
  const [requiresDeposit, setRequiresDeposit] = useState(editing?.requiresDeposit ?? false);
  const [depositKind, setDepositKind] = useState<"PERCENT" | "FIXED">(editing?.depositKind ?? "PERCENT");
  const [hasPrep, setHasPrep] = useState(Boolean(editing?.prepInstructions));
  const [asksReason, setAsksReason] = useState(editing?.asksReason ?? true);
  const [showReminderErrors, setShowReminderErrors] = useState(false);
  const idBase = editing?.id ?? "nuevo";
  const symbol = currencySymbol(currency);

  // Foto de lo guardado al montar; después, cada cambio se compara contra ella.
  useLayoutEffect(() => {
    if (formRef.current) initialSnapshot.current = snapshot(formRef.current);
  }, []);
  const checkDirty = useCallback(() => {
    const form = formRef.current;
    if (!form || initialSnapshot.current === null) return;
    onDirtyChange?.(snapshot(form) !== initialSnapshot.current);
  }, [onDirtyChange]);
  // Los switches y el color son estado controlado: no disparan `input` en el form.
  useEffect(() => {
    checkDirty();
  }, [checkDirty, color, requiresDeposit, depositKind, hasPrep, asksReason]);

  useEffect(() => {
    if (state.ok) {
      notify.saved(editing ? "Servicio guardado" : "Servicio creado");
      onDone?.();
    }
    // Solo la identidad de `state`: cada action devuelve un objeto nuevo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  // Se despacha a mano (no `<form action>`) para que React 19 no resetee el form cuando vuelve un
  // error: lo tipeado tiene que quedar. Si la lista de recordatorios es inválida, no se envía y se
  // enfoca el primer número con error.
  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    let check: ReturnType<typeof validateServiceReminders>;
    try {
      check = validateServiceReminders(JSON.parse(String(formData.get("reminders") ?? "[]")));
    } catch {
      check = { ok: false, errors: [{ index: null, message: "" }] };
    }
    if (!check.ok) {
      setShowReminderErrors(true);
      const first = check.errors.find((err) => err.index !== null);
      if (first && first.index !== null) {
        form.querySelector<HTMLInputElement>(reminderAmountSelector(first.index))?.focus();
      }
      return;
    }
    startTransition(() => action(formData));
  }

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      onInput={checkDirty}
      onChange={checkDirty}
      // Agregar o quitar un recordatorio son botones: se mira después de que el editor se actualice.
      onClickCapture={() => requestAnimationFrame(checkDirty)}
      className="mt-6 space-y-8"
    >
      {editing ? <input type="hidden" name="id" value={editing.id} /> : null}
      <input type="hidden" name="color" value={color} />

      <Group legend={T.groups.data}>
        <Field label="Nombre">
          <Input name="name" defaultValue={editing?.name} required minLength={2} autoComplete="off" className="h-11" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Precio">
            <div className="relative">
              <span
                aria-hidden
                className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-callout text-muted-foreground"
              >
                {symbol}
              </span>
              <Input
                name="price"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                defaultValue={editing?.price}
                required
                aria-label={`Precio en ${symbol}`}
                className="h-11 pl-10 tabular-nums"
              />
            </div>
          </Field>
          <Field label="Duración">
            <NumberInput
              name="durationMin"
              unit="min"
              min={5}
              step={5}
              inputMode="numeric"
              defaultValue={editing?.durationMin ?? 30}
              required
              className="h-11"
            />
          </Field>
        </div>
        <div>
          <p className="mb-1.5 text-subheadline font-medium text-foreground" id={`${idBase}-color`}>
            Color en el calendario
          </p>
          <div role="group" aria-labelledby={`${idBase}-color`} className="flex flex-wrap items-center gap-2">
            {PRESET_COLORS.map((c) => {
              const selected = color.toLowerCase() === c;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  aria-label={`Color ${c}`}
                  aria-pressed={selected}
                  className={cn(
                    "size-11 rounded-full ring-offset-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    selected && "ring-2 ring-foreground",
                  )}
                  style={{ background: c }}
                />
              );
            })}
            <label className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-full bg-background px-3 text-callout shadow-card hover:bg-overlay-hover">
              Otro
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="size-6 cursor-pointer border-0 bg-transparent p-0"
              />
            </label>
          </div>
        </div>
        <Field label="Descripción (opcional)">
          <Textarea name="description" rows={2} defaultValue={editing?.description ?? ""} />
        </Field>
      </Group>

      <Group legend={T.groups.deposit}>
        <SwitchRow
          id={`${idBase}-sena`}
          label="Pide seña para reservar por WhatsApp"
          checked={requiresDeposit}
          onCheckedChange={setRequiresDeposit}
        />
        {/* "0"/"1": la action no usa z.coerce.boolean() (Q17). */}
        <input type="hidden" name="requiresDeposit" value={requiresDeposit ? "1" : "0"} />
        {requiresDeposit ? (
          <div className="space-y-4">
            <SegmentedControl
              aria-label="Tipo de seña"
              value={depositKind}
              onValueChange={setDepositKind}
              size="lg"
              fullWidth
              options={[
                { value: "PERCENT", label: "Porcentaje" },
                { value: "FIXED", label: "Monto fijo" },
              ]}
            />
            <input type="hidden" name="depositKind" value={depositKind} />
            <Field label={depositKind === "PERCENT" ? "Porcentaje del precio" : "Monto de la seña"}>
              <NumberInput
                name="depositValue"
                unit={depositKind === "PERCENT" ? "%" : symbol}
                min={0}
                step="0.01"
                defaultValue={editing?.depositValue ?? ""}
                required
                className="h-11"
              />
            </Field>
          </div>
        ) : null}
      </Group>

      <Group legend={T.groups.beforeAppointment}>
        <SwitchRow
          id={`${idBase}-recomendaciones`}
          label="Mandar recomendaciones"
          hint="Por ejemplo, para antropometría o bioimpedancia."
          checked={hasPrep}
          onCheckedChange={setHasPrep}
        />
        {hasPrep ? (
          <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
            <Field label="Recomendaciones" hint="Se manda por WhatsApp antes del turno.">
              <Textarea
                name="prepInstructions"
                rows={3}
                defaultValue={editing?.prepInstructions ?? ""}
                required
                placeholder="Ej: Vení en ayunas de 4 h y sin haber entrenado ese día."
              />
            </Field>
            <Field label="Horas antes">
              <NumberInput
                name="prepLeadHours"
                unit="h"
                step={1}
                min={1}
                max={168}
                defaultValue={editing?.prepLeadHours ?? 24}
                required
                className="h-11 w-28"
              />
            </Field>
          </div>
        ) : (
          // Apagado: se manda vacío y la action borra las recomendaciones (Q17).
          <input type="hidden" name="prepInstructions" value="" />
        )}
      </Group>

      <Group legend={T.groups.reminders}>
        <RemindersEditor
          initial={editing?.reminders ?? DEFAULT_SERVICE_REMINDERS}
          serverErrors={state.reminderErrors}
          showErrors={showReminderErrors || Boolean(state.reminderErrors)}
          resetKey={0}
          idPrefix={idBase}
        />
      </Group>

      <Group legend={T.groups.onBooking}>
        <SwitchRow
          id={`${idBase}-pide-motivo`}
          label="Pedir motivo"
          hint="El bot le pide al paciente que cuente el motivo antes de confirmar el turno."
          checked={asksReason}
          onCheckedChange={setAsksReason}
        />
        <input type="hidden" name="asksReason" value={asksReason ? "1" : "0"} />
      </Group>

      {/* Sin "Servicio activo": lo cambia solo el switch "Lo ofrece el bot" de la tarjeta (Q17). */}
      <div className="space-y-3">
        <FormError message={state.ok ? undefined : state.error} />
        <Button type="submit" size="lg" loading={pending} className="w-full sm:w-auto">
          {pending ? "Guardando…" : editing ? "Guardar cambios" : "Crear servicio"}
        </Button>
      </div>
    </form>
  );
}
