-- AlterTable
ALTER TABLE "EvolutionEntry"
ADD COLUMN     "bodyFatPercent" DECIMAL(4,1),
ADD COLUMN     "muscleMassKg" DECIMAL(5,2),
ADD COLUMN     "bodyWaterPercent" DECIMAL(4,1),
ADD COLUMN     "visceralFatLevel" DECIMAL(4,1),
ADD COLUMN     "boneMassKg" DECIMAL(4,2),
ADD COLUMN     "basalMetabolicRateKcal" INTEGER;

-- AlterTable
ALTER TABLE "Professional"
ADD COLUMN     "pdfAccentColor" TEXT,
ADD COLUMN     "pdfFooterText" TEXT;
