"use client";

import { useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Wordmark } from "@/components/brand";
import { Button } from "@/components/primitives/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip";
import type { BotShellStatus } from "@/lib/shell";
import { SIDEBAR_COOKIE, type NavBadges } from "./nav-config";
import { SidebarContent } from "./sidebar-content";
import "./sidebar-layout.css";

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
  const sidebarId = useId();
  const sidebar = useRef<HTMLElement>(null);
  const toggleButton = useRef<HTMLButtonElement>(null);
  const workspace = useRef<HTMLDivElement>(null);
  const previousBounds = useRef<DOMRect | null>(null);
  const animation = useRef<Animation | null>(null);

  useLayoutEffect(() => {
    const element = workspace.current;
    const before = previousBounds.current;
    previousBounds.current = null;
    if (!element || !before) return;
    animation.current?.cancel();
    const after = element.getBoundingClientRect();
    if (
      !after.width ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      !window.matchMedia("(min-width: 1024px)").matches ||
      typeof element.animate !== "function"
    ) {
      return;
    }
    animation.current = element.animate(
      [
        { transform: `translateX(${before.left - after.left}px) scaleX(${before.width / after.width})` },
        { transform: "translateX(0) scaleX(1)" },
      ],
      { duration: 280, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
    );
  }, [collapsed]);

  useLayoutEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const desktop = window.matchMedia("(min-width: 1024px)");
    const cancel = () => animation.current?.cancel();
    motion.addEventListener("change", cancel);
    desktop.addEventListener("change", cancel);
    return () => {
      cancel();
      motion.removeEventListener("change", cancel);
      desktop.removeEventListener("change", cancel);
    };
  }, []);

  function toggle() {
    previousBounds.current = workspace.current?.getBoundingClientRect() ?? null;
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
      <div className="panel-sidebar-slot" data-collapsed={collapsed}>
        <aside
          ref={sidebar}
          id={sidebarId}
          aria-label="Navegación principal"
          className="panel-sidebar group/sidebar flex flex-col border-r bg-sidebar"
          data-collapsed={collapsed}
        >
          <div className="panel-sidebar-header relative flex h-14 shrink-0 items-center gap-2 border-b">
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
                  aria-controls={sidebarId}
                  className="panel-sidebar-toggle group/toggle absolute h-10 w-10 shrink-0 cursor-pointer text-muted-foreground hover:text-foreground"
                >
                  <span className="panel-sidebar-toggle-logo pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
                    <Wordmark compact />
                  </span>
                  <ToggleIcon className="panel-sidebar-toggle-icon relative" aria-hidden />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">{toggleLabel}</TooltipContent>
            </Tooltip>
          </div>

          <SidebarContent collapsed={collapsed} email={email} botStatus={botStatus} account={account} badges={badges} />
        </aside>
      </div>
      <div ref={workspace} className="panel-sidebar-workspace flex min-w-0 flex-1 flex-col">
        {children}
      </div>
    </div>
  );
}
