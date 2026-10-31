import { MorphDialogContentReady } from "@/components/primitives/morph-dialog";
import { PlanDetail } from "@/app/(panel)/pacientes/[id]/planes/[planId]/plan-detail";

export const dynamic = "force-dynamic";

/** El plan dentro del modal de la ficha (mismo diálogo y tamaño; lo pone el layout de `(.)[id]`). */
export default async function PlanModalPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; planId: string }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id, planId } = await params;
  const query = (await searchParams) ?? {};
  return (
    <>
      <MorphDialogContentReady />
      <PlanDetail id={id} planId={planId} dia={query.dia} variant="modal" />
    </>
  );
}
