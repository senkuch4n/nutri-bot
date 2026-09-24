"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { LoaderCircle, Send, Sparkles } from "lucide-react";
import { Button, EmptyState, FormError, Textarea, cn } from "@/components/ui";
import { askAssistantAction, type AssistantMessage } from "./actions";

export function AssistantChat() {
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const endRef = useRef<HTMLDivElement>(null);

  // La conversación scrollea sola al último mensaje (y al "Pensando…").
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, pending]);

  function ask() {
    const q = question.trim();
    if (!q || pending) return;
    setError(null);
    setQuestion("");
    startTransition(async () => {
      const res = await askAssistantAction(messages, q);
      setMessages(res.messages);
      if (!res.ok) setError(res.error ?? "Ocurrió un error");
    });
  }

  return (
    <div>
      <div aria-live="polite" className="max-h-[calc(100vh-20rem)] min-h-48 space-y-3 overflow-y-auto p-6">
        {messages.length === 0 ? (
          <EmptyState
            icon={Sparkles}
            title="Preguntale al asistente"
            description='Preguntame por tu agenda, un paciente puntual o la facturación. Ej: "¿qué turnos tengo mañana?" o "contame de Ricardo".'
          />
        ) : (
          messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "text-right" : "text-left"}>
              <p
                className={cn(
                  "inline-block max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-left text-sm",
                  m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
                )}
              >
                {m.content}
              </p>
            </div>
          ))
        )}
        {pending ? (
          <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
            Pensando…
          </p>
        ) : null}
        <div ref={endRef} />
      </div>

      <div className="border-t p-4">
        <div className="flex items-end gap-3">
          <Textarea
            rows={2}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Escribí tu pregunta…"
            aria-label="Pregunta"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                ask();
              }
            }}
          />
          <Button type="button" onClick={ask} loading={pending}>
            {pending ? null : <Send aria-hidden />}
            Preguntar
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Enter envía · Shift + Enter hace un salto de línea</p>
        {error ? (
          <div className="mt-2">
            <FormError message={error} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
