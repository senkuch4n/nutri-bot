const stripAccents = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * Une los renglones del nombre de un alimento. "des-" + "cremada" → "descremada",
 * "PRO-" + "MEDIO" → "PROMEDIO"; si no, con un espacio. Quita los "*" de notas al pie.
 */
export function joinNameLines(lines: readonly string[]): string {
  let acc = "";
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (/\p{L}-$/u.test(acc) && /^\p{L}/u.test(line)) acc = acc.slice(0, -1) + line;
    else acc = acc ? `${acc} ${line}` : line;
  }
  return acc
    .replace(/\*+/g, "")
    .replace(/\s+/g, " ")
    .replace(/ ,/g, ",")
    .trim();
}

/** Nombre partido o ilegible: termina en guion, empieza en minúscula, tiene "*" o es muy corto. */
export function isBrokenName(name: string): boolean {
  const n = name.trim();
  return n.length < 2 || /-$/.test(n) || /^[a-záéíóúñü]/.test(n) || n.includes("*");
}

/** Clave para emparejar la fila A con la B: sin tildes, minúsculas, solo [a-z0-9%]. */
export function sara2PairKey(name: string): string {
  return stripAccents(name)
    .toLowerCase()
    .replace(/(\p{L})-\s+(\p{L})/gu, "$1$2")
    .replace(/[^a-z0-9%]/g, "");
}

/** "sara2:t03:arroz-blanco-hervido" */
export function sara2SourceKey(table: number, name: string): string {
  const slug = stripAccents(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `sara2:t${String(table).padStart(2, "0")}:${slug}`;
}
