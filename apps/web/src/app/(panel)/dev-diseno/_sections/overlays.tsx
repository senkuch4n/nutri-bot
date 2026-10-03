"use client";

import { useState } from "react";
import { Copy, Ellipsis, Pencil, Share, Trash2 } from "lucide-react";
import { useConfirm } from "@/components/confirm";
import { Modal } from "@/components/modal";
import { Button as PrimitiveButton } from "@/components/primitives/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/primitives/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/primitives/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/primitives/popover";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/primitives/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip";
import { Button, Field, Input } from "@/components/ui";
import { notify } from "@/lib/notify";
import { DemoLabel, DemoSection } from "./section";

function SheetDemo({ side, modal = true, label }: { side: "right" | "left" | "bottom"; modal?: boolean; label: string }) {
  return (
    <Sheet modal={modal}>
      <SheetTrigger asChild>
        <Button variant="secondary">{label}</Button>
      </SheetTrigger>
      <SheetContent side={side}>
        <SheetHeader>
          <SheetTitle>Editar servicio</SheetTitle>
          <SheetDescription>
            {side === "bottom"
              ? "Arrastrá el grabber o el encabezado hacia abajo para cerrar."
              : "En táctil, arrastrá el panel hacia su borde para cerrar. Con mouse: X, Esc o clic afuera."}
          </SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-4">
          <Field label="Nombre">
            <Input defaultValue="Control mensual" />
          </Field>
          <Field label="Duración (min)">
            <Input inputMode="numeric" defaultValue="40" />
          </Field>
          {Array.from({ length: side === "bottom" ? 2 : 6 }, (_, i) => (
            <p key={i} className="text-body text-muted-foreground">
              Texto de relleno para scrollear dentro del sheet. El scroll vertical sigue andando: el gesto de
              cerrar solo gana si el movimiento es horizontal.
            </p>
          ))}
        </div>
        <SheetFooter className="mt-6">
          <Button variant="secondary">Cancelar</Button>
          <Button>Guardar</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export function OverlaysSection() {
  const confirm = useConfirm();
  const [modalOpen, setModalOpen] = useState(false);
  const [lastAnswer, setLastAnswer] = useState<string | null>(null);
  const [reopenOpen, setReopenOpen] = useState(false);

  // Caso de prueba: cerrar y reabrir a mitad de la salida (la misma instancia vuelve a estar presente).
  function closeAndReopen() {
    setReopenOpen(true);
    window.setTimeout(() => setReopenOpen(false), 700);
    window.setTimeout(() => setReopenOpen(true), 820);
  }

  // Patrón correcto (confirm.tsx): nunca `await confirm()` dentro de <form action> ni startTransition.
  async function askDestructive() {
    const ok = await confirm({
      title: "¿Borrar la plantilla?",
      description: "Se borra «Plan hipocalórico 1.500 kcal». Los planes ya asignados no cambian.",
      confirmLabel: "Borrar",
    });
    setLastAnswer(ok ? "Confirmó borrar" : "Canceló");
  }
  async function askNeutral() {
    const ok = await confirm({
      title: "¿Enviar el recordatorio ahora?",
      description: "María López lo recibe por WhatsApp en unos segundos. (Demo: no se envía nada.)",
      confirmLabel: "Enviar",
      destructive: false,
    });
    setLastAnswer(ok ? "Confirmó enviar" : "Canceló");
  }

  return (
    <DemoSection
      id="overlays"
      index={11}
      title="Overlays"
      description="Todos se pueden cerrar a mitad de la entrada (Esc o clic afuera) y vuelven desde donde están, por el mismo camino. Con teclado: el foco queda atrapado adentro y vuelve al botón al cerrar."
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3 rounded-xl bg-card p-5 shadow-card">
          <DemoLabel>Modales</DemoLabel>
          <div className="flex flex-wrap gap-2">
            <Dialog>
              <DialogTrigger asChild>
                <Button>Dialog</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Nuevo turno</DialogTitle>
                  <DialogDescription>Elegí paciente, servicio y horario.</DialogDescription>
                </DialogHeader>
                <Field label="Paciente">
                  <Input placeholder="Buscar paciente…" />
                </Field>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="secondary">Cancelar</Button>
                  </DialogClose>
                  <DialogClose asChild>
                    <Button>Crear turno</Button>
                  </DialogClose>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Button variant="secondary" onClick={() => setModalOpen(true)}>
              Modal (compat)
            </Button>
            <Button variant="secondary" onClick={closeAndReopen}>
              Cerrar y reabrir a mitad
            </Button>
            <Dialog open={reopenOpen} onOpenChange={setReopenOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Reabierto durante la salida</DialogTitle>
                  <DialogDescription>
                    Se abrió, se cerró y se volvió a abrir antes de terminar de salir. Tiene que poder usarse: escribí
                    en el campo y cerrá con la X.
                  </DialogDescription>
                </DialogHeader>
                <Field label="Prueba">
                  <Input placeholder="Escribí algo…" />
                </Field>
              </DialogContent>
            </Dialog>
            <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Agregar bloque" description="Modal de compatibilidad sobre Dialog.">
              <p className="text-body text-muted-foreground">Mismo comportamiento y animación que Dialog.</p>
            </Modal>
            <Button variant="danger" onClick={askDestructive}>
              <Trash2 aria-hidden />
              Confirmar destructivo
            </Button>
            <Button variant="secondary" onClick={askNeutral}>
              Confirmar neutro
            </Button>
          </div>
          <p className="text-footnote text-muted-foreground" aria-live="polite">
            {lastAnswer ? `Última respuesta: ${lastAnswer}` : "Las confirmaciones devuelven la respuesta acá."}
          </p>
        </div>

        <div className="space-y-3 rounded-xl bg-card p-5 shadow-card">
          <DemoLabel>Sheets</DemoLabel>
          <div className="flex flex-wrap gap-2">
            <SheetDemo side="right" label="Derecha" />
            <SheetDemo side="left" label="Izquierda" />
            <SheetDemo side="bottom" label="Abajo (grabber)" />
            <SheetDemo side="right" modal={false} label="No modal (turno)" />
          </div>
          <p className="text-footnote text-muted-foreground">
            El no modal no oscurece ni bloquea la pantalla (§12 «separar sin cortar el flujo»).
          </p>
        </div>

        <div className="space-y-3 rounded-xl bg-card p-5 shadow-card">
          <DemoLabel>Popover, menú y tooltip</DemoLabel>
          <div className="flex flex-wrap items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="secondary">1.842 kcal</Button>
              </PopoverTrigger>
              <PopoverContent side="top" align="start">
                <p className="text-callout font-semibold">Porción de 150 g</p>
                <p className="mt-1 text-callout tabular-nums">4 × 30 + 4 × 12 + 9 × 8</p>
                <p className="mt-2 text-footnote text-muted-foreground">Material flotante: texto secundario vibrant.</p>
              </PopoverContent>
            </Popover>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <PrimitiveButton variant="ghost" size="icon" aria-label="Más acciones">
                  <Ellipsis />
                </PrimitiveButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuLabel>Plan</DropdownMenuLabel>
                <DropdownMenuItem>
                  <Pencil aria-hidden />
                  Editar
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Copy aria-hidden />
                  Duplicar
                </DropdownMenuItem>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Share aria-hidden />
                    Compartir
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuItem>Por WhatsApp</DropdownMenuItem>
                    <DropdownMenuItem>Descargar PDF</DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuItem disabled>Archivar</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive">
                  <Trash2 aria-hidden />
                  Borrar plan
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost">Con tooltip</Button>
              </TooltipTrigger>
              <TooltipContent>Tooltip: fundido corto, sin escala con movimiento reducido</TooltipContent>
            </Tooltip>
          </div>
        </div>

        <div className="space-y-3 rounded-xl bg-card p-5 shadow-card">
          <DemoLabel>Toasts (lib/notify.ts, sin cambios)</DemoLabel>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => notify.saved()}>
              notify.saved
            </Button>
            <Button variant="secondary" onClick={() => notify.error()}>
              notify.error
            </Button>
            <Button variant="secondary" onClick={() => notify.info("El turno se movió al jueves 9, 10:30.")}>
              notify.info
            </Button>
          </div>
        </div>
      </div>
    </DemoSection>
  );
}
