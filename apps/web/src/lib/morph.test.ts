import { describe, expect, it } from "vitest";
import {
  blurFilter,
  canMorph,
  flipFrom,
  inverseScale,
  lerp,
  originHiddenStyle,
  originRevealStyle,
  originScale,
  restoreInlineStyle,
  saveInlineStyle,
  settleKeyframes,
  type InlineStyle,
  type Rect,
} from "./morph";

const target: Rect = { left: 100, top: 50, width: 400, height: 300 };
const src: Rect = { left: 20, top: 10, width: 200, height: 40 };

/** `style` de mentira: guarda valor y prioridad como CSSStyleDeclaration. */
function fakeStyle(initial: Record<string, [string, string]> = {}) {
  const map = new Map(Object.entries(initial));
  const style: InlineStyle & { map: typeof map } = {
    map,
    getPropertyValue: (p) => map.get(p)?.[0] ?? "",
    getPropertyPriority: (p) => map.get(p)?.[1] ?? "",
    setProperty: (p, v, priority) => void map.set(p, [v ?? "", priority ?? ""]),
    removeProperty: (p) => {
      const old = map.get(p)?.[0] ?? "";
      map.delete(p);
      return old;
    },
  };
  return style;
}

describe("canMorph", () => {
  it("pide un origen y un destino con tamaño", () => {
    expect(canMorph(src, target)).toBe(true);
    expect(canMorph(null, target)).toBe(false);
    expect(canMorph({ ...src, width: 0 }, target)).toBe(false);
    expect(canMorph(src, { ...target, height: 0 })).toBe(false);
  });
});

describe("flipFrom", () => {
  it("lleva el shell (origen 0 0) exactamente sobre el origen", () => {
    expect(flipFrom(src, target)).toEqual({ x: -80, y: -40, sx: 0.5, sy: 40 / 300 });
  });

  it("sin desplazamiento ni escala cuando coinciden", () => {
    expect(flipFrom(target, target)).toEqual({ x: 0, y: 0, sx: 1, sy: 1 });
  });
});

describe("settleKeyframes", () => {
  it("pasa por una versión un poco más chica y centrada del origen y termina sobre él", () => {
    const k = settleKeyframes(src, target);
    // settleW = max(200 − 6, 200 × 0,96) = 194; settleH = max(40 − 4, 40 × 0,96) = 38,4
    expect(k.x).toEqual([20 + (200 - 194) / 2 - 100, -80]);
    expect(k.y).toEqual([10 + 1 - 50, -40]);
    expect(k.sx[0]).toBeCloseTo(194 / 400);
    expect(k.sx[1]).toBe(0.5);
    expect(k.sy[0]).toBeCloseTo(38.4 / 300);
    expect(k.sy[1]).toBeCloseTo(40 / 300);
  });

  it("en orígenes chicos achica al 96 %", () => {
    const small: Rect = { left: 0, top: 0, width: 50, height: 20 };
    const k = settleKeyframes(small, target);
    // max(44, 48) = 48; max(16, 19,2) = 19,2
    expect(k.sx[0]).toBeCloseTo(48 / 400);
    expect(k.sy[0]).toBeCloseTo(19.2 / 300);
    expect(k.x[0]).toBeCloseTo(1 - 100);
  });
});

describe("originScale", () => {
  it("0,96 en orígenes anchos y 0,75 en los angostos", () => {
    expect(originScale(240)).toBe(0.96);
    expect(originScale(500)).toBe(0.96);
    expect(originScale(239)).toBe(0.75);
  });
});

describe("inverseScale / blurFilter / lerp", () => {
  it("invierte la escala sin dividir por cero", () => {
    expect(inverseScale(0.5)).toBe(2);
    expect(inverseScale(0)).toBe(100);
    expect(inverseScale(-1)).toBe(100);
  });

  it("sin filtro cuando el desenfoque es despreciable", () => {
    expect(blurFilter(0)).toBe("none");
    expect(blurFilter(0.005)).toBe("none");
    expect(blurFilter(12)).toBe("blur(12px)");
  });

  it("interpola", () => {
    expect(lerp(0, 10, 0.25)).toBe(2.5);
    expect(lerp(1, 0.96, 1)).toBe(0.96);
  });
});

describe("estilos del origen", () => {
  it("ocultar: de visible a transparente, desenfocado y achicado", () => {
    expect(originHiddenStyle(0, 0.96, 1)).toEqual({ opacity: "1", filter: "none", transform: "scale(1)" });
    expect(originHiddenStyle(1, 0.75, 1)).toEqual({ opacity: "0", filter: "blur(8px)", transform: "scale(0.75)" });
  });

  it("reaparecer: de blur 3, 0,985 y 2 px abajo a su estado original", () => {
    expect(originRevealStyle(0, 0.8)).toEqual({
      opacity: "0",
      filter: "blur(3px)",
      transform: "translateY(2px) scale(0.985)",
    });
    expect(originRevealStyle(1, 0.8)).toEqual({ opacity: "0.8", filter: "none", transform: "translateY(0px) scale(1)" });
  });

  it("guarda y restaura los estilos inline exactos, con prioridad", () => {
    const style = fakeStyle({ opacity: ["0.5", "important"], transform: ["rotate(1deg)", ""] });
    const saved = saveInlineStyle(style);
    style.setProperty("opacity", "0");
    style.setProperty("filter", "blur(8px)");
    style.setProperty("transform", "scale(0.96)");
    style.setProperty("will-change", "opacity, filter, transform");
    restoreInlineStyle(style, saved);
    expect(Object.fromEntries(style.map)).toEqual({
      opacity: ["0.5", "important"],
      transform: ["rotate(1deg)", ""],
    });
  });

  it("restaura solo las propiedades pedidas", () => {
    const style = fakeStyle({ transform: ["rotate(1deg)", "important"] });
    const saved = saveInlineStyle(style);
    style.setProperty("transform", "scale(0.5)");
    style.setProperty("opacity", "0");
    restoreInlineStyle(style, saved, ["transform"]);
    expect(Object.fromEntries(style.map)).toEqual({
      transform: ["rotate(1deg)", "important"],
      opacity: ["0", ""],
    });
  });
});
