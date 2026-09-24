-- HU-005: fuente SARA 2 / Propio, 27 grupos y nutrientes nuevos en "Food".
-- Editado a mano: mapeo de grupos viejos (D2) y backfill. Todo o nada.
BEGIN;

-- CreateEnum
CREATE TYPE "FoodSource" AS ENUM ('SARA2', 'PROPIO');

-- AlterEnum: FoodGroup de 10 a 27 valores. NO usar "group"::text::"FoodGroup_new":
-- falla con los valores viejos y mandaría GRASAS (aceites, palta, nueces) a GRASAS (tabla 14).
CREATE TYPE "FoodGroup_new" AS ENUM (
  'VERDURAS', 'FRUTAS', 'LEGUMBRES_CEREALES', 'LECHE_Y_POSTRES', 'YOGURES', 'QUESOS', 'CARNES',
  'HUEVOS', 'PESCADOS_Y_MARISCOS', 'ACEITES', 'FRUTAS_SECAS_Y_SEMILLAS',
  'AZUCARES_MERMELADAS_Y_DULCES', 'GOLOSINAS_Y_CHOCOLATES', 'GRASAS', 'SNACKS_SALADOS',
  'ADEREZOS', 'CALDOS_Y_SOPAS', 'POSTRES_Y_HELADOS', 'SALES', 'BEBIDAS_CON_AZUCAR',
  'BEBIDAS_SIN_AZUCAR', 'BEBIDAS_ALCOHOLICAS_Y_ENERGIZANTES', 'BEBIDAS_DE_FRUTAS', 'INFUSIONES',
  'COMIDAS_RAPIDAS', 'SUPLEMENTOS', 'OTROS'
);
ALTER TABLE "Food" ALTER COLUMN "group" TYPE "FoodGroup_new" USING (
  (CASE "group"::text
    WHEN 'CEREALES'          THEN 'LEGUMBRES_CEREALES'
    WHEN 'LEGUMBRES'         THEN 'LEGUMBRES_CEREALES'
    WHEN 'LACTEOS'           THEN 'LECHE_Y_POSTRES'
    WHEN 'CARNES_Y_HUEVOS'   THEN 'CARNES'
    WHEN 'FRUTAS'            THEN 'FRUTAS'
    WHEN 'VERDURAS'          THEN 'VERDURAS'
    WHEN 'GRASAS'            THEN 'ACEITES'
    WHEN 'AZUCARES_Y_DULCES' THEN 'AZUCARES_MERMELADAS_Y_DULCES'
    WHEN 'BEBIDAS'           THEN 'BEBIDAS_SIN_AZUCAR'
    WHEN 'OTROS'             THEN 'OTROS'
  END)::"FoodGroup_new"
);
ALTER TYPE "FoodGroup" RENAME TO "FoodGroup_old";
ALTER TYPE "FoodGroup_new" RENAME TO "FoodGroup";
DROP TYPE "FoodGroup_old";

-- AlterTable: todas nullable o con default (la tabla tiene filas).
ALTER TABLE "Food"
  ADD COLUMN "source"              "FoodSource" NOT NULL DEFAULT 'PROPIO',
  ADD COLUMN "sourceKey"           TEXT,
  ADD COLUMN "reference"           TEXT,
  ADD COLUMN "groupAutoAssigned"   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "alcoholPer100"       DECIMAL(5,2),
  ADD COLUMN "sodiumMgPer100"      DECIMAL(8,2),
  ADD COLUMN "addedSugarPer100"    DECIMAL(5,2),
  ADD COLUMN "saturatedFatPer100"  DECIMAL(6,3),
  ADD COLUMN "cholesterolMgPer100" DECIMAL(7,2),
  ADD COLUMN "nutrients"           JSONB;

-- Backfill (D2): todo alimento que existía antes de esta HU tiene el grupo asignado por la migración.
UPDATE "Food" SET "groupAutoAssigned" = true;

-- Coherencia fuente <-> clave de origen (Prisma no modela CHECK; no genera drift).
ALTER TABLE "Food" ADD CONSTRAINT "Food_source_sourceKey_check"
  CHECK (("source" = 'SARA2') = ("sourceKey" IS NOT NULL));

-- CreateIndex
CREATE UNIQUE INDEX "Food_sourceKey_key" ON "Food"("sourceKey");
CREATE INDEX "Food_source_active_idx" ON "Food"("source", "active");

COMMIT;
