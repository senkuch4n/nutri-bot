import { describe, expect, it } from "vitest";
import { pricesMessage } from "./messages";
import { PAYMENT_METHODS } from "./payment-methods";
import { reasonForAlert } from "./booking-reason";
import { formatDateTime, formatPrice } from "./format";
import * as messages from "./messages";

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

const startsAt = new Date("2026-10-12T13:00:00Z");
const tz = "America/Argentina/Buenos_Aires";
const currency = "ARS";

const base = { serviceName: "Primera consulta", startsAt, price: 25000, tz, currency };
const fecha = formatDateTime(startsAt, tz);
const precio = formatPrice(25000, currency);
const confirmToday = `Confirmás este turno?\n\n📋 *Primera consulta*\n🗓️ ${fecha} hs\n💲 ${precio}\n\nRespondé *sí* para confirmar o *no* para cancelar.`;

const alertBase = {
  patientName: "Ana Pérez",
  patientPhone: "5490000000031",
  serviceName: "Primera consulta",
  startsAt,
  tz,
};
const alertToday = `🔔 Ana Pérez sacó un turno de Primera consulta para el ${fecha} hs.`;

describe("confirmBooking (HU-013)", () => {
  it("sin motivo es idéntico al texto de antes", () => {
    expect(messages.confirmBooking(base)).toBe(confirmToday);
    expect(messages.confirmBooking({ ...base, reason: null })).toBe(confirmToday);
    expect(messages.confirmBooking({ ...base, reason: "" })).toBe(confirmToday);
  });

  it("con motivo suma la línea después del precio", () => {
    const out = messages.confirmBooking({ ...base, reason: "Quiero bajar de peso, tengo hipotiroidismo" });
    expect(out).toContain(
      `\n💲 ${precio}\n📝 Motivo: Quiero bajar de peso, tengo hipotiroidismo\n\nRespondé`,
    );
  });
});

describe("professionalNewBookingAlert (HU-013)", () => {
  it("sin motivo es idéntico al texto de antes", () => {
    expect(messages.professionalNewBookingAlert(alertBase)).toBe(alertToday);
    expect(messages.professionalNewBookingAlert({ ...alertBase, reason: null })).toBe(alertToday);
    expect(messages.professionalNewBookingAlert({ ...alertBase, reason: "" })).toBe(alertToday);
  });

  it("con motivo corto suma la línea", () => {
    expect(messages.professionalNewBookingAlert({ ...alertBase, reason: "Control" })).toBe(
      `${alertToday}\n📝 Motivo: Control`,
    );
  });

  it("con motivo largo lo recorta", () => {
    const reason = "x".repeat(300);
    const out = messages.professionalNewBookingAlert({ ...alertBase, reason });
    expect(out).toContain(reasonForAlert(reason));
    expect(out).toContain("(completo en el panel)");
    expect(out).not.toContain(reason);
  });
});

describe("textos nuevos de HU-013", () => {
  it("mencionan *saltear* donde corresponde", () => {
    expect(messages.ASK_BOOKING_REASON).toContain("*saltear*");
    expect(messages.BOOKING_REASON_TOO_SHORT).toContain("*saltear*");
    expect(messages.BOOKING_REASON_TEXT_ONLY).toContain("*saltear*");
    expect(messages.BOOKING_REASON_TOO_LONG).toContain("resumís");
  });
});

describe("slotTakenKeepReason (HU-013)", () => {
  it("avisa que se ocupó, que el motivo quedó guardado y ofrece los días", () => {
    const out = messages.slotTakenKeepReason([{ label: "Lunes 12/10" }, { label: "Martes 13/10" }]);
    expect(out.startsWith("Ese horario se acaba de ocupar.")).toBe(true);
    expect(out).toContain("Tu motivo quedó guardado");
    expect(out).toContain(messages.askDay([{ label: "Lunes 12/10" }, { label: "Martes 13/10" }]));
  });
});
