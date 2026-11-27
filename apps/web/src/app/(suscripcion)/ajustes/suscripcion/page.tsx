import { getTenantSubscriptionView } from "@nutri-bot/db/domain";
import { auth } from "@/auth";
import { requireSubscriptionPageContext } from "@/lib/tenant-context";
import { SubscriptionScreen } from "./subscription-screen";
import { buildScreenModel } from "./subscription-model";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * HU-029b (§B.6.1): Ajustes → Suscripción, fuera del layout del panel (grupo `(suscripcion)`, §B.6.7) para
 * que la OWNER en onboarding (HU-026) pueda suscribirse. `?mp=volver` solo cambia la UI (P2): no sincroniza
 * ni lee `preapproval_id` de la URL; el estado sale de consultar MP en el servidor.
 */
export default async function SubscriptionPage({ searchParams }: { searchParams: Promise<{ mp?: string | string[] }> }) {
  const sctx = await requireSubscriptionPageContext();
  const [params, view] = await Promise.all([
    searchParams,
    getTenantSubscriptionView({ tenantId: sctx.tenantId }, { userId: sctx.userId }),
  ]);
  // El email precargado (G3, D8a) solo para la OWNER: a STAFF nunca le llega el de la titular.
  const loginEmail = sctx.isOwner ? ((await auth())?.user?.email ?? null) : null;
  const model = buildScreenModel({
    view,
    isOwner: sctx.isOwner,
    returning: params.mp === "volver",
    loginEmail,
    timeZone: sctx.timeZone,
    now: new Date(),
  });
  return <SubscriptionScreen model={model} onboarding={sctx.onboarding} />;
}
