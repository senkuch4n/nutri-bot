"use client"

import * as React from "react"
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu"
import { Check, ChevronRight } from "lucide-react"
import { AnimatePresence, m, useReducedMotionConfig } from "motion/react"

import { fades, springs } from "@/lib/motion"
import { useControllableState } from "@/lib/use-controllable-state"
import { preserveUserFocusOnClose } from "@/lib/overlay-focus"
import { useExitSnapshot } from "@/lib/use-exit-snapshot"
import { cn } from "@/lib/utils"

// HU-017a §9.0/§9.7: Radix + Motion, igual que Popover. Material flotante; crece desde el disparador
// y vuelve a él (§7). Ítems de 44 px en táctil.
const MenuOpenContext = React.createContext(false)
const SubOpenContext = React.createContext(false)

function DropdownMenu({
  open: openProp,
  defaultOpen,
  onOpenChange,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Root>) {
  const [open, setOpen] = useControllableState({
    prop: openProp,
    defaultProp: defaultOpen ?? false,
    onChange: onOpenChange,
  })
  return (
    <MenuOpenContext.Provider value={open}>
      <DropdownMenuPrimitive.Root open={open} onOpenChange={setOpen} {...props} />
    </MenuOpenContext.Provider>
  )
}

function DropdownMenuSub({
  open: openProp,
  defaultOpen,
  onOpenChange,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Sub>) {
  const [open, setOpen] = useControllableState({
    prop: openProp,
    defaultProp: defaultOpen ?? false,
    onChange: onOpenChange,
  })
  return (
    <SubOpenContext.Provider value={open}>
      <DropdownMenuPrimitive.Sub open={open} onOpenChange={setOpen} {...props} />
    </SubOpenContext.Provider>
  )
}

const menuSurface =
  "material-float z-50 min-w-[12rem] overflow-y-auto overflow-x-hidden rounded-lg p-1.5 text-popover-foreground outline-none data-[state=closed]:pointer-events-none"

const itemBase =
  "relative flex h-8 cursor-default select-none items-center gap-2.5 rounded-md px-2.5 text-callout outline-none transition-colors duration-hover focus:bg-overlay-hover data-[disabled]:pointer-events-none data-[disabled]:opacity-40 [@media(pointer:coarse)]:h-11 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0"

function useMenuMotion() {
  const reduced = useReducedMotionConfig()
  const hidden = reduced ? { opacity: 0 } : { opacity: 0, scale: 0.96 }
  return { initial: hidden, animate: { opacity: 1, scale: 1 }, exit: hidden, transition: reduced ? fades.fast : springs.quick }
}

const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger

const DropdownMenuGroup = DropdownMenuPrimitive.Group

const DropdownMenuPortal = DropdownMenuPrimitive.Portal

const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup

const DropdownMenuSubTrigger = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.SubTrigger>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubTrigger> & {
    inset?: boolean
  }
>(({ className, inset, children, ...props }, ref) => (
  <DropdownMenuPrimitive.SubTrigger
    ref={ref}
    className={cn(
      itemBase,
      "data-[state=open]:bg-overlay-hover",
      inset && "pl-8",
      className
    )}
    {...props}
  >
    {children}
    <ChevronRight className="ml-auto text-tertiary" strokeWidth={1.75} aria-hidden />
  </DropdownMenuPrimitive.SubTrigger>
))
DropdownMenuSubTrigger.displayName =
  DropdownMenuPrimitive.SubTrigger.displayName

const DropdownMenuSubContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.SubContent>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubContent>
>(({ className, children, style, ...props }, ref) => {
  const open = React.useContext(SubOpenContext)
  const content = useExitSnapshot(children, open)
  const motionProps = useMenuMotion()
  return (
    <AnimatePresence>
      {open ? (
        <DropdownMenuPrimitive.Portal forceMount>
          <DropdownMenuPrimitive.SubContent asChild ref={ref} {...props} forceMount>
            <m.div
              className={cn(menuSurface, className)}
              style={{ transformOrigin: "var(--radix-dropdown-menu-content-transform-origin)", ...style }}
              {...motionProps}
            >
              {content}
            </m.div>
          </DropdownMenuPrimitive.SubContent>
        </DropdownMenuPrimitive.Portal>
      ) : null}
    </AnimatePresence>
  )
})
DropdownMenuSubContent.displayName =
  DropdownMenuPrimitive.SubContent.displayName

const DropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(({ className, sideOffset = 4, children, style, onCloseAutoFocus, ...props }, ref) => {
  const open = React.useContext(MenuOpenContext)
  const content = useExitSnapshot(children, open)
  const motionProps = useMenuMotion()
  return (
    <AnimatePresence>
      {open ? (
        <DropdownMenuPrimitive.Portal forceMount>
          <DropdownMenuPrimitive.Content
            asChild
            ref={ref}
            sideOffset={sideOffset}
            {...props}
            onCloseAutoFocus={preserveUserFocusOnClose(onCloseAutoFocus)}
            forceMount
          >
            <m.div
              className={cn(menuSurface, "max-h-[var(--radix-dropdown-menu-content-available-height)]", className)}
              style={{ transformOrigin: "var(--radix-dropdown-menu-content-transform-origin)", ...style }}
              {...motionProps}
            >
              {content}
            </m.div>
          </DropdownMenuPrimitive.Content>
        </DropdownMenuPrimitive.Portal>
      ) : null}
    </AnimatePresence>
  )
})
DropdownMenuContent.displayName = DropdownMenuPrimitive.Content.displayName

const DropdownMenuItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & {
    inset?: boolean
    /** `destructive`: texto e ícono rojos (la acción irreversible pide confirmación aparte). */
    variant?: "default" | "destructive"
  }
>(({ className, inset, variant = "default", ...props }, ref) => (
  <DropdownMenuPrimitive.Item
    ref={ref}
    className={cn(
      itemBase,
      variant === "destructive" && "text-destructive",
      inset && "pl-8",
      className
    )}
    {...props}
  />
))
DropdownMenuItem.displayName = DropdownMenuPrimitive.Item.displayName

const DropdownMenuCheckboxItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.CheckboxItem>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.CheckboxItem>
>(({ className, children, checked, ...props }, ref) => (
  <DropdownMenuPrimitive.CheckboxItem
    ref={ref}
    className={cn(
      itemBase,
      "pl-8",
      className
    )}
    checked={checked}
    {...props}
  >
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      <DropdownMenuPrimitive.ItemIndicator>
        <Check className="size-4 text-primary" strokeWidth={2.25} aria-hidden />
      </DropdownMenuPrimitive.ItemIndicator>
    </span>
    {children}
  </DropdownMenuPrimitive.CheckboxItem>
))
DropdownMenuCheckboxItem.displayName =
  DropdownMenuPrimitive.CheckboxItem.displayName

const DropdownMenuRadioItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.RadioItem>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.RadioItem>
>(({ className, children, ...props }, ref) => (
  <DropdownMenuPrimitive.RadioItem
    ref={ref}
    className={cn(
      itemBase,
      "pl-8",
      className
    )}
    {...props}
  >
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      <DropdownMenuPrimitive.ItemIndicator>
        <span className="size-2 rounded-full bg-primary" aria-hidden />
      </DropdownMenuPrimitive.ItemIndicator>
    </span>
    {children}
  </DropdownMenuPrimitive.RadioItem>
))
DropdownMenuRadioItem.displayName = DropdownMenuPrimitive.RadioItem.displayName

const DropdownMenuLabel = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label> & {
    inset?: boolean
  }
>(({ className, inset, ...props }, ref) => (
  <DropdownMenuPrimitive.Label
    ref={ref}
    className={cn(
      "px-2.5 pb-1 pt-1.5 text-footnote font-semibold text-muted-foreground",
      inset && "pl-8",
      className
    )}
    {...props}
  />
))
DropdownMenuLabel.displayName = DropdownMenuPrimitive.Label.displayName

const DropdownMenuSeparator = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Separator
    ref={ref}
    className={cn("-mx-1.5 my-1.5 h-px bg-border", className)}
    {...props}
  />
))
DropdownMenuSeparator.displayName = DropdownMenuPrimitive.Separator.displayName

const DropdownMenuShortcut = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) => {
  return (
    <span
      className={cn("ml-auto text-footnote tracking-widest text-muted-foreground", className)}
      {...props}
    />
  )
}
DropdownMenuShortcut.displayName = "DropdownMenuShortcut"

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuGroup,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuRadioGroup,
}
