// Salida de un sheet que siempre termina (HU-017a, recorrido ronda 2). La salida es una animación de
// Motion que se resuelve con `then`; si no termina nunca (la detuvo otro código, o el navegador dejó de
// dar cuadros: pestaña en segundo plano, ventana tapada), `safeToRemove` no se llamaría y el sheet
// quedaría montado con el foco adentro. Este helper agrega un tope: pasado `timeoutMs` frena la
// animación, deja los valores en su destino y desmonta igual. Puro: se testea con temporizadores falsos.

export type ExitAnimation = { then(onResolve: () => void): unknown; stop(): void };

/** Duración máxima de una salida antes de forzar el desmontaje (springs de ~0,3 s + margen). */
export const SHEET_EXIT_TIMEOUT_MS = 1000;

/**
 * Arranca la salida y garantiza que `onDone` se llame **una sola vez**: al terminar la animación o, si
 * no termina, a los `timeoutMs` (después de `finalize`). Devuelve una función para cancelar si el sheet
 * se reabre a mitad de la salida (en ese caso `onDone` no se llama).
 */
export function runExit(opts: {
  start: () => ExitAnimation;
  finalize: () => void;
  onDone: () => void;
  timeoutMs?: number;
  schedule?: (fn: () => void, ms: number) => unknown;
  clear?: (id: unknown) => void;
}): () => void {
  const {
    start,
    finalize,
    onDone,
    timeoutMs = SHEET_EXIT_TIMEOUT_MS,
    schedule = (fn, ms) => setTimeout(fn, ms),
    clear = (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
  } = opts;
  let settled = false;
  const animation = start();
  const finish = () => {
    if (settled) return;
    settled = true;
    clear(timer);
    onDone();
  };
  const timer = schedule(() => {
    if (settled) return;
    animation.stop();
    finalize();
    finish();
  }, timeoutMs);
  animation.then(finish);
  return () => {
    if (settled) return;
    settled = true;
    clear(timer);
  };
}
