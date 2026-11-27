import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { completeMercadoPagoOAuth } from "@nutri-bot/db/domain";
import { TenantAccessError, requireOwnerContext } from "@/lib/tenant-context";

// HU-023: vuelta del OAuth de Mercado Pago (aplicación "Numa"). El middleware ya exige acceso; el
// contexto de acá es la segunda barrera (HU-025: membresía vigente). HU-028a: solo el OWNER del
// consultorio completa la conexión, y el `state` se ata a su userId y al consultorio. Nunca se loguea
// el query (trae el `code`).
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  // Detrás de Caddy, req.url puede traer el host interno: la base pública es AUTH_URL.
  const base = process.env.AUTH_URL?.trim() || req.url;
  const toInicio = () => NextResponse.redirect(new URL("/inicio", base), 303);
  const toResult = (result: string) => NextResponse.redirect(new URL(`/ajustes?tab=mercadopago&mp=${result}`, base), 303);
  let ctx: Awaited<ReturnType<typeof requireOwnerContext>>;
  try {
    ctx = await requireOwnerContext();
  } catch (error) {
    if (!(error instanceof TenantAccessError)) throw error;
    // Un miembro que no es OWNER no canjea ni consume el state: mismo banner que un state inválido.
    return error.code === "owner_only" ? toResult("invalid_state") : toInicio();
  }

  const result = await completeMercadoPagoOAuth(ctx, { userId: ctx.userId, query: new URL(req.url).searchParams })
    .catch(() => {
      // No registrar la excepción ni el query: pueden contener detalles sensibles.
      console.error("[mercadopago] oauth_callback_failed");
      return "rejected" as const;
    });
  if (result === "connected") {
    revalidatePath("/ajustes");
    revalidatePath("/servicios");
  }
  return toResult(result);
}
