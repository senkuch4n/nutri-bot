import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const timezone = process.env.PROFESSIONAL_TZ ?? "America/Argentina/Buenos_Aires";
  const currency = process.env.CURRENCY ?? "ARS";
  const reminderLeadHours = Number(process.env.REMINDER_LEAD_HOURS ?? 24);

  await prisma.professional.upsert({
    where: { id: 1 },
    update: { timezone, currency, reminderLeadHours },
    create: {
      id: 1,
      name: "Nutricionista",
      email: process.env.ALLOWED_EMAILS?.split(",")[0]?.trim() ?? "nutricionista@example.com",
      phoneJid: process.env.PROFESSIONAL_JID ?? null,
      timezone,
      currency,
      reminderLeadHours,
    },
    select: { id: true },
  });

  await prisma.botStatus.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, connected: false },
  });

  const serviceCount = await prisma.service.count();
  if (serviceCount === 0) {
    await prisma.service.createMany({
      data: [
        {
          name: "Primera consulta",
          description: "Evaluación inicial, anamnesis y plan alimentario.",
          price: new Prisma.Decimal(25000),
          durationMin: 60,
          color: "#2563eb",
        },
        {
          name: "Consulta de seguimiento",
          description: "Control de evolución y ajuste del plan.",
          price: new Prisma.Decimal(15000),
          durationMin: 30,
          color: "#16a34a",
        },
        {
          name: "Antropometría",
          description: "Medición de composición corporal.",
          price: new Prisma.Decimal(10000),
          durationMin: 30,
          color: "#db2777",
        },
      ],
    });
  }

  const ruleCount = await prisma.availabilityRule.count();
  if (ruleCount === 0) {
    // Lunes (1) a viernes (5), 09:00–13:00 y 15:00–19:00.
    const blocks = [
      ["09:00", "13:00"],
      ["15:00", "19:00"],
    ];
    for (let weekday = 1; weekday <= 5; weekday++) {
      for (const [startTime, endTime] of blocks) {
        await prisma.availabilityRule.create({
          data: { weekday, startTime: startTime!, endTime: endTime! },
        });
      }
    }
  }

  const foodCount = await prisma.food.count();
  if (foodCount === 0) {
    const foods: Prisma.FoodCreateManyInput[] = [
      { name: "Arroz blanco cocido", group: "LEGUMBRES_CEREALES", kcalPer100: 130, proteinPer100: 2.7, carbsPer100: 28, fatPer100: 0.3, unitHint: "1 taza ≈ 180 g" },
      { name: "Arroz integral cocido", group: "LEGUMBRES_CEREALES", kcalPer100: 123, proteinPer100: 2.7, carbsPer100: 25.6, fatPer100: 1, unitHint: "1 taza ≈ 180 g" },
      { name: "Avena arrollada", group: "LEGUMBRES_CEREALES", kcalPer100: 389, proteinPer100: 16.9, carbsPer100: 66.3, fatPer100: 6.9, unitHint: "3 cucharadas ≈ 30 g" },
      { name: "Fideos de trigo cocidos", group: "LEGUMBRES_CEREALES", kcalPer100: 158, proteinPer100: 5.8, carbsPer100: 30.9, fatPer100: 0.9, unitHint: "1 plato ≈ 200 g" },
      { name: "Polenta cocida", group: "LEGUMBRES_CEREALES", kcalPer100: 70, proteinPer100: 1.6, carbsPer100: 15, fatPer100: 0.3, unitHint: "1 taza ≈ 240 g" },
      { name: "Pan francés", group: "LEGUMBRES_CEREALES", kcalPer100: 270, proteinPer100: 9, carbsPer100: 52, fatPer100: 3.2, unitHint: "1 unidad chica ≈ 50 g" },
      { name: "Pan integral", group: "LEGUMBRES_CEREALES", kcalPer100: 247, proteinPer100: 13, carbsPer100: 41, fatPer100: 4.2, unitHint: "1 fetita ≈ 25 g" },
      { name: "Harina de maíz", group: "LEGUMBRES_CEREALES", kcalPer100: 365, proteinPer100: 9, carbsPer100: 77, fatPer100: 3.9 },
      { name: "Quinoa cocida", group: "LEGUMBRES_CEREALES", kcalPer100: 120, proteinPer100: 4.4, carbsPer100: 21.3, fatPer100: 1.9, unitHint: "1 taza ≈ 185 g" },
      { name: "Leche entera", group: "LECHE_Y_POSTRES", kcalPer100: 61, proteinPer100: 3.2, carbsPer100: 4.8, fatPer100: 3.3, unitHint: "1 vaso ≈ 200 ml" },
      { name: "Leche descremada", group: "LECHE_Y_POSTRES", kcalPer100: 35, proteinPer100: 3.4, carbsPer100: 5, fatPer100: 0.1, unitHint: "1 vaso ≈ 200 ml" },
      { name: "Yogur natural entero", group: "LECHE_Y_POSTRES", kcalPer100: 61, proteinPer100: 3.5, carbsPer100: 4.7, fatPer100: 3.3, unitHint: "1 pote ≈ 190 g" },
      { name: "Yogur descremado", group: "LECHE_Y_POSTRES", kcalPer100: 40, proteinPer100: 4, carbsPer100: 5, fatPer100: 0.3, unitHint: "1 pote ≈ 190 g" },
      { name: "Queso cremoso", group: "LECHE_Y_POSTRES", kcalPer100: 300, proteinPer100: 20, carbsPer100: 2, fatPer100: 24, unitHint: "1 feta ≈ 25 g" },
      { name: "Queso port salut light", group: "LECHE_Y_POSTRES", kcalPer100: 220, proteinPer100: 25, carbsPer100: 2, fatPer100: 12, unitHint: "1 feta ≈ 25 g" },
      { name: "Ricota", group: "LECHE_Y_POSTRES", kcalPer100: 174, proteinPer100: 11.3, carbsPer100: 3, fatPer100: 13, unitHint: "2 cucharadas ≈ 50 g" },
      { name: "Queso parmesano", group: "LECHE_Y_POSTRES", kcalPer100: 431, proteinPer100: 38, carbsPer100: 4, fatPer100: 29, unitHint: "1 cucharada ≈ 10 g" },
      { name: "Kéfir natural", group: "LECHE_Y_POSTRES", kcalPer100: 50, proteinPer100: 3.5, carbsPer100: 4, fatPer100: 2, unitHint: "1 vaso ≈ 200 ml" },
      { name: "Pechuga de pollo cocida", group: "CARNES", kcalPer100: 165, proteinPer100: 31, carbsPer100: 0, fatPer100: 3.6, unitHint: "1 filete ≈ 150 g" },
      { name: "Muslo de pollo sin piel", group: "CARNES", kcalPer100: 179, proteinPer100: 24, carbsPer100: 0, fatPer100: 8.2 },
      { name: "Carne vacuna magra", group: "CARNES", kcalPer100: 170, proteinPer100: 26, carbsPer100: 0, fatPer100: 7 },
      { name: "Carne picada magra", group: "CARNES", kcalPer100: 176, proteinPer100: 26, carbsPer100: 0, fatPer100: 8, unitHint: "1 hamburguesa casera ≈ 120 g" },
      { name: "Lomo de cerdo", group: "CARNES", kcalPer100: 143, proteinPer100: 26, carbsPer100: 0, fatPer100: 4 },
      { name: "Pescado merluza", group: "CARNES", kcalPer100: 90, proteinPer100: 18, carbsPer100: 0, fatPer100: 1.5, unitHint: "1 filet ≈ 180 g" },
      { name: "Atún al natural escurrido", group: "CARNES", kcalPer100: 116, proteinPer100: 26, carbsPer100: 0, fatPer100: 1, unitHint: "1 lata escurrida ≈ 170 g" },
      { name: "Huevo entero", group: "CARNES", kcalPer100: 143, proteinPer100: 12.6, carbsPer100: 0.7, fatPer100: 9.5, unitHint: "1 huevo mediano ≈ 50 g" },
      { name: "Clara de huevo", group: "CARNES", kcalPer100: 52, proteinPer100: 10.9, carbsPer100: 0.7, fatPer100: 0.2, unitHint: "1 clara ≈ 30 g" },
      { name: "Manzana", group: "FRUTAS", kcalPer100: 52, proteinPer100: 0.3, carbsPer100: 13.8, fatPer100: 0.2, unitHint: "1 unidad mediana ≈ 180 g" },
      { name: "Banana", group: "FRUTAS", kcalPer100: 89, proteinPer100: 1.1, carbsPer100: 22.8, fatPer100: 0.3, unitHint: "1 unidad mediana ≈ 120 g" },
      { name: "Naranja", group: "FRUTAS", kcalPer100: 47, proteinPer100: 0.9, carbsPer100: 11.8, fatPer100: 0.1, unitHint: "1 unidad mediana ≈ 180 g" },
      { name: "Mandarina", group: "FRUTAS", kcalPer100: 53, proteinPer100: 0.8, carbsPer100: 13.3, fatPer100: 0.3, unitHint: "1 unidad ≈ 90 g" },
      { name: "Pera", group: "FRUTAS", kcalPer100: 57, proteinPer100: 0.4, carbsPer100: 15.2, fatPer100: 0.1, unitHint: "1 unidad mediana ≈ 170 g" },
      { name: "Durazno", group: "FRUTAS", kcalPer100: 39, proteinPer100: 0.9, carbsPer100: 9.5, fatPer100: 0.3, unitHint: "1 unidad ≈ 150 g" },
      { name: "Frutilla", group: "FRUTAS", kcalPer100: 32, proteinPer100: 0.7, carbsPer100: 7.7, fatPer100: 0.3, unitHint: "1 taza ≈ 150 g" },
      { name: "Uva", group: "FRUTAS", kcalPer100: 69, proteinPer100: 0.7, carbsPer100: 18.1, fatPer100: 0.2, unitHint: "1 taza ≈ 150 g" },
      { name: "Kiwi", group: "FRUTAS", kcalPer100: 61, proteinPer100: 1.1, carbsPer100: 14.7, fatPer100: 0.5, unitHint: "1 unidad ≈ 75 g" },
      { name: "Papa hervida", group: "VERDURAS", kcalPer100: 87, proteinPer100: 1.9, carbsPer100: 20.1, fatPer100: 0.1, unitHint: "1 unidad mediana ≈ 150 g" },
      { name: "Batata cocida", group: "VERDURAS", kcalPer100: 90, proteinPer100: 2, carbsPer100: 20.7, fatPer100: 0.2, unitHint: "1 unidad mediana ≈ 180 g" },
      { name: "Calabaza", group: "VERDURAS", kcalPer100: 26, proteinPer100: 1, carbsPer100: 6.5, fatPer100: 0.1 },
      { name: "Zanahoria", group: "VERDURAS", kcalPer100: 41, proteinPer100: 0.9, carbsPer100: 9.6, fatPer100: 0.2, unitHint: "1 unidad mediana ≈ 70 g" },
      { name: "Tomate", group: "VERDURAS", kcalPer100: 18, proteinPer100: 0.9, carbsPer100: 3.9, fatPer100: 0.2, unitHint: "1 unidad mediana ≈ 120 g" },
      { name: "Lechuga", group: "VERDURAS", kcalPer100: 15, proteinPer100: 1.4, carbsPer100: 2.9, fatPer100: 0.2 },
      { name: "Espinaca", group: "VERDURAS", kcalPer100: 23, proteinPer100: 2.9, carbsPer100: 3.6, fatPer100: 0.4 },
      { name: "Brócoli", group: "VERDURAS", kcalPer100: 35, proteinPer100: 2.4, carbsPer100: 7.2, fatPer100: 0.4, unitHint: "1 taza ≈ 150 g" },
      { name: "Cebolla", group: "VERDURAS", kcalPer100: 40, proteinPer100: 1.1, carbsPer100: 9.3, fatPer100: 0.1, unitHint: "1 unidad mediana ≈ 110 g" },
      { name: "Lentejas cocidas", group: "LEGUMBRES_CEREALES", kcalPer100: 116, proteinPer100: 9, carbsPer100: 20.1, fatPer100: 0.4, unitHint: "1 taza ≈ 200 g" },
      { name: "Porotos blancos cocidos", group: "LEGUMBRES_CEREALES", kcalPer100: 139, proteinPer100: 9.7, carbsPer100: 25.1, fatPer100: 0.4, unitHint: "1 taza ≈ 180 g" },
      { name: "Porotos negros cocidos", group: "LEGUMBRES_CEREALES", kcalPer100: 132, proteinPer100: 8.9, carbsPer100: 23.7, fatPer100: 0.5 },
      { name: "Garbanzos cocidos", group: "LEGUMBRES_CEREALES", kcalPer100: 164, proteinPer100: 8.9, carbsPer100: 27.4, fatPer100: 2.6, unitHint: "1 taza ≈ 165 g" },
      { name: "Arvejas cocidas", group: "LEGUMBRES_CEREALES", kcalPer100: 84, proteinPer100: 5.4, carbsPer100: 15.6, fatPer100: 0.4, unitHint: "1 taza ≈ 160 g" },
      { name: "Soja cocida", group: "LEGUMBRES_CEREALES", kcalPer100: 173, proteinPer100: 17.3, carbsPer100: 9.9, fatPer100: 9 },
      { name: "Hummus", group: "LEGUMBRES_CEREALES", kcalPer100: 166, proteinPer100: 7.9, carbsPer100: 14.3, fatPer100: 9.6, unitHint: "2 cucharadas ≈ 30 g" },
      { name: "Tofu firme", group: "LEGUMBRES_CEREALES", kcalPer100: 144, proteinPer100: 17, carbsPer100: 2.8, fatPer100: 8 },
      { name: "Harina de garbanzo", group: "LEGUMBRES_CEREALES", kcalPer100: 387, proteinPer100: 22.4, carbsPer100: 57.8, fatPer100: 6.7 },
      { name: "Aceite de oliva", group: "ACEITES", kcalPer100: 884, proteinPer100: 0, carbsPer100: 0, fatPer100: 100, unitHint: "1 cucharadita ≈ 5 ml" },
      { name: "Aceite de girasol", group: "ACEITES", kcalPer100: 884, proteinPer100: 0, carbsPer100: 0, fatPer100: 100, unitHint: "1 cucharadita ≈ 5 ml" },
      { name: "Palta", group: "ACEITES", kcalPer100: 160, proteinPer100: 2, carbsPer100: 8.5, fatPer100: 14.7, unitHint: "1/2 unidad ≈ 100 g" },
      { name: "Nueces", group: "ACEITES", kcalPer100: 654, proteinPer100: 15.2, carbsPer100: 13.7, fatPer100: 65.2, unitHint: "1 puñado ≈ 30 g" },
      { name: "Almendras", group: "ACEITES", kcalPer100: 579, proteinPer100: 21.2, carbsPer100: 21.6, fatPer100: 49.9, unitHint: "1 puñado ≈ 30 g" },
      { name: "Maní tostado", group: "ACEITES", kcalPer100: 567, proteinPer100: 25.8, carbsPer100: 16.1, fatPer100: 49.2, unitHint: "1 puñado ≈ 30 g" },
      { name: "Pasta de maní", group: "ACEITES", kcalPer100: 588, proteinPer100: 25, carbsPer100: 20, fatPer100: 50, unitHint: "1 cucharada ≈ 15 g" },
      { name: "Semillas de chía", group: "ACEITES", kcalPer100: 486, proteinPer100: 16.5, carbsPer100: 42.1, fatPer100: 30.7, unitHint: "1 cucharada ≈ 12 g" },
      { name: "Semillas de girasol", group: "ACEITES", kcalPer100: 584, proteinPer100: 20.8, carbsPer100: 20, fatPer100: 51.5, unitHint: "1 cucharada ≈ 10 g" },
      { name: "Azúcar", group: "AZUCARES_MERMELADAS_Y_DULCES", kcalPer100: 387, proteinPer100: 0, carbsPer100: 100, fatPer100: 0, unitHint: "1 cucharadita ≈ 5 g" },
      { name: "Miel", group: "AZUCARES_MERMELADAS_Y_DULCES", kcalPer100: 304, proteinPer100: 0.3, carbsPer100: 82.4, fatPer100: 0, unitHint: "1 cucharada ≈ 20 g" },
      { name: "Dulce de leche", group: "AZUCARES_MERMELADAS_Y_DULCES", kcalPer100: 315, proteinPer100: 5.8, carbsPer100: 55, fatPer100: 8.5, unitHint: "1 cucharada ≈ 20 g" },
      { name: "Mermelada de durazno", group: "AZUCARES_MERMELADAS_Y_DULCES", kcalPer100: 250, proteinPer100: 0.4, carbsPer100: 65, fatPer100: 0.1, unitHint: "1 cucharada ≈ 20 g" },
      { name: "Chocolate amargo 70%", group: "AZUCARES_MERMELADAS_Y_DULCES", kcalPer100: 598, proteinPer100: 7.8, carbsPer100: 45.9, fatPer100: 42.6, unitHint: "2 cuadraditos ≈ 10 g" },
      { name: "Galletitas de agua", group: "AZUCARES_MERMELADAS_Y_DULCES", kcalPer100: 430, proteinPer100: 10, carbsPer100: 70, fatPer100: 13, unitHint: "4 unidades ≈ 25 g" },
      { name: "Alfajor de chocolate", group: "AZUCARES_MERMELADAS_Y_DULCES", kcalPer100: 430, proteinPer100: 5, carbsPer100: 65, fatPer100: 17, unitHint: "1 unidad ≈ 50 g" },
      { name: "Helado de crema", group: "AZUCARES_MERMELADAS_Y_DULCES", kcalPer100: 207, proteinPer100: 3.5, carbsPer100: 24, fatPer100: 11, unitHint: "1 bocha ≈ 60 g" },
      { name: "Flan casero con caramelo", group: "AZUCARES_MERMELADAS_Y_DULCES", kcalPer100: 140, proteinPer100: 4.5, carbsPer100: 22, fatPer100: 3.5, unitHint: "1 porción ≈ 120 g" },
      { name: "Agua", group: "BEBIDAS_SIN_AZUCAR", kcalPer100: 0, proteinPer100: 0, carbsPer100: 0, fatPer100: 0, unitHint: "1 vaso ≈ 250 ml" },
      { name: "Leche chocolatada", group: "BEBIDAS_SIN_AZUCAR", kcalPer100: 80, proteinPer100: 3.2, carbsPer100: 12, fatPer100: 2.2, unitHint: "1 vaso ≈ 200 ml" },
      { name: "Jugo de naranja natural", group: "BEBIDAS_SIN_AZUCAR", kcalPer100: 45, proteinPer100: 0.7, carbsPer100: 10.4, fatPer100: 0.2, unitHint: "1 vaso ≈ 200 ml" },
      { name: "Mate cocido sin azúcar", group: "BEBIDAS_SIN_AZUCAR", kcalPer100: 1, proteinPer100: 0, carbsPer100: 0.2, fatPer100: 0, unitHint: "1 taza ≈ 200 ml" },
      { name: "Café con leche", group: "BEBIDAS_SIN_AZUCAR", kcalPer100: 30, proteinPer100: 1.5, carbsPer100: 2.5, fatPer100: 1.5, unitHint: "1 taza ≈ 200 ml" },
      { name: "Gaseosa cola", group: "BEBIDAS_SIN_AZUCAR", kcalPer100: 42, proteinPer100: 0, carbsPer100: 10.6, fatPer100: 0, unitHint: "1 vaso ≈ 250 ml" },
      { name: "Cerveza rubia", group: "BEBIDAS_SIN_AZUCAR", kcalPer100: 43, proteinPer100: 0.5, carbsPer100: 3.6, fatPer100: 0, unitHint: "1 lata ≈  lata 473 ml" },
      { name: "Vino tinto", group: "BEBIDAS_SIN_AZUCAR", kcalPer100: 85, proteinPer100: 0.1, carbsPer100: 2.6, fatPer100: 0, unitHint: "1 copa ≈ 150 ml" },
      { name: "Licuado de banana con leche", group: "BEBIDAS_SIN_AZUCAR", kcalPer100: 75, proteinPer100: 2.5, carbsPer100: 12, fatPer100: 1.8, unitHint: "1 vaso ≈ 250 ml" },
      { name: "Caldo de verduras", group: "OTROS", kcalPer100: 15, proteinPer100: 0.5, carbsPer100: 2.5, fatPer100: 0.3, unitHint: "1 taza ≈ 250 ml" },
      { name: "Salsa de tomate", group: "OTROS", kcalPer100: 40, proteinPer100: 1.5, carbsPer100: 7, fatPer100: 0.8, unitHint: "1/2 taza ≈ 125 g" },
      { name: "Mayonesa", group: "OTROS", kcalPer100: 680, proteinPer100: 1, carbsPer100: 1, fatPer100: 75, unitHint: "1 cucharada ≈ 15 g" },
      { name: "Mostaza", group: "OTROS", kcalPer100: 66, proteinPer100: 4, carbsPer100: 6, fatPer100: 3.7, unitHint: "1 cucharadita ≈ 5 g" },
      { name: "Vinagre de manzana", group: "OTROS", kcalPer100: 22, proteinPer100: 0, carbsPer100: 0.9, fatPer100: 0, unitHint: "1 cucharada ≈ 15 ml" },
      { name: "Gelatina sin azúcar preparada", group: "OTROS", kcalPer100: 10, proteinPer100: 2, carbsPer100: 0, fatPer100: 0, unitHint: "1 porción ≈ 125 g" },
      { name: "Aceitunas verdes", group: "OTROS", kcalPer100: 145, proteinPer100: 1, carbsPer100: 3.8, fatPer100: 15.3, unitHint: "6 unidades ≈ 25 g" },
      { name: "Pickles", group: "OTROS", kcalPer100: 12, proteinPer100: 0.5, carbsPer100: 2.4, fatPer100: 0.2, unitHint: "1 porción ≈ 50 g" },
      { name: "Sal fina", group: "OTROS", kcalPer100: 0, proteinPer100: 0, carbsPer100: 0, fatPer100: 0, unitHint: "usar con moderación" },
    ];
    await prisma.food.createMany({ data: foods });
  }

  console.log("Seed completado.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
