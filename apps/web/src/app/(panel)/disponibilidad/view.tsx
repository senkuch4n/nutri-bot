"use client";

import { useState } from "react";
import { Button, SectionLabel } from "@/components/ui";
import { Modal } from "@/components/modal";
import { AddBlockModal, WeeklySchedule, type Rule } from "./schedule";
import { ExceptionForm, ExceptionsList, type ExceptionView } from "./exceptions";

export function DisponibilidadView({
  rules,
  exceptions,
  timezone,
}: {
  rules: Rule[];
  exceptions: ExceptionView[];
  timezone: string;
}) {
  const [blockModal, setBlockModal] = useState<{ weekday: number; start: string } | null>(null);
  const [excOpen, setExcOpen] = useState(false);

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-ink">Disponibilidad</h1>
          <p className="mt-2 text-sm text-ink-soft">
            Tu horario habitual y las excepciones · {timezone}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setBlockModal({ weekday: 1, start: "09:00" })}>
            + Bloque de horario
          </Button>
          <Button onClick={() => setExcOpen(true)}>+ Excepción</Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)] lg:items-start">
        <section className="rounded-card border border-line bg-paper p-5 shadow-card">
          <SectionLabel>Horario semanal</SectionLabel>
          <WeeklySchedule
            rules={rules}
            onAddBlock={(weekday, start) => setBlockModal({ weekday, start })}
          />
        </section>

        <section className="rounded-card border border-line bg-paper p-5 shadow-card lg:sticky lg:top-24">
          <SectionLabel>Excepciones</SectionLabel>
          <p className="mb-4 text-xs text-ink-faint">
            Feriados, días libres y horarios especiales puntuales.
          </p>
          <ExceptionsList exceptions={exceptions} />
        </section>
      </div>

      {blockModal ? (
        <AddBlockModal
          weekday={blockModal.weekday}
          start={blockModal.start}
          onClose={() => setBlockModal(null)}
        />
      ) : null}

      <Modal open={excOpen} onClose={() => setExcOpen(false)} title="Nueva excepción">
        <ExceptionForm onDone={() => setExcOpen(false)} />
      </Modal>
    </div>
  );
}
