"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { generatePlanPdfAction, sendPlanWhatsAppAction } from "./actions";

export function PlanPdfActions({
  planId,
  hasPdf,
  pdfGeneratedAtLabel,
  patientPhone,
}: {
  planId: string;
  hasPdf: boolean;
  pdfGeneratedAtLabel: string | null;
  patientPhone: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function run(action: (id: string) => Promise<{ ok: boolean; error?: string }>, successMsg: string) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const res = await action(planId);
      if (!res.ok) setError(res.error ?? "Ocurrió un error");
      else setNotice(successMsg);
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={pending}
          onClick={() => run(generatePlanPdfAction, "PDF generado.")}
        >
          {pending ? "Generando…" : "Generar PDF"}
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={pending}
          onClick={() =>
            run(sendPlanWhatsAppAction, `Encolado para enviar por WhatsApp a ${patientPhone}.`)
          }
        >
          {pending ? "Enviando…" : "Enviar por WhatsApp"}
        </Button>
        <span className="text-xs text-ink-faint">
          {hasPdf ? `Último PDF: ${pdfGeneratedAtLabel}` : "Todavía no generaste el PDF."}
        </span>
      </div>
      {error ? <p className="reveal text-sm text-red-600">{error}</p> : null}
      {notice ? <p className="reveal text-sm font-medium text-leaf-deep">✓ {notice}</p> : null}
    </div>
  );
}
