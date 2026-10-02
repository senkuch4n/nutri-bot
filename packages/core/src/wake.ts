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

/** Normalización "de comando": sin acentos, sin signos ni emojis, espacios colapsados. */
function normalizeCommand(text: string): string {
  return normalize(text)
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

const EXIT_COMMANDS = new Set(["salir", "terminar", "cancelar todo", "chau", "listo gracias", "nada mas"]);

/**
 * Comando de salida "estricto": el mensaje ENTERO (normalizado, sin signos ni emojis, espacios
 * colapsados) es una de: "salir", "terminar", "cancelar todo", "chau", "listo gracias", "nada mas".
 * Se usa solo en AWAIT_INQUIRY, para que "¿puedo salir a correr?" no cierre la conversación.
 */
export function isExitCommand(text: string): boolean {
  return EXIT_COMMANDS.has(normalizeCommand(text));
}

/** Ídem para "menu"/"menú": el mensaje entero es "menu". "¿qué menú me conviene?" → false. */
export function isMenuCommand(text: string): boolean {
  return normalizeCommand(text) === "menu";
}
