"use client"

import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { AnimatePresence, m, useReducedMotionConfig } from "motion/react"
import { X } from "lucide-react"

import { fades, springs } from "@/lib/motion"
import { useControllableState } from "@/lib/use-controllable-state"
import { ExitFocusGuard, ModalScrim } from "@/components/primitives/modal-scrim"
import { preserveUserFocusOnClose } from "@/lib/overlay-focus"
import { useExitSnapshot } from "@/lib/use-exit-snapshot"
import { cn } from "@/lib/utils"

// HU-017a §9.0 (patrón Radix + Motion): el Root refleja `open` (controlado o no) en un contexto; el
// contenido se monta con forceMount dentro de AnimatePresence, así la salida corre entera y se puede
// reabrir a mitad desde el valor presente (§3). Durante la salida Radix ya no atrapa el foco ni
// bloquea punteros (depende de `context.open`); el foco vuelve al disparador al desmontar.
const DialogOpenContext = React.createContext(false)

function Dialog({
  open: openProp,
  defaultOpen,
  onOpenChange,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  const [open, setOpen] = useControllableState({
    prop: openProp,
    defaultProp: defaultOpen ?? false,
    onChange: onOpenChange,
  })
  return (
    <DialogOpenContext.Provider value={open}>
      <DialogPrimitive.Root open={open} onOpenChange={setOpen} {...props} />
    </DialogOpenContext.Provider>
  )
}

const DialogTrigger = DialogPrimitive.Trigger

const DialogPortal = DialogPrimitive.Portal

const DialogClose = DialogPrimitive.Close

/** Overlay suelto (API conservada). `DialogContent` usa su propio scrim animado. */
const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-scrim duration-scrim data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

/** X de cierre estilo "xmark.circle": 30 px visibles, 44 px de objetivo en táctil. */
const closeButtonClass =
  "absolute right-3 top-3 grid size-[1.875rem] place-items-center rounded-full bg-secondary text-muted-foreground press touch-target hover:bg-fill-hover pressed:bg-fill-pressed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none"

function CloseX() {
  return (
    <DialogPrimitive.Close className={closeButtonClass}>
      <X className="size-3.5" strokeWidth={2.25} aria-hidden />
      <span className="sr-only">Cerrar</span>
    </DialogPrimitive.Close>
  )
}

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, style, onCloseAutoFocus, ...props }, ref) => {
  const open = React.useContext(DialogOpenContext)
  const content = useExitSnapshot(children, open)
  const reduced = useReducedMotionConfig()
  const hidden = reduced ? { opacity: 0 } : { opacity: 0, scale: 0.96 }

  return (
    <AnimatePresence>
      {open ? (
        <DialogPrimitive.Portal forceMount>
          <ModalScrim overlay={<DialogPrimitive.Overlay forceMount className="fixed inset-0 z-50" />} />
          {/* Centrado sin translate (Motion escribe `transform`): el clic afuera cae en el Overlay. */}
          <div className="pointer-events-none fixed inset-0 z-50 grid place-items-center p-4">
            <DialogPrimitive.Content
              asChild
              ref={ref}
              {...props}
              onCloseAutoFocus={preserveUserFocusOnClose(onCloseAutoFocus)}
              forceMount
            >
              <m.div
                className={cn(
                  // Durante la salida (data-state=closed) el contenido ya no recibe punteros.
                  "pointer-events-auto relative grid max-h-[90dvh] w-full max-w-lg gap-4 overflow-y-auto overscroll-contain rounded-2xl bg-background p-6 text-foreground shadow-modal outline-none data-[state=closed]:pointer-events-none",
                  className
                )}
                style={style}
                initial={hidden}
                animate={{ opacity: 1, scale: 1 }}
                exit={hidden}
                transition={reduced ? fades.fast : springs.modal}
              >
                {content}
                <CloseX />
                <ExitFocusGuard />
              </m.div>
            </DialogPrimitive.Content>
          </div>
        </DialogPrimitive.Portal>
      ) : null}
    </AnimatePresence>
  )
})
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col gap-1.5 pr-8 text-center sm:text-left",
      className
    )}
    {...props}
  />
)
DialogHeader.displayName = "DialogHeader"

const DialogFooter = ({
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
DialogFooter.displayName = "DialogFooter"

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-title-2 text-balance text-foreground", className)}
    {...props}
  />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-callout text-muted-foreground", className)}
    {...props}
  />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  closeButtonClass,
}
