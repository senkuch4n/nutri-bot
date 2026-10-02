"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip";
import type { BotShellStatus } from "@/lib/shell";
import { cn } from "@/lib/utils";
import { isActive, navGroups, settingsItem, sidebarItemClass, type NavItem } from "./nav-config";

const botStatusMeta: Record<BotShellStatus, { label: string; dot: string }> = {
  connected: { label: "WhatsApp conectado", dot: "bg-success" },
  paused: { label: "Bot pausado", dot: "bg-warning" },
  disconnected: { label: "WhatsApp desconectado", dot: "bg-destructive" },
};

/** Keep the trigger mounted while labels fade; only show tooltips in rail mode. */
function MaybeTooltip({
  collapsed,
  label,
  children,
}: {
  collapsed: boolean;
  label: string;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      {collapsed ? <TooltipContent side="right">{label}</TooltipContent> : null}
    </Tooltip>
  );
}

function SidebarLink({
  item,
  collapsed,
  active,
  onNavigate,
}: {
  item: NavItem;
  collapsed: boolean;
  active: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  return (
    <MaybeTooltip collapsed={collapsed} label={item.label}>
      <Link
        href={item.href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        aria-label={item.label}
        className={cn(
          sidebarItemClass,
          active &&
            "bg-accent font-medium text-foreground before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-foreground",
        )}
      >
        <Icon className="h-4 w-4 shrink-0" aria-hidden />
        <span className="panel-sidebar-label truncate" aria-hidden="true">{item.label}</span>
      </Link>
    </MaybeTooltip>
  );
}

/**
 * Navegación agrupada + pie (Ajustes, estado del bot, cuenta). La usan la sidebar de escritorio
 * (colapsable) y el Sheet del menú en pantallas chicas (siempre expandida).
 */
export function SidebarContent({
  collapsed = false,
  email,
  botStatus,
  account,
  onNavigate,
}: {
  collapsed?: boolean;
  email?: string | null;
  botStatus: BotShellStatus;
  /** Slot para el botón "Cerrar sesión" (server component con su action inline). */
  account: ReactNode;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const status = botStatusMeta[botStatus];

  return (
    <>
      {/* Alturas pensadas para que todo (grupos + pie) entre sin scroll en ~650 px de alto
          (notebook 1366×768 con el navegador abierto). El overflow-y-auto queda de red de
          seguridad para alturas menores. Medición en progress/impl_HU-002a.md. */}
      <nav aria-label="Principal" className="flex-1 overflow-y-auto px-2 pb-2">
        {navGroups.map((group, i) => (
          <div key={group.label}>
            <p
              className={cn(
                "panel-sidebar-detail px-2 pb-1 text-xs font-medium text-muted-foreground",
                i > 0 ? "pt-3" : "pt-2",
              )}
              aria-hidden={collapsed}
            >
              {group.label}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => (
                <li key={item.href}>
                  <SidebarLink
                    item={item}
                    collapsed={collapsed}
                    active={isActive(pathname, item.href)}
                    onNavigate={onNavigate}
                  />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="mt-auto space-y-0.5 border-t p-2">
        <SidebarLink
          item={settingsItem}
          collapsed={collapsed}
          active={isActive(pathname, settingsItem.href)}
          onNavigate={onNavigate}
        />

        <MaybeTooltip collapsed={collapsed} label={status.label}>
          <Link
            href="/ajustes/whatsapp"
            aria-label={status.label}
            onClick={onNavigate}
            className="flex h-7 items-center gap-2.5 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="flex h-4 w-4 shrink-0 items-center justify-center">
              <span className={cn("h-2 w-2 rounded-full", status.dot)} aria-hidden />
            </span>
            <span className="panel-sidebar-label truncate" aria-hidden="true">{status.label}</span>
          </Link>
        </MaybeTooltip>

        <div className="panel-sidebar-account flex items-center gap-1">
          {email ? (
            <p
              className="panel-sidebar-email panel-sidebar-detail min-w-0 flex-1 truncate px-2 text-xs text-muted-foreground"
              title={email}
              aria-hidden={collapsed}
            >
              {email}
            </p>
          ) : null}
          <div className={cn("panel-sidebar-signout min-w-0", email ? "shrink-0" : "flex-1")}>
            <MaybeTooltip collapsed={collapsed} label="Cerrar sesión">{account}</MaybeTooltip>
          </div>
        </div>
      </div>
    </>
  );
}
