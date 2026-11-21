BEGIN;

-- Requiere detener los lectores y escritores anteriores antes de aplicar.
-- El default genera un UUID también para cada fila existente; no se modifica su dueño ni su contenido.
ALTER TABLE "ConversationState"
  ADD COLUMN "id" UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE "ConversationState"
  DROP CONSTRAINT "ConversationState_pkey",
  ADD CONSTRAINT "ConversationState_pkey" PRIMARY KEY ("id");

-- Las restricciones compuestas ya existen; estos índices cubren solo las filas sin dueño.
CREATE UNIQUE INDEX "ConversationState_unowned_patientJid_key"
  ON "ConversationState"("patientJid") WHERE "tenantId" IS NULL;
CREATE UNIQUE INDEX "Patient_unowned_whatsappJid_key"
  ON "Patient"("whatsappJid") WHERE "tenantId" IS NULL;
DROP INDEX "Patient_whatsappJid_key";

COMMIT;
