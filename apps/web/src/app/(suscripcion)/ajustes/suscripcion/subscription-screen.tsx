"use client";

// HU-029b (§B.6.4): Ajustes → Suscripción. Pinta el modelo que arma el servidor (subscription-model.ts):
// P1–P9 para la OWNER (operativa o en onboarding de HU-026) y P10 (solo lectura, sin botones, radio ni email)
// para STAFF. Nunca muestra ids de MP ni datos de tarjeta; el checkout de MP lo abre la acción con redirect.
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, CircleDashed, CircleSlash, Clock, CreditCard, TriangleAlert, type LucideIcon } from "lucide-react";
import { SUBSCRIPTION_TEXT as T, type SubscriptionStatusValue } from "@nutri-bot/core";
import { AutoRefresh } from "@/components/auto-refresh";
import { useConfirm } from "@/components/confirm";
import { Alert, Button, EmptyState, PageHeader } from "@/components/ui";
import { notify } from "@/lib/notify";
import {
  cancelSubscriptionAction,
  continueCheckoutAction,
  startSubscriptionAction,
} from "./actions";
import { PayerEmailField } from "./payer-email-field";
import { PlanOptionCard } from "./plan-option-card";
import { SubscriptionConfirming } from "./subscription-confirming";
import type { PlanOption, ScreenModel } from "./subscription-model";

/** Respaldo de S14 (sin enlace verificado de gestión del comprador). */
const MERCADO_PAGO_HOME = "https://www.mercadopago.com.ar/";

type ErrorCode = keyof typeof T.errors;
const errorText = (code: string) => T.errors[code as ErrorCode] ?? T.errors.mp_unavailable;
/** Foco al campo cuando la acción rechaza el email (después de que se vuelva a habilitar). */
const focusEmail = (id: string) => requestAnimationFrame(() => document.getElementById(id)?.focus());
const isEmailError = (code: string) => code === "invalid_payer_email" || code === "payer_email_rejected";

const STATUS_ICON: Record<SubscriptionStatusValue | "none", { icon: LucideIcon; className: string }> = {
  none: { icon: CircleDashed, className: "text-muted-foreground" },
  PENDING: { icon: Clock, className: "text-warning" },
  TRIALING: { icon: CircleCheck, className: "text-success" },
  ACTIVE: { icon: CircleCheck, className: "text-success" },
  PAST_DUE: { icon: TriangleAlert, className: "text-warning" },
  CANCELED: { icon: CircleSlash, className: "text-muted-foreground" },
};

export function SubscriptionScreen({ model, onboarding }: { model: ScreenModel; onboarding: boolean }) {
  const back = onboarding ? { href: "/inicio", label: "Inicio" } : { href: "/ajustes?tab=suscripcion", label: "Ajustes" };
  const { state } = model;

  return (
    <div className="max-w-3xl">
      <PageHeader title={T.title} back={back} />
      {state.kind === "unavailable" ? (
        <div className="rounded-xl bg-card shadow-card more-contrast:border more-contrast:border-input">
          <EmptyState icon={CreditCard} title={T.unavailable} />
        </div>
      ) : (
        <div className="space-y-6">
          <StatusCard model={model} />
          <StateBody model={model} />
          {!model.isOwner ? <p className="text-callout text-muted-foreground">{T.staffOnly}</p> : null}
        </div>
      )}
    </div>
  );
}

function StatusCard({ model }: { model: ScreenModel }) {
  const { icon: Icon, className } = STATUS_ICON[model.status ?? "none"];
  return (
    <div className="flex items-center gap-3 rounded-xl bg-card px-5 py-4 shadow-card more-contrast:border more-contrast:border-input">
      <Icon className={`size-8 shrink-0 ${className}`} strokeWidth={1.75} aria-hidden />
      <div className="min-w-0">
        <p className="text-title-3">{model.statusTitle}</p>
        {model.statusDetail ? <p className="text-callout tabular-nums text-muted-foreground">{model.statusDetail}</p> : null}
      </div>
    </div>
  );
}

function StateBody({ model }: { model: ScreenModel }) {
  const { state, isOwner } = model;
  switch (state.kind) {
    case "unavailable":
      return null;
    case "offer":
      return (
        <div className="space-y-6">
          {state.canceledText ? <p className="text-body">{state.canceledText}</p> : null}
          {isOwner ? (
            <StartForm plans={state.plans} defaultPayerEmail={model.defaultPayerEmail} resubscribe={state.canceledText !== null} />
          ) : null}
        </div>
      );
    case "confirming":
      return <SubscriptionConfirming />;
    case "pending_checkout":
      return (
        <div className="space-y-6">
          <p className="text-body">{T.pendingCheckout}</p>
          {isOwner ? <PendingCheckoutActions planId={state.planId} defaultPayerEmail={model.defaultPayerEmail} /> : null}
        </div>
      );
    case "awaiting_first_charge":
      return (
        <div className="space-y-6">
          <CappedAutoRefresh seconds={10} maxSeconds={120} />
          <p className="text-body">{T.awaitingFirstCharge}</p>
          {isOwner ? <CancelButton description={T.cancelConfirmPlain} /> : null}
        </div>
      );
    case "trialing":
    case "active":
      return (
        <div className="space-y-6">
          <p className="text-body">{state.text}</p>
          {isOwner ? <CancelButton description={state.cancelDescription} /> : null}
        </div>
      );
    case "past_due":
      return (
        <div className="space-y-6">
          <Alert tone="warning">{state.text}</Alert>
          {isOwner ? (
            <div className="flex flex-wrap gap-3">
              <a
                href={MERCADO_PAGO_HOME}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-callout font-semibold text-primary-foreground transition-opacity duration-hover hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {T.goToMercadoPago}
              </a>
              <CancelButton description={state.cancelDescription} />
            </div>
          ) : null}
        </div>
      );
  }
}

