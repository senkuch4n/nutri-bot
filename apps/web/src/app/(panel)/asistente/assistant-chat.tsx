"use client";

import { useState, useTransition } from "react";
import { Button, Textarea } from "@/components/ui";
import { askAssistantAction, type AssistantMessage } from "./actions";

export function AssistantChat() {
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

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
    <div className="space-y-4">
      <div className="min-h-[120px] space-y-3">
        {messages.length === 0 ? (
          <p className="text-sm text-ink-faint">
            Preguntame por tu agenda, un paciente puntual o la facturación. Ej: &quot;¿qué turnos
            tengo mañana?&quot; o &quot;contame de Ricardo&quot;.
          </p>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "text-right" : "text-left"}>
              <p
                className={
                  "inline-block max-w-[85%] whitespace-pre-wrap rounded px-3 py-2 text-left text-sm " +
                  (m.role === "user" ? "bg-ink text-white" : "border border-line bg-paper text-ink")
                }
              >
                {m.content}
              </p>
            </div>
          ))
        )}
        {pending ? <p className="text-sm text-ink-faint">Pensando…</p> : null}
      </div>

      <div className="flex items-end gap-3">
        <Textarea
          rows={2}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Escribí tu pregunta…"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              ask();
            }
          }}
        />
        <Button type="button" onClick={ask} disabled={pending}>
          Preguntar
        </Button>
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
