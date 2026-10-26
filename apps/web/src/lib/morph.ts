// Geometría y tiempos del MorphDialog (feature morph-dialog): un diálogo centrado que crece desde el
// elemento que lo abrió (FLIP) y vuelve a él al cerrar. Puro, sin "use client": lo importan el
// componente y los tests.
//
// El shell se transforma con origen en su esquina superior izquierda (`originX/Y = 0`): con `x`, `y`,
// `sx`, `sy` queda exactamente encima del origen. Adentro, un envoltorio con la escala inversa evita
// que el texto se estire, y el radio se divide por la escala para verse siempre de 16 px.

export type Rect = { left: number; top: number; width: number; height: number };
export type Flip = { x: number; y: number; sx: number; sy: number };

/** Radio visible del shell, en px. */
export const MORPH_RADIUS = 16;

/** Escala mínima con la que se divide (evita infinitos con un origen de 0 px). */
const MIN_SCALE = 0.01;

/** Curvas cúbicas equivalentes a las de GSAP. */
export const morphEase = {
  power2Out: [0.25, 0.46, 0.45, 0.94],
  power3In: [0.55, 0.055, 0.675, 0.19],
} as const;

/** Transiciones de Motion de la apertura, el cierre y el movimiento reducido. */
export const morphTransitions = {
  open: {
    backdrop: { type: "tween", duration: 0.26, ease: "easeOut" },
    shellOpacity: { type: "tween", duration: 0.11 },
    shell: { type: "spring", duration: 0.38, bounce: 0.16, delay: 0.01 },
    contentOpacity: { type: "tween", duration: 0.2, ease: morphEase.power2Out, delay: 0.13 },
    contentBlur: { type: "tween", duration: 0.25, ease: morphEase.power2Out, delay: 0.13 },
    content: { type: "spring", duration: 0.34, bounce: 0.16, delay: 0.13 },
    originOut: { type: "tween", duration: 0.15, ease: "easeOut" },
  },
  close: {
    content: { type: "tween", duration: 0.16, ease: morphEase.power2Out },
    shell: { type: "tween", duration: 0.4, delay: 0.02, times: [0, 0.65, 1], ease: [morphEase.power3In, morphEase.power2Out] },
    shellOpacity: { type: "tween", duration: 0.16, delay: 0.26 },
    backdrop: { type: "tween", duration: 0.22, ease: morphEase.power2Out },
    originIn: { type: "tween", duration: 0.18, delay: 0.26, ease: morphEase.power2Out },
  },
  /** Cierre sin origen (se fue del DOM): solo fundido. */
  fadeOut: {
    shellOpacity: { type: "tween", duration: 0.16 },
    backdrop: { type: "tween", duration: 0.22, ease: morphEase.power2Out },
  },
  /** Movimiento reducido: shell y fondo con un fundido de 150 ms, nada más. */
  reduced: { type: "tween", duration: 0.15, ease: morphEase.power2Out },
} as const;

/** Estado inicial y de salida del contenido (opacidad, desplazamiento, escala, desenfoque). */
export const morphContent = {
  enter: { opacity: 0, y: 24, scale: 0.92, blur: 12 },
  exit: { opacity: 0, y: -4, scale: 0.985, blur: 5 },
} as const;

/** Interpolación lineal (exacta en los extremos). */
export function lerp(a: number, b: number, t: number): number {
  return a * (1 - t) + b * t;
}

/** ¿Se puede animar desde el origen? Hace falta que los dos tengan tamaño. */
export function canMorph(src: Rect | null, target: Rect): src is Rect {
  return Boolean(src && src.width > 0 && src.height > 0 && target.width > 0 && target.height > 0);
}

/** Transformación que deja el shell (`target`) encima del origen (`src`). */
export function flipFrom(src: Rect, target: Rect): Flip {
  return {
    x: src.left - target.left,
    y: src.top - target.top,
    sx: src.width / target.width,
    sy: src.height / target.height,
  };
}

/**
 * Fotogramas del regreso: el shell pasa por una versión un poco más chica y centrada del origen
 * (`settle`, 6 × 4 px o el 96 %) y termina sobre él. Cada valor es `[intermedio, destino]`.
 */
export function settleKeyframes(src: Rect, target: Rect): Record<keyof Flip, [number, number]> {
  const settleW = Math.max(src.width - 6, src.width * 0.96);
  const settleH = Math.max(src.height - 4, src.height * 0.96);
  const dest = flipFrom(src, target);
  return {
    x: [src.left + (src.width - settleW) / 2 - target.left, dest.x],
    y: [src.top + 1 - target.top, dest.y],
    sx: [settleW / target.width, dest.sx],
    sy: [settleH / target.height, dest.sy],
  };
}

/** Cuánto se achica el origen al ocultarse: poco si es ancho (una fila), más si es chico (un botón). */
export function originScale(width: number): number {
  return width >= 240 ? 0.96 : 0.75;
}

/** Escala inversa del envoltorio interno (contra-escala del texto). */
export function inverseScale(scale: number): number {
  return 1 / Math.max(scale, MIN_SCALE);
}

/** `filter` de un desenfoque; `none` cuando ya no se nota (no deja una capa de composición). */
export function blurFilter(px: number): string {
  return px < 0.01 ? "none" : `blur(${px}px)`;
}

export type OriginStyle = { opacity: string; filter: string; transform: string };

/** Origen al abrir (`p` 0 → 1): se desvanece, se desenfoca 8 px y se achica a `scale`. */
export function originHiddenStyle(p: number, scale: number, baseOpacity: number): OriginStyle {
  return {
    opacity: String(lerp(baseOpacity, 0, p)),
    filter: blurFilter(lerp(0, 8, p)),
    transform: `scale(${lerp(1, scale, p)})`,
  };
}

/** Origen al cerrar (`p` 0 → 1): reaparece desde blur 3 px, escala 0,985 y 2 px abajo. */
export function originRevealStyle(p: number, baseOpacity: number): OriginStyle {
  return {
    opacity: String(lerp(0, baseOpacity, p)),
    filter: blurFilter(lerp(3, 0, p)),
    transform: `translateY(${lerp(2, 0, p)}px) scale(${lerp(0.985, 1, p)})`,
  };
}

/** Lo que se toca del `style` del origen (subconjunto de `CSSStyleDeclaration`). */
export type InlineStyle = Pick<CSSStyleDeclaration, "getPropertyValue" | "getPropertyPriority" | "setProperty" | "removeProperty">;

export const ORIGIN_PROPERTIES = ["opacity", "filter", "transform", "will-change"] as const;
export type OriginProperty = (typeof ORIGIN_PROPERTIES)[number];
export type SavedInlineStyle = Record<OriginProperty, { value: string; priority: string }>;

/** Copia exacta (valor y `!important`) de los estilos inline que la animación va a pisar. */
export function saveInlineStyle(style: InlineStyle): SavedInlineStyle {
  const saved = {} as SavedInlineStyle;
  for (const prop of ORIGIN_PROPERTIES) {
    saved[prop] = { value: style.getPropertyValue(prop), priority: style.getPropertyPriority(prop) };
  }
  return saved;
}

/** Deja los estilos inline como estaban (los que no había, se quitan). */
export function restoreInlineStyle(
  style: InlineStyle,
  saved: SavedInlineStyle,
  props: readonly OriginProperty[] = ORIGIN_PROPERTIES,
): void {
  for (const prop of props) {
    const { value, priority } = saved[prop];
    if (value) style.setProperty(prop, value, priority);
    else style.removeProperty(prop);
  }
}
