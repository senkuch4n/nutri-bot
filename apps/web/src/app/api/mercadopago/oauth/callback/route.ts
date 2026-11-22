import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { completeMercadoPagoOAuth } from "@nutri-bot/db/domain";
import { auth } from "@/auth";
import { TenantAccessError, requireTenantContext } from "@/lib/tenant-context";

// HU-023: vuelta del OAuth de Mercado Pago (aplicación "Numa"). El middleware ya exige acceso; el
// contexto de acá es la segunda barrera (HU-025: membresía vigente en lugar de la lista de emails). El
// `state` se sigue atando al email de la sesión (HU-028 lo generaliza). Nunca se loguea el query (trae el `code`).
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  // Detrás de Caddy, req.url puede traer el host interno: la base pública es AUTH_URL.
  const base = process.env.AUTH_URL?.trim() || req.url;
  const toInicio = () => NextResponse.redirect(new URL("/inicio", base), 303);
  const ctx = await requireTenantContext("write").catch((error: unknown) => {
    if (error instanceof TenantAccessError) return null;
    throw error;
  });
  if (!ctx) return toInicio();
  const email = (await auth())?.user?.email?.trim().toLowerCase();
  if (!email) return toInicio();

  const result = await completeMercadoPagoOAuth({ sessionEmail: email, query: new URL(req.url).searchParams })
    .catch(() => {
      // No registrar la excepción ni el query: pueden contener detalles sensibles.
      console.error("[mercadopago] oauth_callback_failed");
      return "rejected" as const;
    });
  if (result === "connected") {
    revalidatePath("/ajustes");
    revalidatePath("/servicios");
  }
  return NextResponse.redirect(new URL(`/ajustes?tab=mercadopago&mp=${result}`, base), 303);
}
