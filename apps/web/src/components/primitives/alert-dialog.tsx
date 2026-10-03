"use client"

import * as React from "react"
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog"
import { AnimatePresence, m, useReducedMotionConfig } from "motion/react"

import { buttonVariants } from "@/components/primitives/button"
import { fades, springs } from "@/lib/motion"
import { useControllableState } from "@/lib/use-controllable-state"
import { ExitFocusGuard, ModalScrim } from "@/components/primitives/modal-scrim"
import { preserveUserFocusOnClose } from "@/lib/overlay-focus"
import { useExitSnapshot } from "@/lib/use-exit-snapshot"
import { cn } from "@/lib/utils"

// HU-017a §9.7: alerta de Apple (centrada, angosta, acciones de 44 px) con el patrón Radix + Motion
// de dialog.tsx.
const AlertDialogOpenContext = React.createContext(false)

function AlertDialog({
  open: openProp,
  defaultOpen,
  onOpenChange,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Root>) {
  const [open, setOpen] = useControllableState({
    prop: openProp,
    defaultProp: defaultOpen ?? false,
    onChange: onOpenChange,
  })
  return (
    <AlertDialogOpenContext.Provider value={open}>
      <AlertDialogPrimitive.Root open={open} onOpenChange={setOpen} {...props} />
    </AlertDialogOpenContext.Provider>
  )
}

const AlertDialogTrigger = AlertDialogPrimitive.Trigger

const AlertDialogPortal = AlertDialogPrimitive.Portal

/** Overlay suelto (API conservada). `AlertDialogContent` usa su propio scrim animado. */
const AlertDialogOverlay = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Overlay
    className={cn(
      "fixed inset-0 z-50 bg-scrim duration-scrim data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
    ref={ref}
  />
))
AlertDialogOverlay.displayName = AlertDialogPrimitive.Overlay.displayName

const AlertDialogContent = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Content>
>(({ className, children, style, onCloseAutoFocus, ...props }, ref) => {
  const open = React.useContext(AlertDialogOpenContext)
  const content = useExitSnapshot(children, open)
  const reduced = useReducedMotionConfig()
  const hidden = reduced ? { opacity: 0 } : { opacity: 0, scale: 0.96 }

  return (
    <AnimatePresence>
      {open ? (
        <AlertDialogPrimitive.Portal forceMount>
          <ModalScrim overlay={<AlertDialogPrimitive.Overlay forceMount className="fixed inset-0 z-50" />} />
          <div className="pointer-events-none fixed inset-0 z-50 grid place-items-center p-4">
            <AlertDialogPrimitive.Content
              asChild
              ref={ref}
              {...props}
              onCloseAutoFocus={preserveUserFocusOnClose(onCloseAutoFocus)}
              forceMount
            >
              <m.div
                className={cn(
                  "pointer-events-auto grid w-full max-w-[22.5rem] gap-4 rounded-2xl bg-background p-5 text-center text-foreground shadow-modal outline-none data-[state=closed]:pointer-events-none",
                  className
                )}
                style={style}
                initial={hidden}
                animate={{ opacity: 1, scale: 1 }}
                exit={hidden}
                transition={reduced ? fades.fast : springs.modal}
              >
                {content}
                <ExitFocusGuard />
              </m.div>
            </AlertDialogPrimitive.Content>
          </div>
        </AlertDialogPrimitive.Portal>
      ) : null}
    </AnimatePresence>
  )
})
AlertDialogContent.displayName = AlertDialogPrimitive.Content.displayName

const AlertDialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("grid gap-1.5 text-center", className)} {...props} />
)
AlertDialogHeader.displayName = "AlertDialogHeader"

// Dos columnas iguales; si una etiqueta no entra, se apilan con la acción arriba y Cancelar abajo.
const AlertDialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("flex flex-wrap-reverse gap-2 pt-1 [&>*]:min-w-fit [&>*]:flex-1", className)}
    {...props}
  />
)
AlertDialogFooter.displayName = "AlertDialogFooter"

const AlertDialogTitle = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Title
    ref={ref}
    className={cn("text-headline text-balance", className)}
    {...props}
  />
))
AlertDialogTitle.displayName = AlertDialogPrimitive.Title.displayName

const AlertDialogDescription = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Description
    ref={ref}
    className={cn("text-pretty text-subheadline text-muted-foreground", className)}
    {...props}
  />
))
AlertDialogDescription.displayName =
  AlertDialogPrimitive.Description.displayName

const AlertDialogAction = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Action>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Action>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Action
    ref={ref}
    className={cn(buttonVariants({ size: "lg" }), className)}
    {...props}
  />
))
AlertDialogAction.displayName = AlertDialogPrimitive.Action.displayName

const AlertDialogCancel = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Cancel>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Cancel>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Cancel
    ref={ref}
    className={cn(buttonVariants({ variant: "secondary", size: "lg" }), className)}
    {...props}
  />
))
AlertDialogCancel.displayName = AlertDialogPrimitive.Cancel.displayName

export {
  AlertDialog,
  AlertDialogPortal,
  AlertDialogOverlay,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
}
