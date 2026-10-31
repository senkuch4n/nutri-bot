// Geometría y tiempos del MorphDialog (feature morph-dialog): un diálogo centrado que crece desde el
// elemento que lo abrió (FLIP) y vuelve a él al cerrar. Puro, sin "use client": lo importan el
// componente y los tests.
//
// El shell se transforma con origen en su esquina superior izquierda (`originX/Y = 0`): con `x`, `y`,
// `sx`, `sy` queda exactamente encima del origen. Adentro, un envoltorio con la escala inversa evita
// que el texto se estire, y el radio se divide por la escala para verse siempre igual.
//
// Tiempos medidos cuadro a cuadro en el video de referencia (60 fps). Dos aperturas:
// - Desde la página ("diferida"): el origen se desvanece en 100 ms y la tarjeta aparece exactamente
//   sobre él a los ~180 ms del clic; ahí crece hasta el diálogo.
// - Desde otro diálogo ("levantada"): en 50 ms aparece alrededor del origen una tarjeta blanca un poco
//   más grande que él (8 × 6 px por lado) y con sombra; después crece.
// - El crecimiento es una curva expo-out de 420 ms (sin rebote): ~81 % a los 100 ms, ~94 % a los
//   170 ms; la cola es casi invisible (como un resorte sin rebote).
// - El texto del origen (etiqueta compartida, opcional) viaja con la esquina superior izquierda de la
//   tarjeta sin estirarse y se funde con el contenido cuando este aparece.
// - El contenido aparece desenfocado y transparente cuando la tarjeta ya casi llegó (~150 ms de
//   crecimiento) y queda nítido ~350 ms después de que apareció la tarjeta.
// - El fondo oscurece la página apenas un 8 % (medido: blanco 249 → 228). Un diálogo encima de otro
//   suma solo lo justo para que la página llegue al 12 %: el de abajo queda apenas gris, sin
//   oscurecerse el doble.

import { overlayAlpha } from "./design-tokens";

export type Rect = { left: number; top: number; width: number; height: number };
export type Flip = { x: number; y: number; sx: number; sy: number };
export type Point = { x: number; y: number };

/** Radio visible del shell, en px (esquinas grandes, como en la referencia). */
export const MORPH_RADIUS = 24;

/** Escala mínima con la que se divide (evita infinitos con un origen de 0 px). */
const MIN_SCALE = 0.01;

/** Cuánto oscurece la página el fondo de un diálogo (negro al 8 %). */
export const MORPH_DIM = 0.08;
/** Cuánto oscurecida queda la página, en total, con un diálogo encima de otro. */
export const MORPH_STACK_DIM = 0.12;

/**
 * Oscurecimiento propio de la capa de fondo: `MORPH_DIM` si es el primer diálogo; apilado sobre otro,
 * lo que falta para que la página llegue a `MORPH_STACK_DIM` (el de abajo ya puso su 8 %).
 */
export function layerDim(stacked: boolean): number {
  return stacked ? 1 - (1 - MORPH_STACK_DIM) / (1 - MORPH_DIM) : MORPH_DIM;
}

/** Opacidad del fondo (`bg-scrim`, 30 % de negro) que da `layerDim`. */
export function backdropOpacity(stacked: boolean): number {
  return layerDim(stacked) / overlayAlpha.scrim;
}

/** Opacidad del fondo de un diálogo solo. */
export const MORPH_BACKDROP_OPACITY = backdropOpacity(false);

/** Cuánto más grande que el origen es la tarjeta al "levantarse", por lado. */
export const LIFT_PAD = { x: 8, y: 6 } as const;

/** Desenfoque del origen al ocultarse, en px. */
export const ORIGIN_BLUR = 8;

