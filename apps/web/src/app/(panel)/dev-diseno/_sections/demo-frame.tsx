"use client";

import { useState, type ReactNode } from "react";
import { MotionConfig } from "motion/react";
import { cn } from "@/lib/utils";

export type DemoAnchor = { id: string; label: string };

/** Interruptor de simulación: un checkbox nativo con estilo de chip (no depende de los primitivos). */
export function SimToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label
      className={cn(
        "relative inline-flex h-8 cursor-pointer select-none items-center gap-2 rounded-full px-3 text-subheadline font-medium press-none transition-colors duration-hover",
        "has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring",
        checked ? "bg-primary-soft text-primary-vibrant" : "bg-secondary text-foreground hover:bg-fill-hover pressed:bg-fill-pressed",
      )}
    >
      <input type="checkbox" className="sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span
        aria-hidden
        className={cn("size-2 rounded-full transition-colors duration-hover", checked ? "bg-primary" : "bg-tertiary")}
      />
      {label}
    </label>
  );
}

/**
 * Marco de la demo: barra de simulación (transparencia reducida, más contraste, movimiento reducido) e índice.
 */
export function DemoFrame({
  anchors,
  children,
  stickyTop = "top-14 lg:top-0",
  className,
}: {
  anchors: DemoAnchor[];
  children: ReactNode;
  /** Altura del chrome que queda arriba de la barra (topbar móvil del panel = 3.5rem). */
  stickyTop?: string;
  className?: string;
}) {
  const [reduceTransparency, setReduceTransparency] = useState(false);
  const [moreContrast, setMoreContrast] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  return (
    <div
      className={cn(reduceTransparency && "a11y-reduce-transparency", moreContrast && "a11y-more-contrast", className)}
    >
      <MotionConfig reducedMotion={reduceMotion ? "always" : "user"}>
        <div className={cn("material-chrome sticky z-20 -mx-6 -mt-8 mb-10 px-6 py-3 lg:-mx-10 lg:px-10", stickyTop)} data-scrolled="true">
          <div className="flex flex-wrap items-center gap-2">
            <p className="mr-2 text-headline">Demo de diseño</p>
            <SimToggle label="Transparencia reducida" checked={reduceTransparency} onChange={setReduceTransparency} />
            <SimToggle label="Más contraste" checked={moreContrast} onChange={setMoreContrast} />
            <SimToggle label="Movimiento reducido" checked={reduceMotion} onChange={setReduceMotion} />
          </div>
          <nav aria-label="Secciones de la demo" className="-mx-1 mt-2 flex gap-1 overflow-x-auto pb-0.5">
            {anchors.map((a) => (
              <a
                key={a.id}
                href={`#${a.id}`}
                className="shrink-0 rounded-md px-2 py-1 text-footnote font-medium text-muted-foreground press-none transition-colors duration-hover hover:bg-overlay-hover hover:text-foreground pressed:bg-overlay-pressed"
              >
                {a.label}
              </a>
            ))}
          </nav>
          <p className="mt-1 text-footnote text-muted-foreground">
            El press con movimiento reducido y el modo táctil (<code>pointer: coarse</code>) solo se ven con el ajuste real
            del sistema o la emulación de DevTools.
          </p>
        </div>
        <div className="space-y-16 pb-24">{children}</div>
      </MotionConfig>
    </div>
  );
}
