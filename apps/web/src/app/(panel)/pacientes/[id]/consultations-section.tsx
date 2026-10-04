"use client";

import { Plus, Stethoscope } from "lucide-react";
import { GroupedList, GroupedListRow } from "@/components/grouped-list";
import { Button, EmptyState } from "@/components/ui";
import { NewConsultationButton } from "./consultation-date-sheet";

export interface ConsultationRow {
  id: string;
  /** "Miércoles 24/09" (formatConsultationDay, en la zona de la profesional). */
  dayLabel: string;
  /** "Con turno (Control) · 10:00" o "Sin turno". */
  originLabel: string;
  /** "Se registró: peso, calorías y notas" o "Sin registros". */
  recordedText: string;
}

/** Pestaña Consultas (HU-017c-2): "Nueva consulta" arriba y una lista agrupada, de la más nueva a la
 *  más vieja, en lenguaje común. */
export function ConsultationsSection({
  patientId,
  todayKey,
  consultations,
}: {
  patientId: string;
  todayKey: string;
  consultations: ConsultationRow[];
}) {
  const newButton = (
    <NewConsultationButton
      patientId={patientId}
      todayKey={todayKey}
      trigger={
        <Button type="button" variant="tinted">
          <Plus aria-hidden />
          Nueva consulta
        </Button>
      }
    />
  );

  return (
    <section aria-labelledby="consultas-titulo" className="max-w-3xl">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 id="consultas-titulo" className="text-title-3">
          Consultas
        </h2>
        {consultations.length > 0 ? newButton : null}
      </div>
      {consultations.length === 0 ? (
        <div className="rounded-xl bg-card shadow-card more-contrast:border more-contrast:border-input">
          <EmptyState
            icon={Stethoscope}
            title="Todavía no hay consultas"
            description="Se crean solas al marcar un turno como completado, o podés crear una a mano."
            action={newButton}
          />
        </div>
      ) : (
        <GroupedList>
          {consultations.map((c) => (
            <GroupedListRow
              key={c.id}
              size="lg"
              href={`/pacientes/${patientId}/consultas/${c.id}`}
              label={c.dayLabel}
              description={
                <>
                  <span className="tabular-nums">{c.originLabel}</span>
                  {" · "}
                  {c.recordedText}
                </>
              }
            />
          ))}
        </GroupedList>
      )}
    </section>
  );
}
