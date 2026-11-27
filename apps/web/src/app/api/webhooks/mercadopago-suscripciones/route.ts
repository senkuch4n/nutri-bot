import { after, NextResponse } from "next/server";
import { handleSubscriptionWebhook, verifyMercadoPagoSignature } from "@nutri-bot/db/domain";

// HU-029b (§B.6.5): notificaciones de la aplicación de Mercado Pago de Arzium (suscripciones). Sin sesión
// (el matcher del middleware lo excluye); la firma x-signature con ARZIUM_MERCADOPAGO_WEBHOOK_SECRET es la
// barrera. El cuerpo solo dice QUÉ consultar: handleSubscriptionWebhook consulta MP con el token de Arzium.
// Nunca loguea el cuerpo ni headers.

const DATA_ID = /^[A-Za-z0-9_-]{1,64}$/;

async function handle(req: Request) {
  const secret = process.env.ARZIUM_MERCADOPAGO_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "unconfigured" }, { status: 503 });

  const params = new URL(req.url).searchParams;
  const queryIds = params.getAll("data.id");
  const queryTopic = params.get("type") ?? params.get("topic");

  // El cuerpo se lee una sola vez, solo si hace falta (respaldo de data.id o del tópico).
  let body: Record<string, unknown> | null = null;
  if (req.method === "POST" && (queryIds.length === 0 || !queryTopic)) {
    const parsed: unknown = await req.json().catch(() => null);
    body = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  }
  const bodyData = body?.data && typeof body.data === "object" ? (body.data as Record<string, unknown>) : null;
  const bodyId = typeof bodyData?.id === "string" || typeof bodyData?.id === "number" ? String(bodyData.id) : null;
  const dataId = queryIds.length > 0 ? queryIds[0]! : bodyId;
  const requestId = req.headers.get("x-request-id");

  const invalid = () => NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  if (queryIds.length > 1 || !dataId || !DATA_ID.test(dataId)) return invalid();
  if (!verifyMercadoPagoSignature({ signature: req.headers.get("x-signature"), requestId, dataId, secret })) return invalid();

  const topic = queryTopic ?? (typeof body?.type === "string" ? body.type : null);
  after(async () => {
    try {
      await handleSubscriptionWebhook({ topic, resourceId: dataId, requestId });
    } catch {
      console.error("[subscriptions] webhook_failed");
    }
  });
  return NextResponse.json({ ok: true });
}

export const POST = handle;
export const GET = handle;
