"use client";

import { useCallback, useMemo, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { animate, useMotionValue, type MotionValue } from "motion/react";
import { dragOffset, fades, gestureIntent, resolveDismiss, springs } from "@/lib/motion";

type Side = "left" | "right" | "top" | "bottom";

type DragState = {
  pointerId: number;
  startAxis: number;
  startCross: number;
  startValue: number;
  size: number;
  captured: boolean;
};

const IGNORE = "input, textarea, select, [contenteditable], [contenteditable=''], [data-sheet-drag-ignore]";

/**
 * Arrastrar para cerrar un sheet (HU-017a §9.8). `value` es el desplazamiento en px **hacia el borde
 * por donde se cierra** (0 = abierto, `size` = afuera). Sigue al dedo 1:1 respetando el punto de
 * agarre (§2), toma el valor presente si el sheet estaba animando (§3), espera 10 px de histéresis y
 * bloquea el eje (§10), resiste hacia adentro con rubber-band (§9) y al soltar decide con la velocidad
 * y la proyección de momentum (§5, §6).
 *
 * Con mouse solo se arrastra desde el handle (sheets inferiores): en los laterales el mouse cierra con
 * la X, Esc o el clic afuera (§16 Flexibility; no rompe la selección de texto en formularios).
 */
export function useDismissDrag(opts: {
  side: Side;
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
  const { side, enabled, onDismiss, handleOnly, reducedMotion = false } = opts;
  const value = useMotionValue(0);
  const drag = useRef<DragState | null>(null);
  const horizontal = side === "left" || side === "right";
  // +1 si el eje del puntero crece hacia el borde de cierre.
  const sign = side === "right" || side === "bottom" ? 1 : -1;

  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  const finish = useCallback(
    (e: ReactPointerEvent<HTMLElement>, cancelled: boolean) => {
      const state = drag.current;
      drag.current = null;
      if (!state?.captured) return;
      if (e.currentTarget.hasPointerCapture?.(state.pointerId)) e.currentTarget.releasePointerCapture(state.pointerId);
      const velocity = cancelled ? 0 : value.getVelocity();
      const decision = resolveDismiss({ offset: value.get(), velocity, size: state.size });
      if (decision === "dismiss") onDismissRef.current(velocity);
      else animate(value, 0, reducedMotion ? fades.fast : { ...springs.fling, velocity });
    },
    [value, reducedMotion],
  );

  const handlers = useMemo(
    () => ({
      onPointerDown(e: ReactPointerEvent<HTMLElement>) {
        if (!enabled || e.button !== 0) return;
        const target = e.target as Element;
        const fromHandle = Boolean(target.closest("[data-sheet-handle]"));
        if (handleOnly && !fromHandle) return;
        if (e.pointerType === "mouse" && !fromHandle) return;
        if (target.closest(IGNORE)) return;
        value.stop(); // agarrar en vuelo
        const rect = e.currentTarget.getBoundingClientRect();
        drag.current = {
          pointerId: e.pointerId,
          startAxis: horizontal ? e.clientX : e.clientY,
          startCross: horizontal ? e.clientY : e.clientX,
          startValue: value.get(),
          size: horizontal ? rect.width : rect.height,
          captured: false,
        };
      },
      onPointerMove(e: ReactPointerEvent<HTMLElement>) {
        const state = drag.current;
        if (!state || e.pointerId !== state.pointerId) return;
        const axis = horizontal ? e.clientX : e.clientY;
        const cross = horizontal ? e.clientY : e.clientX;
        if (!state.captured) {
          const intent = gestureIntent((axis - state.startAxis) * sign, cross - state.startCross);
          if (intent === null) return;
          if (intent === "cross") {
            drag.current = null; // gana el scroll
            return;
          }
          state.captured = true;
          state.startAxis = axis; // desde acá 1:1, sin salto por la histéresis
          e.currentTarget.setPointerCapture(e.pointerId);
        }
        const raw = state.startValue + (axis - state.startAxis) * sign;
        value.set(dragOffset(raw, state.size));
      },
      onPointerUp(e: ReactPointerEvent<HTMLElement>) {
        finish(e, false);
      },
      onPointerCancel(e: ReactPointerEvent<HTMLElement>) {
        finish(e, true);
      },
    }),
    [enabled, handleOnly, horizontal, sign, value, finish],
  );

  return { value, handlers, style: { touchAction: horizontal ? "pan-y" : "auto" } };
}
