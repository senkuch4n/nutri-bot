import "server-only";
import { normalizeMeasureQty, parseEsArNumber } from "@nutri-bot/core";

/**
 * HU-018d (SDD 6.2): lee `measureId` y `measureQty` del formulario "Agregar alimento" (planes y
 * plantillas). Sin measureId → null (ítem en gramos, como siempre). Con measureId y sin foodId, o con
 * una cantidad inválida (parseEsArNumber + normalizeMeasureQty) → "invalid".
 * La cantidad nunca tiene miles: se acepta "1,5" y también "1.5".
 */
export function readMeasureFields(
  formData: FormData,
  foodId: string,
): { measureId: string; qty: number } | null | "invalid" {
  const measureId = String(formData.get("measureId") ?? "").trim();
  if (!measureId) return null;
  if (!foodId || measureId.length > 64) return "invalid";
  const raw = String(formData.get("measureQty") ?? "").trim().replace(".", ",");
  const parsed = parseEsArNumber(raw);
  if (!parsed.ok || parsed.value === null) return "invalid";
  const qty = normalizeMeasureQty(parsed.value);
  return qty === null ? "invalid" : { measureId, qty };
}
