import { Card, PageHeader } from "@/components/ui";
import { FoodForm } from "../food-form";
import { createFoodAction } from "../actions";

export default function NuevoAlimentoPage() {
  return (
    <div>
      <PageHeader
        title="Nuevo alimento"
        description="Los valores son cada 100 g de alimento."
        back={{ href: "/alimentos", label: "Volver a alimentos" }}
      />
      <Card className="max-w-3xl">
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
