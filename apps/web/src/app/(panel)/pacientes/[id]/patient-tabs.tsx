"use client";

import { useSearchParams } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/primitives/tabs";
import { cn } from "@/lib/utils";

export const PATIENT_TABS = [
  { value: "resumen", label: "Resumen" },
  { value: "datos", label: "Datos y ficha clínica" },
  { value: "evolucion", label: "Evolución" },
  { value: "planes", label: "Planes" },
  { value: "diario", label: "Diario" },
  { value: "turnos", label: "Turnos" },
] as const; // HU-003 suma { value: "consultas", label: "Consultas" } acá

export type PatientTabValue = (typeof PATIENT_TABS)[number]["value"];

const DEFAULT_TAB: PatientTabValue = "resumen";

function isTab(value: string | null): value is PatientTabValue {
  return PATIENT_TABS.some((t) => t.value === value);
}

const TabContext = createContext<((tab: PatientTabValue) => void) | null>(null);

/**
 * Encabezado persistente (sticky) + seis pestañas. La pestaña activa vive en `?tab=` con
 * `history.replaceState` (sin ida al servidor, sin entradas en el historial). Los seis paneles
 * quedan montados (`forceMount`) para no perder lo escrito en un formulario al cambiar.
 */
export function PatientTabs({
  header,
  panels,
  counts,
  diaryHasRecent,
}: {
  header: ReactNode;
  panels: Record<PatientTabValue, ReactNode>;
  counts: Partial<Record<PatientTabValue, number>>;
  diaryHasRecent: boolean;
}) {
  const param = useSearchParams().get("tab");
  const fromUrl: PatientTabValue = isTab(param) ? param : DEFAULT_TAB;
  const [tab, setTabState] = useState<PatientTabValue>(fromUrl);
  const rootRef = useRef<HTMLDivElement>(null);
  const stickyRef = useRef<HTMLDivElement>(null);

  // Atrás/adelante del navegador o un Link con ?tab= distinto.
  useEffect(() => {
    setTabState(fromUrl);
  }, [fromUrl]);

  const setTab = useCallback((next: PatientTabValue) => {
    setTabState(next);
    const url = new URL(window.location.href);
    if (next === DEFAULT_TAB) url.searchParams.delete("tab");
    else url.searchParams.set("tab", next);
    window.history.replaceState(null, "", url);
  }, []);

  // Para los enlaces internos ("Ver evolución completa"): si el encabezado ya está pegado
  // arriba, el contenido nuevo arranca donde empiezan las pestañas.
  const setTabAndScroll = useCallback(
    (next: PatientTabValue) => {
      setTab(next);
      const root = rootRef.current;
      const sticky = stickyRef.current;
      if (root && sticky && root.getBoundingClientRect().top < sticky.getBoundingClientRect().top) {
        root.scrollIntoView({ block: "start" });
      }
    },
    [setTab],
  );

  return (
    <TabContext.Provider value={setTabAndScroll}>
      <div ref={rootRef} className="scroll-mt-14 lg:scroll-mt-0">
        <Tabs value={tab} onValueChange={(v) => setTab(v as PatientTabValue)}>
          <div
            ref={stickyRef}
            className="sticky top-14 z-20 -mx-6 bg-background px-6 pt-4 lg:top-0 lg:-mx-10 lg:px-10"
          >
            {header}
            {/* A 768 px las seis pestañas pueden no entrar: scrollean dentro de la barra. */}
            <div className="mt-4 overflow-x-auto overflow-y-hidden">
              <TabsList className="w-max min-w-full">
              {PATIENT_TABS.map((t) => {
                const count = counts[t.value];
                return (
                  <TabsTrigger key={t.value} value={t.value}>
                    {t.label}
                    {count !== undefined ? (
                      <span className="ml-1.5 rounded-md bg-secondary px-1.5 text-xs tabular-nums text-muted-foreground">
                        {count}
                      </span>
                    ) : null}
                    {t.value === "diario" && diaryHasRecent ? (
                      <>
                        <span aria-hidden className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-info" />
                        <span className="sr-only"> (hay entradas de las últimas 24 hs)</span>
                      </>
                    ) : null}
                  </TabsTrigger>
                );
              })}
              </TabsList>
            </div>
          </div>

          {PATIENT_TABS.map((t) => (
            <TabsContent key={t.value} value={t.value} forceMount className="data-[state=inactive]:hidden">
              {panels[t.value]}
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </TabContext.Provider>
  );
}

/** Botón con estilo de enlace que cambia de pestaña desde adentro de un panel o del encabezado. */
export function PatientTabLink({
  tab,
  children,
  className,
}: {
  tab: PatientTabValue;
  children: ReactNode;
  className?: string;
}) {
  const setTab = useContext(TabContext);
  return (
    <button
      type="button"
      onClick={() => setTab?.(tab)}
      className={cn(
        "rounded-sm text-sm font-medium text-link underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      {children}
    </button>
  );
}
