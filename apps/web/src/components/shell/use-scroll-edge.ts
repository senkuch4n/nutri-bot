"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Scroll edge (§12): `scrolled` pasa a `true` cuando el contenido empieza a pasar por debajo del
 * chrome. El sentinela va inmediatamente después del header (a `offsetPx` del borde superior); con
 * `rootMargin` negativo deja de intersectar apenas se scrollea.
 */
export function useScrollEdge(offsetPx: number): {
  sentinelRef: React.RefObject<HTMLDivElement | null>;
  scrolled: boolean;
} {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => setScrolled(entry ? !entry.isIntersecting : false), {
      rootMargin: `-${offsetPx}px 0px 0px 0px`,
    });
    io.observe(el);
    return () => io.disconnect();
  }, [offsetPx]);

  return { sentinelRef, scrolled };
}
