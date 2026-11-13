import { redirect } from "next/navigation";
import { ListChecks } from "lucide-react";
import { RECIPE_TEXT } from "@nutri-bot/core";
import { listDraftQueue } from "@nutri-bot/db/domain";
import { ButtonLink, EmptyState, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

// HU-018a-2 (SDD 6.1, 7.5): entrada a la revisión. Lleva al primer borrador de la cola (filtrada por
// ?archivo=). Sin borradores muestra el final de la cola ("No quedan borradores para revisar.").
export default async function RevisarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const file = typeof query.archivo === "string" && query.archivo.trim() !== "" ? query.archivo : null;
  const queue = await listDraftQueue(file ? { file } : undefined);
  const first = queue[0];
  if (first) redirect(`/recetas/revisar/${first.id}${file ? `?archivo=${encodeURIComponent(file)}` : ""}`);

  // Terminó el recetario elegido pero quedan otros.
  const others = file ? (await listDraftQueue()).length : 0;

  return (
    <div>
      <PageHeader title="Revisar borradores" back={{ href: "/recetas", label: "Recetas" }} />
      <EmptyState
        icon={ListChecks}
        title={file && others > 0 ? "No quedan borradores de este recetario." : RECIPE_TEXT.queueDone}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            {file && others > 0 ? (
              <ButtonLink href="/recetas/revisar" size="lg">
                Revisar los demás ({others})
              </ButtonLink>
            ) : null}
            <ButtonLink href="/recetas" size="lg" variant={file && others > 0 ? "secondary" : "primary"}>
              Ver recetas
            </ButtonLink>
          </div>
        }
      />
    </div>
  );
}
