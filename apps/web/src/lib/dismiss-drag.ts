// Máquina de estados del gesto "arrastrar para cerrar" (HU-017a §9.8), sin React ni Motion: la usa
// `components/primitives/use-dismiss-drag.ts` y se testea con un valor falso (dismiss-drag.test.ts).
import { dragOffset, gestureIntent, resolveDismiss } from "./motion";

export type DismissSide = "left" | "right" | "top" | "bottom";

/** Lo mínimo de un MotionValue que necesita el gesto. */
export type DragValue = {
  get(): number;
  set(v: number): void;
  stop(): void;
  getVelocity(): number;
};

export type DragPointerDown = {
  pointerId: number;
  button: number;
  pointerType: string;
  clientX: number;
  clientY: number;
  /** El pointerdown nació en `[data-sheet-handle]`. */
  fromHandle: boolean;
  /** El pointerdown nació en un input, textarea, select, contenteditable o `[data-sheet-drag-ignore]`. */
  ignored: boolean;
  /** Ancho (laterales) o alto (arriba/abajo) del sheet en px. */
  size: number;
};

export type DragPointerMove = { pointerId: number; clientX: number; clientY: number };

type State = {
  pointerId: number;
  startAxis: number;
  startCross: number;
  startValue: number;
  size: number;
  captured: boolean;
};

/**
 * Reglas (§2, §3, §5, §6, §9, §10):
 * - El pointerdown **no** toca la animación en curso: si el gesto termina siendo un toque o un scroll,
 *   la entrada/salida sigue sola (antes un toque la congelaba a mitad; review HU-017a, punto 1).
 * - Recién cuando el gesto se captura (gana el eje del sheet después de 10 px) se detiene la
 *   animación y el arrastre parte del valor presente: "agarrar en vuelo" (§3).
 * - Solo se arrastra mientras `isEnabled()` (el sheet está presente y `dismissOnDrag`): un gesto que
 *   empieza durante la salida se ignora, y si el sheet se cierra a mitad del arrastre (Esc) el gesto se
 *   abandona y la salida sigue.
 * - Con mouse solo desde el handle (los laterales cierran con X, Esc o clic afuera).
 */
export function createDismissDrag(opts: {
  side: DismissSide;
  value: DragValue;
  handleOnly: boolean;
  isEnabled: () => boolean;
  onDismiss: (velocity: number) => void;
  onRestore: (velocity: number) => void;
}) {
  const { side, value, handleOnly, isEnabled, onDismiss, onRestore } = opts;
  const horizontal = side === "left" || side === "right";
  // +1 si el eje del puntero crece hacia el borde de cierre.
  const sign = side === "right" || side === "bottom" ? 1 : -1;
  let state: State | null = null;

  return {
    /** ¿Hay un arrastre capturado en curso? */
    isDragging: () => state?.captured ?? false,

    down(e: DragPointerDown): void {
      state = null;
      if (!isEnabled() || e.button !== 0 || e.ignored) return;
      if (handleOnly && !e.fromHandle) return;
      if (e.pointerType === "mouse" && !e.fromHandle) return;
      state = {
        pointerId: e.pointerId,
        startAxis: horizontal ? e.clientX : e.clientY,
        startCross: horizontal ? e.clientY : e.clientX,
        startValue: 0,
        size: e.size,
        captured: false,
      };
    },

    /** Devuelve `"capture"` en el movimiento en que el gesto se captura (el llamador hace `setPointerCapture`). */
    move(e: DragPointerMove): "capture" | null {
      const s = state;
      if (!s || e.pointerId !== s.pointerId) return null;
      if (!isEnabled()) {
        state = null; // el sheet se está cerrando: la salida manda
        return null;
      }
      const axis = horizontal ? e.clientX : e.clientY;
      const cross = horizontal ? e.clientY : e.clientX;
      let result: "capture" | null = null;
      if (!s.captured) {
        const intent = gestureIntent((axis - s.startAxis) * sign, cross - s.startCross);
        if (intent === null) return null;
        if (intent === "cross") {
          state = null; // gana el scroll; la animación nunca se tocó
          return null;
        }
        value.stop(); // agarrar en vuelo: desde acá manda el dedo
        s.captured = true;
        s.startAxis = axis; // 1:1 desde este punto, sin salto por la histéresis
        s.startValue = value.get();
        result = "capture";
      }
      const raw = s.startValue + (axis - s.startAxis) * sign;
      value.set(dragOffset(raw, s.size));
      return result;
    },

    /** Fin del gesto. Devuelve `true` si había captura (el llamador libera el puntero). */
    up(e: { pointerId: number }, cancelled: boolean): boolean {
      const s = state;
      if (!s || e.pointerId !== s.pointerId) return false;
      state = null;
      if (!s.captured) return false; // toque: la animación siguió sola
      if (!isEnabled()) return true; // se cerró durante el arrastre: la salida ya está en curso
      const velocity = cancelled ? 0 : value.getVelocity();
      const decision = resolveDismiss({ offset: value.get(), velocity, size: s.size });
      if (decision === "dismiss") onDismiss(velocity);
      else onRestore(velocity);
      return true;
    },
  };
}
