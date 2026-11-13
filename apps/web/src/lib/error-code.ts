// HU-016 (D10): qué loguear de un error en caminos que llevan datos sensibles (firma, PDF con la
// firma incrustada). Solo el código (Prisma: "P2000", …) o la clase del error: nunca el error entero
// ni su `message`, porque un error de Prisma puede imprimir los argumentos de la llamada (bytes).
export function errorCode(err: unknown): string {
  if (err && typeof err === "object") {
    const code = (err as { code?: unknown }).code;
    if (typeof code === "string") return code;
    const name = (err as { name?: unknown }).name;
    if (typeof name === "string") return name;
  }
  return "error";
}
