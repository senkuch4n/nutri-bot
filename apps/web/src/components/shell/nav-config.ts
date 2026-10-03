import {
  Apple,
  CalendarDays,
  Clock,
  Files,
  Inbox,
  Megaphone,
  Settings,
  Sparkles,
  Tag,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

/** Contadores que puede mostrar un ítem de la sidebar (HU-011). */
export type NavBadgeKey = "pendingInquiries";
export type NavBadges = Partial<Record<NavBadgeKey, number>>;

export type NavItem = { href: string; label: string; icon: LucideIcon; badge?: NavBadgeKey };
export type NavGroup = { label: string; items: NavItem[] };

/** Grupos de la sidebar del panel (D3). */
export const navGroups: NavGroup[] = [
  {
    label: "Agenda",
    items: [
      { href: "/", label: "Calendario", icon: CalendarDays },
      { href: "/disponibilidad", label: "Disponibilidad", icon: Clock },
      { href: "/servicios", label: "Servicios", icon: Tag },
    ],
  },
  {
    label: "Pacientes",
    items: [
      { href: "/pacientes", label: "Pacientes", icon: Users },
      // HU-011: bandeja de consultas que dejan los pacientes por la opción 0 del bot.
      { href: "/mensajes", label: "Mensajes", icon: Inbox, badge: "pendingInquiries" },
    ],
  },
  {
    label: "Nutrición",
    items: [
      { href: "/alimentos", label: "Alimentos", icon: Apple },
      { href: "/plantillas", label: "Plantillas", icon: Files },
    ],
  },
  {
    label: "Gestión",
    items: [
      { href: "/pagos", label: "Pagos", icon: Wallet },
      { href: "/avisos", label: "Avisos", icon: Megaphone },
    ],
  },
  { label: "Herramientas", items: [{ href: "/asistente", label: "Asistente", icon: Sparkles }] },
];

/** Ítem del pie. También queda activo en /ajustes/whatsapp. */
export const settingsItem: NavItem = { href: "/ajustes", label: "Ajustes", icon: Settings };

/** Anchos de la sidebar de escritorio (los mismos que --panel-sidebar-* de sidebar-layout.css). */
export const SIDEBAR_WIDTH = { collapsed: "3rem", expanded: "14rem" } as const;

/** Cookie con el estado de la sidebar: "collapsed" | "expanded". */
export const SIDEBAR_COOKIE = "nb-sidebar";

/** Regla de activo, igual que la barra anterior. */
export function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/**
 * Clase base de un ítem de la sidebar (la comparten los enlaces y el botón "Cerrar sesión").
 * HU-017a §10.1: press en pointer-down, hover solo con puntero fino, 44 px en el menú táctil
 * (`density="touch"` en `SidebarContent`). El foco va hacia adentro para no recortarse en el rail.
 */
export const sidebarItemClass =
  "relative isolate flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-callout text-foreground press-sm hover:bg-overlay-hover pressed:bg-overlay-pressed focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring group-data-[density=touch]/nav:h-11 [&>svg]:text-muted-foreground";
