import { readFileSync } from "node:fs";

/** Salida real de `pdftotext -bbox -f N -l N` del PDF de SARA 2 (sin editar). */
export function fixture(page: number): string {
  const name = `p${String(page).padStart(3, "0")}.xhtml`;
  return readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), "utf8");
}
