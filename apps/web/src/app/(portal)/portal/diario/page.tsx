import Link from "next/link";
import { listDiaryEntries } from "@nutri-bot/db/domain";
import { formatDateTime } from "@nutri-bot/core";
import { Card } from "@/components/ui";
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
      <div>
        <Link href="/portal" className="text-sm text-ink-soft transition-colors hover:text-ink">
          ← Volver
        </Link>
        <h1 className="mt-2 font-display text-2xl font-bold text-ink">Diario alimentario</h1>
        <p className="mt-1 text-sm text-ink-soft">Anotá lo que comiste, con foto si querés.</p>
      </div>

      <Card>
        <DiaryForm />
      </Card>

      {entries.length === 0 ? (
        <p className="text-sm text-ink-faint">Todavía no cargaste ningún registro.</p>
      ) : (
        <div className="space-y-4">
          {entries.map((e) => (
            <Card key={e.id}>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.06em] text-ink-faint">
                    {formatDateTime(e.createdAt, pro.timezone)} hs
                  </p>
                  {e.note ? <p className="text-sm text-ink">{e.note}</p> : null}
                  {e.photoData ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/portal/diario/photo/${e.id}`}
                      alt="Foto de la comida"
                      className="max-h-64 max-w-full rounded object-cover"
                    />
                  ) : null}
                </div>
                <form action={deleteDiaryEntryAction}>
                  <input type="hidden" name="id" value={e.id} />
                  <button
                    type="submit"
                    className="shrink-0 text-xs font-semibold text-ink-faint transition-colors hover:text-red-600"
                  >
                    Borrar
                  </button>
                </form>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
