"use client";

import { useState, useTransition } from "react";
import { FileDown, Send } from "lucide-react";
import { Button, FormError } from "@/components/ui";
import { notify } from "@/lib/notify";
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
  const [running, setRunning] = useState<"pdf" | "whatsapp" | null>(null);

  function run(
    kind: "pdf" | "whatsapp",
    action: (id: string) => Promise<{ ok: boolean; error?: string }>,
    onSuccess: () => void,
  ) {
    setError(null);
    setRunning(kind);
    startTransition(async () => {
      const res = await action(planId);
      if (!res.ok) setError(res.error ?? "Ocurrió un error");
      else onSuccess();
      setRunning(null);
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={pending}
          loading={pending && running === "pdf"}
          onClick={() => run("pdf", generatePlanPdfAction, () => notify.saved("PDF generado"))}
        >
          {pending && running === "pdf" ? null : <FileDown aria-hidden />}
          {pending && running === "pdf" ? "Generando…" : "Generar PDF"}
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={pending}
          loading={pending && running === "whatsapp"}
          onClick={() =>
            run("whatsapp", sendPlanWhatsAppAction, () =>
              notify.info(`Encolado para enviar por WhatsApp a ${patientPhone}.`),
            )
          }
        >
          {pending && running === "whatsapp" ? null : <Send aria-hidden />}
          {pending && running === "whatsapp" ? "Enviando…" : "Enviar por WhatsApp"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {hasPdf ? `Último PDF: ${pdfGeneratedAtLabel}` : "Todavía no generaste el PDF."}
      </p>
      <FormError message={error} />
    </div>
  );
}
