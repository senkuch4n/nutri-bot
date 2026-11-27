"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { m, useReducedMotionConfig } from "motion/react";
import { CalendarDays, ChevronLeft, ChevronRight, CreditCard, FileText, MessageCircle, SlidersHorizontal, Users, Wallet, type LucideIcon } from "lucide-react";
import { SETTINGS_TEXT as T, SUBSCRIPTION_TEXT, TEAM_TEXT } from "@nutri-bot/core";
import { GroupedList, GroupedListRow } from "@/components/grouped-list";
import { PageHeader, cn } from "@/components/ui";
import { fades } from "@/lib/motion";
import { replaceUrlInRouter } from "@/lib/patient-tab-route";
import { SettingsDirtyProvider, useDirtySections } from "./settings-ui";

export const AJUSTES_TABS = [
  { value: "general", label: T.sections.general },
  { value: "whatsapp", label: T.sections.whatsapp },
  { value: "google", label: T.sections.google },
  { value: "mercadopago", label: T.sections.mercadopago },
  // HU-029b (§B.6.3): todos los miembros la ven; la gestión es de la OWNER en /ajustes/suscripcion.
  { value: "suscripcion", label: SUBSCRIPTION_TEXT.tabLabel },
  { value: "pdf", label: T.sections.pdf },
  // HU-025 (7.2.1): solo para la responsable. page.tsx decide qué pestañas se ven (prop `tabs`).
  { value: "equipo", label: TEAM_TEXT.tabLabel },
] as const;

export type AjustesTabValue = (typeof AJUSTES_TABS)[number]["value"];

const DEFAULT_TAB: AjustesTabValue = "general";

/** Prefijo fijo de los ids de esta pantalla (hay una sola por página). No es `useId`: en `next dev` la
 *  posición del árbol del layout puede variar entre servidor y cliente y los `useId` salen distintos
 *  (mismo caso que el `<aside>` de la sidebar). */
const IDS = "ajustes";

// Íconos definidos acá (no se pasan desde el server component, T9a).
const ICONS: Record<AjustesTabValue, LucideIcon> = {
  general: SlidersHorizontal,
  whatsapp: MessageCircle,
  google: CalendarDays,
  mercadopago: Wallet,
  suscripcion: CreditCard,
  pdf: FileText,
  equipo: Users,
};

type AjustesTab = (typeof AJUSTES_TABS)[number];

/** `?tab=` válido solo si es una de las pestañas visibles (p. ej. `?tab=equipo` sin ser OWNER → la de
 *  por defecto). */
function isTab(value: string | null, tabs: readonly AjustesTab[]): value is AjustesTabValue {
  return tabs.some((t) => t.value === value);
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
 * `?tab=` (`general | whatsapp | google | mercadopago | pdf`; el editor del informe enlaza `?tab=pdf`) y se escribe con
 * `replaceUrlInRouter` (sin ida al servidor ni entradas en el historial). Las secciones quedan
 * montadas para no perder lo escrito al cambiar: cada grupo guarda solo lo suyo y el índice marca con un
 * punto la sección que quedó a medias. Todo se resuelve con CSS por ancho (sin desajuste de hidratación).
 */
export function AjustesTabs({
  tabs,
  panels,
  summaries,
  banner,
  mercadoPagoBanner,
}: {
  /** Pestañas visibles para esta sesión (Equipo solo para la responsable). */
  tabs: readonly AjustesTabValue[];
  panels: Partial<Record<AjustesTabValue, ReactNode>>;
  /** Valor corto de cada sección en la lista del celular ("Conectado"). Solo texto. */
  summaries?: Partial<Record<AjustesTabValue, string>>;
  /** Aviso fijo arriba (WhatsApp desconectado), en todas las secciones. */
  banner?: ReactNode;
  /** HU-023: aviso "servicios con seña sin Mercado Pago", después del de WhatsApp. No se muestra con la
   *  sección Mercado Pago abierta (ahí ya está el estado de la cuenta). */
  mercadoPagoBanner?: ReactNode;
}) {
  return (
    <SettingsDirtyProvider>
      <AjustesLayout tabs={tabs} panels={panels} summaries={summaries} banner={banner} mercadoPagoBanner={mercadoPagoBanner} />
    </SettingsDirtyProvider>
  );
}

function AjustesLayout({
  tabs,
  panels,
  summaries,
  banner,
  mercadoPagoBanner,
}: {
  tabs: readonly AjustesTabValue[];
  panels: Partial<Record<AjustesTabValue, ReactNode>>;
  summaries?: Partial<Record<AjustesTabValue, string>>;
  banner?: ReactNode;
  mercadoPagoBanner?: ReactNode;
}) {
  const visibleTabs = AJUSTES_TABS.filter((t) => tabs.includes(t.value) && panels[t.value] !== undefined);
  const param = useSearchParams().get("tab");
  const fromUrl: AjustesTabValue | null = isTab(param, visibleTabs) ? param : null;
  const [selected, setSelected] = useState<AjustesTabValue | null>(fromUrl);
  const dirty = useDirtySections();
  const reduced = Boolean(useReducedMotionConfig());
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
      document.getElementById(`${IDS}-${selected}`)?.focus({ preventScroll: true });
    } else if (target === "row" && lastOpened.current) {
      const index = visibleTabs.findIndex((t) => t.value === lastOpened.current);
      document.getElementById(`${IDS}-list`)?.querySelectorAll("button")[index]?.focus();
    }
    // visibleTabs no cambia mientras la página está montada.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

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
      {mercadoPagoBanner && active !== "mercadopago" ? (
        <div className="mb-6 max-w-3xl lg:ml-[15rem]">{mercadoPagoBanner}</div>
      ) : null}

      <div className="lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:items-start lg:gap-8">
        {/* Índice lateral (≥ 1024 px) */}
        <nav aria-label="Secciones de ajustes" className="hidden lg:sticky lg:top-8 lg:block">
          <ul className="space-y-0.5">
            {visibleTabs.map((t) => {
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
        <div id={`${IDS}-list`} className={cn("lg:hidden", selected && "hidden")}>
          <GroupedList>
            {visibleTabs.map((t) => (
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
          {visibleTabs.map((t) => {
            const visible = t.value === active;
            return (
              <m.section
                key={t.value}
                aria-labelledby={`${IDS}-${t.value}`}
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
                  id={`${IDS}-${t.value}`}
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
