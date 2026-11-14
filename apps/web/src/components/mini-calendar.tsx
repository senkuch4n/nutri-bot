"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { exceptionDayLabel, monthCalendarWeeks, monthTitle, shiftMonthKey } from "@nutri-bot/core";
import { cn } from "@/components/ui";

const WEEKDAYS = [
  { short: "L", name: "lunes" },
  { short: "M", name: "martes" },
  { short: "M", name: "miércoles" },
  { short: "J", name: "jueves" },
  { short: "V", name: "viernes" },
  { short: "S", name: "sábado" },
  { short: "D", name: "domingo" },
] as const;

const DAY_MS = 24 * 60 * 60 * 1000;

/** "2026-10-31" + 1 → "2026-11-01" (días calendario, sin la zona del proceso). */
function shiftDayKey(dayKey: string, delta: number): string {
  return new Date(Date.parse(`${dayKey}T00:00:00Z`) + delta * DAY_MS).toISOString().slice(0, 10);
}

const navButtonClass =
  "relative inline-flex size-8 items-center justify-center rounded-full text-muted-foreground press-none touch-target transition-colors duration-hover hover:bg-overlay-hover hover:text-foreground pressed:bg-overlay-pressed disabled:pointer-events-none disabled:opacity-30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/**
 * Calendario chico para elegir un día ("yyyy-MM-dd"): un mes por vez, de lunes a domingo, con flechas
 * para cambiar de mes. Los días antes de `min` no se pueden elegir; hoy va marcado. Se navega con las
 * flechas del teclado (un solo día en el orden de tabulación, como una grilla).
 */
export function MiniCalendar({
  value,
  onChange,
  todayKey,
  min,
  labelledBy,
}: {
  value: string;
  onChange: (dayKey: string) => void;
  /** Hoy en la zona de la profesional. */
  todayKey: string;
  /** Primer día elegible ("yyyy-MM-dd"). */
  min?: string;
  /** Id del rótulo del calendario. */
  labelledBy?: string;
}) {
  const [month, setMonth] = useState(value.slice(0, 7));
  const [focusKey, setFocusKey] = useState(value);
  const gridRef = useRef<HTMLDivElement>(null);
  const weeks = monthCalendarWeeks(month);
  const canGoBack = !min || shiftMonthKey(month, -1) >= min.slice(0, 7);
  const selectable = (key: string) => !min || key >= min;
  // El día que recibe el foco con Tab: el elegido si se ve en este mes; si no, el primero elegible.
  const visible = weeks.flat().filter((k) => k.startsWith(month));
  const tabKey = visible.includes(focusKey) ? focusKey : (visible.find(selectable) ?? visible[0]);

  function moveFocus(next: string) {
    if (!selectable(next)) return;
    if (!next.startsWith(month)) setMonth(next.slice(0, 7));
    setFocusKey(next);
    requestAnimationFrame(() => gridRef.current?.querySelector<HTMLButtonElement>(`[data-day="${next}"]`)?.focus());
  }

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, key: string) {
    const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (delta === undefined) return;
    e.preventDefault();
    moveFocus(shiftDayKey(key, delta));
  }

  return (
    <div className="select-none">
      <div className="mb-2 flex items-center justify-between px-1">
        <p className="text-callout font-medium text-foreground" aria-live="polite">
          {monthTitle(month)}
        </p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className={navButtonClass}
            onClick={() => setMonth(shiftMonthKey(month, -1))}
            disabled={!canGoBack}
            aria-label={`Mes anterior: ${monthTitle(shiftMonthKey(month, -1))}`}
          >
            <ChevronLeft className="size-4" strokeWidth={2} aria-hidden />
          </button>
          <button
            type="button"
            className={navButtonClass}
            onClick={() => setMonth(shiftMonthKey(month, 1))}
            aria-label={`Mes siguiente: ${monthTitle(shiftMonthKey(month, 1))}`}
          >
            <ChevronRight className="size-4" strokeWidth={2} aria-hidden />
          </button>
        </div>
      </div>

      <div ref={gridRef} role="group" aria-labelledby={labelledBy} className="grid grid-cols-7 gap-y-1">
        {WEEKDAYS.map((d) => (
          <abbr
            key={d.name}
            title={d.name}
            className="pb-1 text-center text-footnote text-muted-foreground no-underline"
          >
            {d.short}
          </abbr>
        ))}
        {weeks.flat().map((key) => {
          const inMonth = key.startsWith(month);
          const enabled = selectable(key);
          const selected = key === value;
          const today = key === todayKey;
          return (
            <div key={key} className="flex justify-center">
              <button
                type="button"
                data-day={key}
                disabled={!enabled}
                tabIndex={key === tabKey ? 0 : -1}
                onClick={() => {
                  setFocusKey(key);
                  if (!inMonth) setMonth(key.slice(0, 7));
                  onChange(key);
                }}
                onKeyDown={(e) => onKeyDown(e, key)}
                aria-pressed={selected}
                aria-label={`${exceptionDayLabel(key, todayKey)}${today ? " (hoy)" : ""}`}
                className={cn(
                  "relative inline-flex size-10 items-center justify-center rounded-full text-callout tabular-nums press-none transition-colors duration-hover",
                  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  selected
                    ? "bg-foreground font-semibold text-background"
                    : enabled
                      ? cn("hover:bg-[#ebe9ec] pressed:bg-[#e2e0e4]", inMonth ? "text-foreground" : "text-tertiary")
                      : "cursor-default text-muted-foreground/40",
                  today && !selected && "font-semibold",
                )}
              >
                {Number(key.slice(8))}
                {today && !selected ? (
                  <span className="absolute bottom-1.5 left-1/2 size-1 -translate-x-1/2 rounded-full bg-foreground" aria-hidden />
                ) : null}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
