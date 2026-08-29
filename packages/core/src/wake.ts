/** Normaliza texto para comparar: sin acentos, en minúsculas, sin espacios extra. */
export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Palabra clave que "despierta" al bot. Sin una de estas, el bot no responde
 * (para no reaccionar a los mensajes normales de los contactos de la profesional).
 */
export function isWakeWord(text: string): boolean {
  return /\b(menu|turno|turnos|reserva|reservar|agenda|agendar|cita)\b/.test(normalize(text));
}

/** Palabras para cerrar la conversación y dejar el bot en silencio otra vez. */
export function isExitWord(text: string): boolean {
  return /\b(salir|terminar|cancelar todo|chau|listo gracias|nada mas)\b/.test(normalize(text));
}
