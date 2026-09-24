import { listFoods } from "@nutri-bot/db/domain";
import { Plus } from "lucide-react";
import { ButtonLink, PageHeader } from "@/components/ui";
import { FoodsList } from "./foods-list";

export const dynamic = "force-dynamic";

export default async function AlimentosPage() {
  const foods = await listFoods({ activeOnly: false });

  return (
    <div>
      <PageHeader
        title="Alimentos"
        description="Base de alimentos con valores cada 100 g: SARA 2 (Ministerio de Salud, 2022) y tus alimentos propios."
        action={
          <ButtonLink href="/alimentos/nuevo">
            <Plus aria-hidden />
            Nuevo alimento
          </ButtonLink>
        }
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
