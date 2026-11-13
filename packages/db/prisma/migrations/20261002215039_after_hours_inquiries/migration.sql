-- CreateEnum
CREATE TYPE "InquiryStatus" AS ENUM ('PENDING', 'ANSWERED');

-- AlterTable
ALTER TABLE "Professional" ADD COLUMN     "afterHoursEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "afterHoursEnd" TEXT NOT NULL DEFAULT '09:00',
ADD COLUMN     "afterHoursStart" TEXT NOT NULL DEFAULT '22:00';

-- CreateTable
CREATE TABLE "PatientInquiry" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "lastMessageAt" TIMESTAMP(3) NOT NULL,
    "receivedAfterHours" BOOLEAN NOT NULL,
    "status" "InquiryStatus" NOT NULL DEFAULT 'PENDING',
    "answeredAt" TIMESTAMP(3),
    "digestedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientInquiry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PatientInquiry_status_receivedAt_idx" ON "PatientInquiry"("status", "receivedAt");

-- CreateIndex
CREATE INDEX "PatientInquiry_patientId_status_idx" ON "PatientInquiry"("patientId", "status");

-- AddForeignKey
ALTER TABLE "PatientInquiry" ADD CONSTRAINT "PatientInquiry_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
