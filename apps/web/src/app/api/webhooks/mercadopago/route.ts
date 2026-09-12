import { NextResponse } from "next/server";
import { handleMercadoPagoWebhook } from "@nutri-bot/db/domain";

/**
 * Mercado Pago manda el tipo de evento y el id del pago como query params
 * en la notification_url (tanto en el formato nuevo `type`/`data.id` como
 * en el legacy `topic`/`id`), sin importar el método HTTP.
 */
async function handle(req: Request) {
  const query = Object.fromEntries(new URL(req.url).searchParams);
  try {
    await handleMercadoPagoWebhook(query);
  } catch (err) {
    console.error("Error procesando webhook de Mercado Pago", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export const POST = handle;
export const GET = handle;
