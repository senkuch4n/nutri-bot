-- AlterTable
ALTER TABLE "PlanMealItem" ADD COLUMN     "measureGrams" DECIMAL(6,1),
ADD COLUMN     "measureName" TEXT,
ADD COLUMN     "measurePlural" TEXT,
ADD COLUMN     "measureQty" DECIMAL(4,2);

-- AlterTable
ALTER TABLE "TemplateMealItem" ADD COLUMN     "measureGrams" DECIMAL(6,1),
ADD COLUMN     "measureName" TEXT,
ADD COLUMN     "measurePlural" TEXT,
ADD COLUMN     "measureQty" DECIMAL(4,2);

-- CreateTable
CREATE TABLE "FoodMeasure" (
    "id" TEXT NOT NULL,
    "foodId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "plural" TEXT,
    "grams" DECIMAL(6,1) NOT NULL,
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FoodMeasure_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FoodMeasure_foodId_order_idx" ON "FoodMeasure"("foodId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "FoodMeasure_foodId_nameKey_key" ON "FoodMeasure"("foodId", "nameKey");

-- AddForeignKey
ALTER TABLE "FoodMeasure" ADD CONSTRAINT "FoodMeasure_foodId_fkey" FOREIGN KEY ("foodId") REFERENCES "Food"("id") ON DELETE CASCADE ON UPDATE CASCADE;