/** P4: AutoRefresh con tope (no refresca para siempre si MP tarda en informar el primer cobro). */
function CappedAutoRefresh({ seconds, maxSeconds }: { seconds: number; maxSeconds: number }) {
  const [enabled, setEnabled] = useState(true);
  useEffect(() => {
    const id = setTimeout(() => setEnabled(false), maxSeconds * 1000);
    return () => clearTimeout(id);
  }, [maxSeconds]);
  return <AutoRefresh seconds={seconds} enabled={enabled} />;
}

/** P1 / P8: planes + email de MP + botón. */
function StartForm({
  plans,
  defaultPayerEmail,
  resubscribe,
}: {
  plans: PlanOption[];
  defaultPayerEmail: string;
  resubscribe: boolean;
}) {
  const [planId, setPlanId] = useState(() => (plans.find((p) => p.isDefault) ?? plans[0])?.planId ?? "");
  const [email, setEmail] = useState(defaultPayerEmail);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const selected = plans.find((p) => p.planId === planId) ?? null;

  if (plans.length === 0) return <p className="text-body text-muted-foreground">{T.errors.plan_not_offered}</p>;

  const label = resubscribe ? T.resubscribe : selected?.trialEligible ? T.startTrial : T.subscribe;
  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setEmailError(null);
    startTransition(async () => {
      const result = await startSubscriptionAction({ planId, payerEmail: email });
      // Si salió bien, la acción redirige a Mercado Pago y no vuelve acá.
      if (result?.error) {
        if (isEmailError(result.error)) {
          setEmailError(errorText(result.error));
          focusEmail("payer-email-start");
        }
        notify.error(errorText(result.error));
      }
    });
  };

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      {plans.length > 1 ? (
        <fieldset className="space-y-3">
          <legend className="sr-only">{T.title}</legend>
          {plans.map((p) => (
            <PlanOptionCard key={p.planId} plan={p} checked={p.planId === planId} onSelect={setPlanId} />
          ))}
        </fieldset>
      ) : (
        <div className="rounded-xl bg-card px-4 py-3.5 shadow-card more-contrast:border more-contrast:border-input">
          <p className="text-headline">{plans[0]!.name}</p>
          <p className="text-callout tabular-nums text-muted-foreground">{plans[0]!.priceText}</p>
        </div>
      )}
      {selected ? <p className="text-body">{selected.offerText}</p> : null}
      <PayerEmailField id="payer-email-start" value={email} onChange={setEmail} error={emailError} disabled={pending} />
      <Button type="submit" size="lg" loading={pending} disabled={!planId}>
        {label}
      </Button>
    </form>
  );
}

/** P3: continuar el checkout guardado o empezar de nuevo (con otro email si se equivocó). */
function PendingCheckoutActions({ planId, defaultPayerEmail }: { planId: string; defaultPayerEmail: string }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [email, setEmail] = useState(defaultPayerEmail);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"continue" | "restart" | null>(null);
  const [, startTransition] = useTransition();

  const run = (kind: "continue" | "restart", action: () => Promise<{ error?: string } | undefined>) => {
    setBusy(kind);
    setEmailError(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (result?.error) {
          if (isEmailError(result.error)) {
            setEmailError(errorText(result.error));
            focusEmail("payer-email-restart");
          }
          notify.error(errorText(result.error));
          router.refresh();
        }
      } finally {
        setBusy(null);
      }
    });
  };

  const restart = async () => {
    const ok = await confirm({
      title: T.restartConfirmTitle,
      description: T.restartConfirmDescription,
      confirmLabel: T.restart,
      cancelLabel: T.cancelBack,
      destructive: false,
    });
    if (ok) run("restart", () => startSubscriptionAction({ planId, restart: true, payerEmail: email }));
  };

  return (
    <div className="space-y-6">
      <Button size="lg" loading={busy === "continue"} disabled={busy !== null} onClick={() => run("continue", () => continueCheckoutAction())}>
        {T.continueCheckout}
      </Button>
      <div className="space-y-4 border-t border-border pt-6">
        <PayerEmailField id="payer-email-restart" value={email} onChange={setEmail} error={emailError} hint={T.restartEmailHelp} disabled={busy !== null} />
        <Button variant="secondary" loading={busy === "restart"} disabled={busy !== null} onClick={restart}>
          {T.restart}
        </Button>
      </div>
    </div>
  );
}

/** M1: cancelar con confirmación. Solo pasa a CANCELED si MP lo confirma (si no, toast con el error). */
function CancelButton({ description }: { description: string }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, startTransition] = useTransition();
  const onClick = async () => {
    const ok = await confirm({
      title: T.cancelConfirmTitle,
      description,
      confirmLabel: T.cancelYes,
      cancelLabel: T.cancelBack,
      destructive: true,
    });
    if (!ok) return;
    startTransition(async () => {
      const result = await cancelSubscriptionAction();
      if ("error" in result) notify.error(errorText(result.error));
      router.refresh();
    });
  };
  return (
    <Button variant="danger" loading={pending} onClick={onClick}>
      {T.cancel}
    </Button>
  );
}
