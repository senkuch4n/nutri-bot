import { NextResponse, type NextRequest } from "next/server";
import type { Session } from "next-auth";
import { decideTenantAccess } from "@nutri-bot/core";
import { loadAccessFacts } from "@nutri-bot/db/domain";
import { auth } from "@/auth";
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
  // 025a: una server action sin acceso recibe 401 (025b la deja pasar al handler para el error genérico).
  const deny = () =>
    isApi || isServerAction(req) ? unauthorized() : NextResponse.redirect(new URL("/inicio", req.nextUrl));

  const userId = req.auth?.userId;
  if (!userId) return deny();

  const decision = decideTenantAccess(await loadAccessFacts(userId, new Date()), {
    enabledTenantIds: ENABLED_TENANT_IDS,
  });
  if (!decision.ok) {
    console.warn(`[auth] access_denied reason=${decision.reason}`);
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
