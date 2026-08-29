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

  console.log("Seed completado.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
