import "server-only";
export {
  createAppointment,
  cancelAppointment,
  setAppointmentStatus,
  SlotUnavailableError,
  updateAppointmentReason,
  InvalidBookingReasonError,
} from "@nutri-bot/db/domain";
