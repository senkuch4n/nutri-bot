import type { ReactNode } from "react";

/** Sección numerada de la demo (ancla + título + bajada). Server-safe. */
export function DemoSection({
  id,
  index,
  title,
  description,
  children,
}: {
  id: string;
  index: number;
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-28 border-t border-border pt-10 first:border-t-0 first:pt-0">
      <p className="text-footnote font-semibold tabular-nums text-muted-foreground">{String(index).padStart(2, "0")}</p>
      <h2 id={`${id}-title`} className="mt-1 text-title-2 text-balance">
        {title}
      </h2>
      {description ? <p className="mt-1.5 max-w-2xl text-pretty text-body text-muted-foreground">{description}</p> : null}
      <div className="mt-6">{children}</div>
    </section>
  );
}

/** Rótulo chico dentro de una sección. */
export function DemoLabel({ children }: { children: ReactNode }) {
  return <h3 className="mb-3 text-subheadline font-semibold text-muted-foreground">{children}</h3>;
}
