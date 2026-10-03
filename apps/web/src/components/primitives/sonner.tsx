"use client";

import type { CSSProperties } from "react";
import { Toaster as Sonner } from "sonner";
import { radii } from "@/lib/design-tokens";

type ToasterProps = React.ComponentProps<typeof Sonner>;

// HU-017a §9.7: toasts con material flotante. Sonner pinta fondo/borde/texto con sus variables; acá se
// las apuntamos a los tokens y la clase `material-float` suma el blur y el texto vibrant.
const sonnerVars = {
  "--normal-bg": "hsl(var(--background) / var(--material-float-alpha))",
  "--normal-border": "transparent",
  "--normal-text": "hsl(var(--foreground))",
  "--border-radius": radii.lg,
} as CSSProperties;

/**
 * Clases de cada toast. El `li` lleva `group` **y** `toast` (para los `group-[.toast]:` de la
 * descripción y los botones: compilan a `.group.toast .x`) y además `group/toast` (para los íconos por
 * `data-type`). Review HU-017a, punto 3.
 */
export const toastClassNames = {
  toast:
    "group toast group/toast material-float group-[.toaster]:rounded-lg group-[.toaster]:!shadow-float group-[.toaster]:text-callout group-[.toaster]:text-foreground",
  title: "font-semibold",
  description: "group-[.toast]:text-subheadline group-[.toast]:text-muted-foreground",
  icon: "group-data-[type=success]/toast:text-success group-data-[type=error]/toast:text-destructive group-data-[type=info]/toast:text-info group-data-[type=warning]/toast:text-warning",
  actionButton: "group-[.toast]:!rounded-md group-[.toast]:!bg-primary group-[.toast]:!text-primary-foreground",
  cancelButton: "group-[.toast]:!rounded-md group-[.toast]:!bg-secondary group-[.toast]:!text-foreground",
}

// Sin next-themes: el modo oscuro queda preparado en los tokens pero no se activa (D3 → 017f).
const Toaster = ({ style, ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      style={{ ...sonnerVars, ...style }}
      toastOptions={{ classNames: toastClassNames }}
      {...props}
    />
  );
};

export { Toaster };
