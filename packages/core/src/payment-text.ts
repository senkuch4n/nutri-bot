// HU-017b-3 (SDD 4.1 de 017b-3). Glosario de Pagos en palabras simples (D11).

export const PAYMENT_TEXT = {
  kind: { FULL: "Pago completo", DEPOSIT: "Seña" },
  status: { APPROVED: "Cobrado", PENDING: "Esperando pago" },
  /** "manual" → "Efectivo o transferencia"; cualquier otro proveedor → "Mercado Pago". */
  provider: (p: string): string => (p === "manual" ? "Efectivo o transferencia" : "Mercado Pago"),
  /** `Cobrado en ${month}` ("Cobrado en octubre"). */
  collectedIn: (month: string): string => `Cobrado en ${month}`,
  pendingDeposits: "Señas esperando pago",
  count: "Cantidad de pagos",
  /** `Pago registrado: ${amount} de ${patient}`. */
  registered: (amount: string, patient: string): string => `Pago registrado: ${amount} de ${patient}`,
  noAppointments: "No hay turnos para asociar. Tiene que haber un turno de la última semana o de la próxima.",
} as const;
