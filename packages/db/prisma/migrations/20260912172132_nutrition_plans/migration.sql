-- CreateEnum
CREATE TYPE "FoodGroup" AS ENUM ('CEREALES', 'LACTEOS', 'CARNES_Y_HUEVOS', 'FRUTAS', 'VERDURAS', 'LEGUMBRES', 'GRASAS', 'AZUCARES_Y_DULCES', 'BEBIDAS', 'OTROS');

-- CreateEnum
CREATE TYPE "PlanStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- AlterEnum
ALTER TYPE "MessageKind" ADD VALUE 'PLAN_PDF';

-- AlterTable
ALTER TABLE "OutboundMessage" ADD COLUMN     "planId" TEXT;

-- AlterTable
ALTER TABLE "Professional" ADD COLUMN     "logoData" BYTEA,
ADD COLUMN     "logoMimeType" TEXT;

-- CreateTable
CREATE TABLE "Food" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "group" "FoodGroup" NOT NULL,
    "kcalPer100" DECIMAL(6,2) NOT NULL,
    "proteinPer100" DECIMAL(5,2) NOT NULL,
    "carbsPer100" DECIMAL(5,2) NOT NULL,
    "fatPer100" DECIMAL(5,2) NOT NULL,
    "unitHint" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Food_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NutritionPlan" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "status" "PlanStatus" NOT NULL DEFAULT 'DRAFT',
    "pdfData" BYTEA,
    "pdfFileName" TEXT,
    "pdfGeneratedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NutritionPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanMeal" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "PlanMeal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanMealItem" (
    "id" TEXT NOT NULL,
    "mealId" TEXT NOT NULL,
    "foodId" TEXT,
    "customLabel" TEXT,
    "quantityGrams" DECIMAL(7,2),
    "notes" TEXT,
    "order" INTEGER NOT NULL,

    CONSTRAINT "PlanMealItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanTemplate" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateMeal" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "TemplateMeal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateMealItem" (
    "id" TEXT NOT NULL,
    "mealId" TEXT NOT NULL,
    "foodId" TEXT,
    "customLabel" TEXT,
    "quantityGrams" DECIMAL(7,2),
    "notes" TEXT,
    "order" INTEGER NOT NULL,

    CONSTRAINT "TemplateMealItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Food_group_idx" ON "Food"("group");

-- CreateIndex
CREATE INDEX "NutritionPlan_patientId_status_idx" ON "NutritionPlan"("patientId", "status");

-- CreateIndex
CREATE INDEX "PlanMeal_planId_order_idx" ON "PlanMeal"("planId", "order");

-- CreateIndex
CREATE INDEX "PlanMealItem_mealId_order_idx" ON "PlanMealItem"("mealId", "order");

-- CreateIndex
CREATE INDEX "TemplateMeal_templateId_order_idx" ON "TemplateMeal"("templateId", "order");

-- CreateIndex
CREATE INDEX "TemplateMealItem_mealId_order_idx" ON "TemplateMealItem"("mealId", "order");

-- AddForeignKey
ALTER TABLE "OutboundMessage" ADD CONSTRAINT "OutboundMessage_planId_fkey" FOREIGN KEY ("planId") REFERENCES "NutritionPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NutritionPlan" ADD CONSTRAINT "NutritionPlan_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanMeal" ADD CONSTRAINT "PlanMeal_planId_fkey" FOREIGN KEY ("planId") REFERENCES "NutritionPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanMealItem" ADD CONSTRAINT "PlanMealItem_mealId_fkey" FOREIGN KEY ("mealId") REFERENCES "PlanMeal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanMealItem" ADD CONSTRAINT "PlanMealItem_foodId_fkey" FOREIGN KEY ("foodId") REFERENCES "Food"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateMeal" ADD CONSTRAINT "TemplateMeal_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "PlanTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateMealItem" ADD CONSTRAINT "TemplateMealItem_mealId_fkey" FOREIGN KEY ("mealId") REFERENCES "TemplateMeal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateMealItem" ADD CONSTRAINT "TemplateMealItem_foodId_fkey" FOREIGN KEY ("foodId") REFERENCES "Food"("id") ON DELETE SET NULL ON UPDATE CASCADE;
