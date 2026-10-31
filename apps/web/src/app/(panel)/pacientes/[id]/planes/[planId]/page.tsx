import { PlanDetail } from "./plan-detail";

export const dynamic = "force-dynamic";

/** Página completa del plan (URL directa o recarga). Desde la ficha en el modal, se abre en el modal. */
export default async function PlanDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; planId: string }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id, planId } = await params;
  const query = (await searchParams) ?? {};
  return <PlanDetail id={id} planId={planId} dia={query.dia} variant="page" />;
}
