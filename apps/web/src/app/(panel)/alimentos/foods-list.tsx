"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { normalize } from "@nutri-bot/core";
import { FOOD_GROUP_LABELS, FOOD_GROUPS } from "@/lib/food-groups";

export interface FoodRow {
  id: string;
  name: string;
  group: string;
  kcalPer100: string;
  proteinPer100: string;
  carbsPer100: string;
  fatPer100: string;
  active: boolean;
}

export function FoodsList({ foods }: { foods: FoodRow[] }) {
  const [q, setQ] = useState("");
  const [group, setGroup] = useState<string>("");

  const filtered = useMemo(() => {
    const n = normalize(q);
    return foods.filter((f) => {
      if (group && f.group !== group) return false;
      if (n && !normalize(f.name).includes(n)) return false;
      return true;
    });
  }, [foods, q, group]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label htmlFor="food-search" className="sr-only">
          Buscar alimentos
        </label>
        <input
          id="food-search"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar alimento…"
          className="w-full border border-line bg-paper px-3 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-leaf focus:ring-2 focus:ring-leaf/15 sm:max-w-xs"
        />
        <select
          value={group}
          onChange={(e) => setGroup(e.target.value)}
          className="border border-line bg-paper px-3 py-2.5 text-sm text-ink outline-none focus:border-leaf focus:ring-2 focus:ring-leaf/15"
        >
          <option value="">Todos los grupos</option>
          {FOOD_GROUPS.map((g) => (
            <option key={g} value={g}>
              {FOOD_GROUP_LABELS[g as keyof typeof FOOD_GROUP_LABELS]}
            </option>
          ))}
        </select>
        <span className="whitespace-nowrap text-xs text-ink-faint">
          {filtered.length} de {foods.length}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="border border-dashed border-line bg-paper px-6 py-12 text-center text-sm text-ink-soft">
          Sin resultados.
        </div>
      ) : (
        <div className="overflow-x-auto border border-line bg-paper">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-line text-[11px] uppercase tracking-[0.08em] text-ink-faint">
                <th className="px-4 py-2.5 font-semibold">Alimento</th>
                <th className="px-4 py-2.5 font-semibold">Grupo</th>
                <th className="px-4 py-2.5 text-right font-semibold">Kcal</th>
                <th className="px-4 py-2.5 text-right font-semibold">Prot.</th>
                <th className="px-4 py-2.5 text-right font-semibold">Carb.</th>
                <th className="px-4 py-2.5 text-right font-semibold">Grasas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filtered.map((f) => (
                <tr key={f.id} className={f.active ? "" : "opacity-50"}>
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/alimentos/${f.id}`}
                      className="font-medium text-ink hover:text-leaf-deep"
                    >
                      {f.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-ink-soft">
                    {FOOD_GROUP_LABELS[f.group as keyof typeof FOOD_GROUP_LABELS]}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-ink-soft">
                    {f.kcalPer100}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-ink-soft">
                    {f.proteinPer100}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-ink-soft">
                    {f.carbsPer100}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-ink-soft">
                    {f.fatPer100}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
