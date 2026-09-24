"use client";

import { useState, type ReactNode } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Wordmark } from "@/components/brand";
import { Button } from "@/components/primitives/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip";
import type { BotShellStatus } from "@/lib/shell";
import { cn } from "@/lib/utils";
import { SIDEBAR_COOKIE } from "./nav-config";
import { SidebarContent } from "./sidebar-content";

/** Sidebar de escritorio (≥ 1024 px), colapsable a íconos. El estado persiste en una cookie. */
export function AppSidebar({
  initialCollapsed,
  professionalName,
  email,
  botStatus,
  account,
}: {
  initialCollapsed: boolean;
  professionalName: string | null;
  email?: string | null;
  botStatus: BotShellStatus;
  account: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `${SIDEBAR_COOKIE}=${next ? "collapsed" : "expanded"}; path=/; max-age=31536000; samesite=lax`;
  }

  const ToggleIcon = collapsed ? PanelLeftOpen : PanelLeftClose;
  const toggleLabel = collapsed ? "Expandir barra lateral" : "Contraer barra lateral";

  return (
    <aside
      className={cn(
        "group/sidebar sticky top-0 hidden h-screen shrink-0 flex-col border-r bg-sidebar transition-[width] duration-200 lg:flex",
        collapsed ? "w-14" : "w-60",
      )}
      data-collapsed={collapsed}
    >
      <div
        className={cn(
          "flex h-14 shrink-0 items-center gap-2 border-b px-3",
          collapsed ? "justify-center px-0" : "justify-between",
        )}
      >
        {collapsed ? null : <Wordmark subtitle={professionalName} className="min-w-0 flex-1" />}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={toggle}
              aria-label={toggleLabel}
              aria-expanded={!collapsed}
              className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
            >
              <ToggleIcon aria-hidden />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">{toggleLabel}</TooltipContent>
        </Tooltip>
      </div>
      {collapsed ? (
        <div className="flex h-10 items-center justify-center border-b">
          <Wordmark compact />
        </div>
      ) : null}

      <SidebarContent collapsed={collapsed} email={email} botStatus={botStatus} account={account} />
    </aside>
  );
}
