import { normalize } from "./wake";

/** normalize() de wake.ts + puntuación → espacio + colapsar espacios. "Limón, crudo" → "limon crudo". */
export function foodSearchText(name: string): string {
  return normalize(name)
    .replace(/[^a-z0-9%]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function queryWords(query: string): string[] {
  const text = foodSearchText(query);
  return text === "" ? [] : text.split(" ");
}

/** Todas las palabras de la consulta están en el texto (sin tildes ni mayúsculas). Consulta vacía → true. */
export function matchesFoodQuery(searchText: string, query: string): boolean {
  return queryWords(query).every((w) => searchText.includes(w));
}

export interface SearchableFood {
  name: string;
  searchText: string;
}

const collator = new Intl.Collator("es", { sensitivity: "base" });

/**
 * Filtra con matchesFoodQuery y ordena: 0) empieza con la consulta; 1) alguna palabra empieza con
 * la 1ª palabra de la consulta; 2) el resto. Empate: nombre más corto, después alfabético (es).
 */
export function searchFoods<T extends SearchableFood>(
  foods: readonly T[],
  query: string,
  limit?: number,
): T[] {
  const words = queryWords(query);
  const q = words.join(" ");
  const first = words[0] ?? "";
  const rank = (f: T) => {
    if (q === "") return 0;
    if (f.searchText.startsWith(q)) return 0;
    if (f.searchText.split(" ").some((w) => w.startsWith(first))) return 1;
    return 2;
  };
  const ranked = foods
    .filter((f) => words.every((w) => f.searchText.includes(w)))
    .map((f) => ({ f, r: rank(f) }))
    .sort(
      (a, b) =>
        a.r - b.r || a.f.name.length - b.f.name.length || collator.compare(a.f.name, b.f.name),
    )
    .map((x) => x.f);
  return limit !== undefined ? ranked.slice(0, Math.max(0, limit)) : ranked;
}

/** Para comparar nombres duplicados (D12): foodSearchText sin espacios. */
export function foodNameCompareKey(name: string): string {
  return foodSearchText(name).replace(/ /g, "");
}
