-- CreateEnum
CREATE TYPE "BmrFormula" AS ENUM ('MIFFLIN_ST_JEOR', 'HARRIS_BENEDICT', 'KATCH_MCARDLE', 'CUNNINGHAM');

-- CreateEnum
CREATE TYPE "WeightBasis" AS ENUM ('ACTUAL', 'ADJUSTED');

-- CreateEnum
CREATE TYPE "BodyFatSource" AS ENUM ('MEASURED', 'DEURENBERG');

-- CreateEnum
CREATE TYPE "AdjustmentRange" AS ENUM ('MODERATE_DEFICIT', 'AGGRESSIVE_DEFICIT', 'MAINTENANCE', 'SURPLUS');

-- CreateEnum
CREATE TYPE "MacroMode" AS ENUM ('PERCENT_OF_VCT', 'PROTEIN_PER_KG');

-- CreateTable
CREATE TABLE "NutritionPrescription" (
    "id" TEXT NOT NULL,
    "consultationId" TEXT NOT NULL,
    "sex" "BiologicalSex" NOT NULL,
    "ageYears" INTEGER NOT NULL,
    "heightCm" DECIMAL(5,2) NOT NULL,
    "actualWeightKg" DECIMAL(5,2) NOT NULL,
    "idealWeightDevineKg" DECIMAL(5,2) NOT NULL,
    "weightBasis" "WeightBasis" NOT NULL,
    "weightUsedKg" DECIMAL(5,2) NOT NULL,
    "bodyFatPercent" DECIMAL(4,1),
    "bodyFatSource" "BodyFatSource",
    "bodyFatRecordedAt" TIMESTAMP(3),
    "bmrFormula" "BmrFormula" NOT NULL,
    "bmrKcal" INTEGER NOT NULL,
    "bmrMifflinStJeorKcal" INTEGER NOT NULL,
    "bmrHarrisBenedictKcal" INTEGER NOT NULL,
    "bmrKatchMcArdleKcal" INTEGER,
    "bmrCunninghamKcal" INTEGER,
    "activityLevel" "ActivityLevel" NOT NULL,
    "activityFactor" DECIMAL(4,3) NOT NULL,
    "totalExpenditureKcal" INTEGER NOT NULL,
    "nutritionGoal" "NutritionGoal" NOT NULL,
    "adjustmentRange" "AdjustmentRange" NOT NULL,
    "adjustmentPercent" INTEGER NOT NULL,
    "calculatedVctKcal" INTEGER NOT NULL,
    "prescribedVctKcal" INTEGER NOT NULL,
    "macroMode" "MacroMode" NOT NULL,
    "proteinPercent" DECIMAL(4,1) NOT NULL,
    "fatPercent" DECIMAL(4,1) NOT NULL,
    "carbPercent" DECIMAL(4,1) NOT NULL,
    "proteinGPerKg" DECIMAL(3,1),
    "proteinG" INTEGER NOT NULL,
    "fatG" INTEGER NOT NULL,
    "carbG" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NutritionPrescription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NutritionPrescription_consultationId_key" ON "NutritionPrescription"("consultationId");

-- AddForeignKey
ALTER TABLE "NutritionPrescription" ADD CONSTRAINT "NutritionPrescription_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
