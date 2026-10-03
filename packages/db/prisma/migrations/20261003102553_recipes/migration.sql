-- CreateEnum
CREATE TYPE "RecipeStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "RecipeOrigin" AS ENUM ('MANUAL', 'IMPORT');

-- CreateEnum
CREATE TYPE "RecipeType" AS ENUM ('MAIN_DISH', 'SIDE_DISH', 'SALAD', 'SNACK', 'BREAKFAST', 'BREAD_DOUGH', 'DESSERT');

-- CreateEnum
CREATE TYPE "RecipeMoment" AS ENUM ('BREAKFAST', 'LUNCH', 'AFTERNOON_SNACK', 'DINNER', 'SNACK');

-- CreateEnum
CREATE TYPE "RecipeTag" AS ENUM ('GLUTEN_FREE', 'VEGETARIAN', 'MEAL_PREP');

-- CreateEnum
CREATE TYPE "RecipeImportImageKind" AS ENUM ('PAGE', 'CANDIDATE');

-- AlterTable
ALTER TABLE "PlanMealItem" ADD COLUMN     "portions" DECIMAL(3,1),
ADD COLUMN     "recipeId" TEXT;

-- AlterTable
ALTER TABLE "TemplateMealItem" ADD COLUMN     "portions" DECIMAL(3,1),
ADD COLUMN     "recipeId" TEXT;

-- CreateTable
CREATE TABLE "Recipe" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "RecipeStatus" NOT NULL DEFAULT 'DRAFT',
    "origin" "RecipeOrigin" NOT NULL DEFAULT 'MANUAL',
    "type" "RecipeType",
    "moments" "RecipeMoment"[] DEFAULT ARRAY[]::"RecipeMoment"[],
    "tags" "RecipeTag"[] DEFAULT ARRAY[]::"RecipeTag"[],
    "yieldPortions" DECIMAL(5,1),
    "portionHousehold" TEXT,
    "portionGrams" DECIMAL(7,2),
    "preparation" TEXT,
    "tips" TEXT,
    "sourceName" TEXT,
    "publishedPortionText" TEXT,
    "publishedKcal" DECIMAL(7,2),
    "publishedProteinG" DECIMAL(6,2),
    "publishedCarbsG" DECIMAL(6,2),
    "publishedFatG" DECIMAL(6,2),
    "publishedFiberG" DECIMAL(6,2),
    "importKey" TEXT,
    "importFile" TEXT,
    "importPage" INTEGER,
    "importRawText" TEXT,
    "importHints" JSONB,
    "reviewedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Recipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecipeIngredient" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "foodId" TEXT,
    "label" TEXT,
    "grams" DECIMAL(7,2),
    "noQuantity" BOOLEAN NOT NULL DEFAULT false,
    "household" TEXT,
    "rawText" TEXT,

    CONSTRAINT "RecipeIngredient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecipePhoto" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "thumbData" BYTEA NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'image/webp',
    "byteSize" INTEGER NOT NULL,
    "credit" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecipePhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecipeImportImage" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "kind" "RecipeImportImageKind" NOT NULL,
    "order" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "thumbData" BYTEA,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,

    CONSTRAINT "RecipeImportImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Recipe_importKey_key" ON "Recipe"("importKey");

-- CreateIndex
CREATE INDEX "Recipe_status_name_idx" ON "Recipe"("status", "name");

-- CreateIndex
CREATE INDEX "RecipeIngredient_recipeId_order_idx" ON "RecipeIngredient"("recipeId", "order");

-- CreateIndex
CREATE INDEX "RecipeIngredient_foodId_idx" ON "RecipeIngredient"("foodId");

-- CreateIndex
CREATE UNIQUE INDEX "RecipePhoto_recipeId_key" ON "RecipePhoto"("recipeId");

-- CreateIndex
CREATE INDEX "RecipeImportImage_recipeId_kind_order_idx" ON "RecipeImportImage"("recipeId", "kind", "order");

-- CreateIndex
CREATE INDEX "PlanMealItem_recipeId_idx" ON "PlanMealItem"("recipeId");

-- CreateIndex
CREATE INDEX "TemplateMealItem_recipeId_idx" ON "TemplateMealItem"("recipeId");

-- AddForeignKey
ALTER TABLE "PlanMealItem" ADD CONSTRAINT "PlanMealItem_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateMealItem" ADD CONSTRAINT "TemplateMealItem_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeIngredient" ADD CONSTRAINT "RecipeIngredient_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeIngredient" ADD CONSTRAINT "RecipeIngredient_foodId_fkey" FOREIGN KEY ("foodId") REFERENCES "Food"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipePhoto" ADD CONSTRAINT "RecipePhoto_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeImportImage" ADD CONSTRAINT "RecipeImportImage_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;
