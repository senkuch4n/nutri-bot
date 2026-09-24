"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { CalendarDays, FileText, MessageCircle, SlidersHorizontal, type LucideIcon } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/primitives/tabs";

export const AJUSTES_TABS = [
  { value: "general", label: "General" },
  { value: "whatsapp", label: "Bot de WhatsApp" },
  { value: "google", label: "Google Calendar" },
  { value: "pdf", label: "PDF" },
] as const;

export type AjustesTabValue = (typeof AJUSTES_TABS)[number]["value"];

const DEFAULT_TAB: AjustesTabValue = "general";

// Íconos definidos acá (no se pasan desde el server component).
const ICONS: Record<AjustesTabValue, LucideIcon> = {
  general: SlidersHorizontal,
  whatsapp: MessageCircle,
  google: CalendarDays,
  pdf: FileText,
};

function isTab(value: string | null): value is AjustesTabValue {
  return AJUSTES_TABS.some((t) => t.value === value);
}

/**
 * Índice lateral (reordenamiento 6): pestañas verticales a partir de `lg`, barra horizontal en
 * pantallas chicas. La pestaña activa vive en `?tab=` con `history.replaceState` (sin ida al
 * servidor ni entradas en el historial). Los cuatro paneles quedan montados (`forceMount`) para
 * no perder lo escrito al cambiar: el formulario de General + PDF es uno solo.
 */
export function AjustesTabs({ panels }: { panels: Record<AjustesTabValue, ReactNode> }) {
  const param = useSearchParams().get("tab");
  const fromUrl: AjustesTabValue = isTab(param) ? param : DEFAULT_TAB;
  const [tab, setTabState] = useState<AjustesTabValue>(fromUrl);

  // Atrás/adelante del navegador o un Link con ?tab= distinto.
  useEffect(() => {
    setTabState(fromUrl);
  }, [fromUrl]);

  const setTab = useCallback((next: AjustesTabValue) => {
    setTabState(next);
    const url = new URL(window.location.href);
    if (next === DEFAULT_TAB) url.searchParams.delete("tab");
    else url.searchParams.set("tab", next);
    window.history.replaceState(null, "", url);
  }, []);

  return (
    <Tabs
      orientation="vertical"
      value={tab}
      onValueChange={(v) => setTab(v as AjustesTabValue)}
      className="lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:items-start lg:gap-10"
    >
      <TabsList
        aria-label="Secciones de ajustes"
        className="w-full overflow-x-auto lg:sticky lg:top-8 lg:h-auto lg:flex-col lg:items-stretch lg:gap-0.5 lg:overflow-visible lg:border-b-0"
      >
        {AJUSTES_TABS.map((t) => {
          const Icon = ICONS[t.value];
          return (
            <TabsTrigger
              key={t.value}
              value={t.value}
              className="gap-2 lg:relative lg:mb-0 lg:h-8 lg:justify-start lg:rounded-md lg:border-b-0 lg:px-2 lg:py-0 lg:hover:bg-accent lg:data-[state=active]:bg-accent lg:data-[state=active]:before:absolute lg:data-[state=active]:before:inset-y-1.5 lg:data-[state=active]:before:left-0 lg:data-[state=active]:before:w-0.5 lg:data-[state=active]:before:rounded-full lg:data-[state=active]:before:bg-foreground"
            >
              <Icon className="h-4 w-4" aria-hidden />
              {t.label}
            </TabsTrigger>
          );
        })}
      </TabsList>

      {AJUSTES_TABS.map((t) => (
        <TabsContent
          key={t.value}
          value={t.value}
          forceMount
          className="max-w-3xl data-[state=inactive]:hidden lg:mt-0"
        >
          {panels[t.value]}
        </TabsContent>
      ))}
    </Tabs>
  );
}
