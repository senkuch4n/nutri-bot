"use server";

// HU-029b (§B.6.2): acciones de Ajustes → Suscripción. Puertas de §B.6.7: requireSubscriptionOwnerContext
// (OWNER operativa u OWNER en onboarding de HU-026) para start/continue/cancel y requireSubscriptionReadContext
// para el polling. El consultorio sale siempre del contexto del servidor; del navegador solo llegan el planId
// y el email de la cuenta de MP. El email nunca vuelve en la respuesta ni va a logs.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { normalizePayerEmail, type SubscriptionStatusValue } from "@nutri-bot/core";
import {
  cancelTenantSubscription,
  refreshTenantSubscription,
  resumePendingCheckout,
  startTenantSubscription,
  type StartSubscriptionError,
} from "@nutri-bot/db/domain";
import { TenantAccessError, requireSubscriptionOwnerContext, requireSubscriptionReadContext } from "@/lib/tenant-context";

const SCREEN = "/ajustes/suscripcion";

/** Solo URLs https de Mercado Pago (fail closed): nunca redirigir a otro host aunque el dominio lo devuelva. */
function isMercadoPagoUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  return ["mercadopago.com.ar", "mercadopago.com"].some((d) => host === d || host.endsWith(`.${d}`));
}

async function ownerContext() {
  return requireSubscriptionOwnerContext().catch((error: unknown) => {
    if (error instanceof TenantAccessError) return null;
    throw error;
  });
}

/** P1/P3/P8: empezar (o "Empezar de nuevo") la suscripción y mandar a la persona al checkout de MP. */
export async function startSubscriptionAction(input: {
  planId: string;
  restart?: boolean;
  payerEmail: string;
}): Promise<{ error: StartSubscriptionError | "forbidden" }> {
  const ctx = await ownerContext();
  if (!ctx) return { error: "forbidden" };
  const email = normalizePayerEmail(input?.payerEmail);
  if (!email.ok) return { error: "invalid_payer_email" };
  const planId = typeof input?.planId === "string" ? input.planId : "";

  const result = await startTenantSubscription(
    { tenantId: ctx.tenantId },
    { userId: ctx.userId },
    { planId, restart: input.restart === true, payerEmail: email.email },
  );
  if (!result.ok) {
    if (input.restart) revalidatePath(SCREEN);
    return { error: result.error };
  }
  if (!isMercadoPagoUrl(result.checkoutUrl)) return { error: "mp_unavailable" };
  redirect(result.checkoutUrl); // fuera de todo try/catch: tira NEXT_REDIRECT
}

/** P3: "Continuar en Mercado Pago" (recrea el checkout si la prueba ya perdió más de 1 h, §B.5.4b). */
export async function continueCheckoutAction(): Promise<{
  error: "not_found" | "not_available" | "already_subscribed" | "forbidden" | "mp_unavailable";
}> {
  const ctx = await ownerContext();
  if (!ctx) return { error: "forbidden" };
  const result = await resumePendingCheckout({ tenantId: ctx.tenantId }, { userId: ctx.userId });
  if (!result.ok) {
    revalidatePath(SCREEN);
    return { error: result.error };
  }
  if (!isMercadoPagoUrl(result.checkoutUrl)) return { error: "mp_unavailable" };
  redirect(result.checkoutUrl);
}

/** P4–P7: cancelar (con confirmación en el cliente). Solo pasa a CANCELED si MP lo confirma. */
export async function cancelSubscriptionAction(): Promise<
  { ok: true } | { error: "not_available" | "nothing_to_cancel" | "mp_unavailable" | "cancel_unconfirmed" | "forbidden" }
> {
  const ctx = await ownerContext();
  if (!ctx) return { error: "forbidden" };
  const result = await cancelTenantSubscription({ tenantId: ctx.tenantId }, { userId: ctx.userId });
  if (!result.ok) return { error: result.error };
  revalidatePath(SCREEN);
  return { ok: true };
}

/** P2 (polling cada 3 s, también STAFF): solo lectura de hechos; el dominio limita a una consulta cada 3 s. */
export async function refreshSubscriptionAction(): Promise<{ status: SubscriptionStatusValue | null; authorized: boolean }> {
  const ctx = await requireSubscriptionReadContext().catch((error: unknown) => {
    if (error instanceof TenantAccessError) return null;
    throw error;
  });
  if (!ctx) return { status: null, authorized: false };
  const { status, authorized } = await refreshTenantSubscription({ tenantId: ctx.tenantId });
  return { status, authorized };
}
