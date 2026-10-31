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
  cascadeMask,
  cascadeStart,
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
  sharedCloneStyle,
  sharedOpenKeyframes,
  sharedStart,
  visibleRadius,
  type OriginStyle,
  type Point,
  type Rect,
  type SavedInlineStyle,
  type SharedPose,
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
// Ficha del paciente (video de /pacientes): `lift` hace que también desde la página el origen se
// levante (y el cierre sea el rápido de `closeLift`); `cascade` muestra el cuerpo de arriba hacia abajo.
// Elementos compartidos: lo marcado con el mismo `data-morph-id` en el origen y en el diálogo (iniciales,
// nombre, etapa) viaja nítido y escalado entre los dos, encima del cuerpo que se enfoca o desenfoca.
//
// Apilado: un MorphDialog abierto desde un elemento de otro funciona como dos diálogos de Radix
// anidados (foco, Escape y clic afuera los resuelve la capa de arriba; el padre está en el árbol de
// React del hijo, así que un toque en el hijo no cuenta como "afuera" del padre). El fondo del hijo solo
// completa el 12 % (`layerDim`): el padre queda apenas gris detrás, sin oscurecerse el doble, y al cerrar
// el hijo vuelve a su origen adentro del padre sin tocarlo.
type MorphDialogContextValue = {
  open: boolean
  origin: HTMLElement | null
  originLabel: OriginLabel
  lift: boolean
  cascade: boolean
}
const MorphDialogContext = React.createContext<MorphDialogContextValue>({
  open: false,
  origin: null,
  originLabel: false,
  lift: false,
  cascade: false,
})

/** Repite la cascada para el contenido que llegó con el diálogo abierto (ver `MorphDialogContentReady`). */
const MorphRevealContext = React.createContext<(() => void) | null>(null)

/**
 * Dentro de un MorphDialog con `cascade`: avisa que llegó el contenido real (p. ej. la página que
 * reemplaza a su `loading.tsx`), así aparece con la cascada aunque el diálogo ya esté abierto en vez de
 * saltar de golpe.
 */
function MorphDialogContentReady() {
  const replay = React.useContext(MorphRevealContext)
  React.useLayoutEffect(() => replay?.(), [replay])
  return null
}

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
  /** El origen se levanta (tarjeta blanca) también desde la página, y vuelve con el cierre rápido. */
  lift?: boolean
  /** El cuerpo aparece de arriba hacia abajo (máscara que baja) y se va más desenfocado. */
  cascade?: boolean
}

function MorphDialog({
  open: openProp,
  defaultOpen,
  onOpenChange,
  origin = null,
  originLabel = false,
  lift = false,
  cascade = false,
  ...props
}: MorphDialogProps) {
  const [open, setOpen] = useControllableState({
    prop: openProp,
    defaultProp: defaultOpen ?? false,
    onChange: onOpenChange,
  })
  const ctx = React.useMemo(() => ({ open, origin, originLabel, lift, cascade }), [open, origin, originLabel, lift, cascade])
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
  /** Pantallas completas dentro del diálogo (p. ej. la ficha del paciente). */
  xl: "w-[min(100%,1200px)]",
} as const

type MorphDialogContentProps = Omit<React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>, "forceMount"> & {
  size?: keyof typeof morphSizes
}

