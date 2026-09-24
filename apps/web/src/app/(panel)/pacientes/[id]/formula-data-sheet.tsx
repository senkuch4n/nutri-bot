"use client";

import type { ReactNode } from "react";
import { Pencil } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/primitives/sheet";
import { Button } from "@/components/ui";

/** Panel lateral con el formulario de datos para cálculos. No se cierra solo al guardar. */
export function FormulaDataSheet({ children }: { children: ReactNode }) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button type="button" variant="secondary" size="sm">
          <Pencil aria-hidden />
          Editar
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Datos para cálculos</SheetTitle>
          <SheetDescription>Los usan las fórmulas de la calculadora.</SheetDescription>
        </SheetHeader>
        <div className="mt-6">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
