"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { m, useReducedMotionConfig } from "motion/react";
import { CalendarDays, ChevronLeft, ChevronRight, FileText, MessageCircle, SlidersHorizontal, type LucideIcon } from "lucide-react";
import { SETTINGS_TEXT as T } from "@nutri-bot/core";
import { GroupedList, GroupedListRow } from "@/components/grouped-list";
import { PageHeader, cn } from "@/components/ui";
import { fades } from "@/lib/motion";
import { replaceUrlInRouter } from "@/lib/patient-tab-route";
import { SettingsDirtyProvider, useDirtySections } from "./settings-ui";

export const AJUSTES_TABS = [
  { value: "general", label: T.sections.general },
  { value: "whatsapp", label: T.sections.whatsapp },
  { value: "google", label: T.sections.google },
  { value: "pdf", label: T.sections.pdf },
] as const;

export type AjustesTabValue = (typeof AJUSTES_TABS)[number]["value"];

const DEFAULT_TAB: AjustesTabValue = "general";

// Íconos definidos acá (no se pasan desde el server component, T9a).
const ICONS: Record<AjustesTabValue, LucideIcon> = {
  general: SlidersHorizontal,
  whatsapp: MessageCircle,
  google: CalendarDays,
  pdf: FileText,
};

function isTab(value: string | null): value is AjustesTabValue {
  return AJUSTES_TABS.some((t) => t.value === value);
}

function tabHref(tab: AjustesTabValue | null): string {
  const url = new URL(window.location.href);
  if (tab) url.searchParams.set("tab", tab);
  else url.searchParams.delete("tab");
  return url.toString();
}

/**
 * Ajustes (HU-017b-4, D20): desde 1024 px, índice lateral con la sección activa en `tint-soft`; en el
 * celular, la lista de secciones y, al tocar una, la sección con "‹ Ajustes". La sección elegida vive en
 * `?tab=` (`general | whatsapp | google | pdf`; el editor del informe enlaza `?tab=pdf`) y se escribe con
 * `replaceUrlInRouter` (sin ida al servidor ni entradas en el historial). Las cuatro secciones quedan
 * montadas para no perder lo escrito al cambiar: cada grupo guarda solo lo suyo y el índice marca con un
 * punto la sección que quedó a medias. Todo se resuelve con CSS por ancho (sin desajuste de hidratación).
 */
export function AjustesTabs({
  panels,
  summaries,
  banner,
}: {
  panels: Record<AjustesTabValue, ReactNode>;
  /** Valor corto de cada sección en la lista del celular ("Conectado"). Solo texto. */
  summaries?: Partial<Record<AjustesTabValue, string>>;
  /** Aviso fijo arriba (WhatsApp desconectado), en todas las secciones. */
  banner?: ReactNode;
}) {
  return (
    <SettingsDirtyProvider>
      <AjustesLayout panels={panels} summaries={summaries} banner={banner} />
    </SettingsDirtyProvider>
  );
}

