import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-card border border-line bg-paper p-6 shadow-card", className)}>
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight text-ink">{title}</h1>
        {description ? <p className="mt-2 text-sm text-ink-soft">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

/** Etiqueta de sección: mayúsculas espaciadas con tick verde. */
export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-ink-soft">
      <span className="h-1.5 w-1.5 bg-leaf" />
      {children}
    </h2>
  );
}

const buttonBase =
  "inline-flex items-center justify-center gap-2 font-semibold transition-colors duration-150 disabled:opacity-50 disabled:pointer-events-none";

const buttonSizes = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2.5 text-sm",
} as const;

const buttonVariants = {
  primary: "border-2 border-leaf bg-leaf text-white hover:bg-leaf-deep hover:border-leaf-deep",
  secondary: "border-2 border-ink bg-transparent text-ink hover:bg-ink hover:text-white",
  danger: "border-2 border-red-600 bg-red-600 text-white hover:bg-red-700 hover:border-red-700",
  ghost: "text-ink-soft hover:bg-mint",
} as const;

type ButtonVariant = keyof typeof buttonVariants;
type ButtonSize = keyof typeof buttonSizes;

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return (
    <button
      className={cn(buttonBase, "press", buttonSizes[size], buttonVariants[variant], className)}
      {...props}
    />
  );
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return (
    <Link
      className={cn(buttonBase, "press", buttonSizes[size], buttonVariants[variant], className)}
      {...props}
    />
  );
}

/** Ficha compacta de métrica: etiqueta en mayúsculas + valor grande. */
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
    <div className="border border-line bg-paper px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">{label}</p>
      {value !== undefined ? (
        <p className="mt-1 font-display text-2xl font-bold text-ink">{value}</p>
      ) : null}
      {children}
    </div>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-ink-faint">{hint}</span> : null}
    </label>
  );
}

export const inputClass =
  "w-full border border-line bg-paper px-3 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-leaf focus:ring-2 focus:ring-leaf/15";

export function Input(props: ComponentProps<"input">) {
  return <input {...props} className={cn(inputClass, props.className)} />;
}

export function Select(props: ComponentProps<"select">) {
  return <select {...props} className={cn(inputClass, props.className)} />;
}

export function Textarea(props: ComponentProps<"textarea">) {
  return <textarea {...props} className={cn(inputClass, props.className)} />;
}

const badgeTones = {
  slate: "bg-mint text-ink-soft",
  green: "bg-leaf-tint text-leaf-deep",
  red: "bg-red-50 text-red-700",
  amber: "bg-amber-50 text-amber-700",
  blue: "bg-blue-50 text-blue-700",
} as const;

export function Badge({
  children,
  tone = "slate",
}: {
  children: ReactNode;
  tone?: keyof typeof badgeTones;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.06em]",
        badgeTones[tone],
      )}
    >
      {children}
    </span>
  );
}
