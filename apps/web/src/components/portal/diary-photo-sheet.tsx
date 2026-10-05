"use client";

import { useState } from "react";
import { ImageOff } from "lucide-react";
import { PORTAL_DIARY_TEXT as T } from "@nutri-bot/core";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/primitives/sheet";
import { useExitSnapshot } from "@/lib/use-exit-snapshot";
import { useMediaQuery } from "@/lib/use-media-query";

// HU-017d-2 (SDD 4.5): la foto de un registro, grande. Se cierra arrastrando hacia abajo o con la X.
// `title` es cuándo se anotó ("Hoy, 13:40"); va en la descripción, debajo de "Foto de la comida".
export function DiaryPhotoSheet({
  entryId,
  title,
  onOpenChange,
}: {
  entryId: string | null;
  title: string;
  onOpenChange: (open: boolean) => void;
}) {
  const compact = useMediaQuery("(max-width: 767px)");
  const open = entryId !== null;
  // Mientras sale, el panel sigue mostrando la foto que tenía.
  const shownId = useExitSnapshot(entryId, open);
  const [failedId, setFailedId] = useState<string | null>(null);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side={compact ? "bottom" : "right"} className={compact ? "theme-portal" : "theme-portal w-full sm:max-w-lg"}>
        <SheetHeader>
          <SheetTitle>{T.photoSheetTitle}</SheetTitle>
          <SheetDescription>{title}</SheetDescription>
        </SheetHeader>
        {shownId ? (
          failedId === shownId ? (
            <div className="mt-4 flex aspect-[4/3] w-full items-center justify-center rounded-xl bg-secondary text-tertiary">
              <ImageOff className="size-8" aria-hidden />
              <span className="sr-only">{T.photoAlt}</span>
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={shownId}
              src={`/portal/diario/photo/${shownId}`}
              alt={T.photoAlt}
              className="mt-4 max-h-[70dvh] w-full rounded-xl bg-secondary object-contain"
              onError={() => setFailedId(shownId)}
            />
          )
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
