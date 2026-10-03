import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// Lista agrupada estilo Ajustes de iOS (HU-017a §9.4). Server-safe: sin "use client".

export function GroupedList({
  header,
  footer,
  children,
  className,
}: {
  header?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={className}>
      {header ? <h3 className="px-4 pb-1.5 text-subheadline font-medium text-muted-foreground">{header}</h3> : null}
      <ul className="overflow-hidden rounded-xl bg-card shadow-card more-contrast:border more-contrast:border-input">
        {children}
      </ul>
      {footer ? <p className="px-4 pt-1.5 text-footnote text-muted-foreground">{footer}</p> : null}
    </section>
  );
}

export function GroupedListRow({
  label,
  description,
  value,
  icon: Icon,
  accessory,
  href,
  onClick,
  destructive = false,
  disabled = false,
}: {
  label: ReactNode;
  description?: ReactNode;
  value?: ReactNode;
  icon?: LucideIcon;
  accessory?: ReactNode;
  href?: string;
  onClick?: () => void;
  destructive?: boolean;
  disabled?: boolean;
}) {
  const interactive = Boolean(href || onClick) && !disabled;
  const body = (
    <>
      {Icon ? (
        <Icon className={cn("size-[1.125rem] shrink-0", destructive ? "text-destructive" : "text-muted-foreground")} strokeWidth={1.75} aria-hidden />
      ) : null}
      <span className="min-w-0 flex-1">
        <span className={cn("block text-callout", destructive ? "text-destructive" : "text-foreground")}>{label}</span>
        {description ? <span className="block text-footnote text-muted-foreground">{description}</span> : null}
      </span>
      {value !== undefined ? <span className="shrink-0 text-callout tabular-nums text-muted-foreground">{value}</span> : null}
      {accessory ? <span className="shrink-0">{accessory}</span> : null}
      {href ? <ChevronRight className="size-4 shrink-0 text-tertiary" strokeWidth={2} aria-hidden /> : null}
    </>
  );

  // Resaltado de fila de iOS: cambia el tono en el pointer-down, sin escala (§1, §16 Familiarity).
  const rowClass = cn(
    "relative flex min-h-11 w-full items-center gap-3 px-4 py-2.5 text-left",
    interactive &&
      "press-none transition-colors duration-hover hover:bg-overlay-hover pressed:bg-overlay-pressed focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
    disabled && "opacity-40",
  );

  return (
    <li
      className={cn(
        "relative",
        // Separador hairline desde el texto hasta el borde derecho; ninguno en la última fila.
        "after:absolute after:bottom-0 after:right-0 after:h-px after:bg-border last:after:hidden",
        Icon ? "after:left-[3.25rem]" : "after:left-4",
      )}
    >
      {href && !disabled ? (
        <Link href={href} className={rowClass}>
          {body}
        </Link>
      ) : onClick && !disabled ? (
        <button type="button" onClick={onClick} className={rowClass}>
          {body}
        </button>
      ) : (
        <div className={rowClass} aria-disabled={disabled || undefined}>
          {body}
        </div>
      )}
    </li>
  );
}
