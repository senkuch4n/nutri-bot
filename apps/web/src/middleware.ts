import { NextResponse, type NextRequest } from "next/server";
import type { Session } from "next-auth";
import { loadAccessFacts } from "@nutri-bot/db/domain";
import { auth } from "@/auth";
import { createOnboardingAccessAdapter } from "@/lib/onboarding-access-adapter";
import { loadOnboardedClinic } from "@/lib/onboarding-server";
import { getTenantSubscriptionGate } from "@/lib/onboarding-subscription-gate";
import { ENABLED_TENANT_IDS } from "@/lib/tenant-context";

// HU-025 (6.3 de la SDD, opción A): puerta central por request, en runtime Node (Prisma). En cada
// request del matcher se lee la membresía en la base: revocarla corta la siguiente página, ruta API o
// server action sin esperar a que venza la sesión. El tenant no se lee nunca de la request.

const unauthorized = () => NextResponse.json({ error: "unauthorized" }, { status: 401 });

/** Server action: POST con el header `next-action` (lo pone el runtime de React/Next). */
function isServerAction(req: NextRequest) {
  return req.headers.has("next-action");
}

export async function panelGate(req: NextRequest & { auth: Session | null }): Promise<Response> {
  const { pathname } = req.nextUrl;
  const isApi = pathname === "/api" || pathname.startsWith("/api/");
  // 025b-2 (6.3): una server action sin acceso pasa al handler. Todas empiezan con requireTenantContext /
  // requireOwnerContext (lo verifica guard-coverage.test.ts), que falla cerrado: devuelve el error genérico
  // con `reauth` y la UI manda a /inicio (HU 4.2), en lugar de un 401 que el cliente de React no muestra.
  // Las rutas /api/* siguen con 401 y las páginas con redirect.
  const deny = () =>
    isApi ? unauthorized() : isServerAction(req) ? NextResponse.next() : NextResponse.redirect(new URL("/inicio", req.nextUrl));

  const userId = req.auth?.userId;
  if (!userId) return deny();

  const access = await createOnboardingAccessAdapter({
    readSession: async () => ({ userId }),
    loadAccessFacts: (uid) => loadAccessFacts(uid, new Date()),
    existingEnabledTenantIds: ENABLED_TENANT_IDS,
    loadOnboardedClinic,
    getTenantSubscriptionGate,
  }).resolve();
  if (access.kind !== "operational") {
    const reason =
      access.kind === "denied"
        ? access.reason
        : access.kind === "setup"
          ? "onboarding_setup"
          : "onboarding_pending";
    console.warn(`[auth] access_denied reason=${reason}`);
    return deny();
  }
  return NextResponse.next();
}

export default auth(panelGate);

export const config = {
  runtime: "nodejs",
  // /portal no usa el login de Google: cada página valida la sesión del paciente (patient-session.ts).
  matcher: ["/((?!numa-logo\\.png$|opengraph-image\\.png$|icon\\.png$|apple-icon\\.png$|api/webhooks/mercadopago$|api/auth|login|inicio|acerca|privacidad|portal|_next/static|_next/image|favicon.ico).*)"],
};
