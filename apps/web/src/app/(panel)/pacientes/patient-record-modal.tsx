"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { MorphDialog, MorphDialogContent } from "@/components/primitives/morph-dialog";
import { MORPH_LIFT_CLOSE_MS } from "@/lib/morph";
import { modalNavKeyframes, nextModalHistoryDepth } from "@/lib/modal-history";
import { takePatientModalOrigin } from "@/lib/patient-modal-origin";
import { PatientModalPreviewContext } from "./patient-modal-skeleton";

/** La ficha abierta desde la lista: MorphDialog que crece desde la tarjeta tocada. Adentro también se abre
 *  el plan (ruta `(.)[id]/planes/[planId]`), en el mismo diálogo. Cerrar (Escape, la X, tocar afuera)
 *  anima la vuelta y recién después retrocede todos los pasos dados adentro, hasta `/pacientes`.
 *  Como en el video de referencia: la fila se levanta (`lift`), las iniciales, el nombre y la etapa
 *  viajan al encabezado (`data-morph-id`) y el cuerpo aparece de arriba hacia abajo (`cascade`).
 *  "Atrás" del navegador desmonta el slot directo: Radix y el MorphDialog limpian solos el origen. */
/** El contenedor con scroll del diálogo (el cuerpo del MorphDialog). */
function scrollParent(el: HTMLElement): HTMLElement | null {
  for (let node = el.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if (overflowY === "auto" || overflowY === "scroll") return node;
  }
  return null;
}

export function PatientRecordModal({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const [{ origin, preview }] = useState(takePatientModalOrigin);
  const backTimer = useRef<number | null>(null);

  // Pasos dentro del modal (ficha → plan → ficha…): la ✕ los deshace todos y vuelve a la lista. Un
  // cambio de ruta tras un `popstate` es el Atrás del navegador; cualquier otro, una entrada nueva.
  const pathname = usePathname();
  const depth = useRef(1);
  const lastPath = useRef(pathname);
  const popping = useRef(false);
  useEffect(() => {
    const onPop = () => {
      popping.current = true;
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  // Al navegar adentro (ficha ↔ plan) el diálogo se queda y cambia el contenido: entra deslizándose
  // (avanzar desde la derecha, volver desde la izquierda) y el scroll vuelve arriba. Antes de pintar, para
  // que no se vea el cambio de golpe; sin remontar el contenido (es el árbol del router de Next).
  const screenRef = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    if (pathname === lastPath.current) return;
    lastPath.current = pathname;
    const kind = popping.current ? "pop" : "push";
    popping.current = false;
    depth.current = nextModalHistoryDepth(depth.current, kind);
    const screen = screenRef.current;
    if (!screen) return;
    scrollParent(screen)?.scrollTo({ top: 0 });
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    screen.animate(modalNavKeyframes(kind), { duration: 360, easing: "cubic-bezier(0.22, 1, 0.36, 1)" });
  }, [pathname]);

  useEffect(
    () => () => {
      if (backTimer.current !== null) window.clearTimeout(backTimer.current);
    },
    [],
  );

  return (
    <MorphDialog
      open={open}
      origin={origin}
      lift
      cascade
      onOpenChange={(next) => {
        if (next || !open) return;
        setOpen(false);
        backTimer.current = window.setTimeout(() => {
          if (depth.current > 1) window.history.go(-depth.current);
          else router.back();
        }, MORPH_LIFT_CLOSE_MS);
      }}
    >
      {/* ink-accent (globals.css): en el modal de la ficha, el azul de acción pasa a negro y los avisos a gris.
          Alto fijo (el máximo, el del Resumen) en todas las pestañas y en el plan: el diálogo no cambia de
          tamaño al pasar de una a otra; lo que no entra se scrollea adentro. */}
      <MorphDialogContent size="xl" aria-describedby={undefined} className="ink-accent h-[85dvh]">
        <PatientModalPreviewContext.Provider value={preview}>
          <div ref={screenRef}>{children}</div>
        </PatientModalPreviewContext.Provider>
      </MorphDialogContent>
    </MorphDialog>
  );
}
