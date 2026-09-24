"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { foodSearchText } from "@nutri-bot/core";

export interface FoodOption {
  id: string;
  name: string;
  group: string;
  source: "SARA2" | "PROPIO";
}

export type CatalogFood = FoodOption & { searchText: string };

const FoodCatalogContext = createContext<{ foods: CatalogFood[] }>({ foods: [] });

/**
 * Recibe el catálogo UNA sola vez por página (así la lista viaja una vez al cliente aunque haya
 * varias comidas) y lo comparte con los FoodPicker por contexto.
 */
export function FoodCatalogProvider({ foods, children }: { foods: FoodOption[]; children: ReactNode }) {
  const value = useMemo(
    () => ({ foods: foods.map((f) => ({ ...f, searchText: foodSearchText(f.name) })) }),
    [foods],
  );
  return <FoodCatalogContext.Provider value={value}>{children}</FoodCatalogContext.Provider>;
}

export function useFoodCatalog() {
  return useContext(FoodCatalogContext);
}
