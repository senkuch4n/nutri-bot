import { describe, expect, it } from "vitest";
import { PAYMENT_TEXT } from "./payment-text";

describe("PAYMENT_TEXT", () => {
  it("glosario simple", () => {
    expect(PAYMENT_TEXT.kind).toEqual({ FULL: "Pago completo", DEPOSIT: "Seña" });
    expect(PAYMENT_TEXT.status).toEqual({ APPROVED: "Cobrado", PENDING: "Esperando pago" });
    expect(PAYMENT_TEXT.provider("manual")).toBe("Efectivo o transferencia");
    expect(PAYMENT_TEXT.provider("mercadopago")).toBe("Mercado Pago");
    expect(PAYMENT_TEXT.provider("otro")).toBe("Mercado Pago");
    expect(PAYMENT_TEXT.collectedIn("octubre")).toBe("Cobrado en octubre");
    expect(PAYMENT_TEXT.pendingDeposits).toBe("Señas esperando pago");
    expect(PAYMENT_TEXT.count).toBe("Cantidad de pagos");
  });

  it("registered", () => {
    expect(PAYMENT_TEXT.registered("$ 15.000", "Brenda Yebara")).toBe("Pago registrado: $ 15.000 de Brenda Yebara");
  });
});
