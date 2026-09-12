import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@nutri-bot/db";
import { Badge, Button, Card, PageHeader } from "@/components/ui";
import { FoodForm } from "../food-form";
import { updateFoodAction, setFoodActiveAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function EditarAlimentoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const food = await prisma.food.findUnique({ where: { id } });
  if (!food) notFound();

  const boundUpdate = updateFoodAction.bind(null, food.id);
  const toggleActive = async () => {
    "use server";
    await setFoodActiveAction(food.id, !food.active);
  };

  return (
    <div className="space-y-6">
      <div>
        <Link href="/alimentos" className="text-sm text-ink-soft transition-colors hover:text-ink">
          ← Volver a alimentos
        </Link>
        <PageHeader
          title={food.name}
          action={
            <div className="flex items-center gap-3">
              <Badge tone={food.active ? "green" : "slate"}>
                {food.active ? "Activo" : "Inactivo"}
              </Badge>
              <form action={toggleActive}>
                <Button type="submit" variant="secondary" size="sm">
                  {food.active ? "Desactivar" : "Activar"}
                </Button>
              </form>
            </div>
          }
        />
      </div>
      <Card>
        <FoodForm
          action={boundUpdate}
          defaults={{
            name: food.name,
            group: food.group,
            kcalPer100: food.kcalPer100.toString(),
            proteinPer100: food.proteinPer100.toString(),
            carbsPer100: food.carbsPer100.toString(),
            fatPer100: food.fatPer100.toString(),
            unitHint: food.unitHint ?? "",
          }}
          submitLabel="Guardar cambios"
        />
      </Card>
    </div>
  );
}
