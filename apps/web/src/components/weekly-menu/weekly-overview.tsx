"use client";

import {
  WEEKDAYS,
  WEEKDAY_LABELS,
  compareToTarget,
  computeWeeklyTotals,
  formatTargetStatus,
  itemsForDay,
  summarizeDayStatus,
  type MacroTarget,
  type Macros,
  type Weekday,
} from "@nutri-bot/core";
import type { MealItemView, MealView } from "@/components/meals-editor";
import { Badge, Card } from "@/components/ui";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/primitives/table";
import { cn } from "@/lib/utils";
import { itemLabel } from "./labels";

const integer = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });
const MAX_NAMES = 3;

/** "Té · Tostada · Queso" o "Té · Tostada · Queso +2"; "—" si no hay nada. */
function namesOf(items: readonly MealItemView[]): string {
  if (items.length === 0) return "—";
  const shown = items.slice(0, MAX_NAMES).map(itemLabel).join(" · ");
  return items.length > MAX_NAMES ? `${shown} +${items.length - MAX_NAMES}` : shown;
}

const cellButton =
  "flex min-h-11 w-full items-start rounded-md px-2 py-1.5 text-left text-footnote transition-colors duration-hover hover:bg-overlay-hover pressed:bg-overlay-pressed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

function DayStatus({ day, loaded, target }: { day: Macros; loaded: boolean; target: MacroTarget | null }) {
  if (!loaded) return <span className="text-footnote text-muted-foreground">Sin cargar</span>;
  return (
    <span className="block">
      <span className="block font-semibold tabular-nums">{integer.format(day.kcal)} kcal</span>
      {target ? <span className="block text-footnote text-muted-foreground">{summarizeDayStatus(day, target)}</span> : null}
    </span>
  );
}

/**
 * HU-018b (SDD 7.5): vista "Semana", de solo lectura. Escritorio: tabla comidas × días (las comidas
 * "Todos los días" ocupan los 7 días). Celular: una tarjeta por día. Tocar una celda lleva a ese día con
 * esa comida a la vista.
 */
export function WeeklyOverview({
  meals,
  target,
  onSelect,
}: {
  meals: MealView[];
  target: MacroTarget | null;
  onSelect: (day: Weekday, mealId: string | null) => void;
}) {
  const weekly = computeWeeklyTotals(meals);
  const average = weekly.weeklyAverage;

  return (
    <div className="space-y-6">
      {/* Escritorio */}
      <Card padding="none" className="hidden overflow-hidden md:block">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead className="w-32">Comida</TableHead>
              {WEEKDAYS.map((day) => (
                <TableHead key={day} scope="col">
                  <abbr title={WEEKDAY_LABELS[day].long} className="no-underline">
                    {WEEKDAY_LABELS[day].short}
                  </abbr>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {meals.map((meal) => (
              <TableRow key={meal.id} className="hover:bg-transparent">
                <TableHead scope="row" className="h-auto py-2 align-top text-callout font-semibold text-foreground">
                  {meal.name}
                </TableHead>
                {meal.mode === "EVERY_DAY" ? (
                  <TableCell colSpan={7} className="px-1 py-1 align-top">
                    <button
                      type="button"
                      className={cn(cellButton, "flex-wrap gap-x-2 gap-y-1")}
                      onClick={() => onSelect("MON", meal.id)}
                      aria-label={`${meal.name}, todos los días: ${namesOf(meal.items)}. Ir a editar`}
                    >
                      <Badge>Todos los días</Badge>
                      {meal.isOptions ? <span className="font-semibold">Elegí una:</span> : null}
                      <span className="min-w-0">{namesOf(meal.items)}</span>
                    </button>
                  </TableCell>
                ) : (
                  WEEKDAYS.map((day) => {
                    const names = namesOf(itemsForDay(meal, day));
                    return (
                      <TableCell key={day} className="px-1 py-1 align-top">
                        <button
                          type="button"
                          className={cn(cellButton, names === "—" && "text-muted-foreground")}
                          onClick={() => onSelect(day, meal.id)}
                          aria-label={`${meal.name} del ${WEEKDAY_LABELS[day].lower}: ${names === "—" ? "vacío" : names}. Ir a ese día`}
                        >
                          <span className="line-clamp-4 break-words">{names}</span>
                        </button>
                      </TableCell>
                    );
                  })
                )}
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow className="hover:bg-transparent">
              <TableHead scope="row" className="h-auto py-2 align-top text-callout font-semibold text-foreground">
                Total
              </TableHead>
              {WEEKDAYS.map((day) => (
                <TableCell key={day} className="px-3 py-2 align-top text-footnote">
                  <DayStatus day={weekly.days[day].macros} loaded={weekly.days[day].loaded} target={target} />
                </TableCell>
              ))}
            </TableRow>
          </TableFooter>
        </Table>
      </Card>

      {/* Celular: una tarjeta por día */}
      <ul className="space-y-3 md:hidden">
        {WEEKDAYS.map((day) => (
          <li key={day}>
            <Card padding="none" className="overflow-hidden">
              <div className="flex items-baseline justify-between gap-3 border-b px-4 py-3">
                <h3 className="text-headline">{WEEKDAY_LABELS[day].long}</h3>
                <span className="text-right">
                  <DayStatus day={weekly.days[day].macros} loaded={weekly.days[day].loaded} target={target} />
                </span>
              </div>
              <ul className="divide-y">
                {meals.map((meal) => {
                  const names = namesOf(itemsForDay(meal, day));
                  return (
                    <li key={meal.id}>
                      <button
                        type="button"
                        onClick={() => onSelect(day, meal.id)}
                        className="flex min-h-11 w-full items-baseline justify-between gap-3 px-4 py-2 text-left text-callout hover:bg-overlay-hover pressed:bg-overlay-pressed focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                      >
                        <span className="shrink-0 font-semibold">{meal.name}</span>
                        <span className={cn("min-w-0 text-right text-footnote", names === "—" && "text-muted-foreground")}>
                          {meal.isOptions && names !== "—" ? `Elegí una: ${names}` : names}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Card>
          </li>
        ))}
      </ul>

      <Card title="Promedio diario de la semana">
        {average ? (
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {(
              [
                { key: "kcal", label: "Energía", unit: "kcal" },
                { key: "protein", label: "Proteínas", unit: "g" },
                { key: "carbs", label: "Carbohidratos", unit: "g" },
                { key: "fat", label: "Grasas", unit: "g" },
              ] as const
            ).map((cell) => {
              const status = target ? compareToTarget(average[cell.key], target[cell.key]) : null;
              return (
                <div key={cell.key}>
                  <dt className="text-subheadline text-muted-foreground">{cell.label}</dt>
                  <dd className="mt-0.5 text-headline tabular-nums">
                    {integer.format(average[cell.key])} {cell.unit}
                    {target ? (
                      <span className="block text-footnote font-normal text-muted-foreground">
                        de {integer.format(target[cell.key])} {cell.unit}
                        {status ? ` · ${formatTargetStatus(status, cell.unit)}` : ""}
                      </span>
                    ) : null}
                  </dd>
                </div>
              );
            })}
          </dl>
        ) : (
          <p className="text-callout text-muted-foreground">Todavía no hay días cargados.</p>
        )}
      </Card>
    </div>
  );
}
