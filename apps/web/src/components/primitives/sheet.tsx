"use client"

import * as React from "react"
import * as SheetPrimitive from "@radix-ui/react-dialog"
import { cva, type VariantProps } from "class-variance-authority"
import { X } from "lucide-react"
import {
  AnimatePresence,
  animateSingleValue,
  m,
  useMotionValue,
  usePresence,
  useReducedMotionConfig,
  useTransform,
} from "motion/react"

import { closeButtonClass } from "@/components/primitives/dialog"
import { useDismissDrag } from "@/components/primitives/use-dismiss-drag"
import { fades, springs } from "@/lib/motion"
import { useControllableState } from "@/lib/use-controllable-state"
import { ModalScrim } from "@/components/primitives/modal-scrim"
import { preserveUserFocusOnClose } from "@/lib/overlay-focus"
import { useExitSnapshot } from "@/lib/use-exit-snapshot"
import { cn } from "@/lib/utils"

// HU-017a §9.7–§9.8. Un solo MotionValue (`offset`, px hacia el borde de cierre) maneja entrada,
// salida y arrastre: la entrada va de `size` a 0, la salida de donde esté a `size` por el mismo borde
// (§7), y cualquier interrupción (reabrir a mitad, agarrar en vuelo) parte del valor presente (§3).
// El scrim acompaña el progreso. Con movimiento reducido entra y sale con un fundido.
type SheetContextValue = { open: boolean; setOpen: (open: boolean) => void; modal: boolean }
const SheetContext = React.createContext<SheetContextValue>({ open: false, setOpen: () => {}, modal: true })

