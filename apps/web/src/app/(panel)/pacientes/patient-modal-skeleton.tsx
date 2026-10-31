"use client";

import { createContext, useContext } from "react";
import { Skeleton } from "@/components/primitives/skeleton";
import { cn } from "@/lib/utils";
import type { PatientModalPreview } from "@/lib/patient-modal-origin";
import { PatientHeaderIdentity } from "./[id]/patient-header-identity";

/** Lo que la fila tocada ya sabía del paciente; null si el modal no se abrió desde la lista. */
export const PatientModalPreviewContext = createContext<PatientModalPreview | null>(null);

/** Mientras llega la ficha en el modal. Con la vista previa de la fila, el encabezado real (iniciales,
 *  nombre y etapa en el mismo lugar que en la ficha: a dónde viajan desde la fila); sin ella, el
 *  contorno del encabezado. Después, el contorno de los datos, las acciones y las pestañas: con la vista
 *  previa recién aparece si la ficha tarda (como en el video, la tarjeta abre limpia y la ficha entra
 *  con la cascada; un contorno gris que enseguida cambia por la ficha se ve como un salto). */
export function PatientModalSkeleton() {
  const preview = useContext(PatientModalPreviewContext);
  const later = preview ? "animate-fade-in [animation-delay:500ms]" : undefined;
  return (
    <div aria-busy="true">
      <div className="relative pt-1">
        {preview ? (
          <PatientHeaderIdentity
            initials={preview.initials}
            stage={preview.stage}
            archived={false}
            name={preview.name}
            inDialog
          />
        ) : (
          <div className="space-y-4">
            <Skeleton className="size-20 rounded-full" />
            <Skeleton className="h-8 w-64" />
          </div>
        )}
        <div className={cn("mt-3 space-y-2", later)}>
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-20" />
        </div>
        <div className={cn("mt-5 flex gap-2", later)}>
          <Skeleton className="h-9 w-36 rounded-full" />
          <Skeleton className="h-9 w-28 rounded-full" />
          <Skeleton className="h-9 w-28 rounded-full" />
        </div>
      </div>
      <div className={later}>
        <Skeleton className="mt-6 h-11 w-full" />
        <Skeleton className="mt-4 h-48 w-full" />
      </div>
    </div>
  );
}
