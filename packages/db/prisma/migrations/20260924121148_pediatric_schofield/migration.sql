-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "BmrFormula" ADD VALUE 'SCHOFIELD_WEIGHT_HEIGHT';
ALTER TYPE "BmrFormula" ADD VALUE 'SCHOFIELD_WEIGHT';

-- AlterTable
ALTER TABLE "NutritionPrescription" ADD COLUMN     "bmrSchofieldWeightHeightKcal" INTEGER,
ADD COLUMN     "bmrSchofieldWeightKcal" INTEGER,
ALTER COLUMN "idealWeightDevineKg" DROP NOT NULL,
ALTER COLUMN "bmrMifflinStJeorKcal" DROP NOT NULL,
ALTER COLUMN "bmrHarrisBenedictKcal" DROP NOT NULL;