function AjustesLayout({
  panels,
  summaries,
  banner,
}: {
  panels: Record<AjustesTabValue, ReactNode>;
  summaries?: Partial<Record<AjustesTabValue, string>>;
  banner?: ReactNode;
}) {
  const param = useSearchParams().get("tab");
  const fromUrl: AjustesTabValue | null = isTab(param) ? param : null;
  const [selected, setSelected] = useState<AjustesTabValue | null>(fromUrl);
  const dirty = useDirtySections();
  const reduced = Boolean(useReducedMotionConfig());
  const headingIds = useId();
  const lastOpened = useRef<AjustesTabValue | null>(null);
  const focusTarget = useRef<"heading" | "row" | null>(null);

  // Atrás/adelante del navegador o un Link con ?tab= distinto.
  useEffect(() => {
    setSelected(fromUrl);
  }, [fromUrl]);

  // En el celular, el foco acompaña la navegación hacia adentro y de vuelta.
  useEffect(() => {
    const target = focusTarget.current;
    focusTarget.current = null;
    if (!target || window.matchMedia("(min-width: 1024px)").matches) return;
    if (target === "heading" && selected) {
      window.scrollTo({ top: 0 });
      document.getElementById(`${headingIds}-${selected}`)?.focus({ preventScroll: true });
    } else if (target === "row" && lastOpened.current) {
      const index = AJUSTES_TABS.findIndex((t) => t.value === lastOpened.current);
      document.getElementById(`${headingIds}-list`)?.querySelectorAll("button")[index]?.focus();
    }
  }, [selected, headingIds]);

  const open = useCallback((tab: AjustesTabValue) => {
    lastOpened.current = tab;
    focusTarget.current = "heading";
    setSelected(tab);
    replaceUrlInRouter(tabHref(tab));
  }, []);

  const back = useCallback(() => {
    focusTarget.current = "row";
    setSelected(null);
    replaceUrlInRouter(tabHref(null));
  }, []);

  const active = selected ?? DEFAULT_TAB;

  return (
    <div>
      <div className={cn(selected && "max-lg:hidden")}>
        <PageHeader title="Ajustes" description={T.pageDescription} />
      </div>
      {banner ? <div className="mb-6 max-w-3xl lg:ml-[15rem]">{banner}</div> : null}

      <div className="lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:items-start lg:gap-8">
        {/* Índice lateral (≥ 1024 px) */}
        <nav aria-label="Secciones de ajustes" className="hidden lg:sticky lg:top-8 lg:block">
          <ul className="space-y-0.5">
            {AJUSTES_TABS.map((t) => {
              const Icon = ICONS[t.value];
              const isActive = t.value === active;
              const isDirty = dirty.has(t.value);
              return (
                <li key={t.value}>
                  <button
                    type="button"
                    aria-current={isActive ? "page" : undefined}
                    onClick={() => open(t.value)}
                    className={cn(
                      "flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 text-left text-callout press-none transition-colors duration-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                      isActive
                        ? "bg-primary-soft font-semibold text-primary"
                        : "text-foreground hover:bg-overlay-hover pressed:bg-overlay-pressed",
                    )}
                  >
                    <Icon className="size-[1.125rem] shrink-0" strokeWidth={1.75} aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{t.label}</span>
                    {isDirty ? (
                      <>
                        <span aria-hidden className="size-2 shrink-0 rounded-full bg-primary" />
                        <span className="sr-only">, {T.unsaved}</span>
                      </>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Lista de secciones (celular, sin sección elegida) */}
        <div id={`${headingIds}-list`} className={cn("lg:hidden", selected && "hidden")}>
          <GroupedList>
            {AJUSTES_TABS.map((t) => (
              <MobileSectionRow
                key={t.value}
                icon={ICONS[t.value]}
                label={t.label}
                summary={summaries?.[t.value]}
                dirty={dirty.has(t.value)}
                onClick={() => open(t.value)}
              />
            ))}
          </GroupedList>
        </div>

        {/* Secciones: todas montadas; se ve la activa (en el celular, solo si eligió una). */}
        <div className="min-w-0">
          {AJUSTES_TABS.map((t) => {
            const visible = t.value === active;
            return (
              <m.section
                key={t.value}
                aria-labelledby={`${headingIds}-${t.value}`}
                initial={false}
                animate={{ opacity: visible ? 1 : 0 }}
                transition={reduced ? { duration: 0 } : fades.fast}
                className={cn("max-w-3xl", !visible && "hidden", visible && !selected && "max-lg:hidden")}
              >
                <button
                  type="button"
                  onClick={back}
                  className="-ml-1 mb-3 inline-flex min-h-11 items-center gap-0.5 rounded-md text-callout text-primary press-none pressed:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring lg:hidden"
                >
                  <ChevronLeft className="size-4" strokeWidth={2} aria-hidden />
                  {T.back}
                </button>
                <h2
                  id={`${headingIds}-${t.value}`}
                  tabIndex={-1}
                  className="mb-5 text-title-1 focus-visible:outline-none lg:text-title-2"
                >
                  {t.label}
                </h2>
                <div className="space-y-8">{panels[t.value]}</div>
              </m.section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function MobileSectionRow({
  icon,
  label,
  summary,
  dirty,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  summary?: string;
  dirty: boolean;
  onClick: () => void;
}) {
  return (
    <GroupedListRow
        icon={icon}
        label={label}
        description={
          dirty ? (
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="size-2 rounded-full bg-primary" />
              {T.unsaved}
            </span>
          ) : undefined
        }
        value={summary}
        accessory={<ChevronRight className="size-4 text-tertiary" strokeWidth={2} aria-hidden />}
        onClick={onClick}
        size="lg"
      />
  );
}
