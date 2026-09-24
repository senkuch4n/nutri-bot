import { FOOD_SOURCE_LABELS } from "@nutri-bot/core";
import { Badge } from "@/components/ui";

/** Fuente del alimento: "SARA 2" (neutral) o "Propio" (info). Sirve en server y cliente. */
export function FoodSourceBadge({ source }: { source: "SARA2" | "PROPIO" }) {
  return <Badge tone={source === "SARA2" ? "neutral" : "info"}>{FOOD_SOURCE_LABELS[source]}</Badge>;
}
