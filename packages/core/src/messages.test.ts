import { describe, expect, it } from "vitest";
import { pricesMessage } from "./messages";
import { PAYMENT_METHODS } from "./payment-methods";

describe("pricesMessage", () => {
  it.each([undefined, null, "", "OSDE, IOMA"])(
    "includes payment methods with insurances %s",
    (insurances) => {
      const message = pricesMessage("Consulta: $ 25.000", insurances);

      expect(message).toContain("Consulta: $ 25.000");
      expect(message).toContain("💳 Medios de pago:");
      expect(message).toContain("Tarjeta de débito");
      expect(message).toContain("Tarjeta de crédito");
      expect(message).toContain("únicamente en 1 cuota con 10% de interés");
      for (const method of PAYMENT_METHODS) {
        expect(message).toContain(`• ${method}`);
      }
      expect(message).toContain("Escribí *menú* para volver.");
      if (insurances) {
        expect(message).toContain("🏥 Obras sociales:\n• OSDE\n• IOMA");
      } else {
        expect(message).not.toContain("🏥 Obras sociales:");
      }
    },
  );
});
