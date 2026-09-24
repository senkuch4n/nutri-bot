import {
  Apple,
  CalendarDays,
  Clock,
  Files,
  Megaphone,
  Settings,
  Sparkles,
  Tag,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon };
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
  { label: "Pacientes", items: [{ href: "/pacientes", label: "Pacientes", icon: Users }] },
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

/** Cookie con el estado de la sidebar: "collapsed" | "expanded". */
export const SIDEBAR_COOKIE = "nb-sidebar";

/** Regla de activo, igual que la barra anterior. */
export function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/** Clase base de un ítem de la sidebar (la comparten los enlaces y el botón "Cerrar sesión"). */
export const sidebarItemClass =
  "relative flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
