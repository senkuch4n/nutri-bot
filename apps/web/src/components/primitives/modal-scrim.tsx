"use client"

import * as React from "react"
import { m, useIsPresent, type MotionValue } from "motion/react"

import { fades } from "@/lib/motion"
import { applyExitGuard } from "@/lib/overlay-focus"
import { cn } from "@/lib/utils"

/**
 * Scrim de los overlays modales (Dialog, AlertDialog, Sheet modal), en dos capas (HU-017a, review
 * punto 2; §9.0.6, skill §3):
 * - la **visual** (`bg-scrim`, 30 %) nunca recibe punteros y hace su fundido de salida;
 * - el **Overlay de Radix** (transparente) atrapa los clics afuera y lleva el `RemoveScroll`, y se
 *   desmonta apenas empieza la salida: durante la animación de cierre la página ya recibe clics y
 *   scroll. (Radix fuerza `pointer-events: auto` en su Overlay, por eso no alcanza con estilos.)
 * Va siempre dentro del `AnimatePresence` del contenido.
 */
export function ModalScrim({
  overlay,
  opacity,
  className,
}: {
  /** `<XPrimitive.Overlay forceMount className="fixed inset-0 z-50" />` */
  overlay: React.ReactNode
  /** Opacidad controlada desde afuera (el sheet la liga al arrastre). Sin ella, fundido propio. */
  opacity?: MotionValue<number>
  className?: string
}) {
  const isPresent = useIsPresent()
  return (
    <>
      {opacity ? (
        <m.div
          aria-hidden
          data-scrim=""
          className={cn("pointer-events-none fixed inset-0 z-50 bg-scrim", className)}
          style={{ opacity }}
        />
      ) : (
        <m.div
          aria-hidden
          data-scrim=""
          className={cn("pointer-events-none fixed inset-0 z-50 bg-scrim", className)}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={fades.scrim}
        />
      )}
      {isPresent ? overlay : null}
    </>
  )
}

/**
 * Va adentro del contenido de un overlay animado (Dialog, AlertDialog). Cuando empieza la salida, saca
 * el foco del contenido y lo marca `inert`: aunque la animación de salida tarde (o no tenga cuadros),
 * el foco y el lector de pantalla no quedan atrapados en algo que ya está cerrado.
 */
export function ExitFocusGuard() {
  const isPresent = useIsPresent()
  const ref = React.useRef<HTMLSpanElement>(null)
  React.useLayoutEffect(() => {
    const container = ref.current?.parentElement
    if (!container) return
    // Si se reabre durante la salida, la misma instancia vuelve a estar presente: se quita `inert`.
    applyExitGuard(container, isPresent, document.activeElement)
  }, [isPresent])
  return <span ref={ref} hidden />
}
