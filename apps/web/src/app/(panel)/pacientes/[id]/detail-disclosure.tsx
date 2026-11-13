"use client";

import { useId, useState, type ReactNode } from "react";
import { AnimatePresence, m, useReducedMotionConfig } from "motion/react";
import { ChevronRight } from "lucide-react";
import { fades, springs } from "@/lib/motion";

/** Disclosure "Ver detalle" (HU-017c-2): lo técnico queda un nivel más adentro. Cerrado por defecto;
 *  el contenido entra con un fundido (sin animar la altura) y el chevron gira (sin giro con movimiento
 *  reducido). */
export function DetailDisclosure({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const reduced = Boolean(useReducedMotionConfig());
  const contentId = useId();
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setOpen((o) => !o)}
        className="-mx-1 inline-flex min-h-11 items-center gap-1 rounded-md px-1 text-callout font-medium text-primary press-none pressed:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {label}
        <m.span
          aria-hidden
          className="inline-flex"
          initial={false}
          animate={{ rotate: open ? 90 : 0 }}
          transition={reduced ? { duration: 0 } : springs.quick}
        >
          <ChevronRight className="size-4" strokeWidth={2} />
        </m.span>
      </button>
      <div id={contentId}>
        <AnimatePresence initial={false}>
          {open ? (
            <m.div key="detail" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={fades.fast}>
              {children}
            </m.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}
