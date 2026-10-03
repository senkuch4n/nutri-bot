"use client";

import { useState } from "react";
import { typeScale, legacyTypeScale, type TypeToken } from "@/lib/design-tokens";
import { cn } from "@/lib/utils";
import { DemoLabel, DemoSection } from "./section";

// Clases literales: Tailwind solo genera las que ve escritas en el código.
const semantic: { token: TypeToken; className: string; sample: string; use: string }[] = [
  { token: "large-title", className: "text-large-title", sample: "Hola, María", use: "Saludo del portal, login móvil" },
  { token: "title-1", className: "text-title-1", sample: "Pacientes", use: "PageHeader, login" },
  { token: "title-2", className: "text-title-2", sample: "Nuevo turno", use: "Dialog, Sheet, estados" },
  { token: "title-3", className: "text-title-3", sample: "Octubre 2026", use: "Calendario" },
  { token: "headline", className: "text-headline", sample: "Datos para cálculos", use: "Título de Card, SectionLabel" },
  { token: "body", className: "text-body", sample: "Próximo turno: jueves 9 de octubre, 10:30", use: "Texto corrido del panel" },
  { token: "body-lg", className: "text-body-lg", sample: "Próximo turno: jueves 9 de octubre, 10:30", use: "Texto e inputs del portal" },
  { token: "callout", className: "text-callout", sample: "María López · Control mensual", use: "Botones, celdas, filas, sidebar" },
  { token: "subheadline", className: "text-subheadline", sample: "Peso actual", use: "Etiquetas de campo, segmentado" },
  { token: "footnote", className: "text-footnote", sample: "Actualizado hace 3 minutos", use: "Ayudas, timestamps, encabezados de tabla" },
  { token: "caption", className: "text-caption", sample: "AGENDA · PACIENTES", use: "Grupos de sidebar, tab bar" },
  { token: "metric", className: "text-metric tabular-nums", sample: "61,2 kg", use: "Metric lg" },
  { token: "metric-md", className: "text-metric-md tabular-nums", sample: "1.842 kcal", use: "Metric md, StatTile" },
];

const legacy: { key: keyof typeof legacyTypeScale; className: string }[] = [
  { key: "sm", className: "text-sm" },
  { key: "base", className: "text-base" },
  { key: "lg", className: "text-lg" },
  { key: "2xl", className: "text-2xl" },
];

export function TypographySection() {
  const [features, setFeatures] = useState<"none" | "ss01" | "cv11">("none");
  const featureStyle = features === "none" ? undefined : { fontFeatureSettings: `"${features}"` };

  return (
    <DemoSection
      id="tipografia"
      index={2}
      title="Tipografía"
      description="Inter variable con tamaño óptico (opsz 14–32). Tracking y leading cambian con el tamaño: negativo y apretado en títulos, cerca de cero en el cuerpo."
    >
      <div className="space-y-8">
        <div className="overflow-hidden rounded-xl bg-card shadow-card">
          <ul>
            {semantic.map((s) => {
              const v = typeScale[s.token];
              return (
                <li key={s.token} className="grid gap-x-6 gap-y-1 border-b border-border px-5 py-4 last:border-0 md:grid-cols-[1fr_16rem]">
                  <p className={cn(s.className, "min-w-0 truncate")} style={featureStyle}>
                    {s.sample}
                  </p>
                  <div className="text-footnote text-muted-foreground">
                    <p className="font-semibold text-foreground">{s.token}</p>
                    <p className="tabular-nums">
                      {v.size} / {v.lineHeight} · {v.weight} · {v.tracking}
                    </p>
                    <p>{s.use}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <div>
          <DemoLabel>Escala de Tailwind re-mapeada (la usan las pantallas sin migrar)</DemoLabel>
          <div className="grid gap-3 md:grid-cols-2">
            {legacy.map((l) => {
              const v = legacyTypeScale[l.key];
              return (
                <div key={l.key} className="rounded-xl bg-card px-5 py-4 shadow-card">
                  <p className={l.className}>Brenda Yebara — 61,2 kg</p>
                  <p className="mt-1 text-footnote tabular-nums text-muted-foreground">
                    text-{l.key}: {v.size} / {v.lineHeight} · {v.tracking}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        <fieldset>
          <legend className="mb-3 text-subheadline font-semibold text-muted-foreground">
            Rasgos tipográficos para los números (Q2: por defecto ninguno)
          </legend>
          <div className="flex flex-wrap gap-2">
            {(["none", "ss01", "cv11"] as const).map((f) => (
              <label
                key={f}
                className={cn(
                  "relative inline-flex h-8 cursor-pointer items-center rounded-full px-3 text-subheadline font-medium press-none transition-colors duration-hover",
                  "has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring",
                  features === f ? "bg-primary-soft text-primary" : "bg-secondary hover:bg-fill-hover pressed:bg-fill-pressed",
                )}
              >
                <input type="radio" name="font-features" className="sr-only" checked={features === f} onChange={() => setFeatures(f)} />
                {f === "none" ? "Sin rasgos" : f}
              </label>
            ))}
          </div>
          <p className="mt-3 text-metric tabular-nums" style={featureStyle}>
            0123456789 · 61,2 kg · 1.842 kcal
          </p>
        </fieldset>
      </div>
    </DemoSection>
  );
}
