import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyMercadoPagoSignature } from "./mercadopago-signature";

const secret = "isolated-test-secret";
function signature(manifest: string) {
  return `ts=1704908010,v1=${createHmac("sha256", secret).update(manifest).digest("hex")}`;
}
describe("webhook signature", () => {
  const params = { secret, requestId: "request-1", dataId: "ABC123", signature: signature("id:abc123;request-id:request-1;ts:1704908010;") };
  it("validates the official manifest and lowercases the URL id", () => {
    expect(verifyMercadoPagoSignature(params)).toBe(true);
  });
  it("omits absent optional manifest fields", () => {
    expect(verifyMercadoPagoSignature({ secret, dataId: null, requestId: null, signature: signature("ts:1704908010;") })).toBe(true);
  });
  it.each([{ dataId: "different" }, { requestId: "different" }, { secret: "wrong" }, { signature: null }, { signature: "ts=1,v1=bad" }, { signature: `${params.signature},ts=2` }])("rejects altered or malformed inputs %j", (change) => {
    expect(verifyMercadoPagoSignature({ ...params, ...change })).toBe(false);
  });
});
