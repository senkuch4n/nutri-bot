import { after, NextResponse } from "next/server";
import { handleMercadoPagoWebhook, verifyMercadoPagoSignature } from "@nutri-bot/db/domain";

async function handle(req: Request) {
  const params = new URL(req.url).searchParams;
  // Acknowledge legacy retries without trusting or processing their payload.
  // Mixed requests containing data.id must still pass modern signature validation.
  if (!params.has("data.id") && params.getAll("topic").length === 1 &&
    params.get("topic") === "merchant_order" && params.getAll("id").length === 1 && params.get("id")?.trim()) {
    return NextResponse.json({ ok: true, ignored: "legacy_ipn" });
  }
  const dataId = params.get("data.id");
  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "unconfigured" }, { status: 503 });
  if (params.getAll("data.id").length > 1 || !verifyMercadoPagoSignature({
    signature: req.headers.get("x-signature"),
    requestId: req.headers.get("x-request-id"),
    dataId,
    secret,
  })) return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  const query = Object.fromEntries(params);
  if (dataId && /^\d+$/.test(dataId) && (!query.type || query.type === "payment")) {
    // Next.js retains the request lifecycle and starts this callback after sending the response.
    after(async () => {
      try {
        if (!query.type && req.method === "POST" && req.body) {
          const body = await req.json();
          if (typeof body?.type === "string") query.type = body.type;
        }
        await handleMercadoPagoWebhook(query);
      } catch {
        console.error("Error procesando webhook de Mercado Pago después de responder; la conciliación periódica queda como respaldo");
      }
    });
  }
  return NextResponse.json({ ok: true });
}

export const POST = handle;
export const GET = handle;
