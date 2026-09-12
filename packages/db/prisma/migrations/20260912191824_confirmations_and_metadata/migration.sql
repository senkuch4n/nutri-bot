-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "MessageKind" ADD VALUE 'CONFIRMATION_REQUEST';
ALTER TYPE "MessageKind" ADD VALUE 'PREP_INSTRUCTIONS';

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "confirmationRequestedAt" TIMESTAMP(3),
ADD COLUMN     "confirmationRespondedAt" TIMESTAMP(3),
ADD COLUMN     "confirmationResponse" BOOLEAN;

-- AlterTable
ALTER TABLE "ClinicalRecord" ADD COLUMN     "riskFlag" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Food" ADD COLUMN     "fiberPer100" DECIMAL(5,2);

-- AlterTable
ALTER TABLE "Patient" ADD COLUMN     "birthDate" DATE;

-- AlterTable
ALTER TABLE "Professional" ADD COLUMN     "acceptedInsurances" TEXT;

-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "prepInstructions" TEXT,
ADD COLUMN     "prepLeadHours" INTEGER;
