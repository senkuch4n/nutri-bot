import { describe, expect, it } from "vitest";
import { mapMercadoPagoStatus } from "./payment-status";

describe("Mercado Pago status", () => {
  it.each([
    ["approved", "APPROVED"], ["rejected", "REJECTED"],
    ["cancelled", "CANCELLED"], ["refunded", "CANCELLED"],
    ["charged_back", "CANCELLED"], ["pending", "PENDING"],
    ["in_process", "PENDING"], ["authorized", "PENDING"],
    ["in_mediation", "PENDING"], [undefined, "PENDING"],
  ])("maps %s to %s", (status, expected) => {
    expect(mapMercadoPagoStatus(status)).toBe(expected);
  });
});
