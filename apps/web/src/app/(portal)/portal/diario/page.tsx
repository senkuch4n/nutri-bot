import { NotebookPen, Trash2 } from "lucide-react";
import { listDiaryEntries } from "@nutri-bot/db/domain";
import { formatDateTime } from "@nutri-bot/core";
import { Card, EmptyState } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { getPortalPatient } from "@/lib/patient-session";
import { getProfessional } from "@/lib/professional";
import { DiaryForm } from "./diary-form";
import { deleteDiaryEntryAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function PortalDiaryPage() {
  const patient = await getPortalPatient();
  if (!patient) return null;

  const [pro, entries] = await Promise.all([getProfessional(), listDiaryEntries(patient.id)]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-balance text-2xl font-semibold tracking-tight">Diario alimentario</h1>
        <p className="mt-1 text-sm text-muted-foreground">Anotá lo que comiste, con foto si querés.</p>
      </header>

      <Card title="Nuevo registro">
        <DiaryForm />
      </Card>

      {entries.length === 0 ? (
        <Card>
          <EmptyState icon={NotebookPen} title="Todavía no cargaste ningún registro." />
        </Card>
      ) : (
        <section aria-labelledby="diario-registros" className="space-y-4">
          <h2 id="diario-registros" className="text-base font-semibold">
            Tus registros
          </h2>
          {entries.map((e) => {
            const fecha = formatDateTime(e.createdAt, pro.timezone);
            return (
              <Card key={e.id}>
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm text-muted-foreground first-letter:uppercase">
                    <time dateTime={e.createdAt.toISOString()}>{fecha} hs</time>
                  </p>
                  <form action={deleteDiaryEntryAction}>
                    <input type="hidden" name="id" value={e.id} />
                    <SubmitButton
                      variant="ghost"
                      size="lg"
                      pendingLabel="Borrando…"
                      aria-label={`Borrar registro del ${fecha}`}
                      className="-mr-3 -mt-3 text-destructive hover:bg-destructive-muted hover:text-destructive"
                    >
                      <Trash2 aria-hidden />
                      Borrar
                    </SubmitButton>
                  </form>
                </div>
                {e.note ? <p className="mt-2 text-sm">{e.note}</p> : null}
                {e.photoData ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/portal/diario/photo/${e.id}`}
                    alt="Foto de la comida"
                    className="mt-3 max-h-64 w-auto max-w-full rounded-md border object-cover"
                  />
                ) : null}
              </Card>
            );
          })}
        </section>
      )}
    </div>
  );
}
