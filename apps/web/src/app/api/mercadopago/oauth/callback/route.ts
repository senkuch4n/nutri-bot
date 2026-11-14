import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { completeMercadoPagoOAuth } from "@nutri-bot/db/domain";
import { auth } from "@/auth";
import { allowedEmails } from "@/auth.config";

// HU-023: vuelta del OAuth de Mercado Pago (aplicación "Numa"). El middleware ya exige sesión; el
// auth() de acá es la segunda barrera. Nunca se loguea el query (trae el `code`).
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  // Detrás de Caddy, req.url puede traer el host interno: la base pública es AUTH_URL.
  const base = process.env.AUTH_URL?.trim() || req.url;
  const session = await auth();
  const email = session?.user?.email?.trim().toLowerCase();
  if (!email || !allowedEmails.includes(email)) {
    return NextResponse.redirect(new URL("/inicio", base), 303);
  }

  const result = await completeMercadoPagoOAuth({ sessionEmail: email, query: new URL(req.url).searchParams });
  if (result === "connected") {
    revalidatePath("/ajustes");
    revalidatePath("/servicios");
  }
  return NextResponse.redirect(new URL(`/ajustes?tab=mercadopago&mp=${result}`, base), 303);
}
