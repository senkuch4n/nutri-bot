-- CreateEnum
CREATE TYPE "TemplateStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "TemplateOrigin" AS ENUM ('MANUAL', 'IMPORT');

-- AlterTable
ALTER TABLE "PlanTemplate" ADD COLUMN     "importHints" JSONB,
ADD COLUMN     "importKey" TEXT,
ADD COLUMN     "origin" "TemplateOrigin" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "status" "TemplateStatus" NOT NULL DEFAULT 'PUBLISHED';

-- CreateTable
CREATE TABLE "PlanTemplateSection" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanTemplateSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanSection" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanSection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlanTemplateSection_templateId_order_idx" ON "PlanTemplateSection"("templateId", "order");

-- CreateIndex
CREATE INDEX "PlanSection_planId_order_idx" ON "PlanSection"("planId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "PlanTemplate_importKey_key" ON "PlanTemplate"("importKey");

-- CreateIndex
CREATE INDEX "PlanTemplate_status_title_idx" ON "PlanTemplate"("status", "title");

-- AddForeignKey
ALTER TABLE "PlanTemplateSection" ADD CONSTRAINT "PlanTemplateSection_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "PlanTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanSection" ADD CONSTRAINT "PlanSection_planId_fkey" FOREIGN KEY ("planId") REFERENCES "NutritionPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

