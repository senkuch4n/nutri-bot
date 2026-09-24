import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/** Pantalla de estado centrada (error, 404). */
export function StatusScreen({
  icon: Icon,
  title,
  description,
  actions,
  detail,
}: {
  icon?: LucideIcon;
  title: string;
  description: string;
  actions?: ReactNode;
  detail?: string;
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 py-12 text-center">
      {Icon ? <Icon className="mb-4 h-8 w-8 text-muted-foreground" aria-hidden /> : null}
      <h1 className="text-balance text-xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 max-w-md text-pretty text-sm text-muted-foreground">{description}</p>
      {actions ? <div className="mt-6 flex flex-wrap items-center justify-center gap-3">{actions}</div> : null}
      {detail ? <p className="mt-6 text-xs text-muted-foreground tabular-nums">{detail}</p> : null}
    </div>
  );
}
