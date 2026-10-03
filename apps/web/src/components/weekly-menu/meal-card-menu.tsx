"use client";

import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, CalendarDays, CalendarRange, MoreHorizontal, Pencil, Repeat, Trash2 } from "lucide-react";
import { WEEKDAYS, WEEKDAY_LABELS, type Weekday } from "@nutri-bot/core";
import type { MealOwnerKind } from "@nutri-bot/db/domain";
import type { MealView } from "@/components/meals-editor";
import { useConfirm } from "@/components/confirm";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/primitives/dropdown-menu";
import { Button } from "@/components/primitives/button";
import {
  moveMealAction,
  renameMealAction,
  repeatMealAction,
  setMealModeAction,
  setMealOptionsAction,
} from "@/app/(panel)/weekly-menu-actions";
import { agreeWithMeal, lowerMealName, replaceDaysWarning, withArticle } from "./labels";
import { MealModeDialog } from "./meal-mode-dialog";
import { RenameMealDialog } from "./rename-meal-dialog";
import { useMenuUndo } from "./use-menu-undo";

const itemClass = "h-11 [@media(pointer:coarse)]:h-11";

/**
 * HU-018b (SDD 7.4): menú "⋯" de una comida. Junta todo lo que no es "Agregar alimento", así cada
 * comida tiene una sola acción principal a la vista. Los cambios que pisan contenido muestran un
 * toast con "Deshacer"; "Repetir" pide confirmación solo si va a reemplazar otros días.
 */
export function MealCardMenu({
  kind,
  ownerId,
  ownerField,
  meal,
  day,
  isFirst,
  isLast,
  deleteMealAction,
  onModeChanged,
}: {
  kind: MealOwnerKind;
  ownerId: string;
  ownerField: "planId" | "templateId";
  meal: MealView;
  /** Día de la pestaña en un plan semanal; null en la lista de un plan no semanal. */
  day: Weekday | null;
  isFirst: boolean;
  isLast: boolean;
  deleteMealAction: (formData: FormData) => Promise<void>;
  onModeChanged?: (mode: MealView["mode"]) => void;
}) {
  const confirm = useConfirm();
  const { pending, run } = useMenuUndo(kind, ownerId);
  const [deleting, startDelete] = useTransition();
  const [modeDialogOpen, setModeDialogOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const busy = pending || deleting;

  const base = { kind, ownerId, mealId: meal.id };
  const itemCountByDay = Object.fromEntries(
    WEEKDAYS.map((d) => [d, meal.items.filter((item) => item.weekday === d).length]),
  ) as Record<Weekday, number>;

  async function repeat(from: Weekday) {
    const others = WEEKDAYS.filter((d) => d !== from && itemCountByDay[d] > 0);
    const dayLower = WEEKDAY_LABELS[from].lower;
    if (others.length > 0) {
      const ok = await confirm({
        title: `¿Repetir ${withArticle(meal.name)} del ${dayLower}?`,
        description: replaceDaysWarning(others, lowerMealName(meal.name)) ?? "",
        confirmLabel: "Repetir",
        destructive: false,
      });
      if (!ok) return;
    }
    run(
      () => repeatMealAction({ ...base, from }),
      `${meal.name} del ${dayLower} ${agreeWithMeal(meal.name, "repetido")} en todos los días`,
    );
  }

  function toPerDay() {
    const message = meal.isOptions
      ? `${meal.name} ahora cambia cada día; ya no es de opciones`
      : `${meal.name} ahora cambia cada día`;
    run(() => setMealModeAction({ ...base, mode: "PER_DAY" }), message, () => onModeChanged?.("PER_DAY"));
  }

  function toEveryDay(keepWeekday: Weekday) {
    run(
      () => setMealModeAction({ ...base, mode: "EVERY_DAY", keepWeekday }),
      `${meal.name} ahora es igual todos los días`,
      () => onModeChanged?.("EVERY_DAY"),
    );
  }

  async function remove() {
    const count = meal.items.length;
    const ok = await confirm({
      title: `¿Borrar la comida «${meal.name}»?`,
      description:
        count > 0
          ? `Se borran también sus ${count} alimento${count === 1 ? "" : "s"}${
              meal.mode === "PER_DAY" ? " de todos los días" : ""
            }. No se puede deshacer.`
          : "No se puede deshacer.",
      confirmLabel: "Borrar comida",
    });
    if (!ok) return;
    const formData = new FormData();
    formData.set("mealId", meal.id);
    formData.set(ownerField, ownerId);
    startDelete(() => deleteMealAction(formData));
  }

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-lg"
            aria-label={`Más acciones de ${meal.name}`}
            aria-busy={busy || undefined}
            disabled={busy}
          >
            <MoreHorizontal aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[15rem]">
          {meal.mode === "PER_DAY" && day ? (
            <DropdownMenuItem className={itemClass} onSelect={() => void repeat(day)}>
              <Repeat aria-hidden />
              Repetir en todos los días
            </DropdownMenuItem>
          ) : null}
          {meal.mode === "EVERY_DAY" ? (
            <DropdownMenuItem className={itemClass} onSelect={toPerDay}>
              <CalendarDays aria-hidden />
              Cambiar a Cambia cada día
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              className={itemClass}
              onSelect={() => {
                // Sin ítems no hay nada que elegir: se cambia directo (con Deshacer igual).
                if (meal.items.length === 0) toEveryDay("MON");
                else setModeDialogOpen(true);
              }}
            >
              <CalendarRange aria-hidden />
              Cambiar a Igual todos los días
            </DropdownMenuItem>
          )}
          {meal.mode === "EVERY_DAY" ? (
            <DropdownMenuCheckboxItem
              className={itemClass}
              checked={meal.isOptions}
              onCheckedChange={(checked) =>
                run(
                  () => setMealOptionsAction({ ...base, isOptions: checked === true }),
                  checked === true ? `${meal.name}: opciones (elige una)` : `${meal.name} ya no es de opciones`,
                )
              }
            >
              Opciones (elige una)
            </DropdownMenuCheckboxItem>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem className={itemClass} onSelect={() => setRenameOpen(true)}>
            <Pencil aria-hidden />
            Renombrar
          </DropdownMenuItem>
          <DropdownMenuItem
            className={itemClass}
            disabled={isFirst}
            onSelect={() => run(() => moveMealAction({ ...base, direction: "up" }), null)}
          >
            <ArrowUp aria-hidden />
            Subir
          </DropdownMenuItem>
          <DropdownMenuItem
            className={itemClass}
            disabled={isLast}
            onSelect={() => run(() => moveMealAction({ ...base, direction: "down" }), null)}
          >
            <ArrowDown aria-hidden />
            Bajar
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className={itemClass} variant="destructive" onSelect={() => void remove()}>
            <Trash2 aria-hidden />
            Borrar comida
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <MealModeDialog
        open={modeDialogOpen}
        onOpenChange={setModeDialogOpen}
        mealName={meal.name}
        itemCountByDay={itemCountByDay}
        defaultDay="MON"
        onConfirm={toEveryDay}
      />
      <RenameMealDialog
        open={renameOpen}
        onOpenChange={setRenameOpen}
        currentName={meal.name}
        onConfirm={(name) => run(() => renameMealAction({ ...base, name }), "Nombre guardado")}
      />
    </>
  );
}
