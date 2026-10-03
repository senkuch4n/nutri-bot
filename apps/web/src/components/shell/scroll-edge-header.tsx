"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useScrollEdge } from "./use-scroll-edge";

/**
 * `<header>` de chrome translúcido con scroll edge (§12): sin borde fijo; la línea aparece solo cuando
 * el contenido pasa por debajo. El sentinela queda en el flujo justo después del header; el offset es
 * la altura real del header (incluye la safe area del portal).
 */
export function ScrollEdgeHeader({
  className,
  offsetPx = 56,
  children,
}: {
  className?: string;
  offsetPx?: number;
  children: ReactNode;
}) {
  const headerRef = useRef<HTMLElement>(null);
  const [height, setHeight] = useState(offsetPx);
  useLayoutEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const update = () => setHeight(el.offsetHeight || offsetPx);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [offsetPx]);
  const { sentinelRef, scrolled } = useScrollEdge(height);

  return (
    <>
      <header ref={headerRef} className={cn("material-chrome", className)} data-scrolled={scrolled}>
        {children}
      </header>
      <div ref={sentinelRef} aria-hidden className="pointer-events-none -mb-px h-px" />
    </>
  );
}
