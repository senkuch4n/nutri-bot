"use client"

import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"
import {
  AnimatePresence,
  animateSingleValue,
  m,
  useMotionTemplate,
  useMotionValue,
  usePresence,
  useReducedMotionConfig,
  useTransform,
  type MotionValue,
} from "motion/react"

import { closeButtonClass } from "@/components/primitives/dialog"
import { ModalScrim } from "@/components/primitives/modal-scrim"
import {
  MORPH_RADIUS,
  blurFilter,
  canMorph,
  flipFrom,
  inverseScale,
  morphContent,
  morphTransitions,
  originHiddenStyle,
  originRevealStyle,
  originScale,
  restoreInlineStyle,
  saveInlineStyle,
  settleKeyframes,
  type OriginStyle,
  type Rect,
  type SavedInlineStyle,
} from "@/lib/morph"
import { ignoreOutsideBeforeOpen, preserveUserFocusOnClose } from "@/lib/overlay-focus"
import { runExit, type ExitAnimation } from "@/lib/sheet-exit"
import { useControllableState } from "@/lib/use-controllable-state"
import { useExitSnapshot } from "@/lib/use-exit-snapshot"
import { OverlayOpenInfoContext, useOverlayOpenInfo } from "@/lib/use-return-focus"
import { cn } from "@/lib/utils"

// Feature morph-dialog (técnica "case detail" de Factum). Diálogo centrado que crece desde el elemento
// que lo abrió (`origin`, FLIP) y vuelve a él al cerrar. Radix pone el foco atrapado, Escape, el
// bloqueo de scroll, el fondo inerte y la devolución del foco; acá solo se coordina el desmontaje con
// la animación de salida (mismo patrón que Sheet: `forceMount` + `usePresence` + `runExit`).
//
// Capas: fondo (solo opacidad) · shell (x, y, sx, sy con origen 0 0) · envoltorio con la escala inversa
// (el texto no se estira) · cuerpo con scroll (opacidad, y, escala y desenfoque del contenido).
// Con movimiento reducido no se mide ni se transforma nada: shell y fondo con un fundido de 150 ms.
type MorphDialogContextValue = { open: boolean; origin: HTMLElement | null }
const MorphDialogContext = React.createContext<MorphDialogContextValue>({ open: false, origin: null })

type MorphDialogProps = React.ComponentProps<typeof DialogPrimitive.Root> & {
  /** Elemento desde el que crece el diálogo (el que se tocó). Sin él, o si ya no está, entra con un fundido. */
  origin?: HTMLElement | null
}

function MorphDialog({ open: openProp, defaultOpen, onOpenChange, origin = null, ...props }: MorphDialogProps) {
  const [open, setOpen] = useControllableState({
    prop: openProp,
    defaultProp: defaultOpen ?? false,
    onChange: onOpenChange,
  })
  const ctx = React.useMemo(() => ({ open, origin }), [open, origin])
  const openInfo = useOverlayOpenInfo(open)
  return (
    <MorphDialogContext.Provider value={ctx}>
      <OverlayOpenInfoContext.Provider value={openInfo}>
        <DialogPrimitive.Root open={open} onOpenChange={setOpen} {...props} />
      </OverlayOpenInfoContext.Provider>
    </MorphDialogContext.Provider>
  )
}

const MorphDialogTrigger = DialogPrimitive.Trigger

const MorphDialogClose = DialogPrimitive.Close

type MorphDialogContentProps = Omit<React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>, "forceMount">

const MorphDialogContent = React.forwardRef<React.ElementRef<typeof DialogPrimitive.Content>, MorphDialogContentProps>(
  ({ children, ...props }, ref) => {
    const { open, origin } = React.useContext(MorphDialogContext)
    // Durante la salida se conservan el contenido y el origen de la apertura.
    const content = useExitSnapshot(children, open)
    const exitOrigin = useExitSnapshot(origin, open)
    return (
      <AnimatePresence>
        {open ? (
          <DialogPrimitive.Portal forceMount>
            <MorphPanel ref={ref} origin={exitOrigin} {...props}>
              {content}
            </MorphPanel>
          </DialogPrimitive.Portal>
        ) : null}
      </AnimatePresence>
    )
  }
)
MorphDialogContent.displayName = "MorphDialogContent"

/** Origen tomado por el diálogo: sus estilos inline originales y cómo se oculta. */
type OriginSession = {
  el: HTMLElement
  saved: SavedInlineStyle
  baseOpacity: number
  scale: number
  /** 0 visible → 1 oculto: de dónde parte la siguiente animación si se interrumpe. */
  hidden: number
}

