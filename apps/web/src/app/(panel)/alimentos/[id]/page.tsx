import { notFound } from "next/navigation";
import { Copy } from "lucide-react";
import { formatKcalOneDecimal, atwaterKcal, kcalDiffersFromAtwater, readFoodNutrients } from "@nutri-bot/core";
import { getFood, getFoodUsage } from "@nutri-bot/db/domain";
import { Alert, Badge, ButtonLink, Card, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { foodGroupLabel } from "@/lib/food-groups";
import { FoodEnergyCard } from "../food-energy-card";
import { FoodMainNutrientsCard, FoodMoreNutrients } from "../food-nutrients";
import { OwnFoodForm } from "../own-food-form";
import { applyAtwaterKcalAction, setFoodActiveAction, updateOwnFoodAction } from "../actions";

export const dynamic = "force-dynamic";

const num = (v: { toString(): string } | null): number | null => (v === null ? null : Number(v.toString()));
const str = (v: { toString(): string } | null): string => (v === null ? "" : v.toString());
const oneDecimal = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 });

function usageText(u: { plans: number; templates: number }): string {
  const plans = `${u.plans} ${u.plans === 1 ? "plan" : "planes"}`;
  const templates = `${u.templates} ${u.templates === 1 ? "plantilla" : "plantillas"}`;
  return `Lo usan ${plans} y ${templates}`;
}

export default async function AlimentoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [food, usage] = await Promise.all([getFood(id), getFoodUsage(id)]);
  if (!food) notFound();

  const isSara = food.source === "SARA2";
  const nutrients = readFoodNutrients(food.nutrients);
  const macros = {
    protein: Number(food.proteinPer100.toString()),
    carbs: Number(food.carbsPer100.toString()),
    fat: Number(food.fatPer100.toString()),
    alcohol: num(food.alcoholPer100),
  };
  const kcalPer100 = Number(food.kcalPer100.toString());
  const kcalDiffers = !isSara && kcalDiffersFromAtwater(kcalPer100, macros);
  const atwater = atwaterKcal(macros);
  const inUse = usage.plans + usage.templates > 0;

  const toggleActive = async () => {
    "use server";
    await setFoodActiveAction(food.id, !food.active);
  };
  const description = [foodGroupLabel(food.group), isSara ? "SARA 2" : "Propio", !isSara ? food.reference : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <div>
      <PageHeader
        title={food.name}
        description={description}
        back={{ href: "/alimentos", label: "Volver a alimentos" }}
        action={
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone={food.active ? "success" : "neutral"}>{food.active ? "Activo" : "Inactivo"}</Badge>
            <form action={toggleActive}>
              <SubmitButton variant="secondary" size="sm" pendingLabel={food.active ? "Desactivando…" : "Activando…"}>
                {food.active ? "Desactivar" : "Activar"}
              </SubmitButton>
            </form>
            {isSara ? (
              <ButtonLink href={`/alimentos/nuevo?desde=${food.id}`} variant="secondary" size="sm">
                <Copy aria-hidden />
                Duplicar como propio
              </ButtonLink>
            ) : null}
          </div>
        }
      />

      <div className="mb-6 max-w-3xl space-y-3">
        {isSara ? (
          <Alert tone="info">
            Dato oficial de SARA 2 (Ministerio de Salud, 2022). No se puede editar: si necesitás otros valores,
            duplicalo como propio.
          </Alert>
        ) : null}
        {kcalDiffers ? (
          <Alert
            tone="warning"
            title={`Las kcal cargadas (${oneDecimal.format(kcalPer100)}) no coinciden con el cálculo por macros (${oneDecimal.format(atwater)})`}
          >
            <p>
              Se cargaron a mano antes de que el sistema las calculara. Si las cambiás, cambian los totales de los planes
              que usan este alimento.
            </p>
            <form action={applyAtwaterKcalAction.bind(null, food.id)} className="mt-3">
              <SubmitButton variant="secondary" size="sm" pendingLabel="Aplicando…">
                Usar {formatKcalOneDecimal(atwater)}
              </SubmitButton>
            </form>
          </Alert>
        ) : null}
        {!isSara && food.groupAutoAssigned ? (
          <Alert tone="info">Revisá el grupo: se asignó automáticamente al pasar a los grupos de SARA 2.</Alert>
        ) : null}
        {food.active ? null : (
          <Alert tone="info">Este alimento está inactivo: no aparece al armar planes ni plantillas.</Alert>
        )}
        {inUse ? <p className="text-sm text-muted-foreground">{usageText(usage)}</p> : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <FoodEnergyCard
          protein={macros.protein}
          carbs={macros.carbs}
          fat={macros.fat}
          alcohol={macros.alcohol}
          kcalPer100={kcalPer100}
          kcalPublished={nutrients?.kcalPublicada ?? null}
        />
        <FoodMainNutrientsCard
          n={{
            ...macros,
            saturatedFat: num(food.saturatedFatPer100),
            fiber: num(food.fiberPer100),
            addedSugar: num(food.addedSugarPer100),
            sodiumMg: num(food.sodiumMgPer100),
            cholesterolMg: num(food.cholesterolMgPer100),
          }}
        />
      </div>

      {nutrients ? (
        <div className="mt-6">
          <FoodMoreNutrients nutrients={nutrients} />
        </div>
      ) : null}

      {isSara ? null : (
        <Card title="Editar alimento" className="mt-6 max-w-3xl">
          <OwnFoodForm
            action={updateOwnFoodAction.bind(null, food.id)}
            submitLabel="Guardar cambios"
            usage={usage}
            defaults={{
              name: food.name,
              group: food.group,
              reference: food.reference ?? "",
              proteinPer100: str(food.proteinPer100),
              carbsPer100: str(food.carbsPer100),
              fatPer100: str(food.fatPer100),
              fiberPer100: str(food.fiberPer100),
              alcoholPer100: str(food.alcoholPer100),
              sodiumMgPer100: str(food.sodiumMgPer100),
              addedSugarPer100: str(food.addedSugarPer100),
              saturatedFatPer100: str(food.saturatedFatPer100),
              cholesterolMgPer100: str(food.cholesterolMgPer100),
              unitHint: food.unitHint ?? "",
            }}
          />
        </Card>
      )}
    </div>
  );
}
