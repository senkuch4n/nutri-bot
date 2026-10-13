"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  SERVICE_REMINDERS_MAX,
  SERVICE_REMINDERS_TEXT,
  validateServiceReminders,
  type ReminderUnit,
  type ServiceReminder,
  type ServiceReminderError,
} from "@nutri-bot/core";
import { Switch } from "@/components/primitives/switch";
import { Button, Input, Select } from "@/components/ui";

interface Row {
  id: number;
  amount: string;
  unit: ReminderUnit;
  asksConfirmation: boolean;
}

/** ids locales (solo para `key` e ids de accesibilidad), por instancia: iguales en servidor y cliente. */
const toRows = (list: readonly ServiceReminder[], nextId: () => number): Row[] =>
  list.map((r) => ({ id: nextId(), amount: String(r.amount), unit: r.unit, asksConfirmation: r.asksConfirmation }));

/** Lo que viaja en el input oculto `reminders` (y lo que valida el form antes de enviar). */
export function remindersPayload(rows: readonly Pick<Row, "amount" | "unit" | "asksConfirmation">[]) {
  return rows.map((r) => ({
    amount: r.amount.trim() === "" ? null : Number(r.amount),
    unit: r.unit,
    asksConfirmation: r.asksConfirmation,
  }));
}

/** `data-reminder-amount` del número de la fila `index` (lo usa el form para enfocar el primer error). */
export const reminderAmountSelector = (index: number) => `[data-reminder-amount="${index}"]`;

/**
 * HU-014: lista de 0 a 3 recordatorios de un servicio. Estado controlado; manda la lista como JSON
 * en el input oculto `reminders`. Los errores de cada fila se muestran debajo de ella cuando la
 * fila fue tocada (blur del número) o después de un intento de envío (`showErrors`).
 */
export function RemindersEditor({
  initial,
  serverErrors,
  showErrors,
  resetKey,
  idPrefix,
}: {
  initial: readonly ServiceReminder[];
  serverErrors?: ServiceReminderError[];
  showErrors: boolean;
  /** Al cambiar, vuelve a `initial` (form de alta después de crear). */
  resetKey: number;
  idPrefix: string;
}) {
  const counter = useRef(0);
  const nextId = () => ++counter.current;
  const [rows, setRows] = useState<Row[]>(() => toRows(initial, nextId));
  const [touched, setTouched] = useState<Set<number>>(() => new Set());
  const [focusId, setFocusId] = useState<number | null>(null);
  const inputs = useRef(new Map<number, HTMLInputElement>());
  const initialRef = useRef(initial);
  initialRef.current = initial;

  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    setRows(toRows(initialRef.current, () => ++counter.current));
    setTouched(new Set());
  }, [resetKey]);

  useEffect(() => {
    if (focusId === null) return;
    inputs.current.get(focusId)?.focus();
    setFocusId(null);
  }, [focusId]);

  const payload = remindersPayload(rows);
  const validation = validateServiceReminders(payload);
  const clientErrors = validation.ok ? [] : validation.errors;
  const errors = clientErrors.length > 0 ? clientErrors : showErrors ? (serverErrors ?? []) : [];
  const rowError = (index: number) => errors.find((e) => e.index === index)?.message;
  const listError = errors.find((e) => e.index === null)?.message;
  const full = rows.length >= SERVICE_REMINDERS_MAX;

  const update = (id: number, patch: Partial<Row>) =>
    setRows((prev) =>
      prev.map((r) => {
        if (r.id === id) return { ...r, ...patch };
        // Máximo un "pide confirmar" por construcción: marcar uno desmarca los demás.
        if (patch.asksConfirmation) return { ...r, asksConfirmation: false };
        return r;
      }),
    );

  const add = () => {
    if (full) return;
    const row: Row = { id: nextId(), amount: "", unit: "DAYS", asksConfirmation: false };
    setRows((prev) => [...prev, row]);
    setFocusId(row.id);
  };

  const remove = (id: number) => setRows((prev) => prev.filter((r) => r.id !== id));

  return (
    <div className="space-y-3">
      <input type="hidden" name="reminders" value={JSON.stringify(payload)} />
      {/* HU-017b-2: el título "Recordatorios" lo pone el grupo del formulario. */}
      <div className="space-y-1 text-footnote text-muted-foreground">
        <p>El bot le recuerda el turno al paciente por WhatsApp. Podés poner hasta 3.</p>
        <p>
          El que pide confirmar le pregunta al paciente si va a venir (sí/no). Si responde que no, el turno se
          cancela solo.
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed px-3 py-2.5 text-callout text-muted-foreground">
          Los turnos de este servicio no van a recibir recordatorios.
        </p>
      ) : (
        <ul className="space-y-3">
          {rows.map((row, index) => {
            const n = index + 1;
            const error = touched.has(row.id) || showErrors ? rowError(index) : undefined;
            const errorId = `${idPrefix}-recordatorio-${row.id}-error`;
            const confirmId = `${idPrefix}-recordatorio-${row.id}-confirma`;
            return (
              <li key={row.id}>
                <div role="group" aria-label={`Recordatorio ${n}`} className="flex flex-wrap items-center gap-2">
                  <Input
                    ref={(el) => {
                      if (el) inputs.current.set(row.id, el);
                      else inputs.current.delete(row.id);
                    }}
                    type="number"
                    min={1}
                    step={1}
                    inputMode="numeric"
                    autoComplete="off"
                    value={row.amount}
                    onChange={(e) => update(row.id, { amount: e.currentTarget.value })}
                    onBlur={() => setTouched((prev) => new Set(prev).add(row.id))}
                    aria-label={`Anticipación del recordatorio ${n}`}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? errorId : undefined}
                    data-reminder-amount={index}
                    className="h-11 w-20 tabular-nums"
                  />
                  <Select
                    value={row.unit}
                    onChange={(e) => update(row.id, { unit: e.currentTarget.value as ReminderUnit })}
                    aria-label={`Unidad del recordatorio ${n}`}
                    className="h-11 w-28"
                  >
                    <option value="DAYS">días</option>
                    <option value="HOURS">horas</option>
                  </Select>
                  <span className="text-callout text-muted-foreground">antes</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => remove(row.id)}
                    aria-label={`Quitar recordatorio ${n}`}
                    title={`Quitar recordatorio ${n}`}
                    className="ml-auto size-11 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 aria-hidden />
                  </Button>
                  {/* HU-017b-2: los sí/no son switches. */}
                  <div className="flex min-h-11 w-full items-center gap-3">
                    <Switch
                      id={confirmId}
                      checked={row.asksConfirmation}
                      onCheckedChange={(checked) => update(row.id, { asksConfirmation: checked })}
                    />
                    <label htmlFor={confirmId} className="cursor-pointer text-callout">
                      Pide confirmar (sí/no)
                    </label>
                  </div>
                </div>
                {error ? (
                  <p id={errorId} className="mt-1 text-footnote text-destructive">
                    {error}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {listError && (showErrors || listError === SERVICE_REMINDERS_TEXT.tooMany) ? (
        <p role="alert" className="text-footnote text-destructive">
          {listError}
        </p>
      ) : null}

      <Button
        type="button"
        variant="tinted"
        onClick={add}
        disabled={full}
        title={full ? SERVICE_REMINDERS_TEXT.tooMany : undefined}
      >
        <Plus aria-hidden />
        Agregar recordatorio
      </Button>
    </div>
  );
}
