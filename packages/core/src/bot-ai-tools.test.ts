import { describe, expect, it } from "vitest";
import {
  BOT_AI_TOOLS,
  appointmentsForAi,
  availabilityForAi,
  clinicInfoForAi,
  servicesForAi,
} from "./bot-ai-tools";
import { formatPrice } from "./format";
import { PAYMENT_METHODS } from "./payment-methods";

const BA = "America/Argentina/Buenos_Aires";

describe("BOT_AI_TOOLS", () => {
  it("las 4 tools con schema estricto y sin ids de paciente", () => {
    expect(BOT_AI_TOOLS.map((t) => t.name)).toEqual([
      "servicios",
      "disponibilidad",
      "mis_turnos",
      "datos_consultorio",
    ]);
    for (const t of BOT_AI_TOOLS) {
      expect(t.inputSchema.type).toBe("object");
      expect(t.inputSchema.additionalProperties).toBe(false);
      expect([...t.inputSchema.required].sort()).toEqual(Object.keys(t.inputSchema.properties).sort());
      for (const key of Object.keys(t.inputSchema.properties)) {
        expect(["patientId", "paciente", "telefono"]).not.toContain(key);
      }
      expect(t.description.length).toBeGreaterThan(20);
    }
    expect(BOT_AI_TOOLS[1]!.inputSchema.required).toEqual(["servicio"]);
  });
});

const baseService = {
  id: "s1",
  name: "Antropometría",
  description: "Medición ISAK",
  price: 25000,
  durationMin: 45,
  requiresDeposit: false,
  depositKind: null,
  depositValue: null,
  prepInstructions: "Ir en ayunas.",
} as const;

describe("servicesForAi", () => {
  it("formatea precio y seña", () => {
    const [plain] = servicesForAi([{ ...baseService }], "ARS");
    expect(plain).toEqual({
      id: "s1",
      nombre: "Antropometría",
      descripcion: "Medición ISAK",
      precio: formatPrice(25000, "ARS"),
      duracionMin: 45,
      sena: null,
      preparacion: "Ir en ayunas.",
    });
    expect(plain!.precio).toContain("25.000");

    const [withDeposit] = servicesForAi(
      [{ ...baseService, price: "25000", requiresDeposit: true, depositKind: "PERCENT", depositValue: "30" }],
      "ARS",
    );
    expect(withDeposit!.sena).toBe(formatPrice(7500, "ARS"));
    expect(withDeposit!.sena).toContain("7.500");
  });

  it("sin preparación ni descripción → null", () => {
    const [s] = servicesForAi([{ ...baseService, prepInstructions: null, description: "  " }], "ARS");
    expect(s!.preparacion).toBeNull();
    expect(s!.descripcion).toBeNull();
  });
});

describe("availabilityForAi", () => {
  it("agrupa por día en la tz y acota días y horarios", () => {
    const slots: Date[] = [];
    // 9 días: el primero con 12 slots, el resto con 1
    for (let h = 0; h < 12; h++) slots.push(new Date(Date.UTC(2026, 9, 8, 12, h * 15)));
    for (let d = 1; d < 9; d++) slots.push(new Date(Date.UTC(2026, 9, 8 + d, 13, 0)));
    const r = availabilityForAi({ serviceName: "Antropometría", slots, tz: BA });
    expect(r.servicio).toBe("Antropometría");
    expect(r.sinLugar).toBe(false);
    expect(r.dias).toHaveLength(6);
    expect(r.dias[0]!.dia).toBe("jueves 8 de octubre");
    expect(r.dias[0]!.horarios).toHaveLength(8);
    expect(r.dias[0]!.horarios[0]).toBe("09:00");
    expect(r.dias[1]!.horarios).toEqual(["10:00"]); // 13:00Z → 10:00 en BA
  });

  it("sin slots → sinLugar", () => {
    expect(availabilityForAi({ serviceName: "X", slots: [], tz: BA })).toEqual({
      servicio: "X",
      dias: [],
      sinLugar: true,
    });
  });
});

describe("appointmentsForAi", () => {
  it("fecha local y estado legible", () => {
    const r = appointmentsForAi(
      [
        { serviceName: "Antropometría", startsAt: new Date("2026-10-08T13:00:00Z"), status: "CONFIRMED" },
        { serviceName: "Consulta", startsAt: new Date("2026-10-09T13:00:00Z"), status: "AWAITING_PAYMENT" },
      ],
      BA,
    );
    expect(r[0]).toEqual({
      servicio: "Antropometría",
      fechaHora: "jueves 8 de octubre, 10:00",
      estado: "confirmado",
    });
    expect(r[1]!.estado).toBe("reservado, esperando el pago de la seña");
  });
});

describe("clinicInfoForAi", () => {
  const base = {
    professionalName: "Daiana Ponce",
    title: "Lic." as string | null,
    acceptedInsurances: "OSDE, Swiss Medical\nIOMA" as string | null,
    currency: "ARS",
    afterHours: { enabled: true, start: "22:00", end: "09:00" },
    tz: BA,
    now: new Date("2026-10-03T02:10:00Z"), // 23:10 BA
    extraInfo: "Av. Siempre Viva 123" as string | null,
  };

  it("arma los datos del consultorio", () => {
    expect(clinicInfoForAi(base)).toEqual({
      nutricionista: "Lic. Daiana Ponce",
      obrasSociales: ["OSDE", "Swiss Medical", "IOMA"],
      mediosDePago: PAYMENT_METHODS,
      moneda: "ARS",
      horarioMensajes: "de 9:00 a 22:00",
      ahoraFueraDeHorario: true,
      informacionAdicional: "Av. Siempre Viva 123",
    });
  });

  it("de día, sin título, franja apagada y sin info", () => {
    const day = clinicInfoForAi({ ...base, now: new Date("2026-10-02T15:00:00Z"), title: null });
    expect(day.nutricionista).toBe("Daiana Ponce");
    expect(day.ahoraFueraDeHorario).toBe(false);
    const off = clinicInfoForAi({ ...base, afterHours: { ...base.afterHours, enabled: false }, extraInfo: "  " });
    expect(off.horarioMensajes).toBeNull();
    expect(off.ahoraFueraDeHorario).toBe(false);
    expect(off.informacionAdicional).toBeNull();
  });
});
