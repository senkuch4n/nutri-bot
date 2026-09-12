import { Badge } from "@/components/ui";

export interface DiaryEntryRow {
  id: string;
  createdAtLabel: string;
  isRecent: boolean;
  note: string | null;
  hasPhoto: boolean;
}

export function DiarySection({ entries }: { entries: DiaryEntryRow[] }) {
  if (entries.length === 0) {
    return (
      <p className="text-sm text-ink-faint">
        Todavía no cargó nada en su diario alimentario (lo hace desde el portal).
      </p>
    );
  }

  return (
    <ul className="divide-y divide-line text-sm">
      {entries.map((e) => (
        <li key={e.id} className="flex items-start justify-between gap-4 py-3">
          <div className="min-w-0 space-y-2">
            <p className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.06em] text-ink-faint">
                {e.createdAtLabel}
              </span>
              {e.isRecent ? <Badge tone="green">Últimas 24 hs</Badge> : null}
            </p>
            {e.note ? <p className="text-ink">{e.note}</p> : null}
            {e.hasPhoto ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/diary/${e.id}/photo`}
                alt="Foto de la comida"
                className="max-h-48 max-w-full rounded object-cover"
              />
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
