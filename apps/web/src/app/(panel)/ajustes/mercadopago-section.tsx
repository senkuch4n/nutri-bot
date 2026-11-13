"use client";

import { useEffect, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, m, useReducedMotionConfig } from "motion/react";
import { MERCADOPAGO_TEXT as T, type MercadoPagoCallbackResult } from "@nutri-bot/core";
import { useConfirm } from "@/components/confirm";
import { Alert, Button } from "@/components/ui";
import { fades } from "@/lib/motion";
import { notify } from "@/lib/notify";
import { replaceUrlInRouter } from "@/lib/patient-tab-route";
import { connectMercadoPagoAction, disconnectMercadoPagoAction } from "./actions";

// HU-023: piezas cliente de Ajustes → Mercado Pago. Solo reciben lo de MercadoPagoConnectionView
// (sin tokens).

function SubmitButton({ label, variant, disabled }: { label: string; variant: "primary" | "secondary"; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} loading={pending} disabled={disabled}>
      {label}
    </Button>
  );
}

/** "Conectar Mercado Pago" / "Reconectar": server action que manda a Mercado Pago a autorizar la app. */
export function MercadoPagoConnectButton({
  reconnect = false,
  variant = "primary",
  disabled = false,
}: {
  reconnect?: boolean;
  variant?: "primary" | "secondary";
  disabled?: boolean;
}) {
  return (
    <form action={connectMercadoPagoAction}>
      <SubmitButton label={reconnect ? T.reconnect : T.connect} variant={variant} disabled={disabled} />
    </form>
  );
}

/** "Desconectar" con confirmación (D7: solo advierte las señas pendientes, no bloquea). */
export function MercadoPagoDisconnectButton({ pendingDepositCount }: { pendingDepositCount: number }) {
  const confirm = useConfirm();
  const [pending, start] = useTransition();

  async function handleClick() {
    if (pending) return;
    const ok = await confirm({
      title: T.disconnectTitle,
      description:
        T.disconnectDescription + (pendingDepositCount > 0 ? ` ${T.disconnectPending(pendingDepositCount)}` : ""),
      confirmLabel: T.disconnect,
      destructive: true,
    });
    if (!ok) return;
    start(async () => {
      try {
        await disconnectMercadoPagoAction();
      } catch {
        notify.error();
      }
    });
  }

  return (
    <Button type="button" variant="plain" loading={pending} onClick={handleClick}>
      {T.disconnect}
    </Button>
  );
}

const BANNER_MS = 8_000;

function isCallbackResult(value: string | null): value is MercadoPagoCallbackResult {
  return value !== null && Object.prototype.hasOwnProperty.call(T.callback, value);
}

/** Resultado de la vuelta de Mercado Pago (`?mp=`). Saca `mp` de la URL enseguida (sin ida al servidor)
 *  para que recargar no lo repita, y se oculta solo a los 8 s. */
export function MercadoPagoCallbackBanner() {
  const param = useSearchParams().get("mp");
  const [result, setResult] = useState<MercadoPagoCallbackResult | null>(null);
  const reduced = Boolean(useReducedMotionConfig());

  useEffect(() => {
    if (!isCallbackResult(param)) return;
    setResult(param);
    const url = new URL(window.location.href);
    url.searchParams.delete("mp");
    replaceUrlInRouter(url.toString());
  }, [param]);

  useEffect(() => {
    if (!result) return;
    const timer = window.setTimeout(() => setResult(null), BANNER_MS);
    return () => window.clearTimeout(timer);
  }, [result]);

  const tone = result === "connected" ? "success" : result === "denied" ? "warning" : "danger";

  return (
    <AnimatePresence initial={false}>
      {result ? (
        <m.div
          key={result}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={reduced ? { duration: 0 } : fades.fast}
        >
          <Alert tone={tone}>
            <p>{T.callback[result]}</p>
          </Alert>
        </m.div>
      ) : null}
    </AnimatePresence>
  );
}
