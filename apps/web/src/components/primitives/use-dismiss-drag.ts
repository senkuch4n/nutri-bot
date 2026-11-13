"use client";

import { useMemo, useRef, type PointerEvent as ReactPointerEvent } from "react";
// `animateSingleValue` (y no `animate`): anima un MotionValue sin arrastrar el animador de elementos
// del DOM al bundle inicial (review HU-017a, peso).
import { animateSingleValue, useMotionValue, type MotionValue } from "motion/react";
import { createDismissDrag, type DismissSide } from "@/lib/dismiss-drag";
import { fades, springs } from "@/lib/motion";

const IGNORE = "input, textarea, select, [contenteditable], [contenteditable=''], [data-sheet-drag-ignore]";

/**
 * Arrastrar para cerrar un sheet (HU-017a §9.8). `value` es el desplazamiento en px **hacia el borde
 * por donde se cierra** (0 = abierto, `size` = afuera). La lógica del gesto vive en
 * `lib/dismiss-drag.ts`: sigue al dedo 1:1 respetando el punto de agarre (§2), toma el valor presente
 * recién cuando el gesto se captura (§3; un toque o un scroll no frenan la entrada ni la salida),
 * espera 10 px de histéresis y bloquea el eje (§10), resiste hacia adentro con rubber-band (§9) y al
 * soltar decide con la velocidad y la proyección de momentum (§5, §6).
 *
 * `enabled` tiene que ser `false` mientras el sheet sale: los gestos que empiecen ahí se ignoran.
 * Con mouse solo se arrastra desde el handle (sheets inferiores).
 */
export function useDismissDrag(opts: {
  side: DismissSide;
  enabled: boolean;
  onDismiss: (velocity: number) => void;
  handleOnly: boolean;
  /** Movimiento reducido: el arrastre sigue 1:1, pero el regreso es un fundido corto. */
  reducedMotion?: boolean;
}): {
  value: MotionValue<number>;
  handlers: {
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void;
    onPointerMove: (e: ReactPointerEvent<HTMLElement>) => void;
    onPointerUp: (e: ReactPointerEvent<HTMLElement>) => void;
    onPointerCancel: (e: ReactPointerEvent<HTMLElement>) => void;
  };
  style: { touchAction: string };
} {
  const { side, handleOnly } = opts;
  const value = useMotionValue(0);
  // Lo que cambia entre renders se lee por ref: el controlador se crea una sola vez por lado.
  const latest = useRef(opts);
  latest.current = opts;
  const horizontal = side === "left" || side === "right";

  const handlers = useMemo(() => {
    const drag = createDismissDrag({
      side,
      value,
      handleOnly,
      isEnabled: () => latest.current.enabled,
      onDismiss: (velocity) => latest.current.onDismiss(velocity),
      onRestore: (velocity) => {
        animateSingleValue(value, 0, latest.current.reducedMotion ? fades.fast : { ...springs.fling, velocity });
      },
    });
    const release = (e: ReactPointerEvent<HTMLElement>) => {
      if (e.currentTarget.hasPointerCapture?.(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    };
    return {
      onPointerDown(e: ReactPointerEvent<HTMLElement>) {
        const target = e.target as Element;
        const rect = e.currentTarget.getBoundingClientRect();
        drag.down({
          pointerId: e.pointerId,
          button: e.button,
          pointerType: e.pointerType,
          clientX: e.clientX,
          clientY: e.clientY,
          fromHandle: Boolean(target.closest("[data-sheet-handle]")),
          ignored: Boolean(target.closest(IGNORE)),
          size: horizontal ? rect.width : rect.height,
        });
      },
      onPointerMove(e: ReactPointerEvent<HTMLElement>) {
        if (drag.move({ pointerId: e.pointerId, clientX: e.clientX, clientY: e.clientY }) === "capture") {
          e.currentTarget.setPointerCapture(e.pointerId);
        }
      },
      onPointerUp(e: ReactPointerEvent<HTMLElement>) {
        if (drag.up({ pointerId: e.pointerId }, false)) release(e);
      },
      onPointerCancel(e: ReactPointerEvent<HTMLElement>) {
        if (drag.up({ pointerId: e.pointerId }, true)) release(e);
      },
    };
  }, [side, handleOnly, horizontal, value]);

  return { value, handlers, style: { touchAction: horizontal ? "pan-y" : "auto" } };
}
