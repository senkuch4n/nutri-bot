/**
 * HU-018a-2 (SDD 8.4, 12-D8): importa un bundle de `recipes:export` en la base de DATABASE_URL
 * (producción, por túnel, como sara2:load:prod). No lee el .env: la URL va en el entorno.
 *
 * - Por defecto corre EN SECO: muestra qué haría y no escribe nada.
 * - Con --write pide escribir SI. Crea las recetas PUBLISHED que falten; es idempotente por
 *   importKey (correrlo dos veces no duplica) y NUNCA modifica recetas existentes.
 * - Antes de --write en producción: pg_dump.
 *
 * Uso: DATABASE_URL=… npm run recipes:import:prod --workspace packages/db -- <bundle.json> [--write]
 */
import { readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { validateRecipeBundle } from "@nutri-bot/core/recipe-import";

const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));

function target(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname}:${u.port || "5432"}${u.pathname}`;
  } catch {
    return "(no se pudo leer la URL)";
  }
}

async function main() {
  const write = process.argv.includes("--write");
  const arg = process.argv.slice(2).find((a) => !a.startsWith("--"));
  if (!arg) {
    console.error("Falta el bundle: recipes:import:prod -- <bundle.json> [--write]");
    process.exit(1);
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("Falta DATABASE_URL en el entorno (este script no lee el .env).");
    process.exit(1);
  }

  const file = isAbsolute(arg) ? arg : resolve(repoRoot, arg);
  const valid = validateRecipeBundle(JSON.parse(readFileSync(file, "utf8")));
  if (!valid.ok) {
    console.error("El bundle no es válido:");
    for (const e of valid.errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  console.log(`Base: ${target(url)}`);
  console.log(`Bundle: ${valid.bundle.recipes.length} recetas (exportado ${valid.bundle.exportedAt}).`);
  if (write) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question("Se van a crear recetas PUBLICADAS en esa base. Escribí SI para seguir: ");
    rl.close();
    if (answer.trim() !== "SI") {
      console.log("Cancelado: no se escribió nada.");
      return;
    }
  }

  // El cliente de la base se carga después de validar el bundle y confirmar.
  const { prisma } = await import("../../index");
  const { importRecipeBundle } = await import("../../domain/recipeTransfer");
  try {
    const outcomes = await importRecipeBundle(valid.bundle, { dryRun: !write });
    const label = (o: (typeof outcomes)[number]) => {
      switch (o.result) {
        case "created":
          return write ? `creada (${o.id})` : "se crearía";
        case "skipped-exists":
          return "ya existe (no se toca)";
        case "skipped-food":
          return `salteada: ${o.detail}`;
        case "skipped-invalid":
          return `salteada: ${o.issues.join(" · ")}`;
      }
    };
    for (const o of outcomes) console.log(`  ${o.importKey} → ${label(o)}`);
    const count = (r: string) => outcomes.filter((o) => o.result === r).length;
    console.log(
      `${write ? "Resultado" : "En seco (no se escribió nada)"}: ${count("created")} ${write ? "creadas" : "a crear"} · ${count("skipped-exists")} ya existían · ${count("skipped-food")} sin alimento · ${count("skipped-invalid")} inválidas`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error((err as Error).message);
  process.exitCode = 1;
});
