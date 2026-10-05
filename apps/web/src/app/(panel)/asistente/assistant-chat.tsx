"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { m, useReducedMotionConfig } from "motion/react";
import { Send, Sparkles } from "lucide-react";
import { Alert, Button, EmptyState, FormError, PageHeader, Textarea, cn } from "@/components/ui";
import { fades, springs } from "@/lib/motion";
import { DetailDisclosure } from "../pacientes/[id]/detail-disclosure";
import { askAssistantAction, type AssistantMessage } from "./actions";

const TEXT = {
  title: "Asistente",
  description: "Preguntale por tu agenda, tus pacientes o lo que cobraste.",
  newConversation: "Nueva conversación",
  emptyTitle: "¿En qué te ayudo?",
  thinking: "Pensando…",
  placeholder: "Escribí tu pregunta…",
  ask: "Preguntar",
  help: "Enter manda · Shift + Enter, salto de línea",
  disclaimer: "Responde una IA con tus datos. Revisá lo importante en la ficha.",
  error: "No pude responder. Probá de nuevo.",
  unavailable: "El asistente todavía no está disponible. Avisale a quien te instaló el sistema.",
  technicalDetail: "Ver detalle técnico",
  keyDetail: (name: string) => `Falta cargar la variable ${name} en el servidor.`,
  you: "Vos",
  assistant: "Asistente",
} as const;

/** "Contame de una paciente" no se manda: deja "Contame de " en el campo (HU §4.7). */
const SUGGESTIONS = [
  { label: "¿Qué turnos tengo mañana?", send: true },
  { label: "¿Cuánto cobré este mes?", send: true },
  { label: "Contame de una paciente", send: false, prefill: "Contame de " },
] as const;

const MAX_LINES = 5;

/**
 * Asistente (HU-017b-4, §4.7). La conversación vive en memoria (no se guarda en ningún lado). El mensaje
 * de la usuaria aparece al toque; "Pensando…" mientras responde; la respuesta entra con fundido y un
 * desplazamiento corto (con movimiento reducido, solo fundido). Si falla, la pregunta vuelve al campo.
 */
