# HU-024 · Revisión independiente de T2e.1b

**Veredicto:** las cinco pruebas reconstruidas pasaron; T2e.1b sigue abierto. Candidato `c08a46a`, revisión `mwpmfrr1-2-1cyi`. El archivo original de L22 no se recuperó, por lo que no se afirma una repetición exacta.

## Resultado por caso

| Caso con tenant ajeno | Resultado y efecto del rechazo | Control positivo con tenant propio |
|---|---|---|
| Leer receta | `null`; snapshot intacto | Devuelve la receta propia |
| Editar receta | `La receta no existe.`; snapshot intacto, sin actualización ni borrado de ingredientes | Edita la receta propia sin cambiar la ajena |
| Descartar borrador de receta | `La receta no existe.`; snapshot intacto, sin intento de borrado | Borra solo la receta propia |
| Leer plantilla | `null`; snapshot intacto | Devuelve la plantilla propia |
| Editar y borrar plantilla | Ambas operaciones rechazan con `P2025` simulado; snapshot intacto después de cada rechazo | Edita y borra la plantilla propia; la ajena queda intacta |

## Ejecuciones observadas

- Verificador: `npm test -- packages/db/domain/independent-auth.probe.test.ts apps/web/src/auth.test.ts apps/web/src/lib/private-content-access.test.ts` → exit 0, 25 pruebas (5 reconstruidas, 11 de sesión, 9 de pertenencia).
- Verificador: `npm run typecheck` → exit 0 en los cuatro workspaces; `npm test` → exit 0, 2.994 pruebas aprobadas y una omitida. La ejecución focal informó una advertencia de deprecación de Vite CJS.
- El primer intento focal y de suite dio exit 1: el fixture solo usado por el verificador omitía `updatedAt` y la lectura positiva se interrumpía en `recipes.ts:340`. Se corrigió únicamente el fixture sintético y ambas ejecuciones pasaron. No se reprodujo un defecto funcional del candidato.
- Corroboración desde el worktree: `npm test -- apps/web/src/auth.test.ts apps/web/src/lib/private-content-access.test.ts packages/db/domain/recipes.test.ts packages/db/domain/planTemplates.test.ts` → exit 0, 76 pruebas aprobadas. Mismo aviso de Vite.

## Alcance y evidencia pendiente

- S26 cubierto para la reconstrucción; S27 cubierto para los controles positivos de la tabla. S20–S22 parciales: los cinco casos ejercitan el dominio con un tenant explícito; las 20 pruebas de sesión y pertenencia son independientes de esos cinco casos. No se verificó la cadena completa con una sesión HTTP autenticada ni todo el perímetro de rutas.
- S19 respetado en la ejecución. No se conectó a ninguna base ni servicio real. S25: no se amplió el alcance; la revisión no fue una auditoría exhaustiva de HU-025.
- S28 conserva la evidencia independiente previa de PostgreSQL (ODD L22 y L41). No se repitieron las migraciones ni se ensayó el upgrade final. No se comparó el comportamiento ejecutable contra `69a3a96`.
- Los mocks aplican los predicados que reciben; no comprueban semántica real de Prisma ni concurrencia. No corresponde ajustar código de aplicación por el error de fixture.

## Fuente exacta de los cinco casos

En una copia del candidato con dependencias disponibles, guardar el siguiente bloque en `packages/db/domain/independent-auth.probe.test.ts` y ejecutar el comando focal anterior con una URL inerte. No copiar `.env`, credenciales ni datos reales.

