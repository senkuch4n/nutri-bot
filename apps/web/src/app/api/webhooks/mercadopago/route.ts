import { after, NextResponse } from "next/server";
import { parseMercadoPagoNotificationUserId } from "@nutri-bot/core";
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
        // HU-028a: la cuenta sale del user_id del cuerpo (la firma ya se verificó). El cuerpo nunca se loguea.
        let notifiedUserId: string | null = null;
        if (req.method === "POST" && req.body) {
          const body: unknown = await req.json().catch(() => null);
          const bodyType = (body as { type?: unknown } | null)?.type;
          if (!query.type && typeof bodyType === "string") query.type = bodyType;
          notifiedUserId = parseMercadoPagoNotificationUserId(body);
        }
        await handleMercadoPagoWebhook(query, { userId: notifiedUserId });
      } catch {
        console.error("Error procesando webhook de Mercado Pago después de responder; la conciliación periódica queda como respaldo");
      }
    });
  }
  return NextResponse.json({ ok: true });
}

export const POST = handle;
export const GET = handle;
