import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyMercadoPagoSignature(params: {
  signature: string | null;
  requestId: string | null;
  dataId: string | null;
  secret: string;
}): boolean {
  if (!params.secret || !params.signature) return false;
  const parts = params.signature.split(",").map((part) => part.trim().split("="));
  const timestamps = parts.filter(([key]) => key === "ts");
  const hashes = parts.filter(([key]) => key === "v1");
  if (timestamps.length !== 1 || hashes.length !== 1) return false;
  const ts = timestamps[0]?.[1];
  const hash = hashes[0]?.[1];
  if (!ts || !/^\d+$/.test(ts) || !hash || !/^[a-f\d]{64}$/i.test(hash)) return false;
  const manifest = (params.dataId ? `id:${params.dataId.toLowerCase()};` : "")
    + (params.requestId ? `request-id:${params.requestId};` : "") + `ts:${ts};`;
  const expected = createHmac("sha256", params.secret).update(manifest).digest();
  return timingSafeEqual(expected, Buffer.from(hash, "hex"));
}
