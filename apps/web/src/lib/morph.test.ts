import { describe, expect, it } from "vitest";
import { overlayAlpha } from "./design-tokens";
import {
  LIFT_FRACTION,
  LIFT_PAD,
  MORPH_BACKDROP_OPACITY,
  MORPH_DIM,
  MORPH_RADIUS,
  MORPH_STACK_DIM,
  backdropOpacity,
  blurFilter,
  canMorph,
  easeOutExpo,
  flipFrom,
  inverseScale,
  labelOffsetKeyframes,
  labelPosition,
  layerDim,
  lerp,
  liftKeyframes,
  liftRect,
  morphContent,
  morphTiming,
  openMode,
  openTimeline,
  openTransitions,
  originHiddenStyle,
  originRevealStyle,
  originScale,
  restoreInlineStyle,
  saveInlineStyle,
  settleKeyframes,
  visibleRadius,
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

describe("liftRect / liftKeyframes", () => {
  it("la tarjeta levantada es el origen agrandado 8 × 6 px por lado", () => {
    expect(LIFT_PAD).toEqual({ x: 8, y: 6 });
    expect(liftRect(src)).toEqual({ left: 12, top: 4, width: 216, height: 52 });
  });

  it("arranca exactamente sobre el origen, pasa por la tarjeta levantada y termina en su lugar", () => {
    const k = liftKeyframes(src, target);
    expect([k.x[0], k.y[0], k.sx[0], k.sy[0]]).toEqual([-80, -40, 0.5, 40 / 300]);
    // Levantada: { left 12, top 4, 216 × 52 }.
    expect(k.x[1]).toBe(12 - 100);
    expect(k.y[1]).toBe(4 - 50);
    expect(k.sx[1]).toBeCloseTo(216 / 400);
    expect(k.sy[1]).toBeCloseTo(52 / 300);
    expect([k.x[2], k.y[2], k.sx[2], k.sy[2]]).toEqual([0, 0, 1, 1]);
  });
});

describe("visibleRadius", () => {
  it("24 px en una tarjeta grande y una píldora en una baja", () => {
    expect(MORPH_RADIUS).toBe(24);
    expect(visibleRadius(400, 300)).toBe(24);
    expect(visibleRadius(216, 32)).toBe(16);
    expect(visibleRadius(10, 0)).toBe(0);
  });
});

describe("etiqueta compartida", () => {
  const text: Rect = { left: 36, top: 22, width: 90, height: 18 };

  it("queda fija respecto de la tarjeta mientras se levanta y después va hacia el título", () => {
    const k = labelOffsetKeyframes(text, src, { x: 24, y: 24 });
    expect(k.x).toEqual([16, 16, 24]);
    expect(k.y).toEqual([12, 12, 24]);
  });

  it("al arrancar cae exactamente sobre el texto del origen", () => {
    const k = labelOffsetKeyframes(text, src, { x: 24, y: 24 });
    const shell = liftKeyframes(src, target);
    const start = labelPosition({ x: target.left, y: target.top }, { x: shell.x[0], y: shell.y[0] }, { x: k.x[0], y: k.y[0] });
    expect(start).toEqual({ x: text.left, y: text.top });
  });

  it("al levantarse sube y se corre con la esquina de la tarjeta (LIFT_PAD)", () => {
    const k = labelOffsetKeyframes(text, src, { x: 24, y: 24 });
    const shell = liftKeyframes(src, target);
    const lifted = labelPosition({ x: target.left, y: target.top }, { x: shell.x[1], y: shell.y[1] }, { x: k.x[1], y: k.y[1] });
    expect(lifted).toEqual({ x: text.left - LIFT_PAD.x, y: text.top - LIFT_PAD.y });
  });

  it("termina en la esquina del diálogo más el desplazamiento del título", () => {
    const k = labelOffsetKeyframes(text, src, { x: 24, y: 30 });
    const end = labelPosition({ x: target.left, y: target.top }, { x: 0, y: 0 }, { x: k.x[2], y: k.y[2] });
    expect(end).toEqual({ x: 124, y: 80 });
  });
});

describe("modo de apertura", () => {
  it("desde la página es diferida, desde otro diálogo se levanta, y sin origen o reabierta es directa", () => {
    expect(openMode({ morph: true, resumed: false, nested: false })).toBe("delayed");
    expect(openMode({ morph: true, resumed: false, nested: true })).toBe("lift");
    expect(openMode({ morph: false, resumed: false, nested: true })).toBe("direct");
    expect(openMode({ morph: true, resumed: true, nested: false })).toBe("direct");
  });
});

describe("tiempos (medidos en el video de referencia)", () => {
  it("expo-out exacto en los extremos, creciente y con la forma medida", () => {
    expect(easeOutExpo(0)).toBe(0);
    expect(easeOutExpo(1)).toBe(1);
    expect(easeOutExpo(-1)).toBe(0);
    expect(easeOutExpo(2)).toBe(1);
    for (let t = 0; t < 1; t += 0.05) expect(easeOutExpo(t + 0.05)).toBeGreaterThan(easeOutExpo(t));
    const at = (ms: number) => easeOutExpo(ms / 1000 / morphTiming.expand);
    // Referencia: ~0,88 a los 117 ms de crecer y ~0,94 a los 167 ms; "llega" en ~170 ms.
    expect(at(100)).toBeCloseTo(0.81, 1);
    expect(at(170)).toBeGreaterThan(0.93);
    expect(at(170)).toBeLessThan(0.96);
  });

  it("diferida: el origen se va en 100 ms y la tarjeta aparece sobre él a los ~180 ms del clic", () => {
    const tl = openTimeline("delayed");
    expect(morphTiming.originOut).toBe(0.1);
    expect(tl.cardAt).toBe(0.18);
    expect(tl.cardAt).toBeGreaterThan(morphTiming.originOut);
    expect(tl.expandAt).toBe(tl.cardAt);
    const t = openTransitions("delayed");
    expect(t.originOut.duration).toBe(0.1);
    expect(t.originOut.delay ?? 0).toBe(0);
    expect(t.shellOpacity.delay).toBe(0.18);
    expect(t.shell).toMatchObject({ duration: 0.42, delay: 0.18, ease: easeOutExpo });
    expect(t.shell.times).toBeUndefined();
    // El fondo acompaña a la tarjeta.
    expect(t.backdrop.delay).toBe(tl.cardAt);
  });

  it("levantada: la tarjeta aparece y se levanta en 50 ms y después crece, en una sola animación", () => {
    const tl = openTimeline("lift");
    expect(tl.cardAt).toBe(0);
    expect(tl.expandAt).toBe(0.05);
    const t = openTransitions("lift");
    expect(t.shell.duration).toBeCloseTo(0.47);
    expect(t.shell.delay ?? 0).toBe(0);
    expect(t.shell.times).toEqual([0, LIFT_FRACTION, 1]);
    expect(LIFT_FRACTION).toBeCloseTo(0.05 / 0.47);
    expect(t.shell.ease).toEqual([expect.anything(), easeOutExpo]);
    expect(t.shellOpacity.duration).toBe(morphTiming.lift);
    expect(t.originOut.duration).toBe(morphTiming.lift);
  });

  it("directa: sin esperas, el shell aparece con un fundido corto", () => {
    const t = openTransitions("direct");
    expect(openTimeline("direct")).toMatchObject({ cardAt: 0, expandAt: 0 });
    expect(t.shellOpacity).toMatchObject({ duration: 0.15 });
    expect(t.shellOpacity.delay ?? 0).toBe(0);
    expect(t.shell.delay).toBe(0);
  });

  it("el contenido arranca con la tarjeta casi en tamaño y queda nítido ~350 ms después de que aparece", () => {
    for (const mode of ["delayed", "lift"] as const) {
      const tl = openTimeline(mode);
      const t = openTransitions(mode);
      const growthAtContent = easeOutExpo((tl.contentAt - tl.expandAt) / morphTiming.expand);
      expect(growthAtContent).toBeGreaterThan(0.9);
      expect(tl.settledAt - tl.cardAt).toBeGreaterThanOrEqual(0.33);
      expect(tl.settledAt - tl.cardAt).toBeLessThanOrEqual(0.4);
      expect(t.contentOpacity.delay).toBe(tl.contentAt);
      expect(t.contentBlur.delay).toBe(tl.contentAt);
      expect(t.content.delay).toBe(tl.contentAt);
    }
    expect(openTimeline("delayed").settledAt - openTimeline("delayed").cardAt).toBeCloseTo(0.35, 5);
    expect(morphContent.enter.blur).toBeGreaterThan(0);
    expect(morphContent.enter.opacity).toBe(0);
  });

  it("la etiqueta viaja con la tarjeta y se funde con el contenido cuando este aparece", () => {
    for (const mode of ["delayed", "lift"] as const) {
      const t = openTransitions(mode);
      expect(t.labelOpacity.delay).toBe(t.contentOpacity.delay);
      expect(t.labelOpacity.duration).toBeLessThanOrEqual(t.contentOpacity.duration);
    }
  });
});

describe("fondo", () => {
  it("un diálogo solo oscurece la página apenas un 8 % sobre el scrim del 30 %", () => {
    expect(MORPH_DIM).toBe(0.08);
    expect(layerDim(false)).toBe(0.08);
    expect(MORPH_BACKDROP_OPACITY).toBe(backdropOpacity(false));
    expect(MORPH_BACKDROP_OPACITY * overlayAlpha.scrim).toBeCloseTo(0.08);
    expect(MORPH_BACKDROP_OPACITY).toBeLessThan(1);
  });

  it("apilado sobre otro, completa el 12 % en total: no oscurece el doble", () => {
    const total = 1 - (1 - layerDim(false)) * (1 - layerDim(true));
    expect(total).toBeCloseTo(MORPH_STACK_DIM, 10);
    expect(total).toBeLessThan(2 * MORPH_DIM - 0.01);
    expect(layerDim(true)).toBeGreaterThan(0);
    expect(backdropOpacity(true) * overlayAlpha.scrim).toBeCloseTo(layerDim(true));
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

  it("ocultar con etiqueta compartida: solo se desvanece", () => {
    expect(originHiddenStyle(1, 1, 0.9, 0)).toEqual({ opacity: "0", filter: "none", transform: "scale(1)" });
    expect(originHiddenStyle(0.5, 1, 1, 0)).toEqual({ opacity: "0.5", filter: "none", transform: "scale(1)" });
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
