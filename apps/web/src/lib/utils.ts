import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";
import { shadows, typeScale } from "./design-tokens";

// tailwind-merge no conoce los tamaños tipográficos con nombre (`text-headline`): sin esto,
// `cn("text-foreground", "text-headline")` borraría el color (SDD G13).
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: Object.keys(typeScale) }],
      shadow: [{ shadow: Object.keys(shadows) }],
    },
  },
});

/** Une clases de Tailwind resolviendo conflictos (la última gana). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
