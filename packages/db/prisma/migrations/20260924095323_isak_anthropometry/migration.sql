-- CreateEnum
CREATE TYPE "MeasurementStudy" AS ENUM ('ISAK');

-- AlterTable
ALTER TABLE "EvolutionEntry" ADD COLUMN     "armFlexedCm" DECIMAL(5,2),
ADD COLUMN     "armSpanCm" DECIMAL(5,2),
ADD COLUMN     "bicepsSkinfoldMm" DECIMAL(5,2),
ADD COLUMN     "bistyloidBreadthCm" DECIMAL(5,2),
ADD COLUMN     "calfSkinfoldMm" DECIMAL(5,2),
ADD COLUMN     "femurBreadthCm" DECIMAL(5,2),
ADD COLUMN     "humerusBreadthCm" DECIMAL(5,2),
ADD COLUMN     "iliacCrestSkinfoldMm" DECIMAL(5,2),
ADD COLUMN     "sittingHeightCm" DECIMAL(5,2),
ADD COLUMN     "study" "MeasurementStudy",
ADD COLUMN     "supraspinaleSkinfoldMm" DECIMAL(5,2),
ADD COLUMN     "thighSkinfoldMm" DECIMAL(5,2);

-- CreateIndex
CREATE UNIQUE INDEX "EvolutionEntry_consultationId_study_key" ON "EvolutionEntry"("consultationId", "study");