```ts
import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ db: {} as any }));
vi.mock("../index", () => ({ prisma: m.db }));
import { recipesForTenant } from "./recipes";
import { getTemplate, updateTemplate, deleteTemplate } from "./planTemplates";
let recipes: any[], templates: any[];
const match = (rows: any[], where: any) => rows.find(r => r.id === where.id && (where.tenantId === undefined || r.tenantId === where.tenantId));
const input: any = { name: "edited", type: null, moments: [], tags: [], yieldPortions: null, portionHousehold: null, portionGrams: null, preparation: null, tips: null, sourceName: null, published: null, ingredients: [] };
beforeEach(() => {
  recipes = ["a", "b"].map(t => ({ id: `r${t}`, tenantId: t, name: `private-${t}`, status: "DRAFT", origin: "MANUAL", reviewedAt: null, updatedAt: new Date(0), ingredients: [], importImages: [], photo: null, publishedPortionText: null, publishedKcal: null, publishedProteinG: null, publishedCarbsG: null, publishedFatG: null, publishedFiberG: null }));
  templates = ["a", "b"].map(t => ({ id: `t${t}`, tenantId: t, title: `private-${t}`, meals: [], sections: [] }));
  m.db.recipe = {
    findUnique: vi.fn(async ({where}) => match(recipes, where) ?? null),
    updateMany: vi.fn(async ({where, data}) => { const r = match(recipes, where); if (!r) return {count:0}; Object.assign(r, data); return {count:1}; }),
    deleteMany: vi.fn(async ({where}) => { const r = match(recipes, where); if (!r) return {count:0}; recipes.splice(recipes.indexOf(r),1); return {count:1}; }),
  };
  m.db.recipeIngredient = { deleteMany: vi.fn(async () => ({})), createMany: vi.fn(async () => ({})) };
  m.db.planTemplate = {
    findUnique: vi.fn(async ({where}) => match(templates,where) ?? null),
    update: vi.fn(async ({where,data}) => { const t = match(templates,where); if (!t) throw Object.assign(new Error("not found"),{code:"P2025"}); Object.assign(t,data); return t; }),
    delete: vi.fn(async ({where}) => { const t = match(templates,where); if (!t) throw Object.assign(new Error("not found"),{code:"P2025"}); templates.splice(templates.indexOf(t),1); return t; }),
  };
  m.db.$transaction = async (fn: any) => fn(m.db);
});
const snapshot = () => JSON.stringify({recipes, templates});
it("foreign recipe read denied; own read allowed", async () => { const before=snapshot(); expect(await recipesForTenant("a").get("rb")).toBeNull(); expect(snapshot()).toBe(before); expect(await recipesForTenant("a").get("ra")).toMatchObject({id:"ra",name:"private-a"}); });
it("foreign recipe edit denied; own edit allowed", async () => { const before=snapshot(); await expect(recipesForTenant("a").update("rb",input)).rejects.toThrow("La receta no existe."); expect(snapshot()).toBe(before); expect(m.db.recipe.updateMany).not.toHaveBeenCalled(); expect(m.db.recipeIngredient.deleteMany).not.toHaveBeenCalled(); await recipesForTenant("a").update("ra",input); expect(recipes[0].name).toBe("edited"); expect(recipes[1].name).toBe("private-b"); });
it("foreign recipe discard denied; own discard allowed", async () => { const before=snapshot(); await expect(recipesForTenant("a").discardDraft("rb")).rejects.toThrow("La receta no existe."); expect(snapshot()).toBe(before); expect(m.db.recipe.deleteMany).not.toHaveBeenCalled(); await recipesForTenant("a").discardDraft("ra"); expect(recipes.map(r=>r.id)).toEqual(["rb"]); });
it("foreign template read denied; own read allowed", async () => { const before=snapshot(); expect(await getTemplate("tb","a")).toBeNull(); expect(snapshot()).toBe(before); expect(await getTemplate("ta","a")).toMatchObject({id:"ta",title:"private-a"}); });
it("foreign template edit and delete denied; own edit and delete allowed", async () => { const before=snapshot(); await expect(updateTemplate("tb",{title:"edited"},"a")).rejects.toMatchObject({code:"P2025"}); expect(snapshot()).toBe(before); await expect(deleteTemplate("tb","a")).rejects.toMatchObject({code:"P2025"}); expect(snapshot()).toBe(before); await updateTemplate("ta",{title:"edited"},"a"); expect(templates[0].title).toBe("edited"); await deleteTemplate("ta","a"); expect(templates).toEqual([{id:"tb",tenantId:"b",title:"private-b",meals:[],sections:[]}]); });
```
