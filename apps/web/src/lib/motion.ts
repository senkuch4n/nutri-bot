// Presets de movimiento y física de gestos (HU-017a, SDD §7.6 y §9.8). Puro, sin "use client":
// lo importan componentes cliente y los tests.
//
// Springs de Motion con `bounce` + `visualDuration`: `visualDuration` ≈ el *response* de Apple y
// `bounce` ≈ 1 − *damping ratio*. Por defecto críticamente amortiguados (bounce 0); rebote solo
// después de un gesto con impulso (skill apple-design §4).

export const springs = {
  standard: { type: "spring", bounce: 0, visualDuration: 0.35 },
  quick: { type: "spring", bounce: 0, visualDuration: 0.25 },
  modal: { type: "spring", bounce: 0, visualDuration: 0.3 },
  indicator: { type: "spring", bounce: 0, visualDuration: 0.3 },
  fling: { type: "spring", bounce: 0.2, visualDuration: 0.3 },
  toggle: { type: "spring", bounce: 0.15, visualDuration: 0.25 },
} as const;

export const fades = {
  fast: { type: "tween", duration: 0.15, ease: [0.25, 1, 0.5, 1] },
  scrim: { type: "tween", duration: 0.2, ease: [0.25, 1, 0.5, 1] },
} as const;

/**
 * Distancia que recorrería un objeto soltado a `velocityPxPerS` con desaceleración exponencial
 * (la función de *Designing Fluid Interfaces*, §6). `decelerationRate` 0,998 = scroll normal.
 */
export function projectMomentum(velocityPxPerS: number, decelerationRate = 0.998): number {
  return ((velocityPxPerS / 1000) * decelerationRate) / (1 - decelerationRate);
}

/** Resistencia progresiva al pasar un borde (§9). Siempre < `dimension`; conserva el signo. */
export function rubberband(overshoot: number, dimension: number, constant = 0.55): number {
  if (overshoot === 0 || dimension <= 0) return 0;
  const abs = Math.abs(overshoot);
  const value = (abs * dimension * constant) / (dimension + constant * abs);
  return Math.sign(overshoot) * value;
}

/**
 * Desplazamiento visible de un sheet arrastrado. `raw > 0` es hacia cerrar: sigue al dedo 1:1 hasta
 * `size`. `raw < 0` (hacia adentro) resiste con rubber-band.
 */
export function dragOffset(raw: number, size: number): number {
  if (raw >= 0) return Math.min(raw, size);
  return -rubberband(-raw, size);
}

/**
 * Decide si un sheet soltado se cierra o vuelve (§5, §6). Con un flick (|v| ≥ `flickVelocity`)
 * manda el signo de la velocidad; si no, la posición proyectada contra `size × threshold`.
 */
export function resolveDismiss(input: {
  offset: number;
  velocity: number;
  size: number;
  flickVelocity?: number;
  threshold?: number;
}): "dismiss" | "restore" {
  const { offset, velocity, size, flickVelocity = 500, threshold = 0.5 } = input;
  if (Math.abs(velocity) >= flickVelocity) return velocity > 0 ? "dismiss" : "restore";
  return offset + projectMomentum(velocity) >= size * threshold ? "dismiss" : "restore";
}

/**
 * Intención de un gesto después de la histéresis (§10): `"axis"` si el desplazamiento en el eje
 * del sheet supera al cruzado y pasa el umbral, `"cross"` si gana el cruzado (scroll), `null` si
 * todavía no hay suficiente movimiento.
 */
export function gestureIntent(dAxis: number, dCross: number, hysteresis = 10): "axis" | "cross" | null {
  const a = Math.abs(dAxis);
  const c = Math.abs(dCross);
  if (Math.max(a, c) < hysteresis) return null;
  return a > c ? "axis" : "cross";
}

/** Clic izquierdo sin modificadores: el único que navega en la misma pestaña. */
export function isPlainLeftClick(e: {
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  defaultPrevented: boolean;
}): boolean {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && !e.defaultPrevented;
}
