"use client";

import { useId, useState } from "react";
import { atwaterBreakdown, formatKcalOneDecimal, kcalDiffersFromAtwater } from "@nutri-bot/core";
import { NumberInput } from "@/components/number-input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/primitives/table";
import { Card } from "@/components/ui";

const grams = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });
const oneDecimal = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 });

/** Energía cada 100 g con el desglose de Atwater y una calculadora de porción. */
export function FoodEnergyCard({
  protein,
  carbs,
  fat,
  alcohol,
  kcalPer100,
  kcalPublished,
}: {
  protein: number;
  carbs: number;
  fat: number;
  alcohol: number | null;
  kcalPer100: number;
  kcalPublished: number | null;
}) {
  const [portion, setPortion] = useState("100");
  const portionId = useId();
  const parsed = Number(portion.replace(",", "."));
  const portionGrams = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  const macros = { protein, carbs, fat, alcohol };
  const breakdown = atwaterBreakdown(macros, portionGrams);
  const isDefault = portionGrams === 100;
  const differs = kcalDiffersFromAtwater(kcalPer100, macros);
  const storedForPortion = (kcalPer100 * portionGrams) / 100;

  return (
    <Card title="Energía" description="Cada 100 g · 4 kcal/g proteínas y carbohidratos, 9 grasas, 7 alcohol">
      <p className="text-3xl font-semibold tabular-nums">{formatKcalOneDecimal(kcalPer100)}</p>
      {kcalPublished !== null ? (
        <p className="mt-1 text-sm text-muted-foreground">
          La tabla publica {oneDecimal.format(kcalPublished)} kcal
        </p>
      ) : null}

      <div className="mt-6">
        <h3 className="mb-2 text-sm font-medium" aria-live="polite">
          {isDefault ? "Cada 100 g" : `Porción de ${grams.format(portionGrams)} g`}
        </h3>
        <Table>
          <caption className="sr-only">Desglose de las kcal por nutriente</caption>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Nutriente</TableHead>
              <TableHead numeric>Gramos</TableHead>
              <TableHead numeric>Factor</TableHead>
              <TableHead numeric>kcal</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {breakdown.parts.map((p) => (
              <TableRow key={p.key}>
                <TableCell>{p.label}</TableCell>
                <TableCell numeric>{grams.format(Math.round(p.grams * 100) / 100)} g</TableCell>
                <TableCell numeric>× {p.factor}</TableCell>
                <TableCell numeric>{oneDecimal.format(p.kcal)}</TableCell>
              </TableRow>
            ))}
            <TableRow className="font-semibold hover:bg-transparent">
              <TableCell>Total</TableCell>
              <TableCell />
              <TableCell />
              <TableCell numeric>{oneDecimal.format(breakdown.totalKcal)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
        {differs ? (
          <p className="mt-2 text-sm text-muted-foreground">
            El desglose suma {oneDecimal.format(breakdown.totalKcal)} kcal; el alimento tiene cargadas{" "}
            {oneDecimal.format(Math.round(storedForPortion * 10) / 10)}.
          </p>
        ) : null}
      </div>

      <div className="mt-6 max-w-[12rem]">
        <label htmlFor={portionId} className="mb-1.5 block text-sm font-medium">
          Calcular porción
        </label>
        <NumberInput
          id={portionId}
          unit="g"
          min="0"
          step="1"
          value={portion}
          onChange={(e) => setPortion(e.target.value)}
        />
      </div>
    </Card>
  );
}
