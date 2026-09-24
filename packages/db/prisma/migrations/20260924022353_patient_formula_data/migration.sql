-- CreateEnum
CREATE TYPE "BiologicalSex" AS ENUM ('FEMALE', 'MALE');

-- CreateEnum
CREATE TYPE "ActivityLevel" AS ENUM ('SEDENTARY', 'LIGHT', 'MODERATE', 'INTENSE', 'VERY_INTENSE');

-- CreateEnum
CREATE TYPE "NutritionGoal" AS ENUM ('LOSE_WEIGHT', 'MAINTAIN', 'GAIN_WEIGHT', 'GAIN_MUSCLE');

-- CreateEnum
CREATE TYPE "BodyFrame" AS ENUM ('SMALL', 'MEDIUM', 'LARGE');

-- AlterTable
ALTER TABLE "Patient" ADD COLUMN     "activityLevel" "ActivityLevel",
ADD COLUMN     "bodyFrame" "BodyFrame",
ADD COLUMN     "nutritionGoal" "NutritionGoal",
ADD COLUMN     "sex" "BiologicalSex";