type Animation = ReturnType<typeof animateSingleValue>

function viewportRect(el: HTMLElement): Rect {
  const r = el.getBoundingClientRect()
  return { left: r.left, top: r.top, width: r.width, height: r.height }
}

/** Caja del shell sin transformaciones: su padre es la capa fija a pantalla completa. */
function layoutRect(el: HTMLElement): Rect {
  return { left: el.offsetLeft, top: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight }
}

function writeOrigin(s: OriginSession, style: OriginStyle, willChange: boolean) {
  const css = s.el.style
  css.setProperty("opacity", style.opacity)
  css.setProperty("filter", style.filter)
  css.setProperty("transform", style.transform)
  if (willChange) css.setProperty("will-change", "opacity, filter, transform")
  else restoreInlineStyle(css, s.saved, ["will-change"])
}

const MorphPanel = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  MorphDialogContentProps & { origin: HTMLElement | null }
>(({ origin, className, children, style, onCloseAutoFocus, onPointerDownOutside, ...props }, forwardedRef) => {
  const openInfo = React.useContext(OverlayOpenInfoContext)
  const reduced = Boolean(useReducedMotionConfig())
  const [isPresent, safeToRemove] = usePresence()
  const shellRef = React.useRef<HTMLDivElement | null>(null)

  // Shell y fondo.
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const sx = useMotionValue(1)
  const sy = useMotionValue(1)
  const shellOpacity = useMotionValue(0)
  const backdrop = useMotionValue(0)
  const invSx = useTransform(sx, inverseScale)
  const invSy = useTransform(sy, inverseScale)
  const radiusX = useTransform(sx, (v) => MORPH_RADIUS * inverseScale(v))
  const radiusY = useTransform(sy, (v) => MORPH_RADIUS * inverseScale(v))
  const borderRadius = useMotionTemplate`${radiusX}px / ${radiusY}px`
  // Contenido.
  const contentOpacity = useMotionValue<number>(morphContent.enter.opacity)
  const contentY = useMotionValue<number>(morphContent.enter.y)
  const contentScale = useMotionValue<number>(morphContent.enter.scale)
  const contentBlur = useMotionValue<number>(morphContent.enter.blur)
  const contentFilter = useTransform(contentBlur, blurFilter)

  // Interrupciones: cada tanda de animaciones lleva la generación con la que arrancó; `stopAnimations`
  // la avanza, así una tanda frenada nunca dispara su `onComplete`.
  const controls = React.useRef<Animation[]>([])
  const generation = React.useRef(0)
  const phase = React.useRef<"idle" | "open" | "closing">("idle")
  const session = React.useRef<OriginSession | null>(null)
  const focusFallback = React.useRef<HTMLElement | null>(null)
  const cancelExit = React.useRef<(() => void) | null>(null)

  const stopAnimations = React.useCallback(() => {
    generation.current += 1
    const running = controls.current
    controls.current = []
    for (const c of running) c.stop()
  }, [])

  const runAnimations = React.useCallback((list: Animation[], onComplete?: () => void): ExitAnimation => {
    const gen = generation.current
    controls.current.push(...list)
    const done = Promise.all(list.map((a) => new Promise<void>((resolve) => void a.then(() => resolve()))))
    const whenCurrent = (fn: () => void) =>
      void done.then(() => {
        if (gen === generation.current) fn()
      })
    if (onComplete) whenCurrent(onComplete)
    return { then: whenCurrent, stop: stopAnimations }
  }, [stopAnimations])

  /** Devuelve el origen a sus estilos inline exactos. */
  const releaseOrigin = React.useCallback(() => {
    const s = session.current
    session.current = null
    if (s) restoreInlineStyle(s.el.style, s.saved)
  }, [])

  const setAll = React.useCallback(
    (pairs: [MotionValue<number>, number][]) => {
      for (const [value, v] of pairs) value.set(v)
    },
    []
  )

  React.useLayoutEffect(() => {
    if (isPresent) {
      cancelExit.current?.()
      cancelExit.current = null
      const resumed = phase.current === "closing"
      stopAnimations()
      phase.current = "open"
      focusFallback.current = origin

      if (reduced) {
        // Sin medir ni transformar el origen: solo el fundido de shell y fondo.
        releaseOrigin()
        setAll([[x, 0], [y, 0], [sx, 1], [sy, 1], [contentOpacity, 1], [contentY, 0], [contentScale, 1], [contentBlur, 0]])
        runAnimations([
          animateSingleValue(shellOpacity, 1, morphTransitions.reduced),
          animateSingleValue(backdrop, 1, morphTransitions.reduced),
        ])
        return
      }

      const el = origin?.isConnected ? origin : null
      // Reabierto a mitad de la salida hacia el mismo origen: sigue desde el valor presente.
      if (!(resumed && el && session.current?.el === el)) {
        releaseOrigin()
        const shell = shellRef.current
        const target = shell ? layoutRect(shell) : null
        // El origen se mide antes de tocarlo.
        const src = el ? viewportRect(el) : null
        if (el && target && canMorph(src, target)) {
          const computed = Number.parseFloat(getComputedStyle(el).opacity)
          session.current = {
            el,
            saved: saveInlineStyle(el.style),
            baseOpacity: Number.isFinite(computed) ? computed : 1,
            scale: originScale(src.width),
            hidden: 0,
          }
          const f = flipFrom(src, target)
          setAll([[x, f.x], [y, f.y], [sx, f.sx], [sy, f.sy]])
        } else {
          setAll([[x, 0], [y, 0], [sx, 1], [sy, 1]])
        }
        if (!resumed) {
          const e = morphContent.enter
          setAll([[shellOpacity, 0], [contentOpacity, e.opacity], [contentY, e.y], [contentScale, e.scale], [contentBlur, e.blur]])
        }
      }

      const t = morphTransitions.open
      const list = [
        animateSingleValue(backdrop, 1, t.backdrop),
        animateSingleValue(shellOpacity, 1, t.shellOpacity),
        animateSingleValue(x, 0, t.shell),
        animateSingleValue(y, 0, t.shell),
        animateSingleValue(sx, 1, t.shell),
        animateSingleValue(sy, 1, t.shell),
        animateSingleValue(contentOpacity, 1, t.contentOpacity),
        animateSingleValue(contentBlur, 0, t.contentBlur),
        animateSingleValue(contentY, 0, t.content),
        animateSingleValue(contentScale, 1, t.content),
      ]
      const s = session.current
      if (s) {
        list.push(
          animateSingleValue(s.hidden, 1, {
            ...t.originOut,
            onUpdate: (p) => {
              s.hidden = p
              writeOrigin(s, originHiddenStyle(p, s.scale, s.baseOpacity), true)
            },
          })
        )
      }
      // Oculto y quieto: sin `will-change`.
      runAnimations(list, () => {
        if (s && session.current === s) restoreInlineStyle(s.el.style, s.saved, ["will-change"])
      })
      return
    }

    if (phase.current === "closing") return
    phase.current = "closing"
    stopAnimations()
    // El foco no se queda en un diálogo que se va (al desmontar, Radix lo devuelve al disparador).
    const shell = shellRef.current
    if (shell && document.activeElement instanceof HTMLElement && shell.contains(document.activeElement)) {
      document.activeElement.blur()
    }

    const s = session.current
    const target = shell ? layoutRect(shell) : null
    let src: Rect | null = null
    if (!reduced && s?.el.isConnected) {
      // Se mide sin nuestra transformación (solo esa) y se repone enseguida.
      const ours = s.el.style.getPropertyValue("transform")
      restoreInlineStyle(s.el.style, s.saved, ["transform"])
      src = viewportRect(s.el)
      s.el.style.setProperty("transform", ours)
    }
    const morph = Boolean(s && target && canMorph(src, target))
    // Sin origen (se fue del DOM) o con movimiento reducido: solo fundido.
    if (!morph) releaseOrigin()

    const start = (): ExitAnimation => {
      if (!morph || !s || !src || !target) {
        const fade = reduced ? { shell: morphTransitions.reduced, backdrop: morphTransitions.reduced } : {
          shell: morphTransitions.fadeOut.shellOpacity,
          backdrop: morphTransitions.fadeOut.backdrop,
        }
        return runAnimations([
          animateSingleValue(shellOpacity, 0, fade.shell),
          animateSingleValue(backdrop, 0, fade.backdrop),
        ])
      }
      const c = morphTransitions.close
      const out = morphContent.exit
      const k = settleKeyframes(src, target)
      const returnValue = (v: MotionValue<number>, [mid, dest]: [number, number]) =>
        animateSingleValue(v, [v.get(), mid, dest], { ...c.shell, times: [...c.shell.times], ease: [...c.shell.ease] })
      return runAnimations([
        animateSingleValue(contentOpacity, out.opacity, c.content),
        animateSingleValue(contentY, out.y, c.content),
        animateSingleValue(contentScale, out.scale, c.content),
        animateSingleValue(contentBlur, out.blur, c.content),
        returnValue(x, k.x),
        returnValue(y, k.y),
        returnValue(sx, k.sx),
        returnValue(sy, k.sy),
        animateSingleValue(shellOpacity, 0, c.shellOpacity),
        animateSingleValue(backdrop, 0, c.backdrop),
        // El origen reaparece desde los 260 ms (hasta entonces sigue oculto).
        animateSingleValue(0, 1, {
          ...c.originIn,
          onUpdate: (p) => {
            s.hidden = 1 - p
            writeOrigin(s, originRevealStyle(p, s.baseOpacity), p < 1)
          },
        }),
      ])
    }

    cancelExit.current = runExit({
      start,
      finalize: () => {
        shellOpacity.jump(0)
        backdrop.jump(0)
        releaseOrigin()
      },
      onDone: () => {
        cancelExit.current = null
        phase.current = "idle"
        releaseOrigin()
        safeToRemove?.()
      },
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPresent])

  // Desmontaje (y el desmontaje simulado de Strict Mode): nada queda corriendo ni pisando el origen.
  React.useLayoutEffect(
    () => () => {
      cancelExit.current?.()
      cancelExit.current = null
      stopAnimations()
      releaseOrigin()
      phase.current = "idle"
    },
    [stopAnimations, releaseOrigin]
  )

  const setRefs = React.useCallback(
    (node: HTMLDivElement | null) => {
      shellRef.current = node
      if (typeof forwardedRef === "function") forwardedRef(node)
      else if (forwardedRef) forwardedRef.current = node
    },
    [forwardedRef]
  )

  return (
    <>
      <ModalScrim opacity={backdrop} overlay={<DialogPrimitive.Overlay forceMount className="fixed inset-0 z-50" />} />
      {/* Capa fija que centra el shell; el clic afuera cae en el Overlay de Radix. */}
      <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-6">
        <DialogPrimitive.Content
          asChild
          ref={setRefs}
          {...props}
          onCloseAutoFocus={preserveUserFocusOnClose(onCloseAutoFocus, {
            // Al que tenía el foco al abrir; si no había (Safari no enfoca botones al hacer clic), al origen.
            returnTo: () => {
              const previous = openInfo?.returnFocus.current
              return previous?.isConnected ? previous : focusFallback.current
            },
          })}
          onPointerDownOutside={ignoreOutsideBeforeOpen(onPointerDownOutside, () => openInfo?.openedAt.current ?? 0)}
          forceMount
        >
          <m.div
            className={cn(
              "pointer-events-auto relative max-h-[85dvh] w-[min(100%,440px)] overflow-hidden bg-background text-foreground shadow-modal outline-none",
              // Durante la salida el shell ya no recibe punteros.
              "data-[state=closed]:pointer-events-none",
              className
            )}
            style={{ ...style, x, y, scaleX: sx, scaleY: sy, originX: 0, originY: 0, opacity: shellOpacity, borderRadius }}
            // Saliendo: fuera del orden de foco y del árbol de accesibilidad.
            inert={!isPresent || undefined}
          >
            <m.div style={{ scaleX: invSx, scaleY: invSy, originX: 0, originY: 0 }}>
              <m.div
                className="relative max-h-[85dvh] overflow-y-auto overscroll-contain p-6"
                style={{ opacity: contentOpacity, y: contentY, scale: contentScale, filter: contentFilter }}
              >
                {children}
                <DialogPrimitive.Close className={closeButtonClass}>
                  <X className="size-3.5" strokeWidth={2.25} aria-hidden />
                  <span className="sr-only">Cerrar</span>
                </DialogPrimitive.Close>
              </m.div>
            </m.div>
          </m.div>
        </DialogPrimitive.Content>
      </div>
    </>
  )
})
MorphPanel.displayName = "MorphPanel"

const MorphDialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col gap-1.5 pr-8 text-left", className)} {...props} />
)
MorphDialogHeader.displayName = "MorphDialogHeader"

const MorphDialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title ref={ref} className={cn("text-title-2 text-balance text-foreground", className)} {...props} />
))
MorphDialogTitle.displayName = DialogPrimitive.Title.displayName

const MorphDialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} className={cn("text-callout text-muted-foreground", className)} {...props} />
))
MorphDialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  MorphDialog,
  MorphDialogTrigger,
  MorphDialogClose,
  MorphDialogContent,
  MorphDialogHeader,
  MorphDialogTitle,
  MorphDialogDescription,
}
