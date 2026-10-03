-- HU-018b: aditiva. Las comidas existentes quedan EVERY_DAY / isOptions=false por el DEFAULT
-- (backfill de Postgres en el mismo ADD COLUMN). Los ítems existentes quedan weekday=NULL
-- ("todos los días"). No mueve ni borra datos.

-- CreateEnum
CREATE TYPE "MealMode" AS ENUM ('EVERY_DAY', 'PER_DAY');

-- CreateEnum
CREATE TYPE "Weekday" AS ENUM ('MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN');

-- AlterTable
ALTER TABLE "PlanMeal" ADD COLUMN     "isOptions" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mode" "MealMode" NOT NULL DEFAULT 'EVERY_DAY';

-- AlterTable
ALTER TABLE "PlanMealItem" ADD COLUMN     "weekday" "Weekday";

-- AlterTable
ALTER TABLE "TemplateMeal" ADD COLUMN     "isOptions" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mode" "MealMode" NOT NULL DEFAULT 'EVERY_DAY';

-- AlterTable
ALTER TABLE "TemplateMealItem" ADD COLUMN     "weekday" "Weekday";
