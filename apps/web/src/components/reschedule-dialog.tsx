"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import {
  RESCHEDULE_TEXT,
  clockHourLabel,
  clockHourPosition,
  clockMinuteAngle,
  clockPoint,
  dayKeyInTz,
  groupRescheduleSlots,
  initialRescheduleSelection,
  minuteForHour,
  rescheduleDayLabel,
  rescheduleMinuteMarks,
  rescheduleSlotIso,
  shiftDayKey,
  type RescheduleSlotHour,
} from "@nutri-bot/core";
import { MorphDialog, MorphDialogContent, MorphDialogHeader, MorphDialogTitle } from "@/components/primitives/morph-dialog";
import { Button, FormError, cn } from "@/components/ui";
import { getRescheduleSlotsAction, rescheduleAppointmentAction } from "@/app/(panel)/actions";

const T = RESCHEDULE_TEXT;
const HOURS = Array.from({ length: 24 }, (_, h) => h);

// Esfera de 16rem (256 px): números de 36 px; las horas 1–12 y los minutos van afuera, 13–23 y 00 adentro.
const FACE = 256;
const CENTER = FACE / 2;
const R_OUTER = 104;
const R_INNER = 68;
const FOCUS = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export type RescheduleSelection = { hour: number; minute: number };
export type RescheduleMode = "hour" | "minute";

type FaceItem = {
  value: number;
  label: string;
  ariaLabel: string;
  angle: number;
  radius: number;
  enabled: boolean;
  /** Minuto libre que no cae de a 5: punto sin número. */
  dot?: boolean;
  small?: boolean;
};

/**
 * HU-022 (S2, S3). Selector presentacional: "HH : MM" arriba (el segmento activo en negro) y la esfera
 * de 24 h. Solo las horas y minutos libres del día se pueden tocar; el resto queda atenuado y deshabilitado.
 */
