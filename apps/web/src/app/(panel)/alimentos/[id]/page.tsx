import { notFound } from "next/navigation";
import { prisma } from "@nutri-bot/db";
import { Alert, Badge, Card, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { FOOD_GROUP_LABELS } from "@/lib/food-groups";
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
    <div>
      <PageHeader
        title={food.name}
        description={FOOD_GROUP_LABELS[food.group]}
        back={{ href: "/alimentos", label: "Volver a alimentos" }}
        action={
          <div className="flex items-center gap-3">
            <Badge tone={food.active ? "success" : "neutral"}>{food.active ? "Activo" : "Inactivo"}</Badge>
            <form action={toggleActive}>
              <SubmitButton
                variant="secondary"
                size="sm"
                pendingLabel={food.active ? "Desactivando…" : "Activando…"}
              >
                {food.active ? "Desactivar" : "Activar"}
              </SubmitButton>
            </form>
          </div>
        }
      />
      {food.active ? null : (
        <Alert tone="info" className="mb-6 max-w-3xl">
          Este alimento está inactivo: no aparece al armar planes ni plantillas.
        </Alert>
      )}
      <Card className="max-w-3xl">
        <FoodForm
          action={boundUpdate}
          defaults={{
            name: food.name,
            group: food.group,
            kcalPer100: food.kcalPer100.toString(),
            proteinPer100: food.proteinPer100.toString(),
            carbsPer100: food.carbsPer100.toString(),
            fatPer100: food.fatPer100.toString(),
            fiberPer100: food.fiberPer100?.toString() ?? "",
            unitHint: food.unitHint ?? "",
          }}
          submitLabel="Guardar cambios"
        />
      </Card>
    </div>
  );
}
