"use client";

import { useRef, useState } from "react";
import { Send } from "lucide-react";
import { OUTBOX_TEXT } from "@nutri-bot/core";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/primitives/alert-dialog";
import { Button, FormError, Textarea } from "@/components/ui";
import { useDeferredDelete } from "@/lib/deferred-delete";
import { notify } from "@/lib/notify";
import { broadcastMessageAction, type BroadcastState } from "./actions";

const T = OUTBOX_TEXT;
type BroadcastAction = (prev: BroadcastState, formData: FormData) => Promise<BroadcastState>;

/**
 * Comunicado a todas las pacientes (D13, D14): "Revisar y enviar" → vista previa con la burbuja →
 * "Enviar a N pacientes" → toast con "Deshacer" durante 8 s. Nada se encola durante el plazo; recién
 * al vencer corre la action. "Deshacer" devuelve el texto al campo. Mientras está pendiente o
 * enviándose, el navegador avisa al cerrar o recargar (y si igual se cierra, no se manda).
 *
 * `sendAction` es opcional y se define siempre **del lado cliente** (la demo de /dev-diseno, Q18):
 * nunca se pasa una función desde un componente de servidor.
 */
export function BroadcastForm({
  patientCount,
  sendAction = broadcastMessageAction,
}: {
  patientCount: number;
  sendAction?: BroadcastAction;
}) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const deferred = useDeferredDelete();
  const disabled = patientCount === 0;

  function review() {
    const text = body.trim();
    if (text.length < 3) {
      setError(T.emptyBody);
      textareaRef.current?.focus();
      return;
    }
    setError(null);
    setPreviewOpen(true);
  }

  function send() {
    const text = body.trim();
    const n = patientCount;
    setPreviewOpen(false);
    setBody(""); // el campo se vacía al programar; "Deshacer" lo devuelve
    const fd = new FormData();
    fd.set("body", text);
    let sent = n;
    deferred({
      key: `broadcast:${crypto.randomUUID()}`,
      message: T.scheduled(n),
      undoneMessage: T.undone,
      guardUnload: true,
      errorMessage: T.error,
      commit: async () => {
        const r = await sendAction({ ok: false }, fd);
        if (r.ok) sent = r.sent ?? n;
        // Si no se pudo, el texto vuelve al campo (si no escribió otra cosa mientras tanto).
        else setBody((current) => (current === "" ? text : current));
        return { ok: r.ok, error: r.error };
      },
      onCommitted: () => notify.saved(T.committed(sent)),
      onUndone: () => {
        setBody((current) => (current === "" ? text : current));
        textareaRef.current?.focus();
      },
    });
  }

  return (
    <div className="rounded-xl bg-card p-4 shadow-card more-contrast:border more-contrast:border-input sm:p-5">
      <label htmlFor="comunicado-texto" className="sr-only">
        {T.fieldLabel}
      </label>
      <Textarea
        ref={textareaRef}
        id="comunicado-texto"
        name="body"
        rows={3}
        maxLength={1000}
        value={body}
        onChange={(e) => {
          setBody(e.target.value);
          if (error) setError(null);
        }}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? "comunicado-error comunicado-alcance" : "comunicado-alcance"}
        placeholder={T.placeholder}
        className="text-body"
      />
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p id="comunicado-alcance" className="text-subheadline text-muted-foreground">
          {disabled ? T.noRecipients : `${T.reach(patientCount)}.`}
        </p>
        <Button type="button" size="lg" onClick={review} disabled={disabled}>
          <Send aria-hidden />
          {T.review}
        </Button>
      </div>
      <div id="comunicado-error">
        <FormError message={error} />
      </div>

      <AlertDialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <AlertDialogContent
          onOpenAutoFocus={(e) => {
            // El botón seguro tiene el foco.
            e.preventDefault();
            backRef.current?.focus();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>{T.previewTitle}</AlertDialogTitle>
            <AlertDialogDescription>{T.reach(patientCount)}.</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="rounded-xl bg-secondary p-3">
            <p className="ml-auto w-fit max-w-[90%] whitespace-pre-wrap break-words rounded-2xl rounded-tr-sm bg-success-muted px-3.5 py-2 text-body text-foreground shadow-card">
              {body.trim()}
            </p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel ref={backRef}>{T.backToEdit}</AlertDialogCancel>
            <AlertDialogAction onClick={send}>
              <Send aria-hidden />
              {T.send(patientCount)}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