export function RescheduleClock({
  groups,
  selection,
  mode,
  onModeChange,
  onSelect,
  disabled = false,
}: {
  groups: readonly RescheduleSlotHour[];
  selection: RescheduleSelection | null;
  mode: RescheduleMode;
  onModeChange: (mode: RescheduleMode) => void;
  /** `commit`: se eligió con un toque (no con flechas); al elegir la hora, pasa a los minutos. */
  onSelect: (next: RescheduleSelection, commit: boolean) => void;
  disabled?: boolean;
}) {
  const freeHours = new Set(groups.map((g) => g.hour));
  const freeMinutes = selection ? (groups.find((g) => g.hour === selection.hour)?.minutes.map((m) => m.minute) ?? []) : [];

  const items: FaceItem[] =
    mode === "hour"
      ? HOURS.map((h) => {
          const pos = clockHourPosition(h);
          return {
            value: h,
            label: clockHourLabel(h),
            ariaLabel: T.hourLabel(h),
            angle: pos.angle,
            radius: pos.ring === "outer" ? R_OUTER : R_INNER,
            enabled: !disabled && freeHours.has(h),
            small: pos.ring === "inner",
          };
        })
      : rescheduleMinuteMarks(freeMinutes).map(({ minute, labeled }) => ({
          value: minute,
          label: String(minute).padStart(2, "0"),
          ariaLabel: T.minuteLabel(minute),
          angle: clockMinuteAngle(minute),
          radius: R_OUTER,
          enabled: !disabled && freeMinutes.includes(minute),
          dot: !labeled,
        }));
  const selectedValue = selection ? (mode === "hour" ? selection.hour : selection.minute) : null;
  const selectedItem = items.find((i) => i.value === selectedValue && i.enabled) ?? null;
  const enabledValues = items.filter((i) => i.enabled).map((i) => i.value);
  const tabValue = selectedItem?.value ?? enabledValues[0] ?? null;
  const faceRef = useRef<HTMLDivElement>(null);

  function pick(value: number, commit: boolean) {
    if (mode === "hour") {
      const minute = minuteForHour(groups, value, selection?.minute ?? 0);
      if (minute !== null) onSelect({ hour: value, minute }, commit);
    } else if (selection) {
      onSelect({ hour: selection.hour, minute: value }, commit);
    }
  }

  // Grupo de radios: las flechas recorren solo los valores libres (roving tabindex).
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step || enabledValues.length === 0) return;
    e.preventDefault();
    const at = tabValue === null ? -1 : enabledValues.indexOf(tabValue);
    const next = enabledValues[(at + step + enabledValues.length) % enabledValues.length];
    if (next === undefined) return;
    pick(next, false);
    faceRef.current?.querySelector<HTMLButtonElement>(`[data-value="${next}"]`)?.focus();
  }

  const hand = selectedItem ? { angle: selectedItem.angle, length: selectedItem.radius } : null;
  const pad = (n: number | undefined) => (n === undefined ? "--" : String(n).padStart(2, "0"));

  return (
    <div>
      <div className="flex items-center justify-center gap-2 text-large-title font-medium tabular-nums">
        {(["hour", "minute"] as const).map((seg, i) => (
          <span key={seg} className="contents">
            {i === 1 ? <span aria-hidden className="text-muted-foreground">:</span> : null}
            <button
              type="button"
              aria-pressed={mode === seg}
              aria-label={`${seg === "hour" ? T.hours : T.minutes}: ${pad(seg === "hour" ? selection?.hour : selection?.minute)}`}
              disabled={disabled || !selection}
              onClick={() => onModeChange(seg)}
              className={cn(
                "min-w-[4.5rem] rounded-full px-4 py-1 transition-colors duration-150 motion-reduce:transition-none disabled:cursor-default",
                FOCUS,
                mode === seg ? "bg-foreground text-background" : "bg-black/[0.05] text-foreground hover:bg-black/[0.08]",
              )}
            >
              {pad(seg === "hour" ? selection?.hour : selection?.minute)}
            </button>
          </span>
        ))}
      </div>

      <div
        ref={faceRef}
        role="radiogroup"
        aria-label={mode === "hour" ? T.hours : T.minutes}
        onKeyDown={onKeyDown}
        className={cn("relative mx-auto mt-6 rounded-full bg-black/[0.05]", disabled && "opacity-60")}
        style={{ width: FACE, height: FACE }}
      >
        {hand ? (
          <>
            <span
              aria-hidden
              className="absolute bottom-1/2 left-1/2 -ml-px w-0.5 origin-bottom bg-foreground transition-[transform,height] duration-200 ease-out motion-reduce:transition-none"
              style={{ height: hand.length, transform: `rotate(${hand.angle}deg)` }}
            />
            <span aria-hidden className="absolute left-1/2 top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground" />
          </>
        ) : null}
        {items.map((item) => {
          const { x, y } = clockPoint(item.angle, item.radius);
          const selected = item === selectedItem;
          const size = item.dot && !selected ? 20 : 36;
          return (
            <button
              key={item.value}
              type="button"
              role="radio"
              data-value={item.value}
              aria-checked={selected}
              aria-label={item.ariaLabel}
              tabIndex={item.value === tabValue && item.enabled ? 0 : -1}
              disabled={!item.enabled}
              onClick={() => {
                pick(item.value, true);
              }}
              className={cn(
                "absolute grid place-items-center rounded-full tabular-nums transition-colors duration-150 motion-reduce:transition-none",
                FOCUS,
                item.small ? "text-footnote" : "text-body",
                selected
                  ? "bg-foreground font-medium text-background"
                  : item.enabled
                    ? "text-foreground hover:bg-black/[0.08]"
                    : "cursor-default text-muted-foreground/35",
              )}
              style={{ width: size, height: size, left: CENTER + x - size / 2, top: CENTER + y - size / 2 }}
            >
              {item.dot && !selected ? (
                <span aria-hidden className="size-1.5 rounded-full bg-current" />
              ) : (
                item.label
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

type SlotsState =
  | { status: "loading" }
  | { status: "ready"; groups: RescheduleSlotHour[] }
  | { status: "error"; message: string };

type RescheduleDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Elemento tocado ("Fecha y hora"): el diálogo crece en su lugar. */
  origin: HTMLElement | null;
  appointmentId: string;
  /** Inicio actual del turno (ISO). */
  currentStart: string;
  tz: string;
  /** "yyyy-MM-dd" de hoy en `tz` (por defecto, el del reloj del navegador). */
  todayKey?: string;
  onDone: (next: { start: string; end: string }) => void;
};

/**
 * HU-022 (S1–S4). "Cambiar horario": crece desde "Fecha y hora" del detalle del turno. Arriba el día con
 * ‹ ›; los horarios libres de cada día los da el servidor y, al guardar, el servidor vuelve a validar
 * (si el horario se ocupó, el error se muestra acá y el turno no cambia).
 */
export function RescheduleDialog(props: RescheduleDialogProps) {
  return (
    <MorphDialog open={props.open} onOpenChange={props.onOpenChange} origin={props.origin}>
      <MorphDialogContent
        className="ink-accent w-[min(100%,22rem)]"
        closeSide="left"
        anchor="origin"
        aria-describedby={undefined}
      >
        <MorphDialogHeader className="min-h-10 justify-center pl-14 pr-0">
          <MorphDialogTitle className="text-title-2 font-normal text-muted-foreground">{T.title}</MorphDialogTitle>
        </MorphDialogHeader>
        <RescheduleBody {...props} />
      </MorphDialogContent>
    </MorphDialog>
  );
}

// Se monta con cada apertura (el diálogo lo desmonta al cerrarse): el estado arranca de cero.
function RescheduleBody({ onOpenChange, appointmentId, currentStart, tz, todayKey, onDone }: RescheduleDialogProps) {
  const today = todayKey ?? dayKeyInTz(new Date(), tz);
  const startDay = dayKeyInTz(new Date(currentStart), tz);
  const [dayKey, setDayKey] = useState(startDay < today ? today : startDay);
  const [slots, setSlots] = useState<SlotsState>({ status: "loading" });
  const [selection, setSelection] = useState<RescheduleSelection | null>(null);
  const [mode, setMode] = useState<RescheduleMode>("hour");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setSlots({ status: "loading" });
    setSelection(null);
    setMode("hour");
    getRescheduleSlotsAction(appointmentId, dayKey)
      .then((res) => {
        if (!alive) return;
        if (!res.ok) {
          setSlots({ status: "error", message: res.error });
          return;
        }
        const groups = groupRescheduleSlots(res.slots, tz);
        setSlots({ status: "ready", groups });
        setSelection(initialRescheduleSelection(groups, currentStart, tz));
      })
      .catch(() => {
        if (alive) setSlots({ status: "error", message: T.loadError });
      });
    return () => {
      alive = false;
    };
  }, [appointmentId, dayKey, tz, currentStart]);

  const groups = slots.status === "ready" ? slots.groups : [];
  const iso = selection ? rescheduleSlotIso(groups, selection.hour, selection.minute) : null;
  // Sin cambios no se guarda: guardar el mismo horario reiniciaría la confirmación y avisaría a la paciente.
  const unchanged = iso !== null && new Date(iso).getTime() === new Date(currentStart).getTime();

  async function save() {
    if (!iso) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await rescheduleAppointmentAction(appointmentId, iso);
      if (res.ok) {
        onDone({ start: res.start, end: res.end });
        onOpenChange(false);
      } else {
        setSaveError(res.error);
      }
    } catch {
      setSaveError(T.saveError);
    } finally {
      setSaving(false);
    }
  }

  function moveDay(delta: number) {
    setSaveError(null);
    setDayKey((d) => shiftDayKey(d, delta));
  }

  const status =
    slots.status === "loading" ? T.loading : slots.status === "ready" && groups.length === 0 ? T.noSlots : null;

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={T.prevDay}
          disabled={dayKey <= today || saving}
          onClick={() => moveDay(-1)}
          className="size-10 rounded-full hover:bg-black/[0.05]"
        >
          <ChevronLeft className="size-5" strokeWidth={2} aria-hidden />
        </Button>
        <p aria-live="polite" className="min-w-0 truncate text-headline">
          {rescheduleDayLabel(dayKey, today)}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={T.nextDay}
          disabled={saving}
          onClick={() => moveDay(1)}
          className="size-10 rounded-full hover:bg-black/[0.05]"
        >
          <ChevronRight className="size-5" strokeWidth={2} aria-hidden />
        </Button>
      </div>

      <div className="relative mt-4">
        <RescheduleClock
          groups={groups}
          selection={selection}
          mode={mode}
          onModeChange={setMode}
          disabled={slots.status !== "ready" || saving}
          onSelect={(next, commit) => {
            setSaveError(null);
            setSelection(next);
            if (commit && mode === "hour") setMode("minute");
          }}
        />
        {slots.status === "loading" ? (
          <Loader2
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-[calc(50%+2rem)] size-6 -translate-x-1/2 -translate-y-1/2 animate-spin text-muted-foreground motion-reduce:animate-none"
          />
        ) : null}
      </div>

      <p aria-live="polite" className="mt-3 min-h-5 text-center text-callout text-muted-foreground">
        {status}
      </p>
      <div className="mt-1 text-center">
        <FormError message={slots.status === "error" ? slots.message : saveError} />
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          disabled={saving}
          onClick={() => onOpenChange(false)}
          className={cn("rounded-full px-5 hover:bg-black/[0.05]", FOCUS)}
        >
          {T.cancel}
        </Button>
        <Button
          type="button"
          loading={saving}
          disabled={!iso || unchanged}
          onClick={save}
          className={cn("rounded-full bg-foreground px-5 text-background hover:bg-foreground/85", FOCUS)}
        >
          {saving ? T.saving : T.save}
        </Button>
      </div>
    </div>
  );
}
