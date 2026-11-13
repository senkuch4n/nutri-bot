"use client";

import { useState } from "react";
import { CalendarDays, CalendarRange, List } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/primitives/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/primitives/toggle-group";
import { SegmentedControl } from "@/components/segmented-control";
import { DemoLabel, DemoSection } from "./section";

const tabs = ["Resumen", "Consultas", "Antropometría", "Evolución", "Planes", "Diario", "Pagos"];
const slots = ["09:00", "09:40", "10:20", "11:00", "11:40", "12:20", "15:00", "15:40"];

export function SelectionSection() {
  const [filter, setFilter] = useState<"pendientes" | "respondidos">("pendientes");
  const [view, setView] = useState<"dia" | "semana" | "lista">("semana");
  const [period, setPeriod] = useState<"mes" | "trimestre" | "anio" | "todo">("trimestre");
  const [a, setA] = useState<"kg" | "lb">("kg");
  const [b, setB] = useState<"cm" | "in">("cm");
  const [payment, setPayment] = useState<"todos" | "pagados" | "pendientes">("todos");
  const [slot, setSlot] = useState("10:20");
  const [channels, setChannels] = useState<string[]>(["whatsapp"]);

  return (
    <DemoSection
      id="seleccion"
      index={8}
      title="Selección"
      description="El control segmentado reemplaza a futuro los filtros de Mensajes, Pagos y Avisos y el selector de vista del calendario (017b/c). Con teclado: Tab entra, flechas mueven, Espacio elige."
    >
      <div className="space-y-8">
        <div className="space-y-5 rounded-xl bg-card p-5 shadow-card">
          <DemoLabel>Control segmentado</DemoLabel>
          <div className="flex flex-wrap items-center gap-4">
            <SegmentedControl
              aria-label="Filtro de mensajes"
              value={filter}
              onValueChange={setFilter}
              options={[
                { value: "pendientes", label: "Pendientes" },
                { value: "respondidos", label: "Respondidos" },
              ]}
            />
            <SegmentedControl
              aria-label="Vista del calendario"
              size="sm"
              value={view}
              onValueChange={setView}
              options={[
                { value: "dia", label: "Día", icon: CalendarDays },
                { value: "semana", label: "Semana", icon: CalendarRange },
                { value: "lista", label: "Lista", icon: List },
              ]}
            />
            <SegmentedControl
              aria-label="Período"
              size="lg"
              value={period}
              onValueChange={setPeriod}
              options={[
                { value: "mes", label: "Mes" },
                { value: "trimestre", label: "3 meses" },
                { value: "anio", label: "Año" },
                { value: "todo", label: "Todo", disabled: true },
              ]}
            />
          </div>
          <div>
            <p className="mb-2 text-footnote text-muted-foreground">Dos instancias juntas (los thumbs no se cruzan)</p>
            <div className="flex gap-3">
              <SegmentedControl aria-label="Unidad de peso" value={a} onValueChange={setA} options={[{ value: "kg", label: "kg" }, { value: "lb", label: "lb" }]} />
              <SegmentedControl aria-label="Unidad de talla" value={b} onValueChange={setB} options={[{ value: "cm", label: "cm" }, { value: "in", label: "in" }]} />
            </div>
          </div>
          <div className="max-w-md">
            <p className="mb-2 text-footnote text-muted-foreground">fullWidth (portal y móvil)</p>
            <SegmentedControl
              aria-label="Estado del pago"
              fullWidth
              size="lg"
              value={payment}
              onValueChange={setPayment}
              options={[
                { value: "todos", label: "Todos" },
                { value: "pagados", label: "Pagados" },
                { value: "pendientes", label: "Pendientes" },
              ]}
            />
          </div>
        </div>

        <div className="rounded-xl bg-card p-5 shadow-card">
          <DemoLabel>Pestañas (indicador que se desliza)</DemoLabel>
          <Tabs defaultValue="Resumen">
            <div className="overflow-x-auto overflow-y-hidden">
              <TabsList className="w-max min-w-full">
                {tabs.map((t) => (
                  <TabsTrigger key={t} value={t}>
                    {t}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
            {tabs.map((t) => (
              <TabsContent key={t} value={t}>
                <p className="text-body text-muted-foreground">Contenido de «{t}»: aparece con un fundido de 150 ms, sin desplazarse.</p>
              </TabsContent>
            ))}
          </Tabs>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="rounded-xl bg-card p-5 shadow-card">
            <DemoLabel>ToggleGroup: grilla de horarios (single)</DemoLabel>
            <ToggleGroup
              type="single"
              value={slot}
              onValueChange={(v) => v && setSlot(v)}
              className="grid grid-cols-4 gap-2"
              aria-label="Horario"
            >
              {slots.map((s) => (
                <ToggleGroupItem key={s} value={s} variant="outline" className="tabular-nums">
                  {s}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          <div className="rounded-xl bg-card p-5 shadow-card">
            <DemoLabel>ToggleGroup: filtros (multiple)</DemoLabel>
            <ToggleGroup type="multiple" value={channels} onValueChange={setChannels} className="justify-start" aria-label="Canales">
              <ToggleGroupItem value="whatsapp">WhatsApp</ToggleGroupItem>
              <ToggleGroupItem value="mail">Mail</ToggleGroupItem>
              <ToggleGroupItem value="portal">Portal</ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>
      </div>
    </DemoSection>
  );
}
