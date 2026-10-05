/**
 * HU-018d (D9, SDD 3.6): convierte en medidas caseras los `unitHint` legibles ("1 taza ≈ 180 g").
 *
 * Por defecto corre EN SECO: no escribe nada, imprime el reporte. Con `--apply` escribe en una sola
 * transacción. Idempotente (una segunda corrida da 0 altas). Nunca modifica ni borra `unitHint`,
 * nunca toca medidas existentes ni ítems de planes.
 *
 * Uso:
 *   npm run measures:convert-hints --workspace packages/db                 # seco, base de dev
 *   npm run measures:convert-hints --workspace packages/db -- --apply      # escribe (solo con el OK del usuario)
 *   npm run measures:convert-hints:prod --workspace packages/db            # seco, con DATABASE_URL del entorno
 */
import { formatGrams } from "@nutri-bot/core";
import { prisma } from "../../index";
import { convertUnitHints, type UnitHintRow } from "../../domain/unitHintConversion";

function resultText(r: UnitHintRow["result"]): string {
  switch (r.kind) {
    case "CREATED":
      return `creada: ${r.name} = ${formatGrams(r.grams)}`;
    case "WOULD_CREATE":
      return `${r.name} = ${formatGrams(r.grams)}`;
    case "ALREADY_HAD":
      return `ya tenía «${r.name}»`;
    case "UNREADABLE":
      return "no se puede leer";
  }
}

async function main() {
  const apply = process.argv.slice(2).includes("--apply");
  const rows = await convertUnitHints({ apply });

  console.log(apply ? "Conversión de unitHint (CON escritura)\n" : "Conversión de unitHint (EN SECO: no se escribe nada)\n");
  const table = rows.map((r) => ({ alimento: r.foodName, fuente: r.source, unitHint: r.unitHint, resultado: resultText(r.result) }));
  if (table.length > 0) console.table(table);

  const count = (kind: UnitHintRow["result"]["kind"]) => rows.filter((r) => r.result.kind === kind).length;
  const toCreate = apply ? count("CREATED") : count("WOULD_CREATE");
  console.log(
    `\n${rows.length} alimentos con unitHint · ${toCreate} ${apply ? "medidas creadas" : "medidas a crear"} · ` +
      `${count("ALREADY_HAD")} ya tenían la medida · ${count("UNREADABLE")} no se pueden leer`,
  );
  if (!apply && toCreate > 0) console.log("Para escribirlas: agregá -- --apply (solo con el OK del usuario).");
}

main()
  .catch((err) => {
    console.error((err as Error).message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