/** Tiempos de la apertura, en segundos. */
export const morphTiming = {
  /** Diferida: el origen se desvanece desde el clic. */
  originOut: 0.1,
  /** Diferida: la tarjeta aparece sobre el origen a este tiempo del clic... */
  appearDelay: 0.18,
  /** ...con un fundido así de corto. */
  appear: 0.05,
  /** Levantada: la tarjeta pasa del origen al rectángulo levantado y aparece. */
  lift: 0.05,
  /** La tarjeta crece hasta el diálogo (expo-out). */
  expand: 0.42,
  backdrop: 0.22,
  /** Sin origen: el shell aparece con un fundido. */
  fadeIn: 0.15,
  /** El contenido arranca tras este tanto de crecimiento (la tarjeta ya está casi en su tamaño). */
  contentDelay: 0.15,
  contentOpacity: 0.16,
  contentBlur: 0.2,
  /** La etiqueta compartida se funde con el contenido: arranca con él y dura esto. */
  labelFade: 0.12,
  /** Cascada (ficha del paciente): el contenido aparece de arriba hacia abajo en este tiempo. */
  cascade: 0.34,
  /** Levantada: la tarjeta aparece con este fundido (tapa al origen, que se va debajo). */
  liftAppear: 0.05,
} as const;

export type MorphTiming = { [K in keyof typeof morphTiming]: number };

/**
 * Tempo vivo (ficha del paciente, `brisk`): la tarjeta aparece sin fundido (la fila "se vuelve" tarjeta)
 * y el contenido entra antes; todo asienta en ~0,4 s, como el video de /pacientes. El crecimiento sigue
 * la curva medida en ese video (expo-out de 460 ms: 37 % a los 34 ms, 61 % a los 67 ms, 86 % a los
 * 117 ms). Con 340 ms el primer cuadro ya movía casi un tercio y se sentía a los saltos.
 */
export const morphTimingBrisk: MorphTiming = {
  ...morphTiming,
  lift: 0.04,
  liftAppear: 0,
  expand: 0.46,
  contentDelay: 0.08,
  contentOpacity: 0.12,
  contentBlur: 0.16,
  cascade: 0.24,
};

/**
 * Cómo abre: `delayed` desde la página, `lift` desde un elemento de otro diálogo, `direct` sin origen
 * que medir o reabierto a mitad del cierre (sigue desde donde está, sin esperas).
 */
export type MorphOpenMode = "delayed" | "lift" | "direct";

export function openMode(opts: { morph: boolean; resumed: boolean; nested: boolean; lift?: boolean }): MorphOpenMode {
  if (!opts.morph || opts.resumed) return "direct";
  return opts.nested || opts.lift ? "lift" : "delayed";
}

/** Momentos de la apertura, en segundos desde el clic. */
export function openTimeline(
  mode: MorphOpenMode,
  timing: MorphTiming = morphTiming,
): { cardAt: number; expandAt: number; contentAt: number; settledAt: number } {
  const cardAt = mode === "delayed" ? timing.appearDelay : 0;
  const expandAt = mode === "lift" ? cardAt + timing.lift : cardAt;
  const contentAt = expandAt + timing.contentDelay;
  const settledAt = contentAt + Math.max(timing.contentOpacity, timing.contentBlur);
  return { cardAt, expandAt, contentAt, settledAt };
}

/**
 * Expo-out normalizado (exacto en 0 y en 1): arranca rápido y frena largo, como la tarjeta del video.
 * Con 420 ms: 0,56 a los 50 ms, 0,81 a los 100 ms, 0,94 a los 170 ms.
 */
export function easeOutExpo(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return (1 - 2 ** (-10 * t)) / (1 - 2 ** -10);
}

/** Curvas cúbicas equivalentes a las de GSAP. */
export const morphEase = {
  power2Out: [0.25, 0.46, 0.45, 0.94],
  power3In: [0.55, 0.055, 0.675, 0.19],
  power2InOut: [0.455, 0.03, 0.515, 0.955],
} as const;

type Ease =
  | "linear"
  | "easeIn"
  | "easeOut"
  | "easeInOut"
  | readonly [number, number, number, number]
  | ((t: number) => number);
/** Transición de Motion por tiempo (subconjunto de su tipo `Transition`). */
export type MorphTween = { type: "tween"; duration: number; delay?: number; ease?: Ease | Ease[]; times?: number[] };
export type MorphSpring = { type: "spring"; duration: number; bounce: number; delay?: number };

/** Fracción del tiempo total del shell que ocupa el levantado. */
export const LIFT_FRACTION = morphTiming.lift / (morphTiming.lift + morphTiming.expand);

