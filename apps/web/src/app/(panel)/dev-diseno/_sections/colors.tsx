import { Check, X } from "lucide-react";
import { contrastRatio, compositeOver } from "@/lib/contrast";
import {
  MATERIAL_TEXT_TOKENS,
  colors,
  contrastRequirements,
  materials,
  portalColorOverrides,
  type ColorToken,
} from "@/lib/design-tokens";
import { DemoLabel, DemoSection } from "./section";

const groups: { label: string; tokens: ColorToken[] }[] = [
  { label: "Fondos", tokens: ["background", "grouped", "sidebar", "card", "muted"] },
  { label: "Texto", tokens: ["foreground", "muted-foreground", "muted-foreground-vibrant", "placeholder", "tertiary"] },
  { label: "Rellenos y bordes", tokens: ["secondary", "fill-hover", "fill-pressed", "border", "input"] },
  {
    label: "Tint (acción, selección, foco)",
    tokens: ["primary", "primary-hover", "primary-pressed", "primary-soft", "primary-soft-hover", "primary-soft-pressed", "primary-vibrant"],
  },
  {
    label: "Destructivo",
    tokens: ["destructive", "destructive-hover", "destructive-pressed", "destructive-muted", "destructive-muted-hover", "destructive-muted-pressed", "destructive-vibrant"],
  },
  { label: "Estados", tokens: ["success", "success-muted", "warning", "warning-muted", "info", "info-muted"] },
];

const fmt = (n: number) => new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(n);
const resolve = (c: string) => (c.startsWith("#") ? c : colors[c as ColorToken]);

function Pass({ ok }: { ok: boolean }) {
  return ok ? (
    <span className="inline-flex items-center gap-1 font-semibold text-success">
      <Check className="size-3.5" strokeWidth={2.5} aria-hidden />
      AA
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 font-semibold text-destructive">
      <X className="size-3.5" strokeWidth={2.5} aria-hidden />
      No
    </span>
  );
}

export function ColorsSection() {
  const results = contrastRequirements.map((r) => ({ ...r, ratio: contrastRatio(resolve(r.fg), resolve(r.bg)) }));
  const failing = results.filter((r) => r.ratio < r.min).length;
  const backgrounds = [
    { label: "Blanco", hex: colors.background },
    { label: "Agrupado", hex: colors.grouped },
    { label: "Agrupado del portal", hex: portalColorOverrides.grouped ?? colors.grouped },
  ];

  return (
    <DemoSection
      id="colores"
      index={1}
      title="Color"
      description="Un único juego de tokens (lib/design-tokens.ts). El tint azul aparece solo en acción principal, selección, foco, links y navegación activa."
    >
      <div className="space-y-8">
        {groups.map((g) => (
          <div key={g.label}>
            <DemoLabel>{g.label}</DemoLabel>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
              {g.tokens.map((t) => (
                <li key={t} className="overflow-hidden rounded-lg bg-card shadow-card">
                  <div className="h-14" style={{ backgroundColor: colors[t] }} />
                  <div className="px-3 py-2">
                    <p className="truncate text-footnote font-semibold">{t}</p>
                    <p className="text-footnote tabular-nums text-muted-foreground">{colors[t]}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}

        <div>
          <DemoLabel>Texto sobre los tres fondos</DemoLabel>
          <div className="grid gap-3 md:grid-cols-3">
            {backgrounds.map((b) => (
              <div key={b.label} className="rounded-xl p-4 shadow-card" style={{ backgroundColor: b.hex }}>
                <p className="text-footnote font-semibold text-muted-foreground">{b.label}</p>
                <p className="mt-2 text-body">María López · 61,2 kg</p>
                <p className="text-callout text-muted-foreground">Próximo turno: jueves 9 de octubre, 10:30</p>
                <p className="mt-1 text-callout font-medium text-primary">Ver ficha</p>
                <p className="text-callout text-destructive">No se pudo guardar</p>
                <p className="text-callout text-placeholder">Buscar paciente…</p>
              </div>
            ))}
          </div>
        </div>

        <div>
          <DemoLabel>
            Contrastes medidos en vivo ({results.length} pares, {failing === 0 ? "todos AA" : `${failing} fallan`})
          </DemoLabel>
          <div className="overflow-hidden rounded-xl bg-card shadow-card">
            <div className="max-h-[28rem] overflow-y-auto">
              <table className="w-full text-callout">
                <thead className="sticky top-0 bg-background/95 text-left">
                  <tr className="border-b border-border">
                    <th className="h-9 px-3 text-footnote font-semibold text-muted-foreground">Muestra</th>
                    <th className="px-3 text-footnote font-semibold text-muted-foreground">Texto / fondo</th>
                    <th className="px-3 text-footnote font-semibold text-muted-foreground">Uso</th>
                    <th className="px-3 text-right text-footnote font-semibold text-muted-foreground">Relación</th>
                    <th className="px-3 text-right text-footnote font-semibold text-muted-foreground">Mínimo</th>
                    <th className="px-3 text-footnote font-semibold text-muted-foreground">Resultado</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r) => (
                    <tr key={`${r.fg}-${r.bg}`} className="border-b border-border last:border-0">
                      <td className="px-3 py-2">
                        <span
                          className="inline-flex h-7 w-12 items-center justify-center rounded-xs text-footnote font-semibold"
                          style={{ color: resolve(r.fg), backgroundColor: resolve(r.bg) }}
                        >
                          Aa
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <span className="font-medium">{r.fg}</span>
                        <span className="text-muted-foreground"> / {r.bg}</span>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{r.use}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmt(r.ratio)}:1</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{fmt(r.min)}</td>
                      <td className="px-3 py-2">
                        <Pass ok={r.ratio >= r.min} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div>
          <DemoLabel>Texto sobre materiales, con el peor fondo debajo (negro)</DemoLabel>
          <div className="grid gap-3 md:grid-cols-3">
            {Object.entries(materials).map(([name, m]) => {
              const surface = compositeOver(colors.background, m.alpha, colors.overlay);
              return (
                <div key={name} className="rounded-xl p-4" style={{ backgroundColor: surface }}>
                  <p className="text-footnote font-semibold" style={{ color: colors.foreground }}>
                    material-{name} · {Math.round(m.alpha * 100)} % sobre negro → {surface}
                  </p>
                  <ul className="mt-2 space-y-1">
                    {MATERIAL_TEXT_TOKENS.map((t) => {
                      const ratio = contrastRatio(colors[t], surface);
                      return (
                        <li key={t} className="flex items-center justify-between gap-2 text-callout" style={{ color: colors[t] }}>
                          <span>{t}</span>
                          <span className="tabular-nums">{fmt(ratio)}:1</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </DemoSection>
  );
}
