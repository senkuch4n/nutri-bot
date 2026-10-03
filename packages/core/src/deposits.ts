export type DepositKind = "FIXED" | "PERCENT";

/** Monto de la seña según el precio del servicio, redondeado a 2 decimales. */
export function computeDepositAmount(price: number, kind: DepositKind, value: number): number {
  if (!Number.isFinite(price) || !Number.isFinite(value) || price <= 0 || value <= 0) return 0;
  if (kind !== "FIXED" && kind !== "PERCENT") return 0;
  if (kind === "PERCENT" && value > 100) return 0;
  const amount = kind === "FIXED" ? Math.min(price, value) : (price * value) / 100;
  return Math.round(amount * 100) / 100;
}
