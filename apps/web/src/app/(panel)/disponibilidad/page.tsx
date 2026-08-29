import { prisma } from "@nutri-bot/db";
import { formatInTimeZone } from "@nutri-bot/core";
import { Card, PageHeader } from "@/components/ui";
import { getProfessional } from "@/lib/professional";
import {
  AddExceptionForm,
  AddRuleForm,
  DeleteExceptionButton,
  DeleteRuleButton,
} from "./forms";

export const dynamic = "force-dynamic";

const WEEKDAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

export default async function DisponibilidadPage() {
  const pro = await getProfessional();
  const [rules, exceptions] = await Promise.all([
    prisma.availabilityRule.findMany({ orderBy: [{ weekday: "asc" }, { startTime: "asc" }] }),
    prisma.availabilityException.findMany({ orderBy: { date: "asc" } }),
  ]);

  const byWeekday = (wd: number) => rules.filter((r) => r.weekday === wd);
  const order = [1, 2, 3, 4, 5, 6, 0];

  return (
    <div>
      <PageHeader
        title="Disponibilidad"
        description={`Horario habitual y excepciones. Zona horaria: ${pro.timezone}.`}
      />

      <Card className="mb-6">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">
          Horario semanal
        </h2>
        <div className="divide-y divide-slate-100">
          {order.map((wd) => (
            <div key={wd} className="grid gap-2 py-3 sm:grid-cols-[120px_1fr]">
              <div className="pt-1 font-medium">{WEEKDAYS[wd]}</div>
              <div className="space-y-2">
                {byWeekday(wd).length === 0 ? (
                  <p className="text-sm text-slate-400">Sin atención</p>
                ) : (
                  byWeekday(wd).map((r) => (
                    <div key={r.id} className="flex items-center gap-3 text-sm">
                      <span className="rounded bg-slate-100 px-2 py-0.5 font-mono">
                        {r.startTime}–{r.endTime}
                      </span>
                      <DeleteRuleButton id={r.id} />
                    </div>
                  ))
                )}
                <AddRuleForm weekday={wd} />
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">
          Excepciones
        </h2>

        <div className="mb-5 space-y-2">
          {exceptions.length === 0 ? (
            <p className="text-sm text-slate-400">Sin excepciones cargadas.</p>
          ) : (
            exceptions.map((e) => (
              <div key={e.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm">
                <div>
                  <span className="font-medium">
                    {formatInTimeZone(e.date, "UTC", "dd/MM/yyyy")}
                  </span>{" "}
                  —{" "}
                  {e.type === "BLOCKED"
                    ? e.startTime
                      ? `bloqueado ${e.startTime}–${e.endTime}`
                      : "día bloqueado"
                    : `horario especial ${e.startTime}–${e.endTime}`}
                  {e.reason ? <span className="text-slate-400"> · {e.reason}</span> : null}
                </div>
                <DeleteExceptionButton id={e.id} />
              </div>
            ))
          )}
        </div>

        <div className="border-t border-slate-100 pt-4">
          <AddExceptionForm />
        </div>
      </Card>
    </div>
  );
}
