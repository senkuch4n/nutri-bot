import { describe, expect, it } from "vitest";
import { compositeOver, contrastRatio } from "./contrast";
import {
  MATERIAL_TEXT_TOKENS,
  chartPalette,
  colors,
  contrastRequirements,
  cssVariablesFor,
  hexToHslChannels,
  materials,
  typeScale,
} from "./design-tokens";

const resolve = (c: string) => (c.startsWith("#") ? c : colors[c as keyof typeof colors]);

describe("design-tokens: contraste", () => {
  it.each(contrastRequirements.map((r) => [`${r.fg} / ${r.bg} ≥ ${r.min} (${r.use})`, r] as const))(
    "%s",
    (_, r) => {
      expect(contrastRatio(resolve(r.fg), resolve(r.bg))).toBeGreaterThanOrEqual(r.min);
    },
  );

  it("cubre los pares obligatorios de la SDD", () => {
    const has = (fg: string, bg: string) => contrastRequirements.some((r) => r.fg === fg && r.bg === bg);
    expect(has("primary-vibrant", "primary-soft-pressed")).toBe(true);
    expect(has("destructive-pressed", "destructive-muted-pressed")).toBe(true);
    expect(has("input", "grouped")).toBe(true);
    expect(has("ring", "primary-soft")).toBe(true);
    expect(has("primary-foreground", "primary-pressed")).toBe(true);
  });

  const unders = ["#000000", "#1D1D1F", "#0066CC", "#D70015"];
  for (const [name, m] of Object.entries(materials)) {
    for (const token of MATERIAL_TEXT_TOKENS) {
      it(`${token} sobre material ${name} es legible con cualquier fondo debajo`, () => {
        for (const under of unders) {
          const surface = compositeOver(colors.background, m.alpha, under);
          expect(contrastRatio(colors[token], surface)).toBeGreaterThanOrEqual(4.5);
        }
      });
    }
  }

  it("el texto secundario normal y el tint NO son aptos sobre materiales (por eso existen los vibrant)", () => {
    const worst = compositeOver(colors.background, materials.chrome.alpha, "#000000");
    expect(contrastRatio(colors["muted-foreground"], worst)).toBeLessThan(4.5);
    expect(contrastRatio(colors.primary, worst)).toBeLessThan(4.5);
  });

  it("todos los colores de gráficos llegan a 3:1 sobre blanco", () => {
    const all = [
      ...chartPalette.series,
      ...chartPalette.study,
      ...Object.values(chartPalette.metric),
      ...Object.values(chartPalette.tissue),
      ...Object.values(chartPalette.macro),
    ];
    for (const c of all) expect(contrastRatio(c, "#FFFFFF")).toBeGreaterThanOrEqual(3);
  });
});

describe("design-tokens: conversión", () => {
  it("hexToHslChannels", () => {
    expect(hexToHslChannels("#0066CC")).toBe("210 100% 40%");
    expect(hexToHslChannels("#FFFFFF")).toBe("0 0% 100%");
    expect(hexToHslChannels("#000000")).toBe("0 0% 0%");
    expect(hexToHslChannels("#1D1D1F")).toBe("240 3.3% 11.8%");
    expect(hexToHslChannels("#F5F5F7")).toBe("240 11.1% 96.5%");
  });

  it("cssVariablesFor genera canales HSL", () => {
    expect(cssVariablesFor({ primary: colors.primary })).toEqual({ "--primary": "210 100% 40%" });
    expect(cssVariablesFor(colors)["--overlay"]).toBe("0 0% 0%");
  });

  it("no queda ningún valor de la paleta Notion", () => {
    const notion = ["#37352F", "#2C6890", "#65635D"];
    const values = Object.values(colors).map((v) => v.toUpperCase());
    for (const n of notion) expect(values).not.toContain(n);
    const channels = Object.values(cssVariablesFor(colors));
    for (const n of ["45 4% 18%", "45 8% 20%", "60 11% 96%", "60 4% 91%"]) expect(channels).not.toContain(n);
  });

  it("la escala tipográfica usa rem y leading ≥ tamaño", () => {
    for (const s of Object.values(typeScale)) {
      expect(s.size.endsWith("rem")).toBe(true);
      expect(parseFloat(s.lineHeight)).toBeGreaterThanOrEqual(parseFloat(s.size));
    }
  });
});
