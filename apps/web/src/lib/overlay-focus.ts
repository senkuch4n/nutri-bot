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
 * Devuelve el foco a `target` si quedó en `body`/`html` (nadie lo tomó) y `target` sigue en el
 * documento. Devuelve `true` si lo movió.
 */
export function restoreFocus(
  target: { isConnected: boolean; focus(): void } | null,
  doc: { activeElement: Element | null; body: Element | null; documentElement: Element | null },
): boolean {
  if (!target || !target.isConnected) return false;
  const active = doc.activeElement;
  if (active && active !== doc.body && active !== doc.documentElement) return false;
  target.focus();
  return true;
}

/** Elemento con foco en este momento, si es uno real (no `body`): lo que abrió el overlay. */
export function currentFocusTarget(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  const active = document.activeElement;
  return active instanceof HTMLElement && active !== document.body ? active : null;
}

/**
 * Envuelve `onCloseAutoFocus` de Radix:
 * 1. Corre el del consumidor.
 * 2. Si el foco ya está en otro elemento elegido por el usuario (durante la salida), se previene la
 *    devolución automática al disparador.
 * 3. Si no, después de Radix (que enfoca su `Trigger`, si hay uno) y si el foco quedó en `body`, lo
 *    devuelve a `returnTo()`: el elemento que tenía el foco al abrir. Así vuelve al botón que abrió el
 *    overlay aunque no sea un `Trigger` de Radix (overlays controlados: `Modal`, `useConfirm`, un sheet
 *    abierto con `setOpen`). Review HU-017a ronda 2, punto 2.
 */
export function preserveUserFocusOnClose<E extends Event>(
  handler: ((event: E) => void) | undefined,
  opts?: {
    returnTo?: () => { isConnected: boolean; focus(): void } | null;
    schedule?: (fn: () => void) => void;
  },
): (event: E) => void {
  return (event) => {
    handler?.(event);
    if (typeof document === "undefined") return;
    if (!event.defaultPrevented && shouldKeepUserFocus(document.activeElement, document)) {
      event.preventDefault();
      return;
    }
    const target = opts?.returnTo?.() ?? null;
    if (!target) return;
    const schedule = opts?.schedule ?? ((fn: () => void) => queueMicrotask(fn));
    schedule(() => restoreFocus(target, document));
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

/**
 * ¿La interacción "afuera" que informa Radix empezó antes de la última apertura? Pasa al reabrir un
 * overlay durante su salida: en táctil Radix despacha el "pointerdown afuera" recién en el `click`,
 * cuando el overlay ya se reabrió por ese mismo toque, y lo volvería a cerrar.
 */
export function startedBeforeOpen(originalEventTimeStamp: number | undefined, openedAt: number): boolean {
  return typeof originalEventTimeStamp === "number" && originalEventTimeStamp < openedAt;
}

/** Envuelve `onPointerDownOutside`/`onInteractOutside` de Radix con `startedBeforeOpen`. */
export function ignoreOutsideBeforeOpen<E extends CustomEvent<{ originalEvent: Event }>>(
  handler: ((event: E) => void) | undefined,
  getOpenedAt: () => number,
): (event: E) => void {
  return (event) => {
    if (startedBeforeOpen(event.detail?.originalEvent?.timeStamp, getOpenedAt())) {
      event.preventDefault();
      return;
    }
    handler?.(event);
  };
}
