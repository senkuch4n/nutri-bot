/**
 * Pasos de historial dentro del modal de la ficha (ficha → plan → ficha…). La ✕ vuelve esa cantidad de
 * pasos para dejar la lista de Pacientes, esté donde esté. Un link o un redirect de una server action
 * agregan una entrada ("push"); el Atrás del navegador saca una ("pop"), nunca por debajo de la ficha.
 */
export function nextModalHistoryDepth(depth: number, kind: "push" | "pop"): number {
  return kind === "push" ? depth + 1 : Math.max(1, depth - 1);
}

/** Desplazamiento de la transición al navegar dentro del modal (px). */
const NAV_SHIFT = 28;

/**
 * Cuadros (Web Animations API) del contenido nuevo al navegar dentro del modal, como una pila de iOS:
 * avanzar entra desde la derecha, volver desde la izquierda; los dos llegan nítidos y en su lugar.
 */
export function modalNavKeyframes(kind: "push" | "pop"): Keyframe[] {
  const from = kind === "push" ? NAV_SHIFT : -NAV_SHIFT;
  return [
    { opacity: 0, transform: `translateX(${from}px)`, filter: "blur(6px)" },
    { opacity: 1, transform: "none", filter: "blur(0px)" },
  ];
}
