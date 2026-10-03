"use client";

import { useEffect, useId, useState } from "react";
import { WEEKDAYS, WEEKDAY_LABELS, type Weekday } from "@nutri-bot/core";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/primitives/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/primitives/radio-group";
import { Alert, Button } from "@/components/ui";
import { deleteOtherDaysWarning } from "./labels";

/**
 * HU-018b (SDD 7.4): pasar una comida "Cambia cada día" a "Igual todos los días". Una sola pregunta:
 * qué día conservar (por defecto el lunes). Cada opción dice cuántos ítems tiene ese día.
 */
export function MealModeDialog({
  open,
  onOpenChange,
  mealName,
  itemCountByDay,
  defaultDay = "MON",
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mealName: string;
  itemCountByDay: Record<Weekday, number>;
  defaultDay?: Weekday;
  onConfirm: (keepWeekday: Weekday) => void;
}) {
  const [keep, setKeep] = useState<Weekday>(defaultDay);
  const id = useId();
  useEffect(() => {
    if (open) setKeep(defaultDay);
  }, [open, defaultDay]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>¿Qué día conservar?</DialogTitle>
          <DialogDescription>
            {mealName} va a ser igual todos los días, con lo que tiene el día que elijas.
          </DialogDescription>
        </DialogHeader>
        <RadioGroup
          value={keep}
          onValueChange={(value) => setKeep(value as Weekday)}
          aria-label="Día a conservar"
          className="gap-1"
        >
          {WEEKDAYS.map((day) => {
            const count = itemCountByDay[day];
            const itemId = `${id}-${day}`;
            return (
              <label
                key={day}
                htmlFor={itemId}
                className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-3 hover:bg-overlay-hover has-[[data-state=checked]]:bg-primary-soft"
              >
                <RadioGroupItem id={itemId} value={day} />
                <span className="flex-1 text-body">{WEEKDAY_LABELS[day].long}</span>
                <span className="text-footnote tabular-nums text-muted-foreground">
                  {count === 0 ? "vacío" : `${count} ítem${count === 1 ? "" : "s"}`}
                </span>
              </label>
            );
          })}
        </RadioGroup>
        <Alert tone="warning">{deleteOtherDaysWarning(mealName)}</Alert>
        <DialogFooter>
          <Button variant="secondary" size="lg" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            size="lg"
            onClick={() => {
              onOpenChange(false);
              onConfirm(keep);
            }}
          >
            Cambiar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
