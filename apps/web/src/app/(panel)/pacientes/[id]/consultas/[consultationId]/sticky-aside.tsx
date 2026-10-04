"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const XL = "(min-width: 1280px)";
/** `top-6` del sticky + el mismo margen abajo. */
const GAP_PX = 24;

/**
 * Columna lateral de la consulta (HU-017c-3): desde 1280 px acompaña al scroll (sticky) **solo si** su
 * alto entra en la ventana; si no, queda estática (un sticky más alto que la ventana esconde su final).
 * Se mide con `ResizeObserver` (cambia al abrir el formulario de plan o escribir notas) e `innerHeight`.
 */
export function StickyAside({ label, children }: { label: string; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const [sticky, setSticky] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const mql = window.matchMedia(XL);
    const check = () => setSticky(mql.matches && el.offsetHeight + GAP_PX * 2 <= window.innerHeight);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    window.addEventListener("resize", check);
    mql.addEventListener("change", check);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", check);
      mql.removeEventListener("change", check);
    };
  }, []);

  return (
    <aside ref={ref} aria-label={label} data-sticky={sticky || undefined} className={cn("space-y-6", sticky && "sticky top-6")}>
      {children}
    </aside>
  );
}
