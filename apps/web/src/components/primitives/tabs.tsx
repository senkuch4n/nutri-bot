"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { LayoutGroup, m } from "motion/react";

import { springs } from "@/lib/motion";
import { useControllableState } from "@/lib/use-controllable-state";
import { cn } from "@/lib/utils";

// HU-017a §9.5: el indicador se desliza de una pestaña a otra con un spring (§7, §8). `Tabs` refleja
// el valor activo (controlado o no) para saber dónde dibujarlo; la API es la de Radix.
const TabsValueContext = React.createContext<string | undefined>(undefined);

const Tabs = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Root>
>(({ value: valueProp, defaultValue, onValueChange, ...props }, ref) => {
  const [value, setValue] = useControllableState<string | undefined>({
    prop: valueProp,
    defaultProp: defaultValue,
    onChange: onValueChange as ((v: string | undefined) => void) | undefined,
  });
  const id = React.useId();
  return (
    <LayoutGroup id={id}>
      <TabsValueContext.Provider value={value}>
        <TabsPrimitive.Root ref={ref} value={value} onValueChange={setValue} {...props} />
      </TabsValueContext.Provider>
    </LayoutGroup>
  );
});
Tabs.displayName = TabsPrimitive.Root.displayName;

// Estilo subrayado: la lista es una línea inferior y el indicador tint la pisa.
const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn("relative inline-flex h-11 w-full items-center justify-start gap-6 border-b border-border", className)}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, children, ...props }, ref) => {
  const active = React.useContext(TabsValueContext) === props.value;
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(
        "group/tab relative inline-flex h-full items-center whitespace-nowrap px-0.5 text-callout font-medium text-muted-foreground transition-colors duration-hover ease-out-soft hover:text-foreground pressed:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-40 data-[state=active]:text-foreground",
        className,
      )}
      {...props}
    >
      {children}
      {active ? (
        <m.span
          layoutId="tab-indicator"
          aria-hidden
          transition={springs.indicator}
          // En orientación vertical de escritorio (Ajustes) la pantalla dibuja su propio activo.
          className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-primary lg:group-data-[orientation=vertical]/tab:hidden"
        />
      ) : null}
    </TabsPrimitive.Trigger>
  );
});
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn("mt-6 focus-visible:outline-none data-[state=active]:animate-fade-in", className)}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
