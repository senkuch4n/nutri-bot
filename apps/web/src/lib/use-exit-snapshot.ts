"use client";

import { useRef } from "react";

/**
 * Devuelve `value` mientras `open` es verdadero y el último valor visto abierto cuando se cierra.
 * Los overlays animados (HU-017a) siguen montados durante la salida: así el contenido no se vacía a
 * mitad del fundido cuando quien los usa limpia su estado al cerrar (p. ej. el turno seleccionado).
 */
export function useExitSnapshot<T>(value: T, open: boolean): T {
  const snapshot = useRef(value);
  if (open) snapshot.current = value;
  return open ? value : snapshot.current;
}
