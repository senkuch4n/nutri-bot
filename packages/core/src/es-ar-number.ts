export type EsArNumberResult = { ok: true; value: number | null } | { ok: false; raw: string };

const PLAIN = /^-?\d+(?:,\d+)?$/;
const WITH_THOUSANDS = /^-?[1-9]\d{0,2}(?:\.\d{3})+(?:,\d+)?$/;

/**
 * "2,4" → 2.4 · "0" → 0 · "-1,5" → -1.5 · "" / null / undefined → null (celda vacía).
 * Con allowThousands (default false): "38.758" → 38758, "1.234,5" → 1234.5; el primer grupo no
 * puede empezar con 0 ("0.121" es inválido siempre). Cualquier otra cosa → { ok: false }.
 */
export function parseEsArNumber(
  raw: string | null | undefined,
  options?: { allowThousands?: boolean },
): EsArNumberResult {
  if (raw === null || raw === undefined) return { ok: true, value: null };
  const text = raw.trim();
  if (text === "") return { ok: true, value: null };
  let normalized: string | null = null;
  if (PLAIN.test(text)) normalized = text.replace(",", ".");
  else if (options?.allowThousands && WITH_THOUSANDS.test(text)) {
    normalized = text.replace(/\./g, "").replace(",", ".");
  }
  if (normalized === null) return { ok: false, raw };
  const value = Number(normalized);
  if (!Number.isFinite(value)) return { ok: false, raw };
  return { ok: true, value: value === 0 ? 0 : value };
}
