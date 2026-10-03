"use client";

import { createContext, useLayoutEffect, useMemo, useRef, type RefObject } from "react";
import { currentFocusTarget } from "./overlay-focus";

/**
 * Lo que el Root de Dialog, AlertDialog y Sheet recuerda de la última apertura (HU-017a, review
 * ronda 2): el elemento que tenía el foco (para devolvérselo al cerrar aunque no sea un `Trigger` de
 * Radix) y el instante de la apertura (para ignorar interacciones "afuera" que empezaron antes, p. ej.
 * el toque que reabrió el overlay durante su salida).
 */
export type OverlayOpenInfo = {
  returnFocus: RefObject<HTMLElement | null>;
  openedAt: RefObject<number>;
};

export const OverlayOpenInfoContext = createContext<OverlayOpenInfo | null>(null);

/**
 * Se actualiza al pasar `open` a `true`, en un efecto de layout del Root: corre antes del efecto del
 * `FocusScope` de Radix que mueve el foco adentro del overlay.
 */
export function useOverlayOpenInfo(open: boolean): OverlayOpenInfo {
  const returnFocus = useRef<HTMLElement | null>(null);
  const openedAt = useRef(0);
  useLayoutEffect(() => {
    if (!open) return;
    returnFocus.current = currentFocusTarget();
    openedAt.current = performance.now();
  }, [open]);
  return useMemo(() => ({ returnFocus, openedAt }), []);
}
