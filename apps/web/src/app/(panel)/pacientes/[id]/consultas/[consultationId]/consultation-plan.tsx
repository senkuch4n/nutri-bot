"use client";

import { useActionState, useTransition } from "react";
import { ClipboardList, Plus, Unlink } from "lucide-react";
import { MoreActionsMenu } from "@/components/more-actions-menu";
import { Badge, Button, ButtonLink, Card, Field, FormError, Select } from "@/components/ui";
import { UNDO_TEXT } from "@/lib/deferred-delete";
import { notify, useActionToast } from "@/lib/notify";
import type { ActionState } from "../../clinical-actions";
import {
  clearConsultationPlanAction,
  createPlanForConsultationAction,
  setConsultationPlanAction,
} from "../../consultation-actions";

type PlanStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";

// Mismos tonos y textos que plans-section.tsx.
const statusTone = { DRAFT: "neutral", ACTIVE: "success", ARCHIVED: "neutral" } as const;
const statusLabel = { DRAFT: "Borrador", ACTIVE: "Activo", ARCHIVED: "Archivado" } as const;

export interface PlanOption {
  id: string;
  title: string;
  status: PlanStatus;
}

const initial: ActionState = { ok: false };

/** Plan indicado en la consulta (D8): un puntero a un plan del paciente. Indicar o quitar no toca el plan. */
export function ConsultationPlan({
  patientId,
  consultationId,
  plan,
  options,
}: {
  patientId: string;
  consultationId: string;
  plan: PlanOption | null;
  /** Planes del paciente ya ordenados: activos, borradores, archivados; cada grupo por creación desc. */
  options: PlanOption[];
}) {
  const [, startClear] = useTransition();
  const [creating, startCreate] = useTransition();
  const [state, action, setting] = useActionState(setConsultationPlanAction, initial);
  useActionToast(state, { success: "Plan indicado en la consulta" });

  function removePlan(planId: string) {
    startClear(async () => {
      const res = await clearConsultationPlanAction(patientId, consultationId);
      if (!res.ok) {
        notify.error(res.error);
        return;
      }
      notify.undo(UNDO_TEXT.plan.removed, async () => {
        const data = new FormData();
        data.set("patientId", patientId);
        data.set("consultationId", consultationId);
        data.set("planId", planId);
        const undone = await setConsultationPlanAction({ ok: false }, data).catch(() => ({ ok: false }));
        if (undone.ok) notify.saved(UNDO_TEXT.plan.undone);
        else notify.error(UNDO_TEXT.undoError);
      });
    });
  }

  if (plan) {
    return (
      <Card title="Plan indicado">
        <div className="flex flex-wrap items-center gap-2">
          <span className="min-w-0 break-words font-medium">{plan.title}</span>
          <Badge tone={statusTone[plan.status]}>{statusLabel[plan.status]}</Badge>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <ButtonLink variant="secondary" size="lg" className="flex-1" href={`/pacientes/${patientId}/planes/${plan.id}`}>
            <ClipboardList aria-hidden />
            Ver plan
          </ButtonLink>
          <MoreActionsMenu
            label="Más opciones del plan"
            actions={[
              {
                key: "quitar",
                label: "Quitar plan de esta consulta",
                icon: <Unlink />,
                // Sin confirmación: es reversible (HU §4.3). "Deshacer" vuelve a indicar el mismo plan.
                onSelect: () => removePlan(plan.id),
              },
            ]}
          />
        </div>
      </Card>
    );
  }

  return (
    <Card title="Plan indicado">
      <Button
        type="button"
        size="lg"
        className="w-full"
        loading={creating}
        onClick={() =>
          startCreate(async () => {
            await createPlanForConsultationAction(patientId, consultationId);
          })
        }
      >
        {creating ? null : <Plus aria-hidden />}
        {creating ? "Creando…" : "Crear plan"}
      </Button>

      <div className="mt-6">
        {options.length === 0 ? (
          <p className="text-sm text-muted-foreground">El paciente todavía no tiene planes.</p>
        ) : (
          <form action={action} className="space-y-3">
            <input type="hidden" name="patientId" value={patientId} />
            <input type="hidden" name="consultationId" value={consultationId} />
            <Field label="Indicar un plan existente">
              <Select name="planId" defaultValue={options[0]?.id} required>
                {options.map((p) => (
                  <option key={p.id} value={p.id}>
                    {`${p.title} · ${statusLabel[p.status]}`}
                  </option>
                ))}
              </Select>
            </Field>
            <Button type="submit" variant="secondary" size="lg" loading={setting} className="w-full">
              {setting ? "Indicando…" : "Indicar"}
            </Button>
            <FormError message={state.error} />
          </form>
        )}
      </div>
    </Card>
  );
}
