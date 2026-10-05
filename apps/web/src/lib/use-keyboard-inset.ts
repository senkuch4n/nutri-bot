"use client";

import { useEffect, useState } from "react";

// HU-017d-2 (SDD 4.7, Q5): Safari de iOS no achica el layout viewport al abrir el teclado, así que un
// sheet `fixed bottom-0` queda tapado. Con el alto del teclado se levanta el panel.

/** Puro, con test. max(0, innerHeight − vv.height − vv.offsetTop); sin visualViewport → 0. */
export function keyboardInsetFrom(innerHeight: number, vv: { height: number; offsetTop: number } | null): number {
  if (!vv) return 0;
  const inset = innerHeight - vv.height - vv.offsetTop;
  return Number.isFinite(inset) && inset > 0 ? Math.round(inset) : 0;
}

/** Alto del teclado en pantalla (px) según visualViewport: max(0, innerHeight − vv.height − vv.offsetTop).
 *  0 si no hay visualViewport o si !enabled. Escucha resize/scroll de visualViewport. */
export function useKeyboardInset(enabled: boolean): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = typeof window === "undefined" ? null : window.visualViewport;
    if (!enabled || !vv) {
      setInset(0);
      return;
    }
    const update = () => setInset(keyboardInsetFrom(window.innerHeight, vv));
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, [enabled]);
  return enabled ? inset : 0;
}
