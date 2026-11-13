"use client";

import { useEffect, type ReactNode } from "react";
import { LazyMotion, MotionConfig } from "motion/react";

const loadFeatures = () => import("@/lib/motion-features").then((r) => r.default);

function noop() {}

/**
 * Motion para toda la app: features cargadas en diferido (`strict` obliga a usar `m.*`) y
 * `reducedMotion="user"` (con movimiento reducido Motion anula transform/layout y conserva opacidad).
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    // Safari iOS solo aplica :active si hay algún listener de touchstart.
    document.addEventListener("touchstart", noop, { passive: true });
    return () => document.removeEventListener("touchstart", noop);
  }, []);

  return (
    <LazyMotion features={loadFeatures} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
