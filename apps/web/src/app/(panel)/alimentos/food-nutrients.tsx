import { ChevronDown } from "lucide-react";
import {
  FOOD_EXTRA_NUTRIENTS,
  FOOD_NUTRIENT_SECTION_LABELS,
  type FoodNutrientSection,
  type FoodNutrients,
} from "@nutri-bot/core";
import { Card } from "@/components/ui";

const upTo3 = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 3 });
const upTo2 = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });

function Value({ value, unit, format = upTo2 }: { value: number | null; unit: string; format?: Intl.NumberFormat }) {
  if (value === null) return <span className="text-muted-foreground">Sin dato</span>;
  return (
    <span className="tabular-nums">
      {format.format(value)}
      {" "}
      <span className="text-muted-foreground">{unit}</span>
    </span>
  );
}

export interface MainNutrients {
  protein: number;
  carbs: number;
  fat: number;
  saturatedFat: number | null;
  fiber: number | null;
  addedSugar: number | null;
  sodiumMg: number | null;
  cholesterolMg: number | null;
  alcohol: number | null;
}

/** Nutrientes principales cada 100 g. "Sin dato" (null) es distinto de 0. */
export function FoodMainNutrientsCard({ n }: { n: MainNutrients }) {
  const rows: { label: string; value: number | null; unit: string }[] = [
    { label: "Proteínas", value: n.protein, unit: "g" },
    { label: "Carbohidratos disponibles", value: n.carbs, unit: "g" },
    { label: "Grasas totales", value: n.fat, unit: "g" },
    { label: "Grasas saturadas", value: n.saturatedFat, unit: "g" },
    { label: "Fibra", value: n.fiber, unit: "g" },
    { label: "Azúcar agregado", value: n.addedSugar, unit: "g" },
    { label: "Sodio", value: n.sodiumMg, unit: "mg" },
    { label: "Colesterol", value: n.cholesterolMg, unit: "mg" },
  ];
  if (n.alcohol !== null && n.alcohol > 0) rows.push({ label: "Alcohol", value: n.alcohol, unit: "g" });
  return (
    <Card title="Nutrientes principales" description="Cada 100 g">
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        {rows.map((r) => (
          <div key={r.label} className="flex items-baseline justify-between gap-3 border-b py-1.5 last:border-b-0">
            <dt className="text-muted-foreground">{r.label}</dt>
            <dd className="text-right">
              <Value value={r.value} unit={r.unit} format={upTo3} />
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

const SECTIONS: FoodNutrientSection[] = ["grasas", "carbohidratos", "minerales", "vitaminas", "otros"];

/** Resto de los 39 componentes de SARA 2, plegable. */
export function FoodMoreNutrients({ nutrients }: { nutrients: FoodNutrients }) {
  return (
    <details className="group rounded-lg border bg-card text-card-foreground">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-6 py-4 text-base font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        Más nutrientes
        <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform motion-reduce:transition-none group-open:rotate-180" aria-hidden />
      </summary>
      <div className="grid gap-6 border-t px-6 py-5 sm:grid-cols-2 lg:grid-cols-3">
        {SECTIONS.map((section) => (
          <section key={section}>
            <h3 className="mb-2 text-sm font-medium">{FOOD_NUTRIENT_SECTION_LABELS[section]}</h3>
            <dl className="space-y-1 text-sm">
              {FOOD_EXTRA_NUTRIENTS.filter((d) => d.section === section).map((d) => (
                <div key={d.key} className="flex items-baseline justify-between gap-3">
                  <dt className="text-muted-foreground">{d.label}</dt>
                  <dd className="text-right">
                    <Value value={nutrients[d.key]} unit={d.unit} format={upTo3} />
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </details>
  );
}
