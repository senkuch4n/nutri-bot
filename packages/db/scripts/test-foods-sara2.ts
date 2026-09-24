/**
 * Prueba contra la base de desarrollo de la base de alimentos (HU-005).
 *
 * 1. Carga de SARA 2 dentro de una transacción que se revierte a propósito: nada queda escrito.
 * 2. Alimentos propios de prueba: se guardan sus ids y se borran por id en `finally`.
 * Nunca toca los alimentos propios preexistentes, ni planes ni pacientes. No usa WhatsApp.
 *
 * Uso: npm run test:foods --workspace packages/db
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateSara2Dataset, type Sara2Dataset } from "@nutri-bot/core/sara2";
import { prisma } from "../index";
import {
  DuplicateOwnFoodNameError,
  FoodNotEditableError,
  InvalidOwnFoodError,
  Sara2LoadAbortedError,
  applyAtwaterKcal,
  createOwnFood,
  findFoodNameConflicts,
  getFoodUsage,
  loadSara2Dataset,
  updateOwnFood,
  type OwnFoodInput,
} from "../domain";

class Rollback extends Error {}

const step = async (label: string, fn: () => Promise<void>) => {
  try {
    await fn();
    console.log(`ok  ${label}`);
  } catch (err) {
    console.log(`ERR ${label}`);
    throw err;
  }
};

async function propiosSnapshot(): Promise<string> {
  const rows = await prisma.food.findMany({
    where: { source: "PROPIO" },
    select: {
      id: true,
      name: true,
      group: true,
      kcalPer100: true,
      proteinPer100: true,
      carbsPer100: true,
      fatPer100: true,
      fiberPer100: true,
      unitHint: true,
      active: true,
    },
    orderBy: { id: "asc" },
  });
  return JSON.stringify(rows);
}

const baseInput: OwnFoodInput = {
  name: "Prueba HU-005 barrita",
  group: "OTROS",
  reference: "rótulo de prueba",
  proteinPer100: 10,
  carbsPer100: 60,
  fatPer100: 15,
  fiberPer100: 5,
  alcoholPer100: null,
  sodiumMgPer100: null,
  addedSugarPer100: null,
  saturatedFatPer100: null,
  cholesterolMgPer100: null,
  unitHint: null,
};

async function main() {
  const valid = validateSara2Dataset(
    JSON.parse(readFileSync(new URL("../data/sara2/alimentos.json", import.meta.url), "utf8")),
  );
  if (!valid.ok) throw new Error(`alimentos.json inválido: ${valid.errors.join("; ")}`);
  const ds: Sara2Dataset = valid.dataset;
  const total = ds.foods.length;

  const propiosBefore = await propiosSnapshot();
  const saraBefore = await prisma.food.count({ where: { source: "SARA2" } });
  console.log(`antes: ${saraBefore} SARA 2, dataset con ${total}`);

  // ─── 1. Carga en transacción revertida ────────────────────────────────────
  await step("carga SARA 2 idempotente, respeta desactivados y desactiva sin borrar (revertido)", async () => {
    try {
      await prisma.$transaction(
        async (tx) => {
          const first = await loadSara2Dataset(tx, ds);
          assert.equal(first.total, total);
          assert.equal(first.created, saraBefore === 0 ? total : 0, "created en la primera carga");
          assert.equal(first.created + first.updated + first.unchanged, total);

          const idsBefore = new Map(
            (await tx.food.findMany({ where: { source: "SARA2" }, select: { id: true, sourceKey: true } })).map(
              (f) => [f.sourceKey, f.id],
            ),
          );
          const second = await loadSara2Dataset(tx, ds);
          assert.deepEqual(second, { total, created: 0, updated: 0, unchanged: total, deactivated: 0 });
          const afterSecond = await tx.food.findMany({ where: { source: "SARA2" }, select: { id: true, sourceKey: true } });
          assert.equal(afterSecond.length, idsBefore.size, "misma cantidad de SARA 2");
          for (const f of afterSecond) assert.equal(idsBefore.get(f.sourceKey), f.id, "mismo id por sourceKey");

          const dup = await tx.food.groupBy({ by: ["sourceKey"], where: { source: "SARA2" }, _count: true });
          assert.ok(dup.every((d) => d._count === 1), "sourceKey sin duplicados");

          const arroz = await tx.food.findUniqueOrThrow({ where: { sourceKey: "sara2:t03:arroz-blanco-hervido" } });
          assert.equal(Number(arroz.kcalPer100), 125.8);
          assert.equal(Number(arroz.proteinPer100), 2.4);
          assert.equal((arroz.nutrients as { kcalPublicada: number }).kcalPublicada, 126);
          assert.equal(arroz.groupAutoAssigned, false);
          assert.equal(arroz.unitHint, null);

          // Desactivado por ella → la recarga no lo reactiva.
          const first0 = ds.foods[0]!;
          await tx.food.update({ where: { sourceKey: first0.sourceKey }, data: { active: false } });
          const third = await loadSara2Dataset(tx, ds);
          assert.equal(third.unchanged, total);
          const still = await tx.food.findUniqueOrThrow({ where: { sourceKey: first0.sourceKey } });
          assert.equal(still.active, false, "sigue inactivo");

          // Un alimento que sale del archivo se desactiva, no se borra.
          const gone = ds.foods[1]!;
          const fourth = await loadSara2Dataset(tx, { ...ds, foods: ds.foods.filter((f) => f !== gone) });
          assert.equal(fourth.deactivated, 1);
          const goneRow = await tx.food.findUnique({ where: { sourceKey: gone.sourceKey } });
          assert.ok(goneRow, "existe");
          assert.equal(goneRow.active, false);

          // Un archivo con 20 % menos aborta.
          const cut = ds.foods.slice(0, Math.floor(total * 0.8));
          await assert.rejects(loadSara2Dataset(tx, { ...ds, foods: cut }), Sara2LoadAbortedError);

          throw new Rollback();
        },
        { timeout: 300_000, maxWait: 10_000 },
      );
    } catch (err) {
      if (!(err instanceof Rollback)) throw err;
    }
    assert.equal(await propiosSnapshot(), propiosBefore, "los propios no cambiaron");
    assert.equal(await prisma.food.count({ where: { source: "SARA2" } }), saraBefore, "la transacción se revirtió");
  });

  // ─── 2. Alimentos propios (ids propios, borrados por id) ─────────────────
  const createdIds: string[] = [];
  try {
    let id = "";
    await step("createOwnFood calcula kcal por Atwater", async () => {
      const food = await createOwnFood(baseInput);
      createdIds.push(food.id);
      id = food.id;
      assert.equal(Number(food.kcalPer100), 415);
      assert.equal(food.source, "PROPIO");
      assert.equal(food.sourceKey, null);
      assert.equal(food.nutrients, null);
      assert.equal(food.groupAutoAssigned, false);
      assert.equal(food.reference, "rótulo de prueba");
    });

    await step("nombre repetido de otro propio → DuplicateOwnFoodNameError", async () => {
      await assert.rejects(createOwnFood({ ...baseInput, name: "prueba hu-005  BARRITA" }), (err) => {
        assert.ok(err instanceof DuplicateOwnFoodNameError);
        assert.equal(err.existingId, id);
        return true;
      });
    });

    await step("findFoodNameConflicts con un nombre de SARA 2", async () => {
      const saraCount = await prisma.food.count({ where: { source: "SARA2" } });
      if (saraCount === 0) {
        console.log("    (se saltea: SARA 2 todavía no está cargada)");
        return;
      }
      const c = await findFoodNameConflicts("acelga  cruda");
      assert.ok(c.sara, "encuentra el SARA 2");
      assert.equal(c.sara.name, "Acelga, cruda");
    });

    await step("updateOwnFood recalcula kcal y apaga groupAutoAssigned", async () => {
      await prisma.food.update({ where: { id }, data: { groupAutoAssigned: true } });
      const food = await updateOwnFood(id, { ...baseInput, proteinPer100: 20 });
      assert.equal(Number(food.kcalPer100), 455);
      assert.equal(food.groupAutoAssigned, false);
    });

    await step("updateOwnFood sobre un SARA 2 → FoodNotEditableError (sin escribir)", async () => {
      const sara = await prisma.food.findFirst({ where: { source: "SARA2" }, select: { id: true, updatedAt: true } });
      if (!sara) {
        console.log("    (se saltea: SARA 2 todavía no está cargada)");
        return;
      }
      await assert.rejects(updateOwnFood(sara.id, baseInput), FoodNotEditableError);
      await assert.rejects(applyAtwaterKcal(sara.id), FoodNotEditableError);
      const after = await prisma.food.findUniqueOrThrow({ where: { id: sara.id }, select: { updatedAt: true } });
      assert.equal(after.updatedAt.getTime(), sara.updatedAt.getTime());
    });

    await step("macros que suman más de 100 g → InvalidOwnFoodError", async () => {
      await assert.rejects(
        createOwnFood({ ...baseInput, name: "Prueba HU-005 inválido", proteinPer100: 50, carbsPer100: 40, fatPer100: 15, fiberPer100: null }),
        (err) => {
          assert.ok(err instanceof InvalidOwnFoodError);
          assert.deepEqual(err.issues, ["MACROS_OVER_100"]);
          return true;
        },
      );
      assert.equal(await prisma.food.count({ where: { name: "Prueba HU-005 inválido" } }), 0);
    });

    await step("applyAtwaterKcal vuelve a las kcal por macros", async () => {
      await prisma.food.update({ where: { id }, data: { kcalPer100: 999 } });
      const food = await applyAtwaterKcal(id);
      assert.equal(Number(food.kcalPer100), 455);
    });

    await step("getFoodUsage de un alimento sin planes", async () => {
      assert.deepEqual(await getFoodUsage(id), { plans: 0, templates: 0 });
    });
  } finally {
    if (createdIds.length > 0) {
      await prisma.food.deleteMany({ where: { id: { in: createdIds }, source: "PROPIO" } });
    }
    console.log(`borrados por id: ${createdIds.join(", ") || "(ninguno)"}`);
  }

  assert.equal(await propiosSnapshot(), propiosBefore, "los propios preexistentes siguen iguales");
  console.log("OK");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
