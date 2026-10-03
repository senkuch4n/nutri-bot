"use client";

import { useState } from "react";
import { WEEKDAY_LABELS, itemsForDay, type Macros, type Weekday } from "@nutri-bot/core";
import type { MealItemView, MealView } from "@/components/meals-editor";
import { MacroTotals } from "@/components/macro-totals";
import { Badge, Card, Quantity } from "@/components/ui";
import { DaySelector } from "@/components/weekly-menu/day-selector";

/** Lista de ítems de una comida en el portal (la usan la vista por día y la de siempre). */
export function PortalMealItems({ items }: { items: MealItemView[] }) {
  return (
    <ul className="-my-3 divide-y">
      {items.map((item) => (
        <li key={item.id} className="flex items-baseline justify-between gap-4 py-3 text-sm">
          <span className="min-w-0 break-words">{item.foodName ?? item.customLabel ?? "—"}</span>
          {item.quantityGrams ? (
            <Quantity
              value={Number(item.quantityGrams)}
              unit="g"
              decimals={1}
              className="shrink-0 text-muted-foreground"
            />
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/**
 * HU-018b: plan semanal en el portal. Pestañas Lun…Dom con hoy seleccionado (en la zona de la
 * profesional), el total del día y las comidas que valen ese día: las que cambian cada día y las de
 * "Todos los días" (con su marca; las de opciones con "Elegí una"). Cambiar de día es instantáneo:
 * todos los ítems ya llegaron.
 */
export function PortalDayView({
  meals,
  today,
  dayTotals,
  loadedDays,
}: {
  meals: MealView[];
  today: Weekday;
  dayTotals: Record<Weekday, Macros>;
  loadedDays: Weekday[];
}) {
  const [day, setDay] = useState<Weekday>(today);
  const dayMeals = meals
    .map((meal) => ({ meal, items: itemsForDay(meal, day) }))
    .filter(({ items }) => items.length > 0);

  return (
    <div className="space-y-6">
      <DaySelector
        value={day}
        onValueChange={(next) => {
          if (next !== "WEEK") setDay(next);
        }}
        includeWeek={false}
        loadedDays={loadedDays}
        aria-label="Día del plan"
      />

      <MacroTotals totals={dayTotals[day]} label={`Total del ${WEEKDAY_LABELS[day].lower}`} />

      {dayMeals.length === 0 ? (
        <Card>
          <p className="text-pretty text-sm text-muted-foreground">
            El {WEEKDAY_LABELS[day].lower} todavía no tiene comidas cargadas.
          </p>
        </Card>
      ) : null}

      {dayMeals.map(({ meal, items }) => (
        <Card
          key={meal.id}
          title={meal.name}
          actions={meal.mode === "EVERY_DAY" ? <Badge>Todos los días</Badge> : undefined}
        >
          {meal.isOptions ? (
            <p className="mb-4 text-subheadline font-semibold text-muted-foreground">Elegí una</p>
          ) : null}
          <PortalMealItems items={items} />
        </Card>
      ))}
    </div>
  );
}
