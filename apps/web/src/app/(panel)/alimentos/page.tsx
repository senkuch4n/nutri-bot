import { listFoods } from "@nutri-bot/db/domain";
import { PageHeader } from "@/components/ui";
import { FoodsList } from "./foods-list";

export const dynamic = "force-dynamic";

export default async function AlimentosPage() {
  const foods = await listFoods({ activeOnly: false, source: "SARA2" });

  return (
    <div>
      <PageHeader
        title="Alimentos"
        description="Base oficial de alimentos SARA 2 (Ministerio de Salud, 2022), con valores cada 100 g."
      />
      <FoodsList
        foods={foods.map((f) => ({
          id: f.id,
          name: f.name,
          group: f.group,
          source: f.source,
          kcalPer100: f.kcalPer100.toString(),
          proteinPer100: f.proteinPer100.toString(),
          carbsPer100: f.carbsPer100.toString(),
          fatPer100: f.fatPer100.toString(),
          active: f.active,
        }))}
      />
    </div>
  );
}
