// HU-029b (§B.6.4): de la vista del dominio al modelo de la pantalla. Puro: las fechas se formatean acá (en
// el servidor, con la zona del consultorio) y la pantalla cliente solo pinta strings. Nunca recibe ids ni
// URLs de Mercado Pago; el email solo viaja si quien mira es la OWNER (P10 nunca lo ve).
import { SUBSCRIPTION_TEXT as T, computeTrialEnd, formatDate, type SubscriptionStatusValue } from "@nutri-bot/core";
import type { TenantSubscriptionView } from "@nutri-bot/db/domain";

export type PlanOption = {
  planId: string;
  name: string;
  priceText: string;
  /** offerTrial(...) si la prueba es elegible; si no, offerNoTrial(...). */
  offerText: string;
  trialEligible: boolean;
  isDefault: boolean;
};

export type ScreenState =
  | { kind: "unavailable" }
  /** P1 (sin suscripción) y P8 (cancelada: `canceledText` + `resubscribe`). */
  | { kind: "offer"; plans: PlanOption[]; canceledText: string | null }
  | { kind: "confirming" } // P2
  | { kind: "pending_checkout"; planId: string } // P3
  | { kind: "awaiting_first_charge" } // P4
  | { kind: "trialing"; text: string; cancelDescription: string } // P5
  | { kind: "active"; text: string; cancelDescription: string } // P6
  | { kind: "past_due"; text: string; cancelDescription: string }; // P7

export type ScreenModel = {
  state: ScreenState;
  /** Tarjeta de estado: título corto ("En prueba") y detalle ("Plan mensual · $ 60.000 por mes"). */
  statusTitle: string;
  statusDetail: string | null;
  status: SubscriptionStatusValue | null;
  isOwner: boolean;
  /** Solo OWNER: precargado del campo "Email de tu cuenta de Mercado Pago". "" para STAFF. */
  defaultPayerEmail: string;
};

export function buildScreenModel(input: {
  view: TenantSubscriptionView;
  isOwner: boolean;
  returning: boolean;
  loginEmail: string | null;
  timeZone: string;
  now: Date;
}): ScreenModel {
  const { view, isOwner, returning, timeZone, now } = input;
  const date = (d: Date | null) => (d ? formatDate(d, timeZone) : "");
  const sub = view.subscription;
  const defaultPayerEmail = isOwner ? (sub?.checkoutPayerEmail ?? input.loginEmail ?? "") : "";
  const base = { isOwner, defaultPayerEmail };

  if (view.availability !== "enabled") {
    return { ...base, state: { kind: "unavailable" }, statusTitle: T.unavailableShort, statusDetail: null, status: null };
  }

  const plans: PlanOption[] = view.plans.map((p) => ({
    planId: p.planId,
    name: p.name,
    priceText: p.priceText,
    trialEligible: p.trialEligible,
    isDefault: p.isDefault,
    offerText:
      p.trialEligible && p.trialText
        ? T.offerTrial(p.trialText, p.priceText, date(computeTrialEnd(now, p.trialLength, p.trialUnit)))
        : T.offerNoTrial(p.priceText),
  }));

  if (!sub) {
    return { ...base, state: { kind: "offer", plans, canceledText: null }, statusTitle: T.summaryNone, statusDetail: null, status: null };
  }

  const detail = `${sub.planName} · ${sub.priceText}`;
  const statusOf = (state: ScreenState): ScreenModel => ({
    ...base,
    state,
    statusTitle: T.summary[sub.status],
    statusDetail: detail,
    status: sub.status,
  });

  switch (sub.status) {
    case "CANCELED": {
      // Un checkout abandonado (nunca autorizado) no es una baja: se ofrece como si no hubiera suscripción.
      if (!sub.authorized) {
        return { ...base, state: { kind: "offer", plans, canceledText: null }, statusTitle: T.summaryNone, statusDetail: null, status: null };
      }
      const canceledText =
        sub.cancelOrigin === "MERCADO_PAGO" ? T.canceledByMercadoPago(date(sub.canceledAt)) : T.canceled(date(sub.canceledAt));
      return statusOf({ kind: "offer", plans, canceledText });
    }
    case "PENDING":
      if (returning) return statusOf({ kind: "confirming" });
      return sub.authorized ? statusOf({ kind: "awaiting_first_charge" }) : statusOf({ kind: "pending_checkout", planId: sub.planId });
    case "TRIALING": {
      const trialEnd = date(sub.trialEndsAt);
      return statusOf({
        kind: "trialing",
        text: T.trialing(trialEnd, sub.priceText, date(sub.nextPaymentDate ?? sub.trialEndsAt)),
        cancelDescription: T.cancelConfirmTrial(trialEnd),
      });
    }
    case "ACTIVE":
      // 029c suma "Pagado hasta" (cancelConfirmActive con paidUntil).
      return statusOf({ kind: "active", text: T.active(sub.priceText, date(sub.nextPaymentDate)), cancelDescription: T.cancelConfirmPlain });
    case "PAST_DUE":
      // 029c trae el motivo real del cobro rechazado.
      return statusOf({ kind: "past_due", text: T.pastDue(T.summary.PAST_DUE.toLowerCase()), cancelDescription: T.cancelConfirmPlain });
  }
}
