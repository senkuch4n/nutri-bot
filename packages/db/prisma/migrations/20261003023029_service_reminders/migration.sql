-- DropIndex
DROP INDEX "OutboundMessage_appointmentId_kind_key";

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "bookedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "OutboundMessage" ADD COLUMN     "dedupeKey" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "reminders" JSONB NOT NULL DEFAULT '[{"amount":3,"unit":"DAYS","asksConfirmation":true},{"amount":24,"unit":"HOURS","asksConfirmation":false}]';

-- CreateIndex
CREATE UNIQUE INDEX "OutboundMessage_appointmentId_kind_dedupeKey_key" ON "OutboundMessage"("appointmentId", "kind", "dedupeKey");


-- ── HU-014: backfill (agregado a mano) ────────────────────────────────────────────────────────
-- 1) Cada servicio (activo o no) queda como hoy: pedido de confirmación 3 días antes + recordatorio
--    `reminderLeadHours` antes. Si reminderLeadHours = 72 quedaría duplicado con los 3 días: queda
--    solo el que pide confirmar. Sin fila de Professional (base nueva) vale el DEFAULT de la columna.
UPDATE "Service" s
SET "reminders" = CASE
  WHEN p."reminderLeadHours" = 72 THEN
    '[{"amount":3,"unit":"DAYS","asksConfirmation":true}]'::jsonb
  WHEN p."reminderLeadHours" > 72 THEN jsonb_build_array(
    jsonb_build_object('amount', p."reminderLeadHours", 'unit', 'HOURS', 'asksConfirmation', false),
    jsonb_build_object('amount', 3, 'unit', 'DAYS', 'asksConfirmation', true))
  ELSE jsonb_build_array(
    jsonb_build_object('amount', 3, 'unit', 'DAYS', 'asksConfirmation', true),
    jsonb_build_object('amount', p."reminderLeadHours", 'unit', 'HOURS', 'asksConfirmation', false))
END
FROM "Professional" p
WHERE p."id" = 1;

-- 2) Los REMINDER ya encolados (automáticos o del botón, hoy indistinguibles) cuentan como el
--    recordatorio automático de `reminderLeadHours`: así ningún turno lo vuelve a recibir.
--    Los CONFIRMATION_REQUEST ya encolados no necesitan nada: quedan con dedupeKey '' y el código
--    nuevo considera enviado el pedido de confirmación si existe cualquier fila CONFIRMATION_REQUEST
--    del turno o si `confirmationRequestedAt` no es null.
UPDATE "OutboundMessage"
SET "dedupeKey" = 'auto:' || COALESCE((SELECT "reminderLeadHours" FROM "Professional" WHERE "id" = 1), 24) || 'h'
WHERE "kind" = 'REMINDER' AND "appointmentId" IS NOT NULL;

-- 3) Reserva en firme de los turnos existentes: createdAt, o la aprobación de la seña si es posterior.
--    Los AWAITING_PAYMENT quedan en NULL (se sella al aprobarse el pago).
UPDATE "Appointment" a
SET "bookedAt" = GREATEST(a."createdAt", COALESCE((
  SELECT MIN(p."paidAt") FROM "Payment" p
  WHERE p."appointmentId" = a."id" AND p."kind" = 'DEPOSIT' AND p."status" = 'APPROVED'
), a."createdAt"))
WHERE a."status" <> 'AWAITING_PAYMENT';
