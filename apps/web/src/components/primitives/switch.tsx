"use client"

import * as React from "react"
import * as SwitchPrimitives from "@radix-ui/react-switch"
import { m, useReducedMotionConfig } from "motion/react"

import { springs } from "@/lib/motion"
import { useControllableState } from "@/lib/use-controllable-state"
import { cn } from "@/lib/utils"

// 44 × 26 (proporción iOS) con 2 px de aire: el thumb de 22 px recorre 18 px.
const THUMB_TRAVEL = 18

/**
 * Switch con thumb físico (spring `toggle`, §4): misma API que Radix. El estado se refleja localmente
 * (controlado o no) para animar el thumb con Motion; en press el thumb se estira hacia donde va.
 */
const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, checked: checkedProp, defaultChecked, onCheckedChange, ...props }, ref) => {
  const [checked, setChecked] = useControllableState({
    prop: checkedProp,
    defaultProp: defaultChecked ?? false,
    onChange: onCheckedChange,
  })
  const reduced = useReducedMotionConfig()

  return (
    <SwitchPrimitives.Root
      className={cn(
        "group/switch peer relative inline-flex h-[1.625rem] w-[2.75rem] shrink-0 cursor-pointer items-center rounded-full p-0.5 touch-target transition-colors duration-content ease-out-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-40 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input",
        className
      )}
      checked={checked}
      onCheckedChange={setChecked}
      {...props}
      ref={ref}
    >
      <SwitchPrimitives.Thumb asChild>
        <m.span
          className="pointer-events-none relative block size-[1.375rem]"
          initial={false}
          animate={{ x: checked ? THUMB_TRAVEL : 0 }}
          transition={reduced ? { duration: 0 } : springs.toggle}
        >
          <span
            aria-hidden
            className="absolute inset-y-0 left-0 block w-full rounded-full bg-white shadow-thumb transition-[width] duration-release ease-out-soft group-active/switch:w-[1.625rem] group-active/switch:duration-press group-disabled/switch:!w-full group-data-[state=checked]/switch:left-auto group-data-[state=checked]/switch:right-0"
          />
        </m.span>
      </SwitchPrimitives.Thumb>
    </SwitchPrimitives.Root>
  )
})
Switch.displayName = SwitchPrimitives.Root.displayName

export { Switch }
