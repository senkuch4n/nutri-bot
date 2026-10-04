"use client";

import { useSearchParams } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { PATIENT_SUMMARY_TEXT } from "@nutri-bot/core";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/primitives/tabs";
import { useScrollEdge } from "@/components/shell/use-scroll-edge";
import { Button } from "@/components/ui";
import {
  PATIENT_TABS,
  patientTabQuery,
  resolvePatientTab,
  type HistoryView,
  type PatientTab,
} from "@/lib/patient-tab-route";
import { useMediaQuery } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";

const TAB_LABELS: Record<PatientTab, string> = {
  resumen: "Resumen",
  consultas: "Consultas",
  planes: "Plan",
  historial: "Historial",
};

/** Id del bloque "Datos de la paciente" y de su título (destino de `?tab=datos` y "Ver antecedentes"). */
export const PATIENT_DATA_ID = "datos-paciente";
export const PATIENT_DATA_TITLE_ID = "datos-paciente-titulo";

export type PatientTabTarget = { tab: PatientTab; view?: HistoryView; focus?: "datos" };

type PatientTabsContextValue = {
  tab: PatientTab;
  view: HistoryView;
  /** Cambia de pestaña (y de vista de Historial) desde un panel o el encabezado. */
  go: (target: PatientTabTarget) => void;
  setView: (view: HistoryView) => void;
};

const PatientTabsContext = createContext<PatientTabsContextValue | null>(null);

export function usePatientTabs(): PatientTabsContextValue {
  const value = useContext(PatientTabsContext);
  if (!value) throw new Error("usePatientTabs fuera de PatientTabs");
  return value;
}

function writeUrl(tab: PatientTab, view: HistoryView) {
  const url = new URL(window.location.href);
  url.searchParams.delete("tab");
  url.searchParams.delete("vista");
  patientTabQuery(tab, view).forEach((value, key) => url.searchParams.set(key, value));
  window.history.replaceState(window.history.state, "", url);
}

/** Lleva "Datos de la paciente" a la vista (debajo del encabezado pegado) y le da el foco al título. */
function focusPatientData() {
  const section = document.getElementById(PATIENT_DATA_ID);
  const title = document.getElementById(PATIENT_DATA_TITLE_ID);
  if (!section) return;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  section.scrollIntoView({ block: "start", behavior: reduced ? "auto" : "smooth" });
  title?.focus({ preventScroll: true });
}

/**
 * Encabezado pegado (material translúcido con scroll edge) + cuatro pestañas (HU-017c-2). La pestaña y
 * la vista de Historial viven en `?tab=` / `?vista=` con `history.replaceState` (sin ida al servidor);
 * los `?tab=` viejos se resuelven con `resolvePatientTab`. Los cuatro paneles quedan montados
 * (`forceMount`) para no perder lo escrito en un formulario al cambiar.
 */
