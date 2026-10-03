-- CreateEnum
CREATE TYPE "BotAiOutcome" AS ENUM ('ANSWERED', 'HANDOFF_OFFERED', 'REFUSED', 'TRUNCATED', 'TOOL_LIMIT', 'ERROR', 'LIMIT_PATIENT', 'LIMIT_GLOBAL');

-- AlterTable
ALTER TABLE "Professional" ADD COLUMN     "botAiEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "botAiInfo" TEXT;

-- CreateTable
CREATE TABLE "BotAiQuestion" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "askedAt" TIMESTAMP(3) NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT,
    "outcome" "BotAiOutcome" NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheCreationTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheReadTokens" INTEGER NOT NULL DEFAULT 0,
    "toolRounds" INTEGER NOT NULL DEFAULT 0,
    "latencyMs" INTEGER,
    "errorKind" TEXT,
    "handedOffAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BotAiQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BotAiQuestion_patientId_askedAt_idx" ON "BotAiQuestion"("patientId", "askedAt");

-- CreateIndex
CREATE INDEX "BotAiQuestion_askedAt_idx" ON "BotAiQuestion"("askedAt");

-- AddForeignKey
ALTER TABLE "BotAiQuestion" ADD CONSTRAINT "BotAiQuestion_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
