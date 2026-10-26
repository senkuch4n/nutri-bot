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
  ORIGIN_BLUR,
  backdropOpacity,
  blurFilter,
  canMorph,
  flipFrom,
  inverseScale,
  labelOffsetKeyframes,
  liftKeyframes,
  morphContent,
  morphTransitions,
  openMode,
  openTransitions,
  originHiddenStyle,
  originRevealStyle,
  originScale,
  restoreInlineStyle,
  saveInlineStyle,
  settleKeyframes,
  visibleRadius,
  type OriginStyle,
  type Point,
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
// Capas: fondo (solo opacidad, 8 % de negro; 12 % en total si hay otro diálogo abajo) · shell (x, y, sx, sy con origen 0 0) · envoltorio con la
// escala inversa (el texto no se estira) · cuerpo con scroll (opacidad, y, escala y desenfoque del
// contenido) · etiqueta compartida (opcional: el texto del origen viaja con la esquina de la tarjeta).
// Apertura (tiempos en `lib/morph`): desde la página, el origen se desvanece y a los ~180 ms la tarjeta
// aparece exactamente sobre él; desde otro diálogo, el origen se "levanta" (tarjeta un poco más grande,
// 50 ms). Después la tarjeta crece hasta el diálogo (expo-out) y el contenido entra desenfocado cuando
// ya casi llegó.
// Con movimiento reducido no se mide ni se transforma nada: shell y fondo con un fundido de 150 ms.
//
// Apilado: un MorphDialog abierto desde un elemento de otro funciona como dos diálogos de Radix
// anidados (foco, Escape y clic afuera los resuelve la capa de arriba; el padre está en el árbol de
// React del hijo, así que un toque en el hijo no cuenta como "afuera" del padre). El fondo del hijo solo
// completa el 12 % (`layerDim`): el padre queda apenas gris detrás, sin oscurecerse el doble, y al cerrar
// el hijo vuelve a su origen adentro del padre sin tocarlo.
type MorphDialogContextValue = { open: boolean; origin: HTMLElement | null; originLabel: OriginLabel }
const MorphDialogContext = React.createContext<MorphDialogContextValue>({ open: false, origin: null, originLabel: false })

/** `true`: el texto del propio origen. Un elemento: el texto de ese elemento (tiene que estar adentro del origen). */
type OriginLabel = boolean | HTMLElement | null

type MorphDialogProps = React.ComponentProps<typeof DialogPrimitive.Root> & {
  /** Elemento desde el que crece el diálogo (el que se tocó). Sin él, o si ya no está, entra con un fundido. */
  origin?: HTMLElement | null
  /**
   * Etiqueta compartida: el texto del origen viaja con la tarjeta mientras crece (sin estirarse, en su
   * esquina superior izquierda) y se funde con el contenido. Solo si el texto entra en una línea.
   */
  originLabel?: OriginLabel
}

