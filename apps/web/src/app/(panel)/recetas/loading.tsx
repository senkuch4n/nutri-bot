import { Skeleton } from "@/components/primitives/skeleton";
import { RecipeGridSkeleton } from "@/components/recipes/recipe-grid-skeleton";

export default function RecetasLoading() {
  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-3">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
        <Skeleton className="h-11 w-40 rounded-lg" />
      </div>
      <Skeleton className="mb-6 h-11 w-72 max-w-full" />
      <Skeleton className="mb-4 h-12 w-full rounded-lg" />
      <Skeleton className="mb-6 h-11 w-full max-w-2xl" />
      <RecipeGridSkeleton />
    </div>
  );
}
