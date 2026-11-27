-- HU-028a: una cuenta de Mercado Pago de señas por consultorio.
-- La fila existente (legacy-tenant, id = 1) conserva id, tokens cifrados y fechas: el AAD es por campo.
BEGIN;

-- Fail closed: una fila sin dueño no se puede atribuir a ningún consultorio. No se adopta ni se borra.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "MercadoPagoAccount" WHERE "tenantId" IS NULL) THEN
    RAISE EXCEPTION 'HU-028a: MercadoPagoAccount tiene filas sin tenantId; resolver a mano antes de migrar';
  END IF;
END $$;

-- id generado; la próxima fila arranca después del máximo actual (prod: 2).
CREATE SEQUENCE "MercadoPagoAccount_id_seq" AS INTEGER OWNED BY "MercadoPagoAccount"."id";
SELECT setval('"MercadoPagoAccount_id_seq"', COALESCE((SELECT MAX(id) FROM "MercadoPagoAccount"), 0) + 1, false);
ALTER TABLE "MercadoPagoAccount" ALTER COLUMN "id" SET DEFAULT nextval('"MercadoPagoAccount_id_seq"');

ALTER TABLE "MercadoPagoAccount" ALTER COLUMN "tenantId" SET NOT NULL;
-- D3a: una cuenta de MP en un solo consultorio (NULL = sin cuenta, se admiten varios).
CREATE UNIQUE INDEX "MercadoPagoAccount_userId_key" ON "MercadoPagoAccount"("userId");

-- States de OAuth: efímeros (10 min) y sin userId/tenantId confiable. Los que estén en vuelo se
-- descartan: quien estaba conectando ve "No pudimos verificar la conexión" y reintenta.
DELETE FROM "MercadoPagoOAuthState";
ALTER TABLE "MercadoPagoOAuthState" ADD COLUMN "userId" TEXT NOT NULL;
ALTER TABLE "MercadoPagoOAuthState" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "MercadoPagoOAuthState" ALTER COLUMN "sessionEmail" DROP NOT NULL;
CREATE INDEX "MercadoPagoOAuthState_userId_idx" ON "MercadoPagoOAuthState"("userId");
ALTER TABLE "MercadoPagoOAuthState" ADD CONSTRAINT "MercadoPagoOAuthState_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
