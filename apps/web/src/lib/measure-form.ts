import "server-only";
import { normalizeMeasureQty, parseEsArNumber } from "@nutri-bot/core";
import { FoodMeasureNotFoundError, resolveMeasureItem, type MeasureItemFields } from "@nutri-bot/db/domain";

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

/**
 * 018d-1b (R4): resolveMeasureItem para el alta desde el formulario. Si la medida ya no existe (se
 * borró con el editor abierto) o la cantidad no vale, devuelve "gone" para que la action conteste un
 * error amable en vez de llegar al error boundary. Cualquier otro error sigue de largo.
 */
export async function resolveFormMeasure(
  foodId: string,
  fields: { measureId: string; qty: number },
): Promise<MeasureItemFields | "gone"> {
  try {
    return await resolveMeasureItem(foodId, fields.measureId, fields.qty);
  } catch (err) {
    if (err instanceof FoodMeasureNotFoundError || err instanceof RangeError) return "gone";
    throw err;
  }
}
