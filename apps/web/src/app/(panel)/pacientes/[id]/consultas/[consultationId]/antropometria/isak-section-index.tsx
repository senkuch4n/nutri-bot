"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface IsakSection {
  id: string;
  label: string;
}

/**
 * Índice de secciones del estudio ISAK (HU-017c-3). Por debajo de 1280 px, una fila de chips pegada
 * arriba (con scroll horizontal propio); desde `xl`, una lista lateral pegada. `IntersectionObserver`
 * marca la sección que se está leyendo (`aria-current`). Los enlaces son anclas comunes: cada sección
 * tiene su `scroll-margin-top`, así el título no queda tapado.
 */
export function IsakSectionIndex({ sections, variant }: { sections: readonly IsakSection[]; variant: "chips" | "list" }) {
  const [active, setActive] = useState(sections[0]?.id ?? "");
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const targets = sections
      .map((s) => document.getElementById(s.id))
      .filter((el): el is HTMLElement => el !== null);
    if (targets.length === 0) return;
    const visible = new Map<string, boolean>();
    // La franja de "lectura" va del 15 % al 45 % de la ventana: la sección activa es la primera que la toca.
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) visible.set(entry.target.id, entry.isIntersecting);
        const first = sections.find((s) => visible.get(s.id));
        if (first) setActive(first.id);
      },
      { rootMargin: "-15% 0px -55% 0px" },
    );
    for (const el of targets) observer.observe(el);
    return () => observer.disconnect();
  }, [sections]);

  // Chips: la activa queda a la vista dentro de la fila (sin animar: también cambia con el teclado).
  useEffect(() => {
    if (variant !== "chips") return;
    const link = listRef.current?.querySelector<HTMLElement>(`[data-id="${active}"]`);
    const list = listRef.current;
    if (!link || !list) return;
    const { left, right } = link.getBoundingClientRect();
    const box = list.getBoundingClientRect();
    if (left < box.left || right > box.right) list.scrollLeft += left - box.left - 16;
  }, [active, variant]);

  return (
    <nav aria-label="Secciones del estudio">
      <ul
        ref={listRef}
        className={cn(
          variant === "chips"
            ? "flex gap-2 overflow-x-auto py-2 [scrollbar-width:none]"
            : "space-y-0.5",
        )}
      >
        {sections.map((s) => {
          const current = s.id === active;
          return (
            <li key={s.id} className={variant === "chips" ? "shrink-0" : undefined}>
              <a
                href={`#${s.id}`}
                data-id={s.id}
                aria-current={current ? "location" : undefined}
                onClick={() => setActive(s.id)}
                className={cn(
                  "flex items-center rounded-full text-subheadline transition-colors duration-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  variant === "chips"
                    ? "h-9 whitespace-nowrap px-3.5 touch-target"
                    : "min-h-9 rounded-md px-3 py-1.5",
                  current
                    ? "bg-primary-soft font-semibold text-primary"
                    : variant === "chips"
                      ? "bg-secondary text-foreground hover:bg-fill-hover"
                      : "text-muted-foreground hover:bg-overlay-hover hover:text-foreground",
                )}
              >
                {s.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
