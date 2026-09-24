-- AlterEnum
ALTER TYPE "MessageKind" ADD VALUE 'ANTHROPOMETRIC_REPORT_PDF';

-- AlterTable
ALTER TABLE "OutboundMessage" ADD COLUMN     "anthropometricReportId" TEXT;

-- AlterTable
ALTER TABLE "Professional" ADD COLUMN     "licenseNumber" TEXT,
ADD COLUMN     "title" TEXT;

-- CreateTable
CREATE TABLE "AnthropometricReport" (
    "id" TEXT NOT NULL,
    "isakEntryId" TEXT NOT NULL,
    "girthsText" TEXT,
    "distributionText" TEXT,
    "adiposeMuscleText" TEXT,
    "muscleBoneText" TEXT,
    "waistHipText" TEXT,
    "somatotypeText" TEXT,
    "conclusionsText" TEXT,
    "pdfData" BYTEA,
    "pdfFileName" TEXT,
    "pdfGeneratedAt" TIMESTAMP(3),
    "pdfSourceKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnthropometricReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AnthropometricReport_isakEntryId_key" ON "AnthropometricReport"("isakEntryId");

-- AddForeignKey
ALTER TABLE "AnthropometricReport" ADD CONSTRAINT "AnthropometricReport_isakEntryId_fkey" FOREIGN KEY ("isakEntryId") REFERENCES "EvolutionEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboundMessage" ADD CONSTRAINT "OutboundMessage_anthropometricReportId_fkey" FOREIGN KEY ("anthropometricReportId") REFERENCES "AnthropometricReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;
