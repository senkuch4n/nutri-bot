"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { foodSearchText } from "@nutri-bot/core";
import type { FoodMeasureView } from "@/components/food-measures/types";

export interface FoodOption {
  id: string;
  name: string;
  group: string;
  source: "SARA2" | "PROPIO";
  /** HU-018d: para la vista previa del cuadro de medida casera ("… = 180 g · 234 kcal"). */
  kcalPer100?: number;
}

export type CatalogFood = FoodOption & { searchText: string };

const NO_MEASURES: FoodMeasureView[] = [];

interface FoodCatalogValue {
  foods: CatalogFood[];
  /** HU-018d: medidas caseras del alimento, en orden (la primera es la que se propone, D13). */
  measuresFor: (foodId: string) => FoodMeasureView[];
  /** HU-018d: suma la medida recién creada desde el editor (estado local, sin recargar). */
  addMeasure: (foodId: string, measure: FoodMeasureView) => void;
}

const FoodCatalogContext = createContext<FoodCatalogValue>({
  foods: [],
  measuresFor: () => NO_MEASURES,
  addMeasure: () => {},
});

/**
 * Recibe el catálogo UNA sola vez por página (así la lista viaja una vez al cliente aunque haya
 * varias comidas) y lo comparte con los FoodPicker por contexto. HU-018d: también las medidas
 * caseras de los alimentos (solo los que tienen), más las que se creen desde el editor.
 */
export function FoodCatalogProvider({
  foods,
  measures,
  children,
}: {
  foods: FoodOption[];
  measures?: Record<string, FoodMeasureView[]>;
  children: ReactNode;
}) {
  const catalog = useMemo(() => foods.map((f) => ({ ...f, searchText: foodSearchText(f.name) })), [foods]);
  const [added, setAdded] = useState<Record<string, FoodMeasureView[]>>({});

  const measuresFor = useCallback(
    (foodId: string) => {
      const base = measures?.[foodId] ?? NO_MEASURES;
      const extra = (added[foodId] ?? NO_MEASURES).filter((m) => !base.some((b) => b.id === m.id));
      return extra.length === 0 ? base : [...base, ...extra];
    },
    [measures, added],
  );
  const addMeasure = useCallback((foodId: string, measure: FoodMeasureView) => {
    setAdded((prev) => ({ ...prev, [foodId]: [...(prev[foodId] ?? []).filter((m) => m.id !== measure.id), measure] }));
  }, []);

  const value = useMemo(() => ({ foods: catalog, measuresFor, addMeasure }), [catalog, measuresFor, addMeasure]);
  return <FoodCatalogContext.Provider value={value}>{children}</FoodCatalogContext.Provider>;
}

export function useFoodCatalog() {
  return useContext(FoodCatalogContext);
}
