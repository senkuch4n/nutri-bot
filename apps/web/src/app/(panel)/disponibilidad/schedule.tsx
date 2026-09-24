"use client";

import {
  useActionState,
  useEffect,
  useMemo,
  useState,
  useTransition,
  type MouseEvent,
} from "react";
import { X } from "lucide-react";
import { Button, Field, FormError, Input, Select } from "@/components/ui";
import { Modal } from "@/components/modal";
import { useActionToast } from "@/lib/notify";
import { addRuleAction, deleteRuleAction, type FormState } from "./actions";

export interface Rule {
  id: string;
  weekday: number;
  startTime: string;
  endTime: string;
}

const DAYS = [
  { wd: 1, short: "Lun", full: "Lunes" },
  { wd: 2, short: "Mar", full: "Martes" },
  { wd: 3, short: "Mié", full: "Miércoles" },
  { wd: 4, short: "Jue", full: "Jueves" },
  { wd: 5, short: "Vie", full: "Viernes" },
  { wd: 6, short: "Sáb", full: "Sábado" },
  { wd: 0, short: "Dom", full: "Domingo" },
] as const;

const HOUR_PX = 46;

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}
function fmt(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

export function WeeklySchedule({
  rules,
  onAddBlock,
}: {
  rules: Rule[];
  onAddBlock: (weekday: number, start: string) => void;
}) {
  const { startMin, endMin, hours } = useMemo(() => {
    const starts = rules.map((r) => toMin(r.startTime));
    const ends = rules.map((r) => toMin(r.endTime));
    let s = Math.min(8 * 60, ...(starts.length ? starts : [8 * 60]));
    let e = Math.max(20 * 60, ...(ends.length ? ends : [20 * 60]));
    s = Math.floor(s / 60) * 60;
    e = Math.ceil(e / 60) * 60;
    const hrs: number[] = [];
    for (let h = s; h <= e; h += 60) hrs.push(h);
    return { startMin: s, endMin: e, hours: hrs };
  }, [rules]);

  const totalPx = ((endMin - startMin) / 60) * HOUR_PX;

  function onColumnClick(e: MouseEvent<HTMLDivElement>, weekday: number) {
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    let clicked = startMin + Math.round(((y / HOUR_PX) * 60) / 30) * 30;
    clicked = Math.max(startMin, Math.min(endMin - 30, clicked));
    onAddBlock(weekday, fmt(clicked));
  }

  return (
    // Entra a 663 px de alto: la grilla scrollea dentro de la tarjeta, no la página.
    <div className="max-h-[calc(100vh-17rem)] min-h-72 overflow-auto">
      <div className="flex min-w-[560px]">
        <div className="w-12 shrink-0 pt-8">
          {hours.map((h) => (
            <div
              key={h}
              className="relative pr-2 text-right text-xs tabular-nums text-muted-foreground"
              style={{ height: HOUR_PX }}
            >
              <span className="absolute -top-2 right-2">{fmt(h)}</span>
            </div>
          ))}
        </div>

        <div className="grid flex-1 grid-cols-7 border-l">
          {DAYS.map(({ wd, short, full }) => {
            const dayRules = rules
              .filter((r) => r.weekday === wd)
              .sort((a, b) => toMin(a.startTime) - toMin(b.startTime));
            return (
              <div key={wd} className="border-r">
                <div
                  className="flex h-8 items-center justify-center border-b text-xs font-medium text-muted-foreground"
                  title={full}
                >
                  {short}
                </div>
                <div
                  className="relative cursor-pointer transition-colors hover:bg-muted/60"
                  style={{ height: totalPx }}
                  onClick={(e) => onColumnClick(e, wd)}
                >
                  {hours.slice(1).map((h, i) => (
                    <div
                      key={h}
                      className="pointer-events-none absolute inset-x-0 border-t border-border/60"
                      style={{ top: (i + 1) * HOUR_PX }}
                    />
                  ))}
                  {dayRules.map((r) => (
                    <Block key={r.id} rule={r} startMin={startMin} />
                  ))}
                  {dayRules.length === 0 ? (
                    <span className="pointer-events-none absolute inset-x-0 top-3 text-center text-xs text-muted-foreground">
                      —
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Block({ rule, startMin }: { rule: Rule; startMin: number }) {
  const [pending, start] = useTransition();
  const s = toMin(rule.startTime);
  const e = toMin(rule.endTime);
  return (
    <div
      className="absolute inset-x-1 overflow-hidden rounded-md border-l-2 border-l-foreground bg-accent px-2 py-1"
      style={{ top: ((s - startMin) / 60) * HOUR_PX, height: Math.max(((e - s) / 60) * HOUR_PX, 24) }}
      onClick={(ev) => ev.stopPropagation()}
    >
      <p className="pr-5 text-xs font-medium leading-tight tabular-nums text-foreground">{rule.startTime}</p>
      <p className="text-xs leading-tight tabular-nums text-muted-foreground">{rule.endTime}</p>
      <button
        type="button"
        onClick={() => start(() => deleteRuleAction(rule.id))}
        disabled={pending}
        aria-label={`Quitar bloque ${rule.startTime} a ${rule.endTime}`}
        title="Quitar bloque"
        className="absolute right-0.5 top-0.5 flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground hover:bg-background hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
      >
        <X className="h-3.5 w-3.5" aria-hidden />
      </button>
    </div>
  );
}

const initialState: FormState = { ok: false };

export function AddBlockModal({
  weekday,
  start,
  onClose,
}: {
  weekday: number;
  start: string;
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState(addRuleAction, initialState);
  const [wd, setWd] = useState(String(weekday));
  useActionToast(state, { success: "Bloque agregado" });
  useEffect(() => {
    if (state.ok) onClose();
  }, [state.ok, onClose]);

  const end = fmt(Math.min(toMin(start) + 60, 23 * 60 + 30));

  return (
    <Modal open onClose={onClose} title="Nuevo bloque de atención">
      <form action={action} className="grid gap-4 sm:grid-cols-3">
        <Field label="Día">
          <Select name="weekday" value={wd} onChange={(e) => setWd(e.target.value)}>
            {DAYS.map((d) => (
              <option key={d.wd} value={d.wd}>
                {d.full}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Desde">
          <Input name="startTime" type="time" defaultValue={start} required />
        </Field>
        <Field label="Hasta">
          <Input name="endTime" type="time" defaultValue={end} required />
        </Field>
        <div className="flex items-center justify-end gap-3 sm:col-span-3">
          <Button type="submit" loading={pending}>
            {pending ? "Guardando…" : "Agregar bloque"}
          </Button>
        </div>
        {state.error ? (
          <div className="sm:col-span-3">
            <FormError message={state.error} />
          </div>
        ) : null}
      </form>
    </Modal>
  );
}
