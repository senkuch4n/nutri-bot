"use client";

import { useState, type MouseEvent } from "react";
import { CalendarClock, ChevronRight, ClipboardList, NotebookPen } from "lucide-react";
import { MotionConfig } from "motion/react";
import { SimToggle } from "@/app/(panel)/dev-diseno/_sections/demo-frame";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/primitives/sheet";
import { SegmentedControl } from "@/components/segmented-control";
import { PortalHeader } from "@/components/shell/portal-header";
import { PortalNav } from "@/components/shell/portal-nav";
import { Button, Field, Input, Metric, Textarea } from "@/components/ui";
import { cn } from "@/lib/utils";

const paragraphs = [
  "Este texto largo está para scrollear: el contenido pasa por debajo del header y de la tab bar, que son materiales translúcidos. El borde del header aparece recién cuando el contenido empieza a pasar por debajo.",
  "Las tarjetas se pueden tocar: responden en el pointer-down con una escala mínima. En el celular, ningún hover queda pegado después de tocar.",
  "Los campos de texto del portal usan 17 px: Safari en iPhone no hace zoom al enfocarlos.",
];

/** Interacción de la demo: los links y el "Salir" no navegan; marcan el activo localmente. */
function useDemoNav() {
  const [active, setActive] = useState("/portal");
  function onClickCapture(e: MouseEvent) {
    const a = (e.target as Element).closest("a");
    if (!a) return;
    e.preventDefault();
    setActive(a.getAttribute("href") ?? "/portal");
  }
  return { active, onClickCapture };
}

export function PortalDemo() {
  const [reduceTransparency, setReduceTransparency] = useState(false);
  const [moreContrast, setMoreContrast] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [range, setRange] = useState<"mes" | "trimestre" | "anio">("trimestre");
  const nav = useDemoNav();

  return (
    <div
      className={cn(
        "theme-portal relative min-h-[100dvh] bg-grouped text-foreground",
        reduceTransparency && "a11y-reduce-transparency",
        moreContrast && "a11y-more-contrast",
      )}
      onClickCapture={nav.onClickCapture}
      onSubmitCapture={(e) => e.preventDefault()}
    >
      <MotionConfig reducedMotion={reduceMotion ? "always" : "user"}>
        <PortalHeader professionalName="Lic. Daiana Ponce" activeHref={nav.active} />
        <main
          data-portal-main
          className="mx-auto max-w-2xl space-y-6 px-4 pb-[calc(3.5rem+env(safe-area-inset-bottom)+1.5rem)] pt-6 md:py-8"
        >
          <div>
            <p className="text-subheadline font-medium text-muted-foreground">Demo de diseño · portal</p>
            <h1 className="mt-1 text-large-title text-balance">Hola, María</h1>
          </div>

          <div className="flex flex-wrap gap-2 rounded-xl bg-card p-4 shadow-card">
            <SimToggle label="Transparencia reducida" checked={reduceTransparency} onChange={setReduceTransparency} />
            <SimToggle label="Más contraste" checked={moreContrast} onChange={setMoreContrast} />
            <SimToggle label="Movimiento reducido" checked={reduceMotion} onChange={setReduceMotion} />
          </div>

          <button
            type="button"
            className="relative flex w-full items-center gap-4 rounded-xl bg-card p-5 text-left shadow-card press-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
              <CalendarClock className="size-5" strokeWidth={1.75} aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-subheadline text-muted-foreground">Próximo turno</span>
              <span className="block text-headline">Jueves 9 de octubre, 10:30</span>
              <span className="block text-callout text-muted-foreground">Control mensual · 40 min</span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-tertiary" aria-hidden />
          </button>

          <div className="grid gap-4 sm:grid-cols-2">
            <button
              type="button"
              className="relative rounded-xl bg-card p-5 text-left shadow-card press-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <Metric label="Peso" value={61.2} unit="kg" size="lg" trend={{ delta: -1.4, unit: "kg", sentiment: "positive" }} />
            </button>
            <button
              type="button"
              className="relative flex items-center gap-3 rounded-xl bg-card p-5 text-left shadow-card press-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <ClipboardList className="size-6 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden />
              <span>
                <span className="block text-headline">Tu plan</span>
                <span className="block text-callout text-muted-foreground">1.850 kcal · 5 comidas</span>
              </span>
            </button>
          </div>

          <div className="rounded-xl bg-card p-5 shadow-card">
            <SegmentedControl
              aria-label="Período de la evolución"
              fullWidth
              size="lg"
              value={range}
              onValueChange={setRange}
              options={[
                { value: "mes", label: "Mes" },
                { value: "trimestre", label: "3 meses" },
                { value: "anio", label: "Año" },
              ]}
            />
          </div>

          <Sheet>
            <SheetTrigger asChild>
              <Button size="lg" className="w-full">
                <NotebookPen aria-hidden />
                Registrar una comida
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="mx-auto max-w-2xl">
              <SheetHeader>
                <SheetTitle>Registrar una comida</SheetTitle>
                <SheetDescription>Arrastrá el grabber o el título hacia abajo para cerrar. (Demo: no se guarda nada.)</SheetDescription>
              </SheetHeader>
              <div className="mt-5 space-y-4">
                <Field label="¿Qué comiste?">
                  <Input placeholder="Ensalada de quinoa con pollo" />
                </Field>
                <Field label="Comentario" hint="Opcional">
                  <Textarea placeholder="Cómo te sentiste, hambre, saciedad…" />
                </Field>
              </div>
              <SheetFooter className="mt-6">
                <Button size="lg" className="w-full sm:w-auto">
                  Guardar
                </Button>
              </SheetFooter>
            </SheetContent>
          </Sheet>

          {Array.from({ length: 4 }, (_, i) => (
            <section key={i} className="rounded-xl bg-card p-5 shadow-card">
              <h2 className="text-headline">Nota {i + 1}</h2>
              {paragraphs.map((p) => (
                <p key={p} className="mt-2 text-body-lg text-muted-foreground">
                  {p}
                </p>
              ))}
            </section>
          ))}
        </main>
        <PortalNav variant="bottom" activeHref={nav.active} />
      </MotionConfig>
    </div>
  );
}
