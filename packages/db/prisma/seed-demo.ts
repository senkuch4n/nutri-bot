/**
 * Datos de ejemplo para mostrar el sistema con contenido real: pacientes
 * ficticios con historia clínica, evolución, turnos en distintos estados,
 * un plan y algún pago. No se ejecuta con `npm run db:seed` — es aparte
 * a propósito, para no mezclarlo con los datos base de una instalación
 * limpia. Se puede correr de nuevo sin duplicar (usa upsert por teléfono).
 *
 * Uso: npm run seed:demo --workspace packages/db
 */
import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

function jid(phoneDigits: string): string {
  return `${phoneDigits}@s.whatsapp.net`;
}

function daysAgo(n: number, hour = 10, minute = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, minute, 0, 0);
  return d;
}

function daysFromNow(n: number, hour = 10, minute = 0): Date {
  return daysAgo(-n, hour, minute);
}

async function main() {
  const services = await prisma.service.findMany();
  const byServiceName = new Map(services.map((s) => [s.name, s]));
  const primera = byServiceName.get("Primera consulta");
  const seguimiento = byServiceName.get("Consulta de seguimiento");
  const antropometria = byServiceName.get("Antropometría");
  if (!primera || !seguimiento || !antropometria) {
    throw new Error("Corré primero `npm run db:seed` para tener los servicios base.");
  }

  // Solo los propios del seed: SARA 2 repite nombres ("Palta", "Frutilla"…).
  const foods = await prisma.food.findMany({ where: { source: "PROPIO" } });
  const byFoodName = new Map(foods.map((f) => [f.name, f]));
  function food(name: string) {
    const f = byFoodName.get(name);
    if (!f) throw new Error(`Falta el alimento "${name}" — corré \`npm run db:seed\` primero.`);
    return f;
  }

  async function upsertPatient(data: {
    phoneDigits: string;
    name: string;
    background: string;
    goals: string;
  }) {
    const whatsappJid = jid(data.phoneDigits);
    const patient = await prisma.patient.upsert({
      where: { whatsappJid },
      update: { name: data.name },
      create: { whatsappJid, phone: data.phoneDigits, name: data.name },
    });
    await prisma.clinicalRecord.upsert({
      where: { patientId: patient.id },
      update: { background: data.background, goals: data.goals },
      create: { patientId: patient.id, background: data.background, goals: data.goals },
    });
    return patient;
  }

  async function addEvolution(
    patientId: string,
    entries: { daysAgo: number; weightKg: number; heightCm?: number; waistCm?: number; hipCm?: number }[],
  ) {
    for (const e of entries) {
      await prisma.evolutionEntry.create({
        data: {
          patientId,
          recordedAt: daysAgo(e.daysAgo, 12),
          weightKg: new Prisma.Decimal(e.weightKg),
          heightCm: e.heightCm != null ? new Prisma.Decimal(e.heightCm) : null,
          waistCm: e.waistCm != null ? new Prisma.Decimal(e.waistCm) : null,
          hipCm: e.hipCm != null ? new Prisma.Decimal(e.hipCm) : null,
        },
      });
    }
  }

  async function addAppointment(params: {
    patientId: string;
    service: { id: string; price: Prisma.Decimal; durationMin: number };
    startsAt: Date;
    status: "CONFIRMED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
    cancelledBy?: "PATIENT" | "PROFESSIONAL";
  }) {
    const endsAt = new Date(params.startsAt.getTime() + params.service.durationMin * 60_000);
    return prisma.appointment.create({
      data: {
        patientId: params.patientId,
        serviceId: params.service.id,
        startsAt: params.startsAt,
        endsAt,
        status: params.status,
        createdBy: "PROFESSIONAL",
        priceSnapshot: params.service.price,
        needsGoogleSync: false,
        cancelledBy: params.cancelledBy,
        cancelReason: params.status === "CANCELLED" ? "Reprogramó por trabajo" : null,
      },
    });
  }

  async function addPlan(
    patientId: string,
    title: string,
    meals: { name: string; items: { food: string; grams: number; note?: string }[] }[],
  ) {
    const plan = await prisma.nutritionPlan.create({
      data: { patientId, title, status: "ACTIVE" },
    });
    let mealOrder = 0;
    for (const meal of meals) {
      const createdMeal = await prisma.planMeal.create({
        data: { planId: plan.id, name: meal.name, order: mealOrder++ },
      });
      let itemOrder = 0;
      for (const item of meal.items) {
        await prisma.planMealItem.create({
          data: {
            mealId: createdMeal.id,
            foodId: food(item.food).id,
            quantityGrams: new Prisma.Decimal(item.grams),
            notes: item.note ?? null,
            order: itemOrder++,
          },
        });
      }
    }
    return plan;
  }

  async function addPayment(appointmentId: string, amount: Prisma.Decimal, daysAgoPaid: number) {
    await prisma.payment.create({
      data: {
        appointmentId,
        kind: "FULL",
        amount,
        status: "APPROVED",
        provider: "manual",
        paidAt: daysAgo(daysAgoPaid),
      },
    });
  }

  // --- María González ---
  const maria = await upsertPatient({
    phoneDigits: "5493415551234",
    name: "María González",
    background: "Hipotiroidismo controlado con levotiroxina.",
    goals: "Bajar 5 kg en los próximos 3 meses.",
  });
  await addEvolution(maria.id, [
    { daysAgo: 60, weightKg: 78, heightCm: 165, waistCm: 95, hipCm: 105 },
    { daysAgo: 30, weightKg: 76, waistCm: 92, hipCm: 103 },
    { daysAgo: 7, weightKg: 74.5, waistCm: 90, hipCm: 101 },
  ]);
  const mariaAppt1 = await addAppointment({
    patientId: maria.id,
    service: primera,
    startsAt: daysAgo(45, 9, 0),
    status: "COMPLETED",
  });
  await addAppointment({
    patientId: maria.id,
    service: seguimiento,
    startsAt: daysAgo(15, 9, 30),
    status: "COMPLETED",
  });
  await addAppointment({
    patientId: maria.id,
    service: seguimiento,
    startsAt: daysFromNow(3, 10, 0),
    status: "CONFIRMED",
  });
  await addPlan(maria.id, "Plan bajo en sodio", [
    {
      name: "Desayuno",
      items: [
        { food: "Yogur descremado", grams: 200 },
        { food: "Avena arrollada", grams: 40 },
        { food: "Frutilla", grams: 100 },
      ],
    },
    {
      name: "Almuerzo",
      items: [
        { food: "Pechuga de pollo cocida", grams: 150 },
        { food: "Batata cocida", grams: 150 },
        { food: "Espinaca", grams: 80, note: "Al vapor" },
      ],
    },
    {
      name: "Cena",
      items: [
        { food: "Pescado merluza", grams: 180 },
        { food: "Zanahoria", grams: 100 },
        { food: "Aceite de oliva", grams: 10 },
      ],
    },
  ]);
  await addPayment(mariaAppt1.id, primera.price, 45);

  // --- Juan Pérez ---
  const juan = await upsertPatient({
    phoneDigits: "5493515552345",
    name: "Juan Pérez",
    background: "Sin antecedentes relevantes.",
    goals: "Ganar masa muscular, entrena 4 veces por semana.",
  });
  await addEvolution(juan.id, [
    { daysAgo: 42, weightKg: 68, heightCm: 178 },
    { daysAgo: 21, weightKg: 70 },
    { daysAgo: 3, weightKg: 71.5 },
  ]);
  await addAppointment({
    patientId: juan.id,
    service: primera,
    startsAt: daysAgo(42, 16, 0),
    status: "COMPLETED",
  });
  await addAppointment({
    patientId: juan.id,
    service: seguimiento,
    startsAt: daysFromNow(0, 18, 0),
    status: "CONFIRMED",
  });
  await addPlan(juan.id, "Plan hipercalórico deportivo", [
    {
      name: "Desayuno",
      items: [
        { food: "Huevo entero", grams: 150 },
        { food: "Pan integral", grams: 80 },
        { food: "Palta", grams: 50 },
      ],
    },
    {
      name: "Post-entreno",
      items: [
        { food: "Licuado de banana con leche", grams: 300 },
        { food: "Maní tostado", grams: 30 },
      ],
    },
    {
      name: "Cena",
      items: [
        { food: "Carne vacuna magra", grams: 200 },
        { food: "Arroz integral cocido", grams: 200 },
        { food: "Brócoli", grams: 100 },
      ],
    },
  ]);
  await prisma.diaryEntry.create({
    data: { patientId: juan.id, note: "Desayuno post-entreno: huevos revueltos y avena.", createdAt: daysAgo(1, 8, 30) },
  });
  await prisma.diaryEntry.create({
    data: { patientId: juan.id, note: "Almuerzo: milanesa al horno con ensalada.", createdAt: daysAgo(0, 13, 15) },
  });

  // --- Lucía Fernández ---
  const lucia = await upsertPatient({
    phoneDigits: "5492615553456",
    name: "Lucía Fernández",
    background: "Diabetes tipo 2 diagnosticada en 2023, medicada con metformina.",
    goals: "Estabilizar la glucemia y bajar de peso moderadamente.",
  });
  await addEvolution(lucia.id, [
    { daysAgo: 25, weightKg: 82, heightCm: 160, waistCm: 100, hipCm: 108 },
    { daysAgo: 10, weightKg: 80.5, waistCm: 98, hipCm: 106 },
  ]);
  await addAppointment({
    patientId: lucia.id,
    service: primera,
    startsAt: daysAgo(25, 11, 0),
    status: "COMPLETED",
  });
  await addAppointment({
    patientId: lucia.id,
    service: seguimiento,
    startsAt: daysAgo(10, 11, 30),
    status: "NO_SHOW",
  });
  await addAppointment({
    patientId: lucia.id,
    service: seguimiento,
    startsAt: daysFromNow(5, 11, 0),
    status: "CONFIRMED",
  });
  await addPlan(lucia.id, "Plan control glucémico", [
    {
      name: "Desayuno",
      items: [
        { food: "Queso port salut light", grams: 50 },
        { food: "Pan integral", grams: 50 },
        { food: "Mate cocido sin azúcar", grams: 200 },
      ],
    },
    {
      name: "Almuerzo",
      items: [
        { food: "Lentejas cocidas", grams: 200 },
        { food: "Tomate", grams: 100 },
        { food: "Aceite de oliva", grams: 10 },
      ],
    },
    {
      name: "Cena",
      items: [
        { food: "Muslo de pollo sin piel", grams: 150 },
        { food: "Calabaza", grams: 150 },
      ],
    },
  ]);

  // --- Martín Rodríguez ---
  const martin = await upsertPatient({
    phoneDigits: "5492995554567",
    name: "Martín Rodríguez",
    background: "Colesterol LDL elevado en el último análisis de sangre.",
    goals: "Mejorar el perfil lipídico con cambios alimentarios.",
  });
  await addEvolution(martin.id, [
    { daysAgo: 30, weightKg: 90, heightCm: 175, waistCm: 102 },
    { daysAgo: 5, weightKg: 88, waistCm: 99 },
  ]);
  const martinAppt1 = await addAppointment({
    patientId: martin.id,
    service: primera,
    startsAt: daysAgo(30, 17, 0),
    status: "COMPLETED",
  });
  await addAppointment({
    patientId: martin.id,
    service: antropometria,
    startsAt: daysAgo(8, 9, 0),
    status: "CANCELLED",
    cancelledBy: "PATIENT",
  });
  await addAppointment({
    patientId: martin.id,
    service: antropometria,
    startsAt: daysFromNow(2, 11, 0),
    status: "CONFIRMED",
  });
  await addPayment(martinAppt1.id, primera.price, 30);

  // --- Sofía Martínez ---
  const sofia = await upsertPatient({
    phoneDigits: "5493425555678",
    name: "Sofía Martínez",
    background: "Deportista amateur, corre maratones.",
    goals: "Optimizar la alimentación para rendimiento y recuperación.",
  });
  await addEvolution(sofia.id, [
    { daysAgo: 40, weightKg: 58.5, heightCm: 165 },
    { daysAgo: 20, weightKg: 58 },
    { daysAgo: 2, weightKg: 57.8 },
  ]);
  const sofiaAppt1 = await addAppointment({
    patientId: sofia.id,
    service: seguimiento,
    startsAt: daysAgo(5, 15, 0),
    status: "COMPLETED",
  });
  await addAppointment({
    patientId: sofia.id,
    service: seguimiento,
    startsAt: daysFromNow(1, 9, 0),
    status: "CONFIRMED",
  });
  await addPlan(sofia.id, "Plan de rendimiento", [
    {
      name: "Desayuno",
      items: [
        { food: "Avena arrollada", grams: 60 },
        { food: "Banana", grams: 120 },
        { food: "Leche descremada", grams: 200 },
      ],
    },
    {
      name: "Pre-entreno",
      items: [{ food: "Dulce de leche", grams: 20 }, { food: "Pan francés", grams: 40 }],
    },
    {
      name: "Almuerzo",
      items: [
        { food: "Carne picada magra", grams: 150 },
        { food: "Quinoa cocida", grams: 150 },
        { food: "Tomate", grams: 80 },
      ],
    },
    {
      name: "Cena",
      items: [
        { food: "Atún al natural escurrido", grams: 120 },
        { food: "Papa hervida", grams: 200 },
        { food: "Espinaca", grams: 80 },
      ],
    },
  ]);
  await addPayment(sofiaAppt1.id, seguimiento.price, 5);

  console.log("Seed de demo completado: 5 pacientes con evolución, turnos, planes y pagos.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