export function AssistantChat({ available, keyEnvName }: { available: boolean; keyEnvName: string }) {
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [asking, setAsking] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const reduced = Boolean(useReducedMotionConfig());
  const inFlight = useRef(false);
  // Cambia con "Nueva conversación": una respuesta que llega después se descarta.
  const conversation = useRef(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const [composerHeight, setComposerHeight] = useState(0);
  // Índice de la respuesta recién llegada: es la única que entra con movimiento.
  const [freshIndex, setFreshIndex] = useState(-1);

  const busy = pending || asking !== null;
  const hasConversation = messages.length > 0 || asking !== null;

  // El campo crece de 1 a 5 líneas.
  const resize = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    const style = window.getComputedStyle(el);
    const px = (v: string) => parseFloat(v) || 0;
    const borders = px(style.borderTopWidth) + px(style.borderBottomWidth);
    const padding = px(style.paddingTop) + px(style.paddingBottom);
    // border-box: alto = contenido + padding (scrollHeight) + bordes.
    const max = (px(style.lineHeight) || 22) * MAX_LINES + padding + borders;
    const wanted = el.scrollHeight + borders;
    el.style.height = `${Math.min(wanted, max)}px`;
    el.style.overflowY = wanted > max ? "auto" : "hidden";
  }, []);

  useLayoutEffect(resize, [question, resize]);

  // Alto del composer para el espaciador del celular (crece con el campo y con el error).
  useEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setComposerHeight(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // La conversación baja sola al último mensaje (y al "Pensando…").
  useLayoutEffect(() => {
    if (!hasConversation) return;
    // Al final de la página: el composer (fijo o sticky) queda debajo del último mensaje, sin taparlo.
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: reduced ? "auto" : "smooth" });
  }, [messages.length, asking, hasConversation, reduced]);

  function ask(text: string) {
    const q = text.trim();
    if (!q || inFlight.current || !available) return;
    inFlight.current = true;
    const id = conversation.current;
    const history = messages;
    setError(null);
    setQuestion("");
    setAsking(q);
    startTransition(async () => {
      let res: Awaited<ReturnType<typeof askAssistantAction>> | null = null;
      try {
        res = await askAssistantAction(history, q);
      } catch {
        res = null;
      }
      inFlight.current = false;
      if (id !== conversation.current) return;
      setAsking(null);
      if (res?.ok) {
        setMessages(res.messages);
        setFreshIndex(res.messages.length - 1);
      } else {
        setError(TEXT.error);
        // La pregunta vuelve al campo, salvo que ya haya escrito otra cosa.
        setQuestion((current) => (current.trim() === "" ? q : current));
        inputRef.current?.focus();
      }
    });
  }

  function reset() {
    conversation.current += 1;
    inFlight.current = false;
    setFreshIndex(-1);
    setMessages([]);
    setAsking(null);
    setError(null);
    setQuestion("");
    inputRef.current?.focus();
  }

  function pickSuggestion(s: (typeof SUGGESTIONS)[number]) {
    if (s.send) {
      ask(s.label);
      return;
    }
    setQuestion(s.prefill);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
  }

  const enter = reduced
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: fades.fast }
    : { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: springs.standard };

  return (
    // Desde 1024 px la columna llega al borde de abajo (sin el padding inferior del main) y el composer
    // queda pegado ahí con `sticky`; en el celular el composer es `fixed` y un espaciador del mismo alto
    // evita que tape el último mensaje.
    <div className="flex flex-col lg:-mb-8 lg:min-h-[calc(100dvh-2rem)]">
      <PageHeader
        title={TEXT.title}
        description={TEXT.description}
        action={
          hasConversation ? (
            <Button variant="plain" onClick={reset}>
              {TEXT.newConversation}
            </Button>
          ) : null
        }
      />

      {!available ? (
        <Alert tone="info" className="mb-6">
          <p>{TEXT.unavailable}</p>
          <DetailDisclosure label={TEXT.technicalDetail}>
            <p className="text-footnote text-muted-foreground">
              <code translate="no">{TEXT.keyDetail(keyEnvName)}</code>
            </p>
          </DetailDisclosure>
        </Alert>
      ) : null}

      <div role="log" aria-live="polite" aria-relevant="additions" className="flex-1 space-y-3 pb-4">
        {!hasConversation ? (
          <div className="rounded-xl bg-card shadow-card more-contrast:border more-contrast:border-input">
            <EmptyState icon={Sparkles} title={TEXT.emptyTitle} />
            <div className="flex flex-col gap-2 px-6 pb-6 sm:flex-row sm:flex-wrap sm:justify-center">
              {SUGGESTIONS.map((s) => (
                <Button
                  key={s.label}
                  type="button"
                  variant="tinted"
                  size="lg"
                  disabled={!available}
                  onClick={() => pickSuggestion(s)}
                  className="whitespace-normal text-center"
                >
                  {s.label}
                </Button>
              ))}
            </div>
          </div>
        ) : null}

        {messages.map((msg, i) => {
          const isUser = msg.role === "user";
          // El mensaje de la usuaria ya se vio mientras esperaba: solo anima la respuesta nueva.
          const animate = i === freshIndex && !isUser;
          return (
            <m.div
              key={i}
              className={cn("flex", isUser ? "justify-end" : "justify-start")}
              {...(animate ? enter : { initial: false })}
            >
              <Bubble role={msg.role}>{msg.content}</Bubble>
            </m.div>
          );
        })}

        {asking !== null ? (
          <>
            <div className="flex justify-end">
              <Bubble role="user">{asking}</Bubble>
            </div>
            <m.div className="flex justify-start" {...enter}>
              <p role="status" className="rounded-2xl rounded-bl-md bg-secondary px-4 py-2.5 text-callout text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <span aria-hidden className="inline-flex gap-1">
                    <span className="size-1.5 rounded-full bg-current motion-safe:animate-pulse" />
                    <span className="size-1.5 rounded-full bg-current motion-safe:animate-pulse [animation-delay:150ms]" />
                    <span className="size-1.5 rounded-full bg-current motion-safe:animate-pulse [animation-delay:300ms]" />
                  </span>
                  {TEXT.thinking}
                </span>
              </p>
            </m.div>
          </>
        ) : null}
      </div>

      {/* Composer: fijo abajo (material de barra) en el celular y en la compu. */}
      <div aria-hidden className="lg:hidden" style={{ height: composerHeight }} />
      <div
        ref={composerRef}
        className="material-bar fixed inset-x-0 bottom-0 z-20 border-t border-border px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 lg:sticky lg:inset-x-auto lg:-mx-2 lg:px-2"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask(question);
          }}
          className="flex items-end gap-2"
        >
          <Textarea
            ref={inputRef}
            rows={1}
            value={question}
            onChange={(e) => {
              setQuestion(e.target.value);
              if (error) setError(null);
            }}
            placeholder={TEXT.placeholder}
            aria-label="Pregunta"
            aria-describedby="asistente-ayuda asistente-aviso"
            disabled={!available}
            enterKeyHint="send"
            className="min-h-11 resize-none py-2.5 leading-[1.375rem]"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                ask(question);
              }
            }}
          />
          <Button type="submit" size="lg" loading={busy} disabled={!available}>
            {busy ? null : <Send aria-hidden />}
            {TEXT.ask}
          </Button>
        </form>
        {error ? (
          <div className="mt-2">
            <FormError message={error} />
          </div>
        ) : null}
        <p id="asistente-ayuda" className="mt-2 hidden text-footnote text-muted-foreground sm:block">
          {TEXT.help}
        </p>
        <p id="asistente-aviso" className="mt-1 text-footnote text-muted-foreground">
          {TEXT.disclaimer}
        </p>
      </div>
    </div>
  );
}

function Bubble({ role, children }: { role: AssistantMessage["role"]; children: string }) {
  const isUser = role === "user";
  return (
    <p
      className={cn(
        "max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-callout",
        isUser ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md bg-secondary text-foreground",
      )}
    >
      <span className="sr-only">{isUser ? `${TEXT.you}: ` : `${TEXT.assistant}: `}</span>
      {children}
    </p>
  );
}