const MorphDialogContent = React.forwardRef<React.ElementRef<typeof DialogPrimitive.Content>, MorphDialogContentProps>(
  ({ children, ...props }, ref) => {
    const { open, origin, originLabel, lift, cascade } = React.useContext(MorphDialogContext)
    // Durante la salida se conservan el contenido y el origen de la apertura.
    const content = useExitSnapshot(children, open)
    const exitOrigin = useExitSnapshot(origin, open)
    return (
      <AnimatePresence>
        {open ? (
          <DialogPrimitive.Portal forceMount>
            <MorphPanel
              ref={ref}
              origin={exitOrigin}
              originLabel={originLabel}
              lift={lift}
              cascade={cascade}
              {...props}
            >
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

/** Elemento compartido en vuelo: una copia del destino (en la capa de encima) que va y viene del origen. */
type SharedPiece = {
  id: string
  clone: HTMLElement
  /** Caja del destino relativa a la esquina del shell (sin escalar). */
  end: Rect
  /** Pose actual (de dónde parte la siguiente animación si se interrumpe). */
  pose: SharedPose
}

const SHARED_SELECTOR = "[data-morph-id]"
const POSE_KEYS = ["x", "y", "scale"] as const

function writePiece(p: SharedPiece) {
  p.clone.style.transform = `translate(${p.pose.x}px, ${p.pose.y}px) scale(${p.pose.scale})`
}

/** Copia inerte del destino: sin ids ni marcas (no la vuelve a encontrar ningún selector). */
function clonePiece(dest: HTMLElement, end: Rect): HTMLElement {
  const clone = dest.cloneNode(true) as HTMLElement
  for (const node of [clone, ...Array.from(clone.querySelectorAll<HTMLElement>("*"))]) {
    node.removeAttribute("id")
    node.removeAttribute("data-morph-id")
    node.removeAttribute("data-morph-title")
  }
  Object.assign(clone.style, sharedCloneStyle(end))
  return clone
}

/** Caja del elemento `[data-morph-id=id]` dentro de `origin`, en pantalla; null si no está o no se ve. */
function originPieceRect(origin: HTMLElement, id: string): Rect | null {
  const piece = origin.querySelector<HTMLElement>(`[data-morph-id="${CSS.escape(id)}"]`)
  if (!piece) return null
  const r = viewportRect(piece)
  return r.width > 0 && r.height > 0 ? r : null
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
  MorphDialogContentProps & {
    origin: HTMLElement | null
    originLabel: OriginLabel
    lift: boolean
    cascade: boolean
  }
>(({ origin, originLabel, lift: liftProp, cascade, size = "md", className, children, style, onCloseAutoFocus, onPointerDownOutside, ...props }, forwardedRef) => {
  const openInfo = React.useContext(OverlayOpenInfoContext)
  const reduced = Boolean(useReducedMotionConfig())
  const [isPresent, safeToRemove] = usePresence()
  const shellRef = React.useRef<HTMLDivElement | null>(null)
  const labelRef = React.useRef<HTMLSpanElement | null>(null)
  const bodyRef = React.useRef<HTMLDivElement | null>(null)
  const piecesRef = React.useRef<HTMLDivElement | null>(null)
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
  // `lateBlur`: el de la cascada tardía. Va aparte (animar de nuevo `contentBlur` frenaría la animación
  // de la apertura, y una animación frenada de Motion nunca termina su promesa).
  const lateBlur = useMotionValue(0)
  const contentFilter = useTransform([contentBlur, lateBlur], ([a = 0, b = 0]: number[]) => blurFilter(Math.max(a, b)))
  // Cascada: 0 todo oculto → 1 sin máscara. `lateReveal`: la del contenido que llega ya abierto; manda
  // la que menos dejó ver.
  const reveal = useMotionValue(1)
  const lateReveal = useMotionValue(1)
  const revealMask = useTransform([reveal, lateReveal], ([a = 1, b = 1]: number[]) => cascadeMask(Math.min(a, b)))
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
  const pieces = React.useRef<SharedPiece[]>([])
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

  const runAnimations = React.useCallback((all: (Animation | undefined)[], onComplete?: () => void): ExitAnimation => {
    // Una animación instantánea (duración 0, p. ej. la tarjeta del tempo `brisk`) ya terminó y Motion
    // no devuelve controles: no hay nada que esperar ni frenar.
    const list = all.filter((a): a is Animation => a !== undefined)
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

  /** Corre `fn` en el cuadro siguiente al que se está por pintar (doble rAF), salvo que se haya frenado
   *  todo antes (un cierre o el desmontaje avanzan la generación). */
  const afterNextPaint = React.useCallback((fn: () => void) => {
    const gen = generation.current
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (gen === generation.current) fn()
      })
    )
  }, [])

  /** Devuelve el origen a sus estilos inline exactos. */
  const releaseOrigin = React.useCallback(() => {
    const s = session.current
    session.current = null
    if (s) restoreInlineStyle(s.el.style, s.saved)
  }, [])

  /** `will-change` del cuerpo solo mientras se anima (una capa permanente gasta memoria y desenfoca el texto). */
  const setBodyLayer = React.useCallback((on: boolean) => {
    const body = bodyRef.current
    if (!body) return
    if (on) body.style.setProperty("will-change", "opacity, filter, transform")
    else body.style.removeProperty("will-change")
  }, [])

  /**
   * El contenido real llegó con el diálogo ya abierto (la ficha después de su `loading`): si la cascada
   * de la apertura ya había dejado ver esa parte, se repite desde abajo del encabezado compartido (que
   * sigue nítido en su lugar). Si todavía no había llegado hasta ahí, alcanza con la de la apertura.
   */
  const replayReveal = React.useCallback(() => {
    const body = bodyRef.current
    if (!cascade || reduced || phase.current !== "open" || !body) return
    let floor = 0
    for (const el of Array.from(body.querySelectorAll<HTMLElement>(SHARED_SELECTOR))) {
      const at = offsetWithin(el, body)
      if (at) floor = Math.max(floor, at.y + el.offsetHeight)
    }
    const from = cascadeStart(floor - body.scrollTop, body.clientHeight)
    if (Math.min(reveal.get(), lateReveal.get()) <= from) return
    lateReveal.set(from)
    const list = [animateSingleValue(lateReveal, 1, morphTransitions.lateReveal)]
    // Si el encabezado todavía viaja (sus copias están fuera del cuerpo y no se desenfocan), la ficha
    // además entra desenfocada, como en el video. Con el encabezado real ya en el cuerpo, solo la máscara.
    if (pieces.current.length) {
      lateBlur.set(morphContent.enterCascade.blur)
      list.push(animateSingleValue(lateBlur, 0, morphTransitions.lateReveal))
    }
    // Fuera de `runAnimations`: no demora el final de la apertura; un cierre la frena con el resto.
    for (const a of list) if (a) controls.current.push(a)
  }, [cascade, reduced, reveal, lateReveal, lateBlur])

  /** Saca las copias en vuelo y vuelve a mostrar los elementos compartidos reales. */
  const releasePieces = React.useCallback(() => {
    for (const p of pieces.current) p.clone.remove()
    pieces.current = []
    shellRef.current?.removeAttribute("data-morph-flying")
  }, [])

  /**
   * Copias de los elementos compartidos que están en el diálogo y en `originEl`, ya en su pose de
   * destino. `src` es la caja del origen; la pose de origen se calcula con `sharedStart`.
   */
  const collectPieces = React.useCallback((): SharedPiece[] => {
    const shell = shellRef.current
    const layer = piecesRef.current
    if (!shell || !layer) return []
    const scroll = bodyRef.current?.scrollTop ?? 0
    const list: SharedPiece[] = []
    for (const dest of Array.from(bodyRef.current?.querySelectorAll<HTMLElement>(SHARED_SELECTOR) ?? [])) {
      const id = dest.getAttribute("data-morph-id")
      const at = id ? offsetWithin(dest, shell) : null
      if (!id || !at || list.some((p) => p.id === id)) continue
      const end = { left: at.x, top: at.y - scroll, width: dest.offsetWidth, height: dest.offsetHeight }
      if (end.width <= 0 || end.height <= 0) continue
      const clone = clonePiece(dest, end)
      layer.appendChild(clone)
      list.push({ id, clone, end, pose: { x: end.left, y: end.top, scale: 1 } })
    }
    return list
  }, [])

  const setAll = React.useCallback(
    (pairs: [MotionValue<number>, number][]) => {
      for (const [value, v] of pairs) value.set(v)
    },
    []
  )

  /** Anima la pose de un elemento compartido eje por eje (fotogramas por eje, misma transición). */
  const animatePose = (
    p: SharedPiece,
    frames: (key: keyof SharedPose) => number[],
    transition: Parameters<typeof animateSingleValue>[2]
  ): Animation[] =>
    POSE_KEYS.map((key) =>
      animateSingleValue(p.pose[key], frames(key), {
        ...transition,
        onUpdate: (v: number) => {
          p.pose[key] = v
          writePiece(p)
        },
      })
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
        releasePieces()
        setAll([[x, 0], [y, 0], [sx, 1], [sy, 1], [contentOpacity, 1], [contentY, 0], [contentScale, 1], [contentBlur, 0], [reveal, 1], [lateReveal, 1], [lateBlur, 0]])
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
      // Elementos compartidos que salen del origen, con sus fotogramas.
      const shared: { piece: SharedPiece; k: ReturnType<typeof sharedOpenKeyframes> }[] = []
      if (!resumeSame) {
        releaseOrigin()
        releasePieces()
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
          // Solo los que también están en el origen; los demás entran con el cuerpo.
          for (const piece of collectPieces()) {
            const from = originPieceRect(el, piece.id)
            if (!from) {
              piece.clone.remove()
              continue
            }
            const k = sharedOpenKeyframes(from, src, piece.end)
            piece.pose = { x: k.x[0], y: k.y[0], scale: k.scale[0] }
            writePiece(piece)
            shared.push({ piece, k })
          }
          pieces.current = shared.map((e) => e.piece)
          if (shared.length) shell.setAttribute("data-morph-flying", "")
          const computed = Number.parseFloat(getComputedStyle(el).opacity)
          session.current = {
            el,
            saved: saveInlineStyle(el.style),
            baseOpacity: Number.isFinite(computed) ? computed : 1,
            // Con etiqueta o elementos compartidos, el origen solo se desvanece: lo que viaja lo tapa exacto.
            scale: label || shared.length ? 1 : originScale(src.width),
            blur: label || shared.length ? 0 : ORIGIN_BLUR,
            hidden: 0,
          }
          frames = liftKeyframes(src, target)
          setAll([[x, frames.x[0]], [y, frames.y[0]], [sx, frames.sx[0]], [sy, frames.sy[0]]])
        } else {
          setAll([[x, 0], [y, 0], [sx, 1], [sy, 1]])
        }
        if (!resumed) {
          const e = cascade ? morphContent.enterCascade : morphContent.enter
          setAll([
            [shellOpacity, 0],
            [contentOpacity, e.opacity],
            [contentY, e.y],
            [contentScale, e.scale],
            [contentBlur, e.blur],
            [reveal, cascade ? 0 : 1],
            [lateReveal, 1],
            [lateBlur, 0],
          ])
        }
      }

      const mode = openMode({ morph: frames !== null, resumed, nested, lift: liftProp })
      const t = openTransitions(mode, { cascade, brisk: liftProp })
      const lift = mode === "lift"
      // Diferida: el shell espera invisible sobre el origen y crece sin pasar por la tarjeta levantada.
      const along = (v: MotionValue<number>, k: [number, number, number] | undefined, dest: number) =>
        animateSingleValue(v, k ? (lift ? k : [k[0], k[2]]) : dest, t.shell)
      const start = () => {
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
        if (cascade) list.push(animateSingleValue(reveal, 1, t.cascade))
        for (const { piece, k } of shared) {
          list.push(...animatePose(piece, (key) => (lift ? k[key] : [k[key][0], k[key][2]]), t.shell))
        }
        // Reabierto a mitad del cierre: los que estaban volviendo regresan a su lugar desde donde están.
        if (resumeSame) {
          for (const piece of pieces.current) {
            const end = { x: piece.end.left, y: piece.end.top, scale: 1 }
            list.push(...animatePose(piece, (key) => [piece.pose[key], end[key]], t.shell))
          }
        }
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
        // El cuerpo en su propia capa mientras se anima (opacidad, desenfoque y desplazamiento sin repintar).
        setBodyLayer(true)
        // Oculto y quieto: sin `will-change`. Los elementos compartidos llegaron: se muestran los reales.
        runAnimations(list, () => {
          if (s && session.current === s) restoreInlineStyle(s.el.style, s.saved, ["will-change"])
          releasePieces()
          setBodyLayer(false)
        })
      }
      // Desde un origen nuevo, la animación arranca en un cuadro limpio. El clic monta el diálogo (Radix,
      // el contenido, las mediciones) y ese cuadro tarda: si arrancaba ahí, Motion ya contaba ese tiempo
      // y el primer cuadro pintado saltaba casi todo el recorrido. Mientras, la tarjeta espera invisible
      // sobre el origen, que sigue a la vista. Reabierto a mitad del cierre sigue sin esperar.
      if (resumed || !frames) start()
      else afterNextPaint(start)
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
    /** A dónde vuelve cada elemento compartido (su caja en el origen). */
    const homes = new Map<string, Rect>()
    if (!reduced && s?.el.isConnected) {
      // Se mide sin nuestra transformación (solo esa) y se repone enseguida.
      const ours = s.el.style.getPropertyValue("transform")
      restoreInlineStyle(s.el.style, s.saved, ["transform"])
      src = viewportRect(s.el)
      // Cerrado a mitad de la apertura: siguen las copias en vuelo; si no, se copian los del diálogo.
      if (!pieces.current.length) pieces.current = collectPieces()
      for (const piece of pieces.current) {
        const home = originPieceRect(s.el, piece.id)
        if (home) homes.set(piece.id, home)
      }
      s.el.style.setProperty("transform", ours)
    }
    const morph = Boolean(s && target && canMorph(src, target))
    // Sin origen (se fue del DOM) o con movimiento reducido: solo fundido.
    if (!morph) {
      releaseOrigin()
      releasePieces()
    } else {
      for (const piece of pieces.current) if (!homes.has(piece.id)) piece.clone.remove()
      pieces.current = pieces.current.filter((piece) => homes.has(piece.id))
      if (pieces.current.length) shell?.setAttribute("data-morph-flying", "")
      for (const piece of pieces.current) writePiece(piece)
    }
    const flying = pieces.current
    setBodyLayer(true)

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
      const c = liftProp ? morphTransitions.closeLift : morphTransitions.close
      const out = cascade ? morphContent.exitCascade : morphContent.exit
      const k = settleKeyframes(src, target)
      const shellTransition = { ...c.shell, times: [...c.shell.times], ease: [...c.shell.ease] }
      const returnValue = (v: MotionValue<number>, [mid, dest]: [number, number]) =>
        animateSingleValue(v, [v.get(), mid, dest], shellTransition)
      // Los elementos compartidos llegan a su lugar en el origen cuando la tarjeta llega a él.
      const home = (piece: SharedPiece) => sharedStart(homes.get(piece.id) ?? src, src, piece.end)
      return runAnimations([
        ...flying.flatMap((piece) => {
          const to = home(piece)
          return animatePose(piece, (key) => [piece.pose[key], to[key], to[key]], shellTransition)
        }),
        hideLabel,
        animateSingleValue(contentOpacity, out.opacity, c.contentFade),
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
        releasePieces()
      },
      onDone: () => {
        cancelExit.current = null
        phase.current = "idle"
        releaseOrigin()
        releasePieces()
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
      releasePieces()
      phase.current = "idle"
    },
    [stopAnimations, releaseOrigin, releasePieces]
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
              // Mientras viajan las copias, los elementos compartidos reales no se ven.
              "[&[data-morph-flying]_[data-morph-id]]:invisible",
              className
            )}
            style={{ ...style, x, y, scaleX: sx, scaleY: sy, originX: 0, originY: 0, opacity: shellOpacity, borderRadius }}
            // Saliendo: fuera del orden de foco y del árbol de accesibilidad.
            inert={!isPresent || undefined}
          >
            <m.div className="relative" style={{ scaleX: invSx, scaleY: invSy, originX: 0, originY: 0 }}>
              <m.div
                ref={bodyRef}
                className="relative max-h-[85dvh] overflow-y-auto overscroll-contain p-6"
                style={{
                  opacity: contentOpacity,
                  y: contentY,
                  scale: contentScale,
                  filter: contentFilter,
                  maskImage: revealMask,
                  WebkitMaskImage: revealMask,
                }}
              >
                <MorphRevealContext.Provider value={replayReveal}>{children}</MorphRevealContext.Provider>
                <DialogPrimitive.Close className={closeButtonClass}>
                  <X className="size-3.5" strokeWidth={2.25} aria-hidden />
                  <span className="sr-only">Cerrar</span>
                </DialogPrimitive.Close>
              </m.div>
              {/* Copias de los elementos compartidos en vuelo (fuera del cuerpo: no se desenfocan con él). */}
              <div ref={piecesRef} aria-hidden className="pointer-events-none absolute left-0 top-0" />
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
  MorphDialogContentReady,
  MorphDialogHeader,
  MorphDialogTitle,
  MorphDialogDescription,
}
