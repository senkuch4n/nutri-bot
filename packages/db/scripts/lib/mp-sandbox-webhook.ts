/**
 * HU-029 · 029a (SDD §A.4, subcomando `listen`; supuestos S6 y S7): análisis de cada request que
 * llega al receptor local (webhooks de MP y la vuelta del `back_url`). Devuelve el registro SIN
 * redactar: quien lo guarda o imprime lo pasa por `redactMercadoPagoResource`.
 */
import { verifyMercadoPagoSignature } from "../../domain/mercadopago-signature";

export type WebhookDataIds = { query: string | null; body: string | null };

export type WebhookRecord = {
  method: string;
  path: string;
  query: Record<string, string>;
  headers: { "x-signature": string | null; "x-request-id": string | null; "content-type": string | null };
  body: unknown;
  /** Nombres terminados en _id para que la redacción los acorte. */
  query_data_id: string | null;
  body_data_id: string | null;
  signature: {
    present: boolean;
    /** null = no había data.id de ese lado para probar. */
    valid_with_query_id: boolean | null;
    valid_with_body_id: boolean | null;
    valid_with: "query" | "body" | "none";
  };
  /** S7: la vuelta del checkout trae `?preapproval_id=`. */
  back_url_preapproval_id: boolean;
};

function idValue(value: unknown): string | null {
  if (typeof value === "string" && value) return value;
  if (typeof value === "number") return String(value);
  return null;
}

/** `data.id` (o `id`, formato viejo `?id=&topic=`) de la query y del cuerpo. */
export function extractWebhookDataIds(query: URLSearchParams, body: unknown): WebhookDataIds {
  const fromQuery = query.get("data.id") || query.get("id") || null;
  let fromBody: string | null = null;
  if (body !== null && typeof body === "object") {
    const b = body as { data?: { id?: unknown }; id?: unknown };
    fromBody = idValue(b.data?.id) ?? idValue(b.id);
  }
  return { query: fromQuery, body: fromBody };
}

function header(headers: Record<string, string | string[] | undefined>, name: string): string | null {
  const value = headers[name];
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function parseBody(rawBody: string): unknown {
  if (!rawBody) return null;
  try {
    return JSON.parse(rawBody);
  } catch {
    return rawBody;
  }
}

export function analyzeWebhookRequest(params: {
  method: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
  rawBody: string;
  secret: string;
}): WebhookRecord {
  const url = new URL(params.url, "http://localhost");
  const body = parseBody(params.rawBody);
  const dataId = extractWebhookDataIds(url.searchParams, body);
  const signature = header(params.headers, "x-signature");
  const requestId = header(params.headers, "x-request-id");
  const check = (id: string | null) =>
    id === null ? null : verifyMercadoPagoSignature({ signature, requestId, dataId: id, secret: params.secret });
  const withQuery = check(dataId.query);
  const withBody = check(dataId.body);
  return {
    method: params.method,
    path: url.pathname,
    query: Object.fromEntries(url.searchParams.entries()),
    headers: {
      "x-signature": signature,
      "x-request-id": requestId,
      "content-type": header(params.headers, "content-type"),
    },
    body,
    query_data_id: dataId.query,
    body_data_id: dataId.body,
    signature: {
      present: signature !== null,
      valid_with_query_id: withQuery,
      valid_with_body_id: withBody,
      valid_with: withQuery ? "query" : withBody ? "body" : "none",
    },
    back_url_preapproval_id: url.searchParams.has("preapproval_id"),
  };
}
