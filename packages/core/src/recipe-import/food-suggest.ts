import { foodSearchText } from "../food-search";

// HU-018a-2 (D5, 12-D12): sugerencia de alimento para un ingrediente de la carga asistida. Se calcula
// en el cliente al abrir la revisión y NUNCA se guarda sola: la tiene que aceptar una persona.

export interface SuggestableFood {
  id: string;
  name: string;
  searchText: string;
  source: "SARA2" | "PROPIO";
  active: boolean;
}

/** Palabras que no ayudan a encontrar el alimento (preparación, tamaño, conectores). */
const STOP_WORDS = new Set([
  "de", "del", "la", "las", "el", "los", "una", "un", "uno", "unos", "unas", "y", "o", "e", "con", "sin", "para", "al", "a",
  "en", "por", "su", "sus", "tipo",
  "picado", "picada", "picados", "picadas", "rallado", "rallada", "rallados", "ralladas", "cortado", "cortada",
  "cortados", "cortadas", "trozado", "trozada", "pelado", "pelada", "pelados", "peladas", "pisado", "pisada",
  "chico", "chica", "chicos", "chicas", "grande", "grandes", "mediano", "mediana", "medianos", "medianas",
  "fresco", "fresca", "frescos", "frescas", "opcional", "optativo", "optativa", "aprox", "pure", "dientes", "diente",
  "unidad", "unidades", "hojas", "hoja", "rodajas", "rodaja", "cubitos", "finito", "finita", "bien", "bastante",
]);

/**
 * Sinónimos (claves y valores en foodSearchText). Un valor de una palabra reemplaza esa palabra en
 * cualquier consulta; uno de varias palabras solo se usa si la consulta entera es la clave ("huevo").
 * Lista chica y versionada, sin datos de terceros.
 */
export const RECIPE_FOOD_SYNONYMS: Readonly<Record<string, string>> = {
  calabaza: "zapallo",
  calabazas: "zapallo",
  morron: "pimiento",
  morrones: "pimiento",
  choclo: "maiz",
  choclos: "maiz",
  zapallitos: "zapallito",
  palta: "palta",
  ricota: "ricota",
  frutillas: "frutilla",
  maicena: "almidon maiz",
  huevo: "huevo gallina entero",
  huevos: "huevo gallina entero",
  leche: "leche entera fluida",
  aceite: "aceite girasol",
};

/** Plural → singular simple ("zanahorias" → "zanahoria", "porotos" → "poroto", "limones" → "limon"). */
function singular(word: string): string[] {
  const out: string[] = [];
  if (word.length > 4 && word.endsWith("es")) out.push(word.slice(0, -2));
  if (word.length > 3 && word.endsWith("s")) out.push(word.slice(0, -1));
  return out;
}

function rankFoods(foods: readonly SuggestableFood[], query: string): SuggestableFood[] {
  const words = query.split(" ").filter(Boolean);
  if (words.length === 0) return [];
  const first = words[0]!;
  const rank = (f: SuggestableFood) => {
    if (f.searchText.startsWith(query)) return 0;
    if (f.searchText.split(" ").some((w) => w.startsWith(first))) return 1;
    return 2;
  };
  const collator = new Intl.Collator("es", { sensitivity: "base" });
  return foods
    .filter((f) => words.every((w) => f.searchText.includes(w)))
    .map((f) => ({ f, r: rank(f) }))
    // A igual ranking, SARA2 antes que PROPIO (pasa a producción por sourceKey, 8.4); después el nombre más corto.
    .sort(
      (a, b) =>
        a.r - b.r ||
        (a.f.source === b.f.source ? 0 : a.f.source === "SARA2" ? -1 : 1) ||
        a.f.name.length - b.f.name.length ||
        collator.compare(a.f.name, b.f.name),
    )
    .map((x) => x.f);
}

/** Palabras útiles del label: sin paréntesis, sin palabras vacías y con los sinónimos de una palabra. */
export function suggestionWords(label: string): string[] {
  const base = foodSearchText(label.replace(/\([^)]*\)?/g, " "));
  const whole = RECIPE_FOOD_SYNONYMS[base];
  if (whole) return whole.split(" ");
  return base
    .split(" ")
    .filter((w) => w !== "" && !STOP_WORDS.has(w) && !/^\d/.test(w))
    .map((w) => {
      const syn = RECIPE_FOOD_SYNONYMS[w];
      return syn && !syn.includes(" ") ? syn : w;
    });
}

/** Sugerencia para la revisión. NUNCA se guarda sola: la tiene que aceptar una persona. */
export function suggestFood(
  label: string,
  foods: readonly SuggestableFood[],
): { foodId: string; matchedQuery: string } | null {
  const words = suggestionWords(label);
  if (words.length === 0) return null;
  const active = foods.filter((f) => f.active);
  const wholeQuery = words.join(" ");
  const multi = RECIPE_FOOD_SYNONYMS[wholeQuery];
  const queries = [...new Set([multi, wholeQuery, words.slice(0, 2).join(" "), words[0]!].filter((q): q is string => !!q))];
  for (const q of queries) {
    const variants = [q];
    const qWords = q.split(" ");
    const singularized = qWords.map((w) => singular(w)[0] ?? w).join(" ");
    const singularized2 = qWords.map((w) => singular(w)[1] ?? singular(w)[0] ?? w).join(" ");
    variants.push(singularized, singularized2);
    for (const v of [...new Set(variants)]) {
      const whole = RECIPE_FOOD_SYNONYMS[v];
      const query = whole && whole.includes(" ") ? whole : v;
      const hit = rankFoods(active, query)[0];
      if (hit) return { foodId: hit.id, matchedQuery: query };
    }
  }
  return null;
}
