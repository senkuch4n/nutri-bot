import Link from "next/link";
import type { ReactNode } from "react";
import { formatMacroAmount } from "@nutri-bot/core";
import { Badge } from "@/components/ui";
import type { RecipeCardView } from "@/lib/recipe-view";
import { MacroLine } from "./macro-line";
import { RecipePhoto } from "./recipe-photo";

// HU-018a: tarjeta de la grilla. Toda la parte superior es un enlace; el `footer` queda fuera del
// enlace (018c pone ahí "Agregar" y el impacto, que son botones y no pueden ir dentro de un <a>).

export const RECIPE_CARD_SIZES = "(min-width: 1536px) 22vw, (min-width: 1024px) 30vw, (min-width: 640px) 45vw, 100vw";

export function RecipeCard({
  card,
  href,
  footer,
  priority = false,
}: {
  card: RecipeCardView;
  href: string;
  footer?: ReactNode;
  priority?: boolean;
}) {
  return (
    <article className="flex flex-col overflow-hidden rounded-xl bg-card text-card-foreground shadow-card more-contrast:border more-contrast:border-input">
      <Link
        href={href}
        className="group/card flex flex-1 flex-col press-sm focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
      >
        <RecipePhoto photoUrl={card.photoUrl} type={card.type} alt="" sizes={RECIPE_CARD_SIZES} priority={priority} />
        <div className="flex flex-1 flex-col gap-1 p-4">
          <h3 className="line-clamp-2 text-headline group-hover/card:underline group-hover/card:underline-offset-2">
            {card.name}
          </h3>
          {card.portionHousehold ? (
            <p className="text-subheadline text-muted-foreground">1 porción: {card.portionHousehold}</p>
          ) : null}
          {card.perPortion ? (
            <>
              <p className="text-title-3 tabular-nums">{formatMacroAmount(card.perPortion.kcal, "kcal")}</p>
              <MacroLine macros={card.perPortion} />
            </>
          ) : (
            <p className="text-subheadline text-muted-foreground">Sin macros: falta el rendimiento</p>
          )}
          {card.macrosIncomplete || card.status !== "PUBLISHED" ? (
            <div className="mt-1 flex flex-wrap gap-1.5">
              {card.status === "DRAFT" ? <Badge tone="info">Borrador</Badge> : null}
              {card.status === "ARCHIVED" ? <Badge>Archivada</Badge> : null}
              {card.macrosIncomplete ? <Badge tone="warning">Macros incompletos</Badge> : null}
            </div>
          ) : null}
        </div>
      </Link>
      {footer ? <div className="border-t px-4 py-3">{footer}</div> : null}
    </article>
  );
}
