import { describe, expect, it } from "vitest";
import {
  dragOffset,
  gestureIntent,
  isPlainLeftClick,
  projectMomentum,
  resolveDismiss,
  rubberband,
  springs,
} from "./motion";

describe("projectMomentum", () => {
  it("proyecta con d = 0,998", () => {
    expect(projectMomentum(0)).toBe(0);
    expect(projectMomentum(1000)).toBeCloseTo(499, 0);
    expect(projectMomentum(200)).toBeCloseTo(99.8, 1);
  });
  it("conserva el signo", () => {
    expect(projectMomentum(-1000)).toBeCloseTo(-499, 0);
  });
});

describe("rubberband", () => {
  it("vale 0 sin desborde y ≈ 106,45 con desborde igual a la dimensión", () => {
    expect(rubberband(0, 300)).toBe(0);
    expect(rubberband(300, 300)).toBeCloseTo(106.45, 1);
  });
  it("es monótona creciente y asintótica a la dimensión", () => {
    let prev = 0;
    for (const x of [1, 10, 50, 100, 500, 1000, 10000]) {
      const v = rubberband(x, 300);
      expect(v).toBeGreaterThan(prev);
      expect(v).toBeLessThan(300);
      prev = v;
    }
    expect(rubberband(1e6, 300)).toBeLessThan(300);
  });
});

describe("dragOffset", () => {
  it("sigue al dedo hacia cerrar hasta el tamaño", () => {
    expect(dragOffset(50, 300)).toBe(50);
    expect(dragOffset(400, 300)).toBe(300);
  });
  it("resiste hacia adentro", () => {
    const v = dragOffset(-50, 300);
    expect(v).toBeCloseTo(-25.19, 1);
    expect(v).toBeGreaterThan(-50);
    expect(v).toBeLessThan(0);
  });
});

describe("resolveDismiss (size 300)", () => {
  const size = 300;
  it("con flick manda el signo de la velocidad", () => {
    expect(resolveDismiss({ offset: 10, velocity: 900, size })).toBe("dismiss");
    expect(resolveDismiss({ offset: 250, velocity: -900, size })).toBe("restore");
  });
  it("sin flick decide la posición proyectada", () => {
    expect(resolveDismiss({ offset: 30, velocity: 100, size })).toBe("restore");
    expect(resolveDismiss({ offset: 100, velocity: 200, size })).toBe("dismiss");
    expect(resolveDismiss({ offset: 120, velocity: 0, size })).toBe("restore");
    expect(resolveDismiss({ offset: 200, velocity: 0, size })).toBe("dismiss");
  });
});

describe("gestureIntent", () => {
  it("espera la histéresis y bloquea el eje", () => {
    expect(gestureIntent(5, 3)).toBeNull();
    expect(gestureIntent(12, 3)).toBe("axis");
    expect(gestureIntent(3, 12)).toBe("cross");
    expect(gestureIntent(-12, 3)).toBe("axis");
  });
});

describe("isPlainLeftClick", () => {
  const plain = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false };
  it("verdadero en el clic plano", () => {
    expect(isPlainLeftClick(plain)).toBe(true);
  });
  it.each([
    ["metaKey", { metaKey: true }],
    ["ctrlKey", { ctrlKey: true }],
    ["shiftKey", { shiftKey: true }],
    ["altKey", { altKey: true }],
    ["botón medio", { button: 1 }],
    ["defaultPrevented", { defaultPrevented: true }],
  ])("falso con %s", (_, patch) => {
    expect(isPlainLeftClick({ ...plain, ...patch })).toBe(false);
  });
});

describe("springs", () => {
  it("son springs críticamente amortiguados salvo fling y toggle", () => {
    for (const [name, s] of Object.entries(springs)) {
      expect(s.type).toBe("spring");
      const expected = name === "fling" ? 0.2 : name === "toggle" ? 0.15 : 0;
      expect(s.bounce).toBe(expected);
    }
  });
});
