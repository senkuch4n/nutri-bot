"use client";

import { startTransition, useActionState, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Trash2 } from "lucide-react";
import { AVAILABILITY_TEXT, WEEKDAY_NAMES, WEEKDAY_ORDER, hhmmToMinutes } from "@nutri-bot/core";
import {
  MorphDialog,
  MorphDialogContent,
  MorphDialogDescription,
  MorphDialogHeader,
  MorphDialogTitle,
} from "@/components/primitives/morph-dialog";
import { Button, Input, Select } from "@/components/ui";
import { notify } from "@/lib/notify";
import { addRuleAction, updateRuleAction, type FormState } from "./actions";
import { addRangeButtonId, type Rule } from "./schedule";

const T = AVAILABILITY_TEXT;

export type RangeTarget = { mode: "add"; weekday: number; startTime: string; endTime: string } | { mode: "edit"; rule: Rule };

function dayLower(weekday: number): string {
  return (WEEKDAY_NAMES[weekday] ?? "").toLowerCase();
}

function toHhmm(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** Horas propuestas al agregar en un día: 9:00–13:00 si no tiene nada; si no, desde el fin del último
 *  horario y hasta 4 h después (sin pasar de las 23:59). */
export function suggestedRange(dayRules: readonly Rule[]): { startTime: string; endTime: string } {
  if (dayRules.length === 0) return { startTime: "09:00", endTime: "13:00" };
  const lastEnd = Math.max(...dayRules.map((r) => hhmmToMinutes(r.endTime)));
  const start = Math.min(lastEnd, 22 * 60);
  return { startTime: toHhmm(start), endTime: toHhmm(Math.min(start + 4 * 60, 23 * 60 + 59)) };
}

/**
 * Panel "Horario del lunes" (HU-017b-2): Día, "Desde", "Hasta" (inputs nativos de 44 px) y "Guardar";
 * al editar, además "Borrar este horario". La superposición se valida en el servidor (solo contra las
 * reglas activas) y el mensaje queda junto a los campos. Diálogo centrado que crece desde el horario o
 * el botón que lo abrió (`MorphDialog`) y vuelve a él al cerrar.
 */
export function RangeSheet({
  target,
  origin = null,
  open,
  onOpenChange,
  onDelete,
}: {
  target: RangeTarget | null;
  /** Elemento desde el que crece el diálogo (el horario o "Agregar horario" tocado). */
  origin?: HTMLElement | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pide la confirmación y programa el borrado diferido. Devuelve true si se confirmó. */
  onDelete: (rule: Rule) => Promise<boolean>;
}) {
  const fallbackFocus = useRef<HTMLElement | null>(null);

  return (
    // `originLabel`: el texto del horario (o "Agregar horario") viaja con la tarjeta mientras crece.
    <MorphDialog open={open} onOpenChange={onOpenChange} origin={origin} originLabel>
      <MorphDialogContent
        onCloseAutoFocus={(event) => {
          // Si el horario que abrió el panel se borró, el foco va a "Agregar horario" de ese día.
          const el = fallbackFocus.current;
          fallbackFocus.current = null;
          if (el?.isConnected) {
            event.preventDefault();
            el.focus();
          }
        }}
      >
        {target ? (
          <RangeForm
            // Cada apertura remonta el formulario: arranca con las horas del horario y sin errores.
            key={target.mode === "edit" ? `edit:${target.rule.id}` : `add:${target.weekday}:${target.startTime}`}
            target={target}
            onDone={() => onOpenChange(false)}
            onDelete={async (rule) => {
              const confirmed = await onDelete(rule);
              if (confirmed) {
                fallbackFocus.current = document.getElementById(addRangeButtonId(rule.weekday));
                onOpenChange(false);
              }
            }}
          />
        ) : null}
      </MorphDialogContent>
    </MorphDialog>
  );
}

const initial: FormState = { ok: false };

function RangeForm({
  target,
  onDone,
  onDelete,
}: {
  target: RangeTarget;
  onDone: () => void;
  onDelete: (rule: Rule) => Promise<void>;
}) {
  const editing = target.mode === "edit" ? target.rule : null;
  const [state, formAction, pending] = useActionState(editing ? updateRuleAction : addRuleAction, initial);
  const init = target.mode === "edit" ? target.rule : target;
  const [weekday, setWeekday] = useState(init.weekday);
  const [startTime, setStartTime] = useState(init.startTime);
  const [endTime, setEndTime] = useState(init.endTime);
  const submitted = useRef({ weekday, startTime, endTime });
  const formRef = useRef<HTMLFormElement>(null);
  const ids = useId();
  const errorId = `${ids}-error`;

  useEffect(() => {
    if (state.ok) {
      const s = submitted.current;
      notify.saved(T.saved(WEEKDAY_NAMES[s.weekday] ?? "", s));
      onDone();
      return;
    }
    // Con error, el foco va al campo señalado (el mensaje se anuncia con role="alert").
    if (state.field) formRef.current?.querySelector<HTMLInputElement>(`[name="${state.field}"]`)?.focus();
    // Solo la identidad de `state`: cada respuesta de la action es un objeto nuevo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  // Sin `action={…}`: React 19 resetea el form al terminar una form action y con un error se perdería lo
  // elegido. Se despacha a mano dentro de una transición.
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submitted.current = { weekday, startTime, endTime };
    const data = new FormData(event.currentTarget);
    startTransition(() => formAction(data));
  }

  const error = state.ok ? undefined : state.error;
  // La superposición (y "inicio antes del fin") es de los dos campos: los dos quedan marcados.
  const invalid = error ? true : undefined;

  return (
    <>
      <MorphDialogHeader>
        <MorphDialogTitle>{`Horario del ${dayLower(weekday)}`}</MorphDialogTitle>
        <MorphDialogDescription>
          {editing ? "Cambiá las horas y guardá. El bot ofrece turnos solo en tu horario." : "El bot ofrece turnos solo en tu horario."}
        </MorphDialogDescription>
      </MorphDialogHeader>

      <form ref={formRef} onSubmit={onSubmit} noValidate className="mt-6 space-y-5">
        {editing ? <input type="hidden" name="id" value={editing.id} /> : null}

        <label className="block">
          <span className="mb-1.5 block text-subheadline font-medium text-foreground">Día</span>
          <Select name="weekday" value={String(weekday)} onChange={(e) => setWeekday(Number(e.target.value))} className="h-11">
            {WEEKDAY_ORDER.map((d) => (
              <option key={d} value={d}>
                {WEEKDAY_NAMES[d]}
              </option>
            ))}
          </Select>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1.5 block text-subheadline font-medium text-foreground">{T.from}</span>
            <Input
              name="startTime"
              type="time"
              required
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="h-11 tabular-nums"
              aria-invalid={invalid}
              aria-describedby={error ? errorId : undefined}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-subheadline font-medium text-foreground">{T.to}</span>
            <Input
              name="endTime"
              type="time"
              required
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="h-11 tabular-nums"
              aria-invalid={invalid}
              aria-describedby={error ? errorId : undefined}
            />
          </label>
        </div>
        {error ? (
          <p id={errorId} role="alert" className="-mt-2 text-footnote text-destructive">
            {error}
          </p>
        ) : null}

        <Button type="submit" size="lg" loading={pending} className="w-full">
          {pending ? "Guardando…" : T.save}
        </Button>

        {editing ? (
          <div className="border-t pt-4">
            <Button
              type="button"
              variant="ghost"
              size="lg"
              disabled={pending}
              onClick={() => void onDelete(editing)}
              className="w-full text-destructive hover:text-destructive"
            >
              <Trash2 aria-hidden />
              {T.deleteRange}
            </Button>
          </div>
        ) : null}
      </form>
    </>
  );
}
