// HU-012: tools de SOLO LECTURA de la IA del bot. Especificación neutral (sin tipos de ningún SDK)
// y armado puro de sus resultados. Ninguna tool recibe un id de paciente: lo pone el bot.
import { formatClock, isWithinAfterHours, type AfterHoursConfig } from "./after-hours";
import { computeDepositAmount } from "./deposits";
import { formatDate, formatDateTime, formatPrice, formatTime } from "./format";
import { formatInsuranceList } from "./messages";
import { dayKeyInTz } from "./time";

export type BotAiToolName = "servicios" | "disponibilidad" | "mis_turnos" | "datos_consultorio";

/** Especificación NEUTRAL (sin tipos de ningún SDK). Cada adapter la traduce a su formato. */
export type BotAiToolSpec = {
  name: BotAiToolName;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, { type: "string"; description: string }>;
    /** = todas las keys de properties. */
    required: string[];
    additionalProperties: false;
  };
};

export const BOT_AI_TOOLS: readonly BotAiToolSpec[] = [
  {
    name: "servicios",
    description:
      "Lista los servicios activos del consultorio con id, nombre, descripción, precio, duración, seña (si pide) e instrucciones de preparación.",
    inputSchema: { type: "object", properties: {}, required: [], additionalProperties: false },
  },
  {
    name: "disponibilidad",
    description:
      "Próximos días (hasta 3 semanas) con horarios libres para un servicio. Solo informa: no reserva.",
    inputSchema: {
      type: "object",
      properties: {
        servicio: {
          type: "string",
          description: "id del servicio (de la herramienta servicios) o su nombre exacto",
        },
      },
      required: ["servicio"],
      additionalProperties: false,
    },
  },
  {
    name: "mis_turnos",
    description:
      "Próximos turnos de la persona que escribe (servicio, fecha y hora, estado). No incluye turnos de otras personas.",
    inputSchema: { type: "object", properties: {}, required: [], additionalProperties: false },
  },
  {
    name: "datos_consultorio",
    description:
      "Datos del consultorio: nutricionista, obras sociales, moneda, horario en que la nutricionista responde mensajes, si ahora es fuera de ese horario e información adicional cargada por ella.",
    inputSchema: { type: "object", properties: {}, required: [], additionalProperties: false },
  },
];

export type AiServiceItem = {
  id: string;
  nombre: string;
  descripcion: string | null;
  /** formatPrice(price, currency): "$ 25.000". */
  precio: string;
  duracionMin: number;
  /** Seña formateada si el servicio la pide; si no null. */
  sena: string | null;
  preparacion: string | null;
};

export function servicesForAi(
  services: {
    id: string;
    name: string;
    description: string | null;
    price: string | number;
    durationMin: number;
    requiresDeposit: boolean;
    depositKind: "FIXED" | "PERCENT" | null;
    depositValue: string | number | null;
    prepInstructions: string | null;
  }[],
  currency: string,
): AiServiceItem[] {
  return services.map((s) => {
    const price = Number(s.price);
    const sena =
      s.requiresDeposit && s.depositKind && s.depositValue !== null && s.depositValue !== ""
        ? formatPrice(computeDepositAmount(price, s.depositKind, Number(s.depositValue)), currency)
        : null;
    return {
      id: s.id,
      nombre: s.name,
      descripcion: s.description?.trim() || null,
      precio: formatPrice(price, currency),
      duracionMin: s.durationMin,
      sena,
      preparacion: s.prepInstructions?.trim() || null,
    };
  });
}

/** Agrupa por día en tz. Máx. `maxDays` (6) días y `maxSlotsPerDay` (8) horarios por día (los primeros). */
export function availabilityForAi(p: {
  serviceName: string;
  slots: Date[];
  tz: string;
  maxDays?: number;
  maxSlotsPerDay?: number;
}): { servicio: string; dias: { dia: string; horarios: string[] }[]; sinLugar: boolean } {
  const maxDays = p.maxDays ?? 6;
  const maxSlots = p.maxSlotsPerDay ?? 8;
  const sorted = [...p.slots].sort((a, b) => a.getTime() - b.getTime());
  const byDay = new Map<string, Date[]>();
  for (const slot of sorted) {
    const key = dayKeyInTz(slot, p.tz);
    const list = byDay.get(key);
    if (list) list.push(slot);
    else byDay.set(key, [slot]);
  }
  const dias = [...byDay.values()].slice(0, maxDays).map((list) => ({
    dia: formatDate(list[0]!, p.tz),
    horarios: list.slice(0, maxSlots).map((d) => formatTime(d, p.tz)),
  }));
  return { servicio: p.serviceName, dias, sinLugar: dias.length === 0 };
}

export function appointmentsForAi(
  appts: { serviceName: string; startsAt: Date; status: "CONFIRMED" | "AWAITING_PAYMENT" }[],
  tz: string,
): {
  servicio: string;
  fechaHora: string;
  estado: "confirmado" | "reservado, esperando el pago de la seña";
}[] {
  return appts.map((a) => ({
    servicio: a.serviceName,
    fechaHora: formatDateTime(a.startsAt, tz),
    estado: a.status === "CONFIRMED" ? "confirmado" : "reservado, esperando el pago de la seña",
  }));
}

export function clinicInfoForAi(p: {
  professionalName: string;
  title: string | null;
  acceptedInsurances: string | null;
  currency: string;
  afterHours: AfterHoursConfig;
  tz: string;
  now: Date;
  extraInfo: string | null;
}): {
  nutricionista: string;
  obrasSociales: string[];
  moneda: string;
  horarioMensajes: string | null;
  ahoraFueraDeHorario: boolean;
  informacionAdicional: string | null;
} {
  const title = p.title?.trim();
  return {
    nutricionista: title ? `${title} ${p.professionalName}` : p.professionalName,
    obrasSociales: formatInsuranceList(p.acceptedInsurances),
    moneda: p.currency,
    horarioMensajes: p.afterHours.enabled
      ? `de ${formatClock(p.afterHours.end)} a ${formatClock(p.afterHours.start)}`
      : null,
    ahoraFueraDeHorario: isWithinAfterHours(p.now, p.afterHours, p.tz),
    informacionAdicional: p.extraInfo?.trim() || null,
  };
}
