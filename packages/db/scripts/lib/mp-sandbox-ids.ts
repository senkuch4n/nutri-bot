/**
 * HU-029 · 029a: el script solo imprime ids acortados ("2c9380…"), pero los subcomandos necesitan
 * el id completo. Los ids completos que devuelve MP se guardan en un archivo de estado local, fuera
 * del repo (MP_SUBS_CAPTURE_DIR/state.json), y acá se resuelve un id acortado al completo.
 */
import { isMercadoPagoIdEntry } from "./mp-sandbox-redact";

/** Todos los ids de MP (completos, como string) que aparecen en un valor, a cualquier profundidad. */
export function collectMercadoPagoIds(value: unknown): string[] {
  const out = new Set<string>();
  const walk = (node: unknown) => {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (node === null || typeof node !== "object") return;
    for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
      if (isMercadoPagoIdEntry(key, child)) out.add(String(child));
      else walk(child);
    }
  };
  walk(value);
  return [...out];
}

export function mergeIds(known: string[], found: string[]): string[] {
  return [...new Set([...known, ...found])];
}

/**
 * "2c9380…", "2c9380..." o "2c9380" → el id completo conocido que empieza así. Un id completo o
 * desconocido pasa tal cual. Un prefijo que coincide con dos ids conocidos es un error.
 */
export function resolveIdArg(input: string, known: string[]): string {
  const prefix = input.trim().replace(/(…|\.\.\.)$/, "");
  if (known.includes(prefix)) return prefix;
  const matches = known.filter((id) => id.startsWith(prefix));
  if (matches.length > 1) {
    throw new Error(`El id "${input}" es ambiguo (coincide con ${matches.length} ids conocidos): pasá más caracteres.`);
  }
  return matches[0] ?? prefix;
}
