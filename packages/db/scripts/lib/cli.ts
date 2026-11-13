/**
 * HU-020 (SDD 5.8): helpers chicos de línea de comandos que comparten los scripts de carga
 * (recipes:extract, recipes:import, plans:import, plans:undo). Movidos desde recipes/extract.ts y
 * recipes/import.ts sin cambiar su comportamiento.
 */
import { execFileSync } from "node:child_process";
import { createInterface } from "node:readline/promises";

/** Valores de un flag repetible: `--file a --file b` → ["a", "b"]. */
export function argValues(flag: string): string[] {
  const out: string[] = [];
  process.argv.forEach((a, i) => {
    if (a === flag && process.argv[i + 1]) out.push(process.argv[i + 1]!);
  });
  return out;
}

export const hasFlag = (flag: string) => process.argv.includes(flag);

/** Corre un comando de poppler (pdftotext, pdfimages…) y devuelve su salida. Si falta, sale con aviso. */
export function run(cmd: string, args: string[], encoding: "utf8" | "buffer" = "utf8"): string {
  try {
    return execFileSync(cmd, args, {
      maxBuffer: 256 * 1024 * 1024,
      encoding: encoding === "utf8" ? "utf8" : undefined,
      stdio: ["ignore", "pipe", "ignore"],
    }) as unknown as string;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      console.error(`Falta ${cmd} (poppler). En macOS: brew install poppler`);
      process.exit(1);
    }
    throw err;
  }
}

/** "host:port/db" de una URL de Postgres, sin usuario ni contraseña. */
export function describeDbTarget(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname}:${u.port || "5432"}${u.pathname}`;
  } catch {
    return "(no se pudo leer la URL)";
  }
}

/** Exige DATABASE_URL, muestra solo host:port/db y pide escribir SI (salvo --yes). */
export async function confirmWrite(
  message = "Se van a crear o actualizar borradores en esa base. Escribí SI para seguir: ",
): Promise<boolean> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("--write necesita DATABASE_URL.");
    process.exit(1);
  }
  console.log(`Base: ${describeDbTarget(url)}`);
  if (hasFlag("--yes")) return true;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(message);
  rl.close();
  return answer.trim() === "SI";
}
