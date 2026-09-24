import { getFood } from "@nutri-bot/db/domain";
import { Card, PageHeader } from "@/components/ui";
import { OwnFoodForm, type OwnFoodDefaults } from "../own-food-form";
import { createOwnFoodAction } from "../actions";

export const dynamic = "force-dynamic";

const str = (v: { toString(): string } | null): string => (v === null ? "" : v.toString());

const EMPTY: OwnFoodDefaults = {
  name: "",
  group: "OTROS",
  reference: "",
  proteinPer100: "",
  carbsPer100: "",
  fatPer100: "",
  fiberPer100: "",
  alcoholPer100: "",
  sodiumMgPer100: "",
  addedSugarPer100: "",
  saturatedFatPer100: "",
  cholesterolMgPer100: "",
  unitHint: "",
};

export default async function NuevoAlimentoPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string | string[] }>;
}) {
  const { desde } = await searchParams;
  const sourceId = typeof desde === "string" ? desde : null;
  const from = sourceId ? await getFood(sourceId) : null;

  // "Duplicar como propio": mismos valores, nombre "(copia)", sin referencia ni "Más nutrientes".
  const defaults: OwnFoodDefaults = from
    ? {
        name: `${from.name} (copia)`,
        group: from.group,
        reference: "",
        proteinPer100: str(from.proteinPer100),
        carbsPer100: str(from.carbsPer100),
        fatPer100: str(from.fatPer100),
        fiberPer100: str(from.fiberPer100),
        alcoholPer100: str(from.alcoholPer100),
        sodiumMgPer100: str(from.sodiumMgPer100),
        addedSugarPer100: str(from.addedSugarPer100),
        saturatedFatPer100: str(from.saturatedFatPer100),
        cholesterolMgPer100: str(from.cholesterolMgPer100),
        unitHint: from.unitHint ?? "",
      }
    : EMPTY;

  return (
    <div>
      <PageHeader
        title="Nuevo alimento"
        description="Alimento propio. Los valores son cada 100 g; las kcal se calculan solas."
        back={{ href: "/alimentos", label: "Volver a alimentos" }}
      />
      <Card className="max-w-3xl">
        <OwnFoodForm action={createOwnFoodAction} defaults={defaults} submitLabel="Crear alimento" />
      </Card>
    </div>
  );
}
