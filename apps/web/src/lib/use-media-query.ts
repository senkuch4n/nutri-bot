"use client";

import { useCallback, useSyncExternalStore } from "react";

/** ¿Coincide la media query? En el servidor (y en la hidratación) devuelve `serverDefault ?? false`. */
export function useMediaQuery(query: string, serverDefault?: boolean): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => serverDefault ?? false,
  );
}
