/**
 * HU-029 · 029a (SDD §A.3): compuertas del script de sandbox de suscripciones. Fail closed: si
 * algo no prueba que estamos en sandbox con un usuario de prueba, el script no opera.
 */
import { relative, resolve, isAbsolute } from "node:path";

/** Tira si `/users/me` no es un usuario de prueba de MP (`tags` con "test_user"). */
export function assertSandboxSeller(me: unknown): void {
  const tags = me !== null && typeof me === "object" ? (me as { tags?: unknown }).tags : undefined;
  if (!Array.isArray(tags) || !tags.includes("test_user")) {
    throw new Error(
      "La cuenta del ARZIUM_MERCADOPAGO_ACCESS_TOKEN no es un usuario de prueba de Mercado Pago "
      + "(falta el tag \"test_user\" en /users/me). El script solo opera con el vendedor de prueba.",
    );
  }
}

/** Exige `MP_SUBS_SANDBOX=true` y `NODE_ENV !== "production"`. */
export function assertSandboxEnv(env: Record<string, string | undefined>): void {
  if (env.MP_SUBS_SANDBOX !== "true") {
    throw new Error("Falta MP_SUBS_SANDBOX=true en .env.mp-sandbox.local: el script solo corre contra el sandbox.");
  }
  if (env.NODE_ENV === "production") {
    throw new Error("NODE_ENV=production: el script de sandbox no corre en producción.");
  }
}

/** Las capturas (cuerpos de webhooks, estado local con ids completos) nunca van dentro del repo. */
export function assertCaptureDirOutsideRepo(captureDir: string, repoRoot: string): void {
  const rel = relative(resolve(repoRoot), resolve(captureDir));
  const inside = rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
  if (inside) {
    throw new Error(`MP_SUBS_CAPTURE_DIR tiene que estar fuera del repo (es ${captureDir}).`);
  }
}
