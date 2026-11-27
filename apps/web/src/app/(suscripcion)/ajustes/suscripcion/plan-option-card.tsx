// HU-029b (§B.6.4 P1/P8): opción de plan como "radio card". Radio nativo (teclado y lector de pantalla gratis);
// la tarjeta entera es el área de toque. Server-safe: sin hooks.
import { cn } from "@/lib/utils";
import type { PlanOption } from "./subscription-model";

export function PlanOptionCard({
  plan,
  checked,
  onSelect,
  name = "planId",
}: {
  plan: PlanOption;
  checked: boolean;
  onSelect: (planId: string) => void;
  name?: string;
}) {
  return (
    <label
      className={cn(
        "flex min-h-11 cursor-pointer items-start gap-3 rounded-xl bg-card px-4 py-3.5 shadow-card transition-colors duration-hover",
        "ring-1 ring-inset ring-input has-[:checked]:bg-primary-soft has-[:checked]:ring-2 has-[:checked]:ring-primary",
        "has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring",
      )}
    >
      <input
        type="radio"
        name={name}
        value={plan.planId}
        checked={checked}
        onChange={() => onSelect(plan.planId)}
        className="mt-1 size-4 shrink-0 accent-[hsl(var(--primary))]"
      />
      <span className="min-w-0 flex-1">
        <span className="block text-headline">{plan.name}</span>
        <span className="block text-callout tabular-nums text-muted-foreground">{plan.priceText}</span>
        <span className="mt-1 block text-footnote text-muted-foreground">{plan.offerText}</span>
      </span>
    </label>
  );
}
