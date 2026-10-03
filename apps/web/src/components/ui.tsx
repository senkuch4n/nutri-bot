import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronLeft,
  CircleAlert,
  CircleCheck,
  Info,
  LoaderCircle,
  Minus,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { buttonVariants } from "@/components/primitives/button";
import { cn } from "@/lib/utils";

// Componentes de aplicación server-safe (sin "use client"). Los primitivos shadcn
// (Dialog, Sheet, Tabs, Tooltip, …) se importan directo desde @/components/primitives/<nombre>.

export { cn } from "@/lib/utils";

// ─── Layout ────────────────────────────────────────────────────────────────────

export function Card({
  children,
  className,
  title,
  description,
  actions,
  padding = "md",
}: {
  children: ReactNode;
  className?: string;
  title?: string;
  description?: string;
  actions?: ReactNode;
  padding?: "md" | "none";
}) {
  const hasHeader = Boolean(title || description || actions);
  return (
    <div
      className={cn(
        "rounded-xl bg-card text-card-foreground shadow-card more-contrast:border more-contrast:border-input",
        padding === "md" && "p-6",
        className,
      )}
    >
      {hasHeader ? (
        <div
          className={cn(
            "flex flex-wrap items-start justify-between gap-4",
            padding === "md" ? "mb-4" : "border-b px-6 py-4",
          )}
        >
          <div className="min-w-0">
            {title ? <h2 className="text-headline">{title}</h2> : null}
            {description ? <p className="mt-1 text-subheadline text-muted-foreground">{description}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  action,
  back,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <div className="mb-8">
      {back ? (
        <Link
          href={back.href}
          className="-ml-1 mb-3 inline-flex items-center gap-0.5 rounded-md text-callout text-primary press-none pressed:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <ChevronLeft className="size-4" strokeWidth={2} aria-hidden />
          {back.label}
        </Link>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-balance text-title-1">{title}</h1>
          {description ? <p className="mt-1.5 text-body text-muted-foreground">{description}</p> : null}
        </div>
        {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
      </div>
    </div>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <h2 className="mb-3 text-headline text-foreground">{children}</h2>;
}

// ─── Botones ───────────────────────────────────────────────────────────────────

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost" | "link" | "tinted" | "plain";
type ButtonSize = "sm" | "md" | "lg" | "icon";

// HU-017a §6.2: primary = filled tint, secondary = gray, danger = rojo suave (el rojo lleno queda
// para la confirmación final), ghost = plain neutro, plain = texto tint, link = tint sin subrayado.
const variantMap = {
  primary: "default",
  secondary: "secondary",
  danger: "destructive-tinted",
  ghost: "ghost",
  link: "link",
  tinted: "tinted",
  plain: "plain",
} as const;

const sizeMap = { sm: "sm", md: "default", lg: "lg", icon: "icon" } as const;

function buttonClass(variant: ButtonVariant, size: ButtonSize, className?: string) {
  return cn(buttonVariants({ variant: variantMap[variant], size: sizeMap[size] }), className);
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  className,
  children,
  disabled,
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant; size?: ButtonSize; loading?: boolean }) {
  return (
    <button
      className={buttonClass(variant, size, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}

// ─── Datos ─────────────────────────────────────────────────────────────────────

export function StatTile({
  label,
  value,
  children,
}: {
  label: string;
  value?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-xl bg-card px-4 py-3 shadow-card more-contrast:border more-contrast:border-input">
      <p className="text-subheadline text-muted-foreground">{label}</p>
      {value !== undefined ? <p className="mt-1 text-metric-md tabular-nums">{value}</p> : null}
      {children}
    </div>
  );
}

/**
 * Número grande con etiqueta (HU-017a §9.4): peso, kcal, porcentajes. El color de la tendencia lo
 * decide quien llama (`sentiment`), porque si subir es bueno o malo es una regla de dominio.
 */
export function Metric({
  label,
  value,
  unit,
  decimals = 1,
  size = "md",
  trend,
}: {
  label: string;
  value: number | null | undefined;
  unit?: string;
  decimals?: number;
  size?: "md" | "lg";
  trend?: { delta: number; unit?: string; sentiment: "positive" | "negative" | "neutral"; label?: string };
}) {
  const fmt = (n: number) => new Intl.NumberFormat("es-AR", { maximumFractionDigits: decimals }).format(n);
  const empty = value === null || value === undefined || Number.isNaN(value);
  const trendMeta = trend
    ? {
        positive: "text-success",
        negative: "text-destructive",
        neutral: "text-muted-foreground",
      }[trend.sentiment]
    : "";
  const TrendIcon = !trend || trend.delta === 0 ? Minus : trend.delta > 0 ? ArrowUpRight : ArrowDownRight;
  // Signo menos tipográfico (U+2212), no guion.
  const deltaText = trend
    ? `${trend.delta > 0 ? "+" : trend.delta < 0 ? "\u2212" : ""}${fmt(Math.abs(trend.delta))}${trend.unit ? "\u00A0" + trend.unit : ""}`
    : "";
  const spoken = trend
    ? (trend.label ??
      (trend.delta === 0
        ? "sin cambios"
        : `${trend.delta > 0 ? "subió" : "bajó"} ${fmt(Math.abs(trend.delta))}${trend.unit ? " " + trend.unit : ""}`))
    : "";

  return (
    <div>
      <p className="text-subheadline text-muted-foreground">{label}</p>
      <p className={cn("mt-0.5 tabular-nums", size === "lg" ? "text-metric" : "text-metric-md")}>
        {empty ? (
          <span className="text-tertiary">—</span>
        ) : (
          <>
            {fmt(value)}
            {unit ? (
              <span className="text-subheadline font-medium text-muted-foreground">{"\u00A0" + unit}</span>
            ) : null}
          </>
        )}
      </p>
      {trend ? (
        <p className={cn("mt-0.5 inline-flex items-center gap-1 text-footnote font-medium tabular-nums", trendMeta)}>
          <TrendIcon className="size-3.5" strokeWidth={2} aria-hidden />
          <span aria-hidden>{deltaText}</span>
          <span className="sr-only">{spoken}</span>
        </p>
      ) : null}
    </div>
  );
}

/** Número formateado en es-AR con unidad. `null`/`undefined` se muestran como "—". */
export function Quantity({
  value,
  unit,
  decimals = 1,
  className,
}: {
  value: number | null | undefined;
  unit?: string;
  decimals?: number;
  className?: string;
}) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return <span className={cn("tabular-nums text-muted-foreground", className)}>—</span>;
  }
  const formatted = new Intl.NumberFormat("es-AR", { maximumFractionDigits: decimals }).format(value);
  return (
    <span className={cn("tabular-nums", className)}>
      {formatted}
      {/* Espacio duro (\u00A0): la unidad nunca queda sola en la l\u00EDnea siguiente (SDD 6.2). */}
      {unit ? <span className="text-muted-foreground">{"\u00A0" + unit}</span> : null}
    </span>
  );
}

const adequacyStatus = {
  low: { label: "Por debajo", bar: "bg-warning", text: "text-warning" },
  ok: { label: "En rango", bar: "bg-success", text: "text-success" },
  high: { label: "Por encima", bar: "bg-destructive", text: "text-destructive" },
} as const;

/** Barra de adecuación valor/objetivo. El `status` lo calcula quien la usa (regla de dominio). */
export function AdequacyBar({
  label,
  value,
  target,
  unit,
  status,
  decimals = 1,
}: {
  label: string;
  value: number;
  target: number;
  unit: string;
  status: "low" | "ok" | "high";
  decimals?: number;
}) {
  const ratio = target > 0 ? value / target : 0;
  const fill = Math.max(0, Math.min(ratio, 1)) * 100;
  const percent = Math.round(ratio * 100);
  const over = value > target;
  const meta = adequacyStatus[status];
  const fmt = (n: number) => new Intl.NumberFormat("es-AR", { maximumFractionDigits: decimals }).format(n);

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-callout">
        <span className="font-medium">{label}</span>
        <span className="flex items-baseline gap-2 tabular-nums">
          <span>
            <Quantity value={value} decimals={decimals} />
            <span className="text-muted-foreground"> / </span>
            <Quantity value={target} unit={unit} decimals={decimals} />
          </span>
          <span className="text-muted-foreground">{percent}%</span>
          <span className={cn("text-footnote font-semibold", meta.text)}>{meta.label}</span>
        </span>
      </div>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={target}
        aria-valuenow={value}
        aria-valuetext={`${fmt(value)} de ${fmt(target)} ${unit}`}
        className="relative h-2 w-full overflow-hidden rounded-full bg-secondary"
      >
        <div className={cn("h-full rounded-full", meta.bar)} style={{ width: `${fill}%` }} />
        {over ? (
          <span
            aria-hidden
            className="absolute inset-y-0 right-0 w-0.5 bg-foreground"
            title="Supera el objetivo"
          />
        ) : null}
      </div>
    </div>
  );
}

// ─── Formularios ───────────────────────────────────────────────────────────────

export function Field({
  label,
  children,
  hint,
  error,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  error?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-subheadline font-medium text-foreground">{label}</span>
      {children}
      {error ? (
        <span role="alert" className="mt-1.5 block text-footnote text-destructive">
          {error}
        </span>
      ) : hint ? (
        <span className="mt-1.5 block text-footnote text-muted-foreground">{hint}</span>
      ) : null}
    </label>
  );
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-callout text-destructive">
      {message}
    </p>
  );
}

// Borde a 3:1 (1.4.11); foco = borde tint + halo. En táctil la regla global de globals.css lleva el
// texto a 16 px (sin zoom en Safari iOS).
export const inputClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-callout text-foreground placeholder:text-placeholder transition-[border-color,box-shadow] duration-hover ease-out-soft focus-visible:border-ring focus-visible:shadow-focus focus-visible:outline-none aria-[invalid=true]:border-destructive disabled:cursor-not-allowed disabled:bg-secondary disabled:text-tertiary";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input {...props} className={cn(inputClass, className)} />;
}

/** `<select>` nativo con el estilo del sistema (conserva `<option>` y FormData). */
export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select {...props} className={cn(inputClass, "pr-8", className)} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea {...props} className={cn(inputClass, "h-auto min-h-20 py-2", className)} />;
}

// ─── Estado y feedback ─────────────────────────────────────────────────────────

const badgeTones = {
  neutral: "bg-secondary text-foreground",
  success: "bg-success-muted text-success",
  danger: "bg-destructive-muted text-destructive",
  warning: "bg-warning-muted text-warning",
  info: "bg-info-muted text-info",
} as const;

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: keyof typeof badgeTones;
}) {
  return (
    <span
      className={cn("inline-flex items-center rounded-xs px-2 py-0.5 text-footnote font-semibold", badgeTones[tone])}
    >
      {children}
    </span>
  );
}

const alertTones = {
  info: { icon: Info, className: "bg-info-muted text-info more-contrast:border-info" },
  warning: { icon: TriangleAlert, className: "bg-warning-muted text-warning more-contrast:border-warning" },
  danger: { icon: CircleAlert, className: "bg-destructive-muted text-destructive more-contrast:border-destructive" },
  success: { icon: CircleCheck, className: "bg-success-muted text-success more-contrast:border-success" },
} as const;

/** Callout con ícono y título: el tono no depende solo del color. */
export function Alert({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: keyof typeof alertTones;
  title?: string;
  children?: ReactNode;
  className?: string;
}) {
  const { icon: Icon, className: toneClass } = alertTones[tone];
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn("flex gap-3 rounded-lg px-4 py-3 text-callout more-contrast:border", toneClass, className)}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={cn(title && "mt-1", "text-foreground")}>{children}</div> : null}
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon: Icon,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: LucideIcon;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      {Icon ? <Icon className="mb-3 size-8 text-tertiary" strokeWidth={1.75} aria-hidden /> : null}
      <p className="text-balance text-headline">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-pretty text-subheadline text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