function Sheet({
  open: openProp,
  defaultOpen,
  onOpenChange,
  modal = true,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Root>) {
  const [open, setOpen] = useControllableState({
    prop: openProp,
    defaultProp: defaultOpen ?? false,
    onChange: onOpenChange,
  })
  const ctx = React.useMemo(() => ({ open, setOpen, modal }), [open, setOpen, modal])
  return (
    <SheetContext.Provider value={ctx}>
      <SheetPrimitive.Root open={open} onOpenChange={setOpen} modal={modal} {...props} />
    </SheetContext.Provider>
  )
}

const SheetTrigger = SheetPrimitive.Trigger

const SheetClose = SheetPrimitive.Close

const SheetPortal = SheetPrimitive.Portal

/** Overlay suelto (API conservada). `SheetContent` usa su propio scrim, ligado al arrastre. */
const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Overlay
    className={cn(
      "fixed inset-0 z-50 bg-scrim duration-scrim data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
    ref={ref}
  />
))
SheetOverlay.displayName = SheetPrimitive.Overlay.displayName

const sheetVariants = cva(
  "fixed z-50 gap-4 overflow-y-auto overscroll-contain bg-background p-6 text-foreground outline-none",
  {
    variants: {
      side: {
        top: "inset-x-0 top-0 rounded-b-2xl",
        bottom: "inset-x-0 bottom-0 max-h-[90dvh] rounded-t-2xl pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-7",
        left: "inset-y-0 left-0 h-full w-[min(85vw,20rem)] rounded-r-2xl",
        right: "inset-y-0 right-0 h-full w-3/4 sm:max-w-sm sm:rounded-l-2xl",
      },
    },
    defaultVariants: {
      side: "right",
    },
  }
)

interface SheetContentProps
  extends React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content>,
    VariantProps<typeof sheetVariants> {
  /** Arrastrar para cerrar (táctil en laterales; desde el grabber/encabezado en el inferior). Default `true`. */
  dismissOnDrag?: boolean
}

type Side = NonNullable<SheetContentProps["side"]>

const SheetContent = React.forwardRef<React.ElementRef<typeof SheetPrimitive.Content>, SheetContentProps>(
  ({ side, children, ...props }, ref) => {
    const { open } = React.useContext(SheetContext)
    const content = useExitSnapshot(children, open)
    return (
      <AnimatePresence>
        {open ? (
          <SheetPrimitive.Portal forceMount>
            <SheetPanel ref={ref} side={side ?? "right"} {...props}>
              {content}
            </SheetPanel>
          </SheetPrimitive.Portal>
        ) : null}
      </AnimatePresence>
    )
  }
)
SheetContent.displayName = SheetPrimitive.Content.displayName

const SheetPanel = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Content>,
  Omit<SheetContentProps, "side" | "forceMount"> & { side: Side }
>(({ side, className, children, style, dismissOnDrag = true, onCloseAutoFocus, ...props }, forwardedRef) => {
  const { setOpen, modal } = React.useContext(SheetContext)
  const reduced = Boolean(useReducedMotionConfig())
  const [isPresent, safeToRemove] = usePresence()
  const panelRef = React.useRef<HTMLDivElement | null>(null)
  const size = React.useRef(0)
  const exitVelocity = React.useRef<number | null>(null)
  const opacity = useMotionValue(reduced ? 0 : 1)

  const { value: offset, handlers, style: dragStyle } = useDismissDrag({
    side,
    // Mientras sale no se arrastra: un toque no puede frenar la salida (review HU-017a, punto 1).
    enabled: dismissOnDrag && isPresent,
    handleOnly: side === "bottom" || side === "top",
    reducedMotion: reduced,
    onDismiss: (velocity) => {
      exitVelocity.current = velocity
      setOpen(false)
    },
  })

  // Primer render: afuera de la pantalla (todavía no se puede medir) para que no haya un cuadro
  // con el sheet en su lugar antes de la entrada.
  const horizontal = side === "left" || side === "right"
  const initialized = React.useRef(false)
  if (!initialized.current) {
    initialized.current = true
    if (!reduced && typeof window !== "undefined") offset.set(horizontal ? window.innerWidth : window.innerHeight)
  }

  const sign = side === "right" || side === "bottom" ? 1 : -1
  const translate = useTransform(offset, (v) => v * sign)
  const scrimOpacity = useTransform([offset, opacity], ([v, o]) => {
    const progress = size.current > 0 ? 1 - Math.min(1, Math.max(0, (v as number) / size.current)) : 1
    return progress * (o as number)
  })

  const measure = React.useCallback(() => {
    const el = panelRef.current
    if (!el) return 0
    size.current = horizontal ? el.offsetWidth : el.offsetHeight
    return size.current
  }, [horizontal])

  // Entrada (antes del primer pintado) y salida/reapertura según la presencia.
  React.useLayoutEffect(() => {
    if (isPresent) {
      if (reduced) {
        offset.set(0)
        animateSingleValue(opacity, 1, fades.scrim)
        return
      }
      // Primera vez: arranca justo afuera. Si se reabre a mitad de la salida, sigue desde donde está.
      const full = measure()
      if (offset.get() > full) offset.set(full)
      opacity.set(1)
      animateSingleValue(offset, 0, springs.standard)
      return
    }
    const velocity = exitVelocity.current
    exitVelocity.current = null
    const done = () => safeToRemove?.()
    if (reduced) {
      animateSingleValue(opacity, 0, fades.scrim).then(done)
      return
    }
    const target = measure()
    animateSingleValue(offset, target, velocity !== null ? { ...springs.fling, velocity } : springs.standard).then(done)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPresent])

  const setRefs = React.useCallback(
    (node: HTMLDivElement | null) => {
      panelRef.current = node
      if (typeof forwardedRef === "function") forwardedRef(node)
      else if (forwardedRef) forwardedRef.current = node
    },
    [forwardedRef]
  )

  return (
    <>
      {modal ? (
        <ModalScrim
          opacity={scrimOpacity}
          overlay={<SheetPrimitive.Overlay forceMount className="fixed inset-0 z-50" />}
        />
      ) : null}
      <SheetPrimitive.Content
        asChild
        ref={setRefs}
        {...props}
        onCloseAutoFocus={preserveUserFocusOnClose(onCloseAutoFocus)}
        forceMount
      >
        <m.div
          className={cn(
            sheetVariants({ side }),
            modal ? "shadow-modal" : "shadow-float",
            // Durante la salida el panel ya no recibe punteros (review HU-017a, punto 2).
            "data-[state=closed]:pointer-events-none",
            className
          )}
          style={{ ...style, ...dragStyle, ...(horizontal ? { x: translate } : { y: translate }), opacity }}
          {...handlers}
        >
          {side === "bottom" ? (
            <div data-sheet-handle aria-hidden className="absolute inset-x-0 top-0 flex h-6 touch-none justify-center">
              <span className="mt-2 h-[5px] w-9 rounded-full bg-fill-pressed" />
            </div>
          ) : null}
          {children}
          <SheetPrimitive.Close className={closeButtonClass}>
            <X className="size-3.5" strokeWidth={2.25} aria-hidden />
            <span className="sr-only">Cerrar</span>
          </SheetPrimitive.Close>
        </m.div>
      </SheetPrimitive.Content>
    </>
  )
})
SheetPanel.displayName = "SheetPanel"

const SheetHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    // El encabezado también sirve de agarre en el sheet inferior (§9.8).
    data-sheet-handle=""
    className={cn(
      "flex flex-col gap-1.5 pr-8 text-center sm:text-left",
      className
    )}
    {...props}
  />
)
SheetHeader.displayName = "SheetHeader"

const SheetFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
      className
    )}
    {...props}
  />
)
SheetFooter.displayName = "SheetFooter"

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Title>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Title
    ref={ref}
    className={cn("text-title-2 text-balance text-foreground", className)}
    {...props}
  />
))
SheetTitle.displayName = SheetPrimitive.Title.displayName

const SheetDescription = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Description>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Description
    ref={ref}
    className={cn("text-callout text-muted-foreground", className)}
    {...props}
  />
))
SheetDescription.displayName = SheetPrimitive.Description.displayName

export {
  Sheet,
  SheetPortal,
  SheetOverlay,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
