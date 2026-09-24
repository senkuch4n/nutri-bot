"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button, Card, PageHeader } from "@/components/ui";
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
      <PageHeader
        title="Disponibilidad"
        description={`Tu horario habitual y las excepciones · ${timezone}`}
        action={
          <>
            <Button variant="secondary" onClick={() => setBlockModal({ weekday: 1, start: "09:00" })}>
              <Plus aria-hidden />
              Bloque de horario
            </Button>
            <Button onClick={() => setExcOpen(true)}>
              <Plus aria-hidden />
              Excepción
            </Button>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)] lg:items-start">
        <Card
          title="Horario semanal"
          description="Tocá una franja vacía de un día para agregar un bloque."
        >
          <WeeklySchedule
            rules={rules}
            onAddBlock={(weekday, start) => setBlockModal({ weekday, start })}
          />
        </Card>

        <Card
          title="Excepciones"
          description="Feriados, días libres y horarios especiales puntuales."
          className="lg:sticky lg:top-8"
        >
          <ExceptionsList exceptions={exceptions} />
        </Card>
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
