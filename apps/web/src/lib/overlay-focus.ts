// Foco al cerrar un overlay animado (HU-017a, review punto 2). Durante la salida el scrim ya no bloquea
// la página: si el usuario tocó o tabuló a otro elemento mientras el overlay salía, Radix no tiene que
// devolverle el foco al disparador al desmontar (le "robaría" el foco a lo que eligió).

/** ¿El foco está en algo que el usuario eligió fuera del overlay (no en body ni en el propio overlay)? */
export function shouldKeepUserFocus(
  active: Element | null,
  doc: { body: Element | null; documentElement: Element | null },
  overlay?: { contains(node: Element): boolean } | null,
): boolean {
  if (!active || active === doc.body || active === doc.documentElement) return false;
  if (overlay?.contains(active)) return false;
  return true;
}

/**
 * Envuelve `onCloseAutoFocus` de Radix: primero el del consumidor; si no lo previno y el foco ya está
 * en otro elemento elegido por el usuario, se previene la devolución automática al disparador.
 */
export function preserveUserFocusOnClose<E extends Event>(
  handler: ((event: E) => void) | undefined,
  getOverlay?: () => { contains(node: Element): boolean } | null,
): (event: E) => void {
  return (event) => {
    handler?.(event);
    if (event.defaultPrevented || typeof document === "undefined") return;
    if (shouldKeepUserFocus(document.activeElement, document, getOverlay?.())) event.preventDefault();
  };
}

/**
 * Estado de accesibilidad del contenido de un overlay según su presencia (lo usa `ExitFocusGuard`):
 * saliendo → `inert` y, si el foco estaba adentro, `blur()`; presente otra vez (se reabrió a mitad de
 * la salida: `AnimatePresence` re-presenta la misma instancia) → se quita `inert`.
 */
export function applyExitGuard(
  container: { inert: boolean; contains(node: Element): boolean },
  isPresent: boolean,
  active: (Element & { blur?: () => void }) | null,
): void {
  if (isPresent) {
    container.inert = false;
    return;
  }
  if (active && container.contains(active)) active.blur?.();
  container.inert = true;
}
