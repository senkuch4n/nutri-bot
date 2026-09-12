import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";
import { FoodForm } from "../food-form";
import { createFoodAction } from "../actions";

export default function NuevoAlimentoPage() {
  return (
    <div className="space-y-6">
      <div>
        <Link href="/alimentos" className="text-sm text-ink-soft transition-colors hover:text-ink">
          ← Volver a alimentos
        </Link>
        <PageHeader title="Nuevo alimento" />
      </div>
      <Card>
        <FoodForm
          action={createFoodAction}
          defaults={{
            name: "",
            group: "OTROS",
            kcalPer100: "",
            proteinPer100: "",
            carbsPer100: "",
            fatPer100: "",
            fiberPer100: "",
            unitHint: "",
          }}
          submitLabel="Crear alimento"
        />
      </Card>
    </div>
  );
}
