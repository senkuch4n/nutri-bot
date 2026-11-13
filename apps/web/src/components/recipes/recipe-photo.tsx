import Image from "next/image";
import { Apple, CakeSlice, Carrot, ChefHat, Coffee, CookingPot, Croissant, Salad, type LucideIcon } from "lucide-react";
import type { RecipeTypeKey } from "@nutri-bot/core";
import { cn } from "@/lib/utils";

// HU-018a: foto 4:3 de una receta. Sin foto, la "ilustración neutra" es un ícono por tipo (D14).
// `unoptimized` (D7): el optimizador de Next pediría la imagen sin la cookie de sesión.

const TYPE_ICONS: Record<RecipeTypeKey, LucideIcon> = {
  MAIN_DISH: CookingPot,
  SIDE_DISH: Carrot,
  SALAD: Salad,
  SNACK: Apple,
  BREAKFAST: Coffee,
  BREAD_DOUGH: Croissant,
  DESSERT: CakeSlice,
};

export function RecipePhoto({
  photoUrl,
  type,
  alt,
  priority = false,
  sizes,
  className,
}: {
  photoUrl: string | null;
  type: RecipeTypeKey | null;
  alt: string;
  priority?: boolean;
  sizes: string;
  className?: string;
}) {
  const Icon = type ? TYPE_ICONS[type] : ChefHat;
  return (
    <div className={cn("relative aspect-[4/3] w-full overflow-hidden bg-muted", className)}>
      {photoUrl ? (
        <Image
          src={photoUrl}
          alt={alt}
          fill
          unoptimized
          sizes={sizes}
          priority={priority}
          loading={priority ? undefined : "lazy"}
          className="object-cover"
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center">
          <Icon className="size-10 text-tertiary" strokeWidth={1.5} aria-hidden />
        </div>
      )}
    </div>
  );
}