/** Transiciones de Motion de la apertura según el modo (ver `openTimeline`). */
export function openTransitions(mode: MorphOpenMode, opts: { cascade?: boolean; brisk?: boolean } = {}): {
  backdrop: MorphTween;
  shellOpacity: MorphTween;
  /** Del shell y del desplazamiento de la etiqueta: con `lift`, fotogramas origen → levantada → diálogo. */
  shell: MorphTween;
  contentOpacity: MorphTween;
  contentBlur: MorphTween;
  content: MorphSpring;
  originOut: MorphTween;
  labelOpacity: MorphTween;
  /** Máscara de la cascada (de 0 a 1). */
  cascade: MorphTween;
} {
  const T = opts.brisk ? morphTimingBrisk : morphTiming;
  const tl = openTimeline(mode, T);
  const lift = mode === "lift";
  const liftFraction = T.lift / (T.lift + T.expand);
  return {
    backdrop: { type: "tween", duration: T.backdrop, delay: tl.cardAt, ease: "easeOut" },
    shellOpacity:
      mode === "direct"
        ? { type: "tween", duration: T.fadeIn, ease: morphEase.power2Out }
        : { type: "tween", duration: lift ? T.liftAppear : T.appear, delay: tl.cardAt, ease: "linear" },
    shell: lift
      ? { type: "tween", duration: T.lift + T.expand, times: [0, liftFraction, 1], ease: [morphEase.power2Out, easeOutExpo] }
      : { type: "tween", duration: T.expand, delay: tl.expandAt, ease: easeOutExpo },
    contentOpacity: { type: "tween", duration: T.contentOpacity, ease: morphEase.power2Out, delay: tl.contentAt },
    // Con cascada, el desenfoque acompaña a la máscara: lo de abajo llega nítido cuando aparece.
    contentBlur: { type: "tween", duration: opts.cascade ? T.cascade : T.contentBlur, ease: morphEase.power2Out, delay: tl.contentAt },
    content: { type: "spring", duration: 0.3, bounce: 0, delay: tl.contentAt },
    // Levantada: el origen queda tapado por la tarjeta, se va en lo que dura el levantado.
    originOut: lift ? { type: "tween", duration: T.lift, ease: "linear" } : { type: "tween", duration: T.originOut, ease: "easeOut" },
    labelOpacity: { type: "tween", duration: T.labelFade, delay: tl.contentAt, ease: "easeInOut" },
    cascade: { type: "tween", duration: T.cascade, delay: tl.contentAt, ease: morphEase.power2Out },
  };
}

/** Transiciones de Motion del cierre y del movimiento reducido. */
export const morphTransitions = {
  close: {
    content: { type: "tween", duration: 0.12, ease: morphEase.power2Out },
    /** Opacidad del contenido (acá, junto con el resto del contenido). */
    contentFade: { type: "tween", duration: 0.12, ease: morphEase.power2Out },
    shell: { type: "tween", duration: 0.36, delay: 0.02, times: [0, 0.65, 1], ease: [morphEase.power3In, morphEase.power2Out] },
    shellOpacity: { type: "tween", duration: 0.12, delay: 0.24 },
    backdrop: { type: "tween", duration: 0.2, ease: morphEase.power2Out },
    originIn: { type: "tween", duration: 0.16, delay: 0.24, ease: morphEase.power2Out },
    /** Si se cierra mientras la etiqueta todavía se ve. */
    label: { type: "tween", duration: 0.08 },
  },
  /**
   * Cierre de una tarjeta levantada (ficha del paciente, medido en su video): la tarjeta llega a la
   * fila en ~170 ms (arranque rápido, sin la espera del power3In), se queda un instante blanca encima
   * y se desvanece mientras la fila reaparece; el fondo aclara recién cuando ya llegó. El cuerpo se
   * desenfoca enseguida pero se sigue viendo mientras la tarjeta se achica: se termina de ir al llegar.
   */
  closeLift: {
    content: { type: "tween", duration: 0.1, ease: morphEase.power2Out },
    contentFade: { type: "tween", duration: 0.16, ease: "easeIn" },
    shell: { type: "tween", duration: 0.28, delay: 0, times: [0, 0.62, 1], ease: [morphEase.power2InOut, morphEase.power2Out] },
    shellOpacity: { type: "tween", duration: 0.12, delay: 0.22 },
    backdrop: { type: "tween", duration: 0.18, delay: 0.14, ease: morphEase.power2Out },
    originIn: { type: "tween", duration: 0.12, delay: 0.2, ease: morphEase.power2Out },
    label: { type: "tween", duration: 0.08 },
  },
  /** Cierre sin origen (se fue del DOM): solo fundido. */
  fadeOut: {
    shellOpacity: { type: "tween", duration: 0.16 },
    backdrop: { type: "tween", duration: 0.2, ease: morphEase.power2Out },
  },
  /** Cascada tardía: el contenido real llegó después de abrir y barre desde abajo del encabezado. */
  lateReveal: { type: "tween", duration: 0.3, ease: morphEase.power2Out },
  /** Movimiento reducido: shell y fondo con un fundido de 150 ms, nada más. */
  reduced: { type: "tween", duration: 0.15, ease: morphEase.power2Out },
} as const;