function MorphDialog({ open: openProp, defaultOpen, onOpenChange, origin = null, originLabel = false, ...props }: MorphDialogProps) {
  const [open, setOpen] = useControllableState({
    prop: openProp,
    defaultProp: defaultOpen ?? false,
    onChange: onOpenChange,
  })
  const ctx = React.useMemo(() => ({ open, origin, originLabel }), [open, origin, originLabel])
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

/** Ancho del diálogo: `md` el de siempre, `lg` un panel ancho. */
const morphSizes = {
  md: "w-[min(100%,440px)]",
  lg: "w-[min(100%,720px)]",
} as const

type MorphDialogContentProps = Omit<React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>, "forceMount"> & {
  size?: keyof typeof morphSizes
}

const MorphDialogContent = React.forwardRef<React.ElementRef<typeof DialogPrimitive.Content>, MorphDialogContentProps>(
  ({ children, ...props }, ref) => {
    const { open, origin, originLabel } = React.useContext(MorphDialogContext)
    // Durante la salida se conservan el contenido y el origen de la apertura.
    const content = useExitSnapshot(children, open)
    const exitOrigin = useExitSnapshot(origin, open)
    return (
      <AnimatePresence>
        {open ? (
          <DialogPrimitive.Portal forceMount>
            <MorphPanel ref={ref} origin={exitOrigin} originLabel={originLabel} {...props}>
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
  /** Desenfoque al ocultarse (0 con etiqueta compartida). */
  blur: number
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

/** Lo que se copia del texto del origen a la etiqueta compartida (para que se vea idéntica). */
const LABEL_STYLE_PROPS = [
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "font-stretch",
  "font-feature-settings",
  "font-variation-settings",
  "font-variant-numeric",
  "font-kerning",
  "letter-spacing",
  "word-spacing",
  "text-transform",
  "color",
  "-webkit-font-smoothing",
] as const

type LabelMeasure = { text: string; rect: Rect; style: CSSStyleDeclaration }

/** Texto visible de `source` en una sola línea: su caja en pantalla y los estilos de la fuente. */
function measureLabel(source: HTMLElement): LabelMeasure | null {
  const walker = document.createTreeWalker(source, NodeFilter.SHOW_TEXT)
  const range = document.createRange()
  const visible: Text[] = []
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node as Text
    if (!text.data.trim()) continue
    range.selectNodeContents(text)
    const r = range.getBoundingClientRect()
    // Afuera el texto solo para lectores de pantalla (`sr-only` mide 1 px).
    if (r.width > 1 && r.height > 1) visible.push(text)
  }
  const first = visible[0]
  const last = visible[visible.length - 1]
  if (!first || !last || !first.parentElement) return null
  range.setStart(first, 0)
  range.setEnd(last, last.length)
  const lines = Array.from(range.getClientRects()).filter((r) => r.width > 0 && r.height > 0)
  const top = lines[0]?.top ?? 0
  if (lines.some((r) => Math.abs(r.top - top) > 2)) return null
  const r = range.getBoundingClientRect()
  const text = range.toString().replace(/\s+/g, " ").trim()
  if (!text || r.width <= 0 || r.height <= 0) return null
  return {
    text,
    rect: { left: r.left, top: r.top, width: r.width, height: r.height },
    style: getComputedStyle(first.parentElement),
  }
}

/** Posición de `el` relativa a `ancestor` según el layout (sin transformaciones ni scroll). */
function offsetWithin(el: HTMLElement, ancestor: HTMLElement): Point | null {
  let x = 0
  let y = 0
  let node: HTMLElement | null = el
  while (node && node !== ancestor) {
    x += node.offsetLeft
    y += node.offsetTop
    const parent: Element | null = node.offsetParent
    if (!(parent instanceof HTMLElement) || !(parent === ancestor || ancestor.contains(parent))) return null
    node = parent
  }
  return node === ancestor ? { x, y } : null
}

const DIALOG_SELECTOR = '[role="dialog"], [role="alertdialog"]'

/** ¿Hay otro diálogo abierto (de Radix) debajo de `shell`? Entonces el fondo de este va apilado. */
function hasDialogBelow(shell: HTMLElement | null): boolean {
  if (typeof document === "undefined") return false
  return Array.from(document.querySelectorAll<HTMLElement>(DIALOG_SELECTOR)).some(
    (node) => node !== shell && node.getAttribute("data-state") === "open" && !(shell?.contains(node) ?? false)
  )
}

/** Padding del cuerpo (`p-6`): a dónde va la etiqueta si el diálogo no tiene título. */
const BODY_PADDING = 24

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
  MorphDialogContentProps & { origin: HTMLElement | null; originLabel: OriginLabel }
>(({ origin, originLabel, size = "md", className, children, style, onCloseAutoFocus, onPointerDownOutside, ...props }, forwardedRef) => {
  const openInfo = React.useContext(OverlayOpenInfoContext)
  const reduced = Boolean(useReducedMotionConfig())
  const [isPresent, safeToRemove] = usePresence()
  const shellRef = React.useRef<HTMLDivElement | null>(null)
  const labelRef = React.useRef<HTMLSpanElement | null>(null)
  /** Tamaño del shell sin transformar (para el radio visible). */
  const shellSize = React.useRef<{ width: number; height: number } | null>(null)

  // Shell y fondo.
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const sx = useMotionValue(1)
  const sy = useMotionValue(1)
  const shellOpacity = useMotionValue(0)
  const backdrop = useMotionValue(0)
  const invSx = useTransform(sx, inverseScale)
  const invSy = useTransform(sy, inverseScale)
  // Radio de 24 px, salvo cuando la tarjeta es tan baja que queda una píldora (al levantarse de un chip).
  const radiusAt = (a: number, b: number) => {
    const size = shellSize.current
    return size ? visibleRadius(a * size.width, b * size.height) : MORPH_RADIUS
  }
  const radiusX = useTransform([sx, sy], ([a = 1, b = 1]: number[]) => radiusAt(a, b) * inverseScale(a))
  const radiusY = useTransform([sx, sy], ([a = 1, b = 1]: number[]) => radiusAt(a, b) * inverseScale(b))
  const borderRadius = useMotionTemplate`${radiusX}px / ${radiusY}px`
  // Contenido.
  const contentOpacity = useMotionValue<number>(morphContent.enter.opacity)
  const contentY = useMotionValue<number>(morphContent.enter.y)
  const contentScale = useMotionValue<number>(morphContent.enter.scale)
  const contentBlur = useMotionValue<number>(morphContent.enter.blur)
  const contentFilter = useTransform(contentBlur, blurFilter)
  // Etiqueta compartida: esquina del shell sin transformar (`anchor`) + traslación del shell + desplazamiento.
  const anchorX = useMotionValue(0)
  const anchorY = useMotionValue(0)
  const labelOffX = useMotionValue(0)
  const labelOffY = useMotionValue(0)
  const labelOpacity = useMotionValue(0)
  const labelX = useTransform([anchorX, x, labelOffX], ([a = 0, b = 0, c = 0]: number[]) => a + b + c)
  const labelY = useTransform([anchorY, y, labelOffY], ([a = 0, b = 0, c = 0]: number[]) => a + b + c)

  // Interrupciones: cada tanda de animaciones lleva la generación con la que arrancó; `stopAnimations`
  // la avanza, así una tanda frenada nunca dispara su `onComplete`.
  const controls = React.useRef<Animation[]>([])
  const generation = React.useRef(0)
  const phase = React.useRef<"idle" | "open" | "closing">("idle")
  const session = React.useRef<OriginSession | null>(null)
  const focusFallback = React.useRef<HTMLElement | null>(null)
  /** Opacidad del fondo de esta apertura (más baja si hay otro diálogo abajo). */
  const backdropTarget = React.useRef(backdropOpacity(false))
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
      labelOpacity.set(0)
      backdropTarget.current = backdropOpacity(hasDialogBelow(shellRef.current))

      if (reduced) {
        // Sin medir ni transformar el origen: solo el fundido de shell y fondo.
        releaseOrigin()
        setAll([[x, 0], [y, 0], [sx, 1], [sy, 1], [contentOpacity, 1], [contentY, 0], [contentScale, 1], [contentBlur, 0]])
        runAnimations([
          animateSingleValue(shellOpacity, 1, morphTransitions.reduced),
          animateSingleValue(backdrop, backdropTarget.current, morphTransitions.reduced),
        ])
        return
      }

      const el = origin?.isConnected ? origin : null
      // Reabierto a mitad de la salida hacia el mismo origen: sigue desde el valor presente.
      const resumeSame = resumed && el !== null && session.current?.el === el
      // Desde un elemento de otro diálogo, la tarjeta se "levanta" alrededor del origen.
      const nested = Boolean(el?.parentElement?.closest(DIALOG_SELECTOR))
      // Origen → (tarjeta levantada →) diálogo, cuando hay un origen nuevo que medir.
      let frames: ReturnType<typeof liftKeyframes> | null = null
      let label: { offset: ReturnType<typeof labelOffsetKeyframes> } | null = null
      if (!resumeSame) {
        releaseOrigin()
        const shell = shellRef.current
        const target = shell ? layoutRect(shell) : null
        if (target) shellSize.current = { width: target.width, height: target.height }
        // El origen se mide antes de tocarlo.
        const src = el ? viewportRect(el) : null
        if (el && shell && target && canMorph(src, target)) {
          // Etiqueta compartida: el texto (de una línea) del origen o de un elemento suyo.
          const labelSource = originLabel === true ? el : originLabel instanceof HTMLElement && el.contains(originLabel) ? originLabel : null
          const measured = labelSource ? measureLabel(labelSource) : null
          const span = labelRef.current
          if (measured && span) {
            for (const prop of LABEL_STYLE_PROPS) span.style.setProperty(prop, measured.style.getPropertyValue(prop))
            // Interlineado = alto del texto: la caja de la etiqueta coincide con la del texto medido.
            span.style.setProperty("line-height", `${measured.rect.height}px`)
            span.textContent = measured.text
            const title = shell.querySelector<HTMLElement>("[data-morph-title]")
            const end = (title && offsetWithin(title, shell)) ?? { x: BODY_PADDING, y: BODY_PADDING }
            label = { offset: labelOffsetKeyframes(measured.rect, src, end) }
            // Desde el clic la etiqueta tapa exacto al texto del origen (que se desvanece debajo).
            setAll([[anchorX, target.left], [anchorY, target.top], [labelOffX, label.offset.x[0]], [labelOffY, label.offset.y[0]], [labelOpacity, 1]])
          }
          const computed = Number.parseFloat(getComputedStyle(el).opacity)
          session.current = {
            el,
            saved: saveInlineStyle(el.style),
            baseOpacity: Number.isFinite(computed) ? computed : 1,
            // Con etiqueta, el origen solo se desvanece: el texto que viaja lo tapa exacto.
            scale: label ? 1 : originScale(src.width),
            blur: label ? 0 : ORIGIN_BLUR,
            hidden: 0,
          }
          frames = liftKeyframes(src, target)
          setAll([[x, frames.x[0]], [y, frames.y[0]], [sx, frames.sx[0]], [sy, frames.sy[0]]])
        } else {
          setAll([[x, 0], [y, 0], [sx, 1], [sy, 1]])
        }
        if (!resumed) {
          const e = morphContent.enter
          setAll([[shellOpacity, 0], [contentOpacity, e.opacity], [contentY, e.y], [contentScale, e.scale], [contentBlur, e.blur]])
        }
      }

      const mode = openMode({ morph: frames !== null, resumed, nested })
      const t = openTransitions(mode)
      const lift = mode === "lift"
      // Diferida: el shell espera invisible sobre el origen y crece sin pasar por la tarjeta levantada.
      const along = (v: MotionValue<number>, k: [number, number, number] | undefined, dest: number) =>
        animateSingleValue(v, k ? (lift ? k : [k[0], k[2]]) : dest, t.shell)
      const list = [
        animateSingleValue(backdrop, backdropTarget.current, t.backdrop),
        animateSingleValue(shellOpacity, 1, t.shellOpacity),
        along(x, frames?.x, 0),
        along(y, frames?.y, 0),
        along(sx, frames?.sx, 1),
        along(sy, frames?.sy, 1),
        animateSingleValue(contentOpacity, 1, t.contentOpacity),
        animateSingleValue(contentBlur, 0, t.contentBlur),
        animateSingleValue(contentY, 0, t.content),
        animateSingleValue(contentScale, 1, t.content),
      ]
      if (label) {
        list.push(
          along(labelOffX, label.offset.x, 0),
          along(labelOffY, label.offset.y, 0),
          // Se funde con el contenido, que aparece casi en el mismo lugar (el título).
          animateSingleValue(labelOpacity, 0, t.labelOpacity)
        )
      }
      const s = session.current
      if (s) {
        list.push(
          animateSingleValue(s.hidden, 1, {
            ...t.originOut,
            onUpdate: (p) => {
              s.hidden = p
              writeOrigin(s, originHiddenStyle(p, s.scale, s.baseOpacity, s.blur), true)
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
    if (target) shellSize.current = { width: target.width, height: target.height }
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
      // Si se cierra mientras la etiqueta compartida todavía se ve, se va enseguida.
      const hideLabel = animateSingleValue(labelOpacity, 0, morphTransitions.close.label)
      if (!morph || !s || !src || !target) {
        const fade = reduced ? { shell: morphTransitions.reduced, backdrop: morphTransitions.reduced } : {
          shell: morphTransitions.fadeOut.shellOpacity,
          backdrop: morphTransitions.fadeOut.backdrop,
        }
        return runAnimations([
          hideLabel,
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
        hideLabel,
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
        // El origen reaparece desde los 240 ms (hasta entonces sigue oculto).
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
        labelOpacity.jump(0)
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
              "pointer-events-auto relative max-h-[85dvh] overflow-hidden bg-background text-foreground shadow-modal outline-none",
              "more-contrast:border more-contrast:border-input",
              morphSizes[size],
              // Durante la salida el shell ya no recibe punteros.
              "data-[state=closed]:pointer-events-none",
              className
            )}
            style={{ ...style, x, y, scaleX: sx, scaleY: sy, originX: 0, originY: 0, opacity: shellOpacity, borderRadius }}
            // Saliendo: fuera del orden de foco y del árbol de accesibilidad.
            inert={!isPresent || undefined}
          >
            <m.div className="relative" style={{ scaleX: invSx, scaleY: invSy, originX: 0, originY: 0 }}>
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
        {/* Etiqueta compartida: fuera del shell (no hereda su fundido de entrada), encima de él. */}
        <m.span
          ref={labelRef}
          aria-hidden
          className="pointer-events-none absolute left-0 top-0 select-none whitespace-nowrap"
          style={{ x: labelX, y: labelY, opacity: labelOpacity }}
        />
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
  // `data-morph-title`: a dónde va la etiqueta compartida.
  <DialogPrimitive.Title
    ref={ref}
    data-morph-title=""
    className={cn("text-title-2 text-balance text-foreground", className)}
    {...props}
  />
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
