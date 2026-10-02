import { PrismaClient } from "@prisma/client";
import { readFoodNutrients } from "@nutri-bot/core";
import { validateSara2Dataset } from "@nutri-bot/core/sara2";
import { readFileSync } from "node:fs";

// Small, additive local demo. Existing records are never updated or deleted.
// Invalid WhatsApp domains prevent these fictional identities being real contacts.
const prisma = new PrismaClient();

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
    throw new Error("This demo seed only supports a local development database.");
  }

  const foods = await prisma.food.findMany({
    where: { source: "SARA2", active: true }, orderBy: { id: "asc" },
  });
  const validated = validateSara2Dataset(JSON.parse(readFileSync(new URL("../data/sara2/alimentos.json", import.meta.url), "utf8")));
  if (!validated.ok) throw new Error("The local SARA 2 dataset is invalid.");
  const available = foods.length ? foods : validated.dataset.foods;
  const withNutrients = available.map((food) => ({ food, nutrients: readFoodNutrients(food.nutrients) }));
  const pick = (key: "calcio" | "hierro" | "vitaminaC") => {
    const candidates = withNutrients.filter((entry) => (entry.nutrients?.[key] ?? 0) > 0);
    candidates.sort((a, b) => (b.nutrients?.[key] ?? 0) - (a.nutrients?.[key] ?? 0));
    const food = candidates[0]?.food;
    if (!food) throw new Error(`No usable SARA 2 food for ${key}. Load SARA 2 before running this seed.`);
    return food;
  };
  const selected = [pick("calcio"), pick("hierro"), pick("vitaminaC")];
  const cases = [
    { key: "adult", name: "Prueba HU-010 · Adulto", sex: "MALE" as const, birthDate: new Date("1990-01-15"), custom: false },
    { key: "older", name: "Prueba HU-010 · Adulta mayor", sex: "FEMALE" as const, birthDate: new Date("1950-01-15"), custom: true },
    { key: "missing", name: "Prueba HU-010 · Sin datos personales", sex: null, birthDate: null, custom: false },
    { key: "minor", name: "Prueba HU-010 · Menor de 19", sex: "FEMALE" as const, birthDate: new Date(`${new Date().getUTCFullYear() - 16}-01-15`), custom: false },
  ];

  const results = await prisma.$transaction(async (tx) => {
    const selectedIds: string[] = [];
    for (const food of selected) {
      if ("id" in food) {
        selectedIds.push(food.id);
        continue;
      }
      const existing = await tx.food.findUnique({ where: { sourceKey: food.sourceKey } });
      if (existing) {
        selectedIds.push(existing.id);
        continue;
      }
      const { table: _table, pages: _pages, ...data } = food;
      const created = await tx.food.create({ data: { ...data, source: "SARA2" } });
      selectedIds.push(created.id);
    }
    const created: { name: string; patientId: string; planId: string | null; skipped: boolean }[] = [];
    for (const scenario of cases) {
      const id = `hu010-demo-patient-${scenario.key}`;
      const existing = await tx.patient.findUnique({ where: { id }, include: { nutritionPlans: { select: { id: true }, take: 1 } } });
      if (existing) {
        created.push({ name: existing.name ?? id, patientId: id, planId: existing.nutritionPlans[0]?.id ?? null, skipped: true });
        continue;
      }
      const planId = `hu010-demo-plan-${scenario.key}`;
      await tx.patient.create({
        data: {
          id, name: scenario.name, phone: `HU010-${scenario.key}`,
          whatsappJid: `hu010-${scenario.key}@example.invalid`,
          sex: scenario.sex, birthDate: scenario.birthDate,
          notes: "Paciente ficticio para probar micronutrientes. No contactar. Los alimentos y porciones del plan son una muestra técnica, no una indicación clínica.",
          nutritionPlans: {
            create: {
              id: planId, title: "Prueba de micronutrientes HU-010", status: "DRAFT",
              notes: "Muestra técnica con alimentos SARA 2 seleccionados por su aporte de calcio, hierro y vitamina C. No es un plan para consumo.",
              meals: {
                create: selected.map((food, index) => ({
                  name: ["Muestra de calcio", "Muestra de hierro", "Muestra de vitamina C"][index]!,
                  order: index,
                  items: { create: [
                    { foodId: selectedIds[index]!, quantityGrams: index === 0 ? 250 : 100, order: 0 },
                    ...(scenario.custom && index === 0 ? [{ customLabel: "Preparación casera sin composición registrada", order: 1 }] : []),
                  ] },
                })),
              },
            },
          },
        },
      });
      created.push({ name: scenario.name, patientId: id, planId, skipped: false });
    }
    return created;
  });
  for (const result of results) {
    console.log(`${result.skipped ? "Existing (unchanged)" : "Created"}: ${result.name}`);
    if (result.planId) console.log(`  /pacientes/${result.patientId}/planes/${result.planId}`);
  }
  console.log("SARA 2 sample foods:", selected.map((food) => food.name).join(" · "));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