/** Estado inicial y de salida del contenido (opacidad, desplazamiento, escala, desenfoque). En la
 *  referencia el contenido casi no se mueve: aparece en su lugar y se enfoca. */
export const morphContent = {
  enter: { opacity: 0, y: 8, scale: 0.97, blur: 10 },
  exit: { opacity: 0, y: -4, scale: 0.985, blur: 5 },
  /**
   * Con cascada (ficha del paciente, un cuerpo grande): sin escala y entra con poco desenfoque. Escalar
   * o desenfocar mucho toda la ficha obliga a repintarla en cada cuadro y la apertura se traba. Al
   * cerrar sí va muy desenfocada (como en el video): dura ~170 ms y el encabezado viaja nítido encima.
   */
  enterCascade: { opacity: 0, y: 6, scale: 1, blur: 4 },
  exitCascade: { opacity: 0, y: -2, scale: 1, blur: 8 },
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

/** Rectángulo de la tarjeta "levantada": el origen agrandado `LIFT_PAD` por lado. */
export function liftRect(src: Rect): Rect {
  return {
    left: src.left - LIFT_PAD.x,
    top: src.top - LIFT_PAD.y,
    width: src.width + LIFT_PAD.x * 2,
    height: src.height + LIFT_PAD.y * 2,
  };
}

/**
 * Fotogramas de la apertura: el shell arranca exactamente sobre el origen, pasa por la tarjeta
 * levantada y termina en su lugar. Cada valor es `[origen, levantada, destino]`.
 */
export function liftKeyframes(src: Rect, target: Rect): Record<keyof Flip, [number, number, number]> {
  const from = flipFrom(src, target);
  const lifted = flipFrom(liftRect(src), target);
  return {
    x: [from.x, lifted.x, 0],
    y: [from.y, lifted.y, 0],
    sx: [from.sx, lifted.sx, 1],
    sy: [from.sy, lifted.sy, 1],
  };
}

/**
 * Radio visible del shell para un tamaño visible dado: `MORPH_RADIUS`, salvo que la tarjeta sea tan
 * baja o angosta que el radio pase de la mitad (ahí queda una píldora, como el chip del que sale).
 */
export function visibleRadius(width: number, height: number): number {
  return Math.max(0, Math.min(MORPH_RADIUS, Math.min(width, height) / 2));
}

/**
 * Etiqueta compartida: posición del texto relativa a la esquina superior izquierda del shell, en px
 * sin escalar. Se queda fija respecto de la tarjeta mientras se levanta (sube y se corre con ella) y
 * durante el crecimiento va hacia `end` (el título del diálogo). Cada eje es `[origen, levantada, destino]`.
 */
export function labelOffsetKeyframes(text: Rect, src: Rect, end: Point): Record<"x" | "y", [number, number, number]> {
  const x = text.left - src.left;
  const y = text.top - src.top;
  return { x: [x, x, end.x], y: [y, y, end.y] };
}

/** Posición en pantalla de la etiqueta: esquina del shell (`anchor` + traslación) más su desplazamiento. */
export function labelPosition(anchor: Point, shell: Point, offset: Point): Point {
  return { x: anchor.x + shell.x + offset.x, y: anchor.y + shell.y + offset.y };
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

/**
 * Origen al abrir (`p` 0 → 1): se desvanece, se desenfoca `blur` px y se achica a `scale`. Con la
 * etiqueta compartida va sin desenfoque ni escala (el texto que viaja tapa exactamente al del origen).
 */
export function originHiddenStyle(p: number, scale: number, baseOpacity: number, blur: number = ORIGIN_BLUR): OriginStyle {
  return {
    opacity: String(lerp(baseOpacity, 0, p)),
    filter: blurFilter(lerp(0, blur, p)),
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

/** Transiciones de un cierre con origen (`morphTransitions.close` o `closeLift`). */
type CloseTransitions = {
  shell: { delay: number; duration: number };
  originIn: { delay: number; duration: number };
};

/** Duración total de un cierre con origen (ms): lo que tarda la tarjeta en volver y el origen en
 *  reaparecer. Para quien tiene que esperar la animación antes de desmontar (p. ej. un `router.back()`). */
export function morphCloseMs(c: CloseTransitions): number {
  return Math.ceil(1000 * Math.max(c.shell.delay + c.shell.duration, c.originIn.delay + c.originIn.duration));
}

export const MORPH_CLOSE_MS = morphCloseMs(morphTransitions.close);
/** Cierre de un MorphDialog con `lift`. */
export const MORPH_LIFT_CLOSE_MS = morphCloseMs(morphTransitions.closeLift);

/** Ancho del borde suave de la cascada, en % del alto del cuerpo. */
export const CASCADE_BAND = 40;

/**
 * Máscara de la cascada (`p` 0 → 1): un borde suave baja de arriba hacia abajo y deja ver el contenido
 * en orden (botones, pestañas, secciones). En 1 ya no hay máscara (no deja una capa de composición).
 */
export function cascadeMask(p: number): string {
  if (p >= 1) return "none";
  const edge = lerp(0, 100 + CASCADE_BAND, Math.max(0, p));
  return `linear-gradient(to bottom, #000 ${edge - CASCADE_BAND}%, transparent ${edge}%)`;
}

/**
 * Desde dónde arranca la cascada tardía (contenido que llegó con el diálogo ya abierto, p. ej. la ficha
 * después de su `loading`): el borde queda justo debajo de `floor` (px desde arriba del cuerpo, donde
 * termina el encabezado compartido), así lo de arriba sigue nítido y el resto baja. `height`: alto visible.
 */
export function cascadeStart(floor: number, height: number): number {
  if (height <= 0) return 1;
  const pct = Math.min(100, Math.max(0, (floor / height) * 100));
  return (pct + CASCADE_BAND) / (100 + CASCADE_BAND);
}

/** Posición (relativa a la esquina del shell, sin escalar) y escala uniforme de un elemento compartido. */
export type SharedPose = { x: number; y: number; scale: number };

/**
 * Elemento compartido (iniciales, nombre, etapa): dónde está en el origen, relativo a la esquina del
 * origen (donde arranca o termina la esquina del shell), y su escala respecto del destino (`end`, la
 * caja del elemento en el diálogo relativa a la esquina del shell). Se escala por el alto: es el mismo
 * texto, más grande o más chico.
 */
export function sharedStart(piece: Rect, src: Rect, end: Rect): SharedPose {
  return {
    x: piece.left - src.left,
    y: piece.top - src.top,
    scale: end.height > 0 ? piece.height / end.height : 1,
  };
}

/**
 * Estilo inline de la copia de un elemento compartido: en la esquina de la capa, con la caja del
 * destino (`end`). Siempre en una línea y sin recortar: `offsetWidth` redondea y, con el ancho justo,
 * un título con `text-balance` partía el nombre ("Juan" / "Pérez") y el alto fijo escondía la segunda línea.
 */
export function sharedCloneStyle(end: Rect): Record<string, string> {
  return {
    position: "absolute",
    left: "0",
    top: "0",
    margin: "0",
    width: `${end.width}px`,
    height: `${end.height}px`,
    whiteSpace: "nowrap",
    overflow: "visible",
    transformOrigin: "0 0",
    willChange: "transform",
  };
}

/** Fotogramas de apertura de un elemento compartido: quieto en pantalla mientras la tarjeta se levanta
 *  (compensa el `LIFT_PAD` que se corre la esquina), después va a su lugar en el diálogo. Cada valor es
 *  `[origen, levantada, destino]`, relativo a la esquina del shell. */
export function sharedOpenKeyframes(piece: Rect, src: Rect, end: Rect): Record<keyof SharedPose, [number, number, number]> {
  const s = sharedStart(piece, src, end);
  return {
    x: [s.x, s.x + LIFT_PAD.x, end.left],
    y: [s.y, s.y + LIFT_PAD.y, end.top],
    scale: [s.scale, s.scale, 1],
  };
}
