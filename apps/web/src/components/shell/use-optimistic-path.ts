"use client";

import { useCallback, useEffect, useState, type MouseEvent } from "react";
import { usePathname } from "next/navigation";
import { isPlainLeftClick } from "@/lib/motion";

/** Tope para el activo optimista si la navegación no cambia la ruta (falla o redirige; R-9). */
const PENDING_TIMEOUT_MS = 4000;

/**
 * Activo optimista de la navegación (§1, S1/P3): al hacer clic plano en un link, el indicador ya se
 * mueve a su destino mientras carga la página. Se limpia cuando cambia la ruta real o a los 4 s.
 * Cmd/Ctrl/Shift/Alt-clic y clic medio (abren otra pestaña) no marcan nada.
 */
export function useOptimisticPath(): {
  pathname: string;
  markPending: (href: string, e: MouseEvent) => void;
} {
  const pathname = usePathname();
  const [pending, setPending] = useState<{ href: string; from: string } | null>(null);

  useEffect(() => {
    if (!pending) return;
    const t = setTimeout(() => setPending(null), PENDING_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [pending]);

  const markPending = useCallback(
    (href: string, e: MouseEvent) => {
      if (!isPlainLeftClick(e)) return;
      const target = (e.currentTarget as HTMLAnchorElement | null)?.getAttribute?.("target");
      if (target && target !== "_self") return;
      setPending({ href, from: pathname });
    },
    [pathname],
  );

  // Válido solo mientras la ruta real sigue siendo la del clic.
  const optimistic = pending && pending.from === pathname ? pending.href : null;
  return { pathname: optimistic ?? pathname, markPending };
}
