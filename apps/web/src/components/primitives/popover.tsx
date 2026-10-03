"use client"

import * as React from "react"
import * as PopoverPrimitive from "@radix-ui/react-popover"
import { AnimatePresence, m, useReducedMotionConfig } from "motion/react"

import { fades, springs } from "@/lib/motion"
import { useControllableState } from "@/lib/use-controllable-state"
import { preserveUserFocusOnClose } from "@/lib/overlay-focus"
import { useExitSnapshot } from "@/lib/use-exit-snapshot"
import { cn } from "@/lib/utils"

// HU-017a §9.0/§9.7: Radix + Motion. El Root refleja `open` (controlado o no) para que el contenido
// pueda quedar montado durante la salida (forceMount + AnimatePresence). Nace del disparador y vuelve
// a él (§7); el spring re-apunta desde el valor presente si se reabre a mitad (§3).
const PopoverOpenContext = React.createContext(false)

function Popover({
  open: openProp,
  defaultOpen,
  onOpenChange,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  const [open, setOpen] = useControllableState({
    prop: openProp,
    defaultProp: defaultOpen ?? false,
    onChange: onOpenChange,
  })
  return (
    <PopoverOpenContext.Provider value={open}>
      <PopoverPrimitive.Root open={open} onOpenChange={setOpen} {...props} />
    </PopoverOpenContext.Provider>
  )
}

const PopoverTrigger = PopoverPrimitive.Trigger

const PopoverAnchor = PopoverPrimitive.Anchor

const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, align = "center", sideOffset = 4, children, style, onCloseAutoFocus, ...props }, ref) => {
  const open = React.useContext(PopoverOpenContext)
  const content = useExitSnapshot(children, open)
  const reduced = useReducedMotionConfig()
  const hidden = reduced ? { opacity: 0 } : { opacity: 0, scale: 0.96 }

  return (
    <AnimatePresence>
      {open ? (
        <PopoverPrimitive.Portal forceMount>
          <PopoverPrimitive.Content
            asChild
            ref={ref}
            align={align}
            sideOffset={sideOffset}
            {...props}
            onCloseAutoFocus={preserveUserFocusOnClose(onCloseAutoFocus)}
            forceMount
          >
            <m.div
              className={cn(
                "material-float z-50 w-72 rounded-lg p-4 text-popover-foreground outline-none data-[state=closed]:pointer-events-none",
                className
              )}
              style={{ transformOrigin: "var(--radix-popover-content-transform-origin)", ...style }}
              initial={hidden}
              animate={{ opacity: 1, scale: 1 }}
              exit={hidden}
              transition={reduced ? fades.fast : springs.quick}
            >
              {content}
            </m.div>
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      ) : null}
    </AnimatePresence>
  )
})
PopoverContent.displayName = PopoverPrimitive.Content.displayName

export { Popover, PopoverTrigger, PopoverContent, PopoverAnchor }
