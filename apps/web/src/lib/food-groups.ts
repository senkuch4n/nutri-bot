import type { FoodGroup } from "@nutri-bot/db";

export const FOOD_GROUP_LABELS: Record<FoodGroup, string> = {
  CEREALES: "Cereales y derivados",
  LACTEOS: "Lácteos",
  CARNES_Y_HUEVOS: "Carnes y huevos",
  FRUTAS: "Frutas",
  VERDURAS: "Verduras",
  LEGUMBRES: "Legumbres",
  GRASAS: "Grasas",
  AZUCARES_Y_DULCES: "Azúcares y dulces",
  BEBIDAS: "Bebidas",
  OTROS: "Otros",
};

export const FOOD_GROUPS = Object.keys(FOOD_GROUP_LABELS) as FoodGroup[];
