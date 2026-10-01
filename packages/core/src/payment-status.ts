export function mapMercadoPagoStatus(status: string | undefined) {
  switch (status) {
    case "approved": return "APPROVED";
    case "rejected": return "REJECTED";
    case "cancelled":
    case "refunded":
    case "charged_back": return "CANCELLED";
    default: return "PENDING";
  }
}
