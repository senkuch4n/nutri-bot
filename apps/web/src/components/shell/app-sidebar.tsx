"use client";

import { useRef, useState, type ReactNode } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { LayoutGroup, m, useReducedMotionConfig } from "motion/react";
import { Wordmark } from "@/components/brand";
import { Button } from "@/components/primitives/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip";
import { springs } from "@/lib/motion";
import type { BotShellStatus } from "@/lib/shell";
import { SIDEBAR_COOKIE, SIDEBAR_WIDTH, type NavBadges } from "./nav-config";
import { SidebarContent } from "./sidebar-content";
import "./sidebar-layout.css";

/**
 * Id fijo del `<aside>` (lo usa `aria-controls` del botón de colapsar). No es `useId`: en `next dev`, Next
 * inserta antes del layout del panel una cantidad variable de `<link>`/`<script>` del segmento, y eso
 * corre la posición del árbol entre el servidor y el cliente; un `useId` acá salía distinto en una parte de
 * las recargas ("_R_15etb_" vs "_R_4petb_", HU-017b-4). La sidebar se monta una sola vez, en el layout del
 * panel, así que un id fijo es único.
 */
const SIDEBAR_ID = "panel-sidebar";

/** Sidebar de escritorio (≥ 1024 px), colapsable a íconos. El estado persiste en una cookie. */
export function AppSidebar({
  initialCollapsed,
  professionalName,
  email,
  botStatus,
  account,
  badges,
  children,
}: {
  initialCollapsed: boolean;
  professionalName: string | null;
  email?: string | null;
  botStatus: BotShellStatus;
  account: ReactNode;
  /** HU-011: contadores de los ítems de la sidebar (p. ej. mensajes pendientes). */
  badges?: NavBadges;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const sidebar = useRef<HTMLElement>(null);
  const toggleButton = useRef<HTMLButtonElement>(null);
  const reduced = useReducedMotionConfig();

  function toggle() {
    const next = !collapsed;
    if (next && sidebar.current?.contains(document.activeElement)) toggleButton.current?.focus();
    setCollapsed(next);
    try {
      document.cookie = `${SIDEBAR_COOKIE}=${next ? "collapsed" : "expanded"}; path=/; max-age=31536000; samesite=lax`;
    } catch {
      // Keep navigation usable when browser storage is blocked.
    }
  }

  const ToggleIcon = collapsed ? PanelLeftOpen : PanelLeftClose;
  const toggleLabel = collapsed ? "Abrir sidebar" : "Cerrar sidebar";

  return (
    <div className="panel-sidebar-layout flex min-h-screen bg-background">
      {/* §10.1 / G5: se anima el ANCHO del slot con un spring (interrumpible, con velocidad). La
          sidebar mantiene 14rem fija y queda recortada: nada se escala ni se deforma. Única
          excepción documentada a "solo transform/opacity" (SDD §7.6, R-3). */}
      <m.div
        className="panel-sidebar-slot"
        data-collapsed={collapsed}
        initial={false}
        animate={{ width: collapsed ? SIDEBAR_WIDTH.collapsed : SIDEBAR_WIDTH.expanded }}
        transition={reduced ? { duration: 0 } : springs.standard}
      >
        <aside
          ref={sidebar}
          id={SIDEBAR_ID}
          aria-label="Navegación principal"
          className="panel-sidebar group/sidebar flex flex-col bg-sidebar"
          data-collapsed={collapsed}
        >
          <div className="panel-sidebar-header relative flex h-14 shrink-0 items-center gap-2">
            <div
              className="panel-sidebar-detail min-w-0 flex-1 pr-10"
              aria-hidden={collapsed}
              inert={collapsed}
            >
              <Wordmark subtitle={professionalName} className="w-full [&>span]:flex-1" />
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  ref={toggleButton}
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={toggle}
                  aria-label={toggleLabel}
                  aria-expanded={!collapsed}
                  aria-controls={SIDEBAR_ID}
                  className="panel-sidebar-toggle group/toggle absolute size-10 shrink-0 cursor-pointer text-muted-foreground hover:text-foreground"
                >
                  <span className="panel-sidebar-toggle-logo pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
                    <Wordmark compact />
                  </span>
                  <ToggleIcon className="panel-sidebar-toggle-icon relative" strokeWidth={1.75} aria-hidden />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">{toggleLabel}</TooltipContent>
            </Tooltip>
          </div>

          <LayoutGroup id="sidebar-desktop">
            <SidebarContent collapsed={collapsed} email={email} botStatus={botStatus} account={account} badges={badges} />
          </LayoutGroup>
        </aside>
      </m.div>
      <div className="panel-sidebar-workspace flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
