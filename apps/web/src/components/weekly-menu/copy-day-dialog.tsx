"use client";

import { useEffect, useId, useState } from "react";
import { WEEKDAYS, WEEKDAY_LABELS, type Weekday } from "@nutri-bot/core";
import { Checkbox } from "@/components/primitives/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/primitives/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/primitives/radio-group";
import { Alert, Button } from "@/components/ui";
import { replaceDaysWarning } from "./labels";

const rowClass =
  "flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-3 hover:bg-overlay-hover has-[[data-state=checked]]:bg-primary-soft";

/**
 * HU-018b (SDD 7.6). Dos usos, con la misma action (`copyDay`):
 * - "to-others": "Copiar el lunes a…", los otros 6 días como casillas grandes.
 * - "into-day": "Copiar al jueves", desde un día vacío: elegir uno de los días cargados.
 * Sin confirmación extra: después de copiar hay "Deshacer".
 */
export function CopyDayDialog({
  open,
  onOpenChange,
  variant,
  day,
  loadedDays,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  variant: "to-others" | "into-day";
  /** Día de la pestaña: origen en "to-others", destino en "into-day". */
  day: Weekday;
  /** Días con algún ítem en comidas "Cambia cada día". */
  loadedDays: readonly Weekday[];
  onConfirm: (from: Weekday, to: Weekday[]) => void;
}) {
  const id = useId();
  const [checked, setChecked] = useState<Weekday[]>([]);
  const sources = loadedDays.filter((d) => d !== day);
  const [source, setSource] = useState<Weekday | null>(sources[0] ?? null);

  // Se reinicia solo al abrir (o si cambia el día): `loadedDays` llega como array nuevo en cada render.
  const firstSource = sources[0] ?? null;
  useEffect(() => {
    if (!open) return;
    setChecked([]);
    setSource(firstSource);
  }, [open, day, firstSource]);

  const dayLower = WEEKDAY_LABELS[day].lower;

  if (variant === "into-day") {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Copiar al {dayLower}</DialogTitle>
            <DialogDescription>Elegí qué día copiar. Las comidas de todos los días no cambian.</DialogDescription>
          </DialogHeader>
          <RadioGroup
            value={source ?? ""}
            onValueChange={(value) => setSource(value as Weekday)}
            aria-label="Día a copiar"
            className="gap-1"
          >
            {sources.map((d) => (
              <label key={d} htmlFor={`${id}-${d}`} className={rowClass}>
                <RadioGroupItem id={`${id}-${d}`} value={d} />
                <span className="text-body">{WEEKDAY_LABELS[d].long}</span>
              </label>
            ))}
          </RadioGroup>
          <DialogFooter>
            <Button variant="secondary" size="lg" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              size="lg"
              disabled={!source}
              onClick={() => {
                if (!source) return;
                onOpenChange(false);
                onConfirm(source, [day]);
              }}
            >
              Copiar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  const targets = WEEKDAYS.filter((d) => d !== day);
  const warning = replaceDaysWarning(checked.filter((d) => loadedDays.includes(d)));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Copiar el {dayLower} a…</DialogTitle>
          <DialogDescription>Las comidas de todos los días no cambian.</DialogDescription>
        </DialogHeader>
        <fieldset className="grid gap-1">
          <legend className="sr-only">Días de destino</legend>
          {targets.map((d) => {
            const isChecked = checked.includes(d);
            return (
              <label key={d} htmlFor={`${id}-${d}`} className={rowClass}>
                <Checkbox
                  id={`${id}-${d}`}
                  checked={isChecked}
                  onCheckedChange={(value) =>
                    setChecked((prev) => (value === true ? [...prev, d] : prev.filter((x) => x !== d)))
                  }
                />
                <span className="flex-1 text-body">{WEEKDAY_LABELS[d].long}</span>
                {loadedDays.includes(d) ? (
                  <span className="text-footnote text-muted-foreground">Ya tiene comidas</span>
                ) : null}
              </label>
            );
          })}
        </fieldset>
        {warning ? <Alert tone="warning">{warning}</Alert> : null}
        <DialogFooter>
          <Button variant="secondary" size="lg" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            size="lg"
            disabled={checked.length === 0}
            onClick={() => {
              onOpenChange(false);
              onConfirm(day, WEEKDAYS.filter((d) => checked.includes(d)));
            }}
          >
            Copiar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
