-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "reason" TEXT;

-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "asksReason" BOOLEAN NOT NULL DEFAULT true;