export function PatientTabs({
  header,
  panels,
  consultationCount,
  diaryHasRecent,
}: {
  header: ReactNode;
  panels: Record<PatientTab, ReactNode>;
  consultationCount: number;
  diaryHasRecent: boolean;
}) {
  const params = useSearchParams();
  const tabParam = params.get("tab");
  const viewParam = params.get("vista");
  const [state, setState] = useState(() => resolvePatientTab(tabParam, viewParam));
  const [pendingFocus, setPendingFocus] = useState(state.focus === "datos");
  const rootRef = useRef<HTMLDivElement>(null);
  const stickyRef = useRef<HTMLDivElement>(null);

  // Atrás/adelante del navegador o un Link con otro ?tab=.
  useEffect(() => {
    const next = resolvePatientTab(tabParam, viewParam);
    setState(next);
    if (next.focus === "datos") setPendingFocus(true);
  }, [tabParam, viewParam]);

  // Con el panel ya visible (después del render), recién se puede scrollear al bloque.
  useEffect(() => {
    if (!pendingFocus || state.tab !== "resumen") return;
    setPendingFocus(false);
    const id = requestAnimationFrame(focusPatientData);
    return () => cancelAnimationFrame(id);
  }, [pendingFocus, state.tab]);

  // Alto del chrome pegado (para `scroll-margin-top` de los destinos internos).
  useLayoutEffect(() => {
    const root = rootRef.current;
    const sticky = stickyRef.current;
    if (!root || !sticky) return;
    const update = () => {
      const top = Number.parseFloat(getComputedStyle(sticky).top) || 0;
      root.style.setProperty("--patient-chrome-h", `${top + sticky.offsetHeight + 16}px`);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(sticky);
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  // Scroll edge: la línea inferior aparece cuando el contenido pasa por debajo del chrome. El
  // encabezado se pega a 56 px (debajo de la barra móvil) o a 0 desde 1024 px.
  const desktop = useMediaQuery("(min-width: 1024px)");
  const { sentinelRef, scrolled } = useScrollEdge(desktop ? 0 : 56);

  const go = useCallback((target: PatientTabTarget) => {
    setState((prev) => {
      const view = target.view ?? prev.view;
      writeUrl(target.tab, view);
      return { tab: target.tab, view, focus: null };
    });
    if (target.focus === "datos") {
      setPendingFocus(true);
      return;
    }
    // Si el encabezado ya está pegado arriba, el contenido nuevo arranca donde empiezan las pestañas.
    const root = rootRef.current;
    const sticky = stickyRef.current;
    if (root && sticky && root.getBoundingClientRect().top < sticky.getBoundingClientRect().top) {
      root.scrollIntoView({ block: "start" });
    }
  }, []);

  const setTab = useCallback((tab: PatientTab) => {
    setState((prev) => {
      writeUrl(tab, prev.view);
      return { tab, view: prev.view, focus: null };
    });
  }, []);

  const setView = useCallback((view: HistoryView) => {
    setState((prev) => {
      writeUrl(prev.tab, view);
      return { ...prev, view, focus: null };
    });
  }, []);

  return (
    <PatientTabsContext.Provider value={{ tab: state.tab, view: state.view, go, setView }}>
      <div
        ref={rootRef}
        className="scroll-mt-14 lg:scroll-mt-0"
        style={{ "--patient-chrome-h": "12rem" } as CSSProperties}
      >
        <Tabs value={state.tab} onValueChange={(v) => setTab(v as PatientTab)}>
          <div ref={sentinelRef} aria-hidden className="pointer-events-none h-px" />
          <div
            ref={stickyRef}
            data-scrolled={scrolled}
            className="material-chrome sticky top-14 z-20 -mx-6 px-6 pt-3 lg:top-0 lg:-mx-10 lg:px-10 lg:pt-4"
          >
            {header}
            <TabsList
              aria-label="Secciones de la ficha"
              className="mt-3 max-sm:grid max-sm:grid-cols-4 max-sm:gap-1 sm:gap-7"
            >
              {PATIENT_TABS.map((value) => (
                <TabsTrigger key={value} value={value} className="max-sm:justify-center max-sm:text-subheadline">
                  {TAB_LABELS[value]}
                  {value === "consultas" && consultationCount > 0 ? (
                    <span className="ml-1 font-normal tabular-nums text-muted-foreground">{consultationCount}</span>
                  ) : null}
                  {value === "historial" && diaryHasRecent ? (
                    <>
                      <span aria-hidden className="ml-1 inline-block size-1.5 rounded-full bg-primary" />
                      <span className="sr-only"> {PATIENT_SUMMARY_TEXT.recentHint}</span>
                    </>
                  ) : null}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          {PATIENT_TABS.map((value) => (
            <TabsContent key={value} value={value} forceMount className="data-[state=inactive]:hidden">
              {panels[value]}
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </PatientTabsContext.Provider>
  );
}

/** Botón con estilo de enlace que cambia de pestaña desde adentro de un panel o del encabezado. */
export function PatientTabLink({
  tab,
  view,
  focus,
  children,
  className,
}: PatientTabTarget & { children: ReactNode; className?: string }) {
  const ctx = useContext(PatientTabsContext);
  return (
    <button
      type="button"
      onClick={() => ctx?.go({ tab, view, focus })}
      className={cn(
        "relative rounded-sm text-callout font-medium text-primary touch-target press-none transition-colors duration-hover hover:text-primary-hover pressed:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** Botón (secundario, con ícono y texto) que cambia de pestaña: "Cargar peso", "Ver planes". */
export function PatientTabButton({
  tab,
  view,
  focus,
  children,
  variant = "secondary",
}: PatientTabTarget & { children: ReactNode; variant?: "secondary" | "tinted" }) {
  const ctx = useContext(PatientTabsContext);
  return (
    <Button type="button" variant={variant} size="sm" onClick={() => ctx?.go({ tab, view, focus })}>
      {children}
    </Button>
  );
}
