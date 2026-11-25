# Review — HU-025b2 (reintento 1)

**Veredicto:** APPROVED

Scope: the retry commits `git diff ac42a4d..HEAD` (`7df879b` and `ea1d792`), checked against the round 1 review (`progress/review_HU-025b2-ronda1.md`). The full diff `95259e1..HEAD` was re-read only where it touches those points. Everything below was run during this review.

## Verificación corrida por el reviewer

| Comando | Resultado |
|---|---|
| `npm run db:generate` + `rm -rf apps/web/.next/types` + `npm run typecheck` | exit 0 (core, db, bot, web) |
| `npm run test` | 228 archivos pasan y 1 se salta; 3913 tests pasan y 1 se salta; exit 0. En la ronda 1 eran 227/3908: se suman `whatsapp.test.ts` (4 tests) y 1 test en `recipes.test.ts`. |
| `./ops/harness/verify.sh` | "Arnés OK", exit 0 |
| `bash packages/db/scripts/test-tenant-isolation.sh` | En Postgres descartable: M1–M3 13/13 y M4–M7 14/14, con el test nuevo de recetas. "test-tenant-isolation: OK", exit 0. No quedaron contenedores (`docker ps --filter label=hu025.tenant-isolation` vacío). |
| `git status` | Solo quedan `progress/impl_HU-025b2.md` y `progress/review_HU-025b2-ronda1.md` sin trackear. No quedaron archivos sueltos. |

No volví a correr `test:confirm-flow` ni `test:after-hours` porque escriben en la base de desarrollo. El reintento solo cambia `setBotStatus`, que esos scripts no ejecutan, y la ronda 1 los corrió (8/8 y 12/12) sobre los mismos flujos. El cambio del bot lo cubre `apps/bot/src/whatsapp.test.ts`, con Baileys y la base mockeados.

## Hallazgos de la ronda 1, punto por punto

1. **Catálogo de recetas sin la visibilidad del consultorio: resuelto.**
   - `packages/db/domain/recipes.ts:352-371` (`readFoodsForRecipes`). Con `tenantId`, filtra por `tenantVisibleFoodWhere(t)`, la misma regla que `/alimentos` y `tenant_visible_foods`.
   - Los `includeIds` entran solo dentro de `tenantFoodWhere(t)`: un propio de otro consultorio nunca entra, ni aunque se pida.
   - `active` se calcula con `activeForTenant`, leyendo solo la preferencia del tenant (`visibilityFor(t)`, exportados de `foods.ts:47` y `foods.ts:53`).
   - El camino sin tenant (scripts) conserva la columna global, igual que antes.
   - Los dos sentidos del desvío quedan cubiertos:
     - Un SARA 2 con preferencia `visible=false` sale del catálogo, y entra marcado inactivo solo si la receta ya lo usa.
     - Un SARA 2 con `active=false` y sin preferencia sigue visible.
   - Tests:
     - Con mock: `packages/db/domain/recipes.test.ts:465-498`. Fija el `where`, que la preferencia leída es solo la de `tenant-a` y los valores de `active`.
     - Contra Postgres real: `packages/db/scripts/tenant-isolation-b2.integration.ts:267-287`. Fija que lo que oculta C no afecta a D, el `includeIds`, que un propio de D no entra aunque se pida, y la columna global en false.
     - El probe restaura los datos en `finally` y corre en el contenedor descartable.
   - Revisé que no quedaran otros lectores del panel con la columna global para SARA 2:
     - `foodReferenceOwnership.ts` no filtra por `active`.
     - `recipeTransfer.ts:178` (importación por script) no está en el diff, es previo y queda fuera de alcance.
2. **SQL de producción de la decisión 7: resuelto.**
   - `progress/impl_HU-025b2.md:60-80` describe los dos desvíos: (a) un SARA 2 desactivado después de HU-024 reaparecería, y (b) uno reactivado después desaparecería.
   - El chequeo de solo lectura es la consulta que pidió la ronda 1, sin cambios.
   - El remedio es un único `INSERT … ON CONFLICT ("tenantId","foodId") DO UPDATE SET visible = EXCLUDED.visible` dentro de `BEGIN`, y el reporte aclara que se corre **antes** del deploy.
   - El orquestador tiene que llevarlo a la nota de deploy del PR.
3. **Duda `setBotStatus` (la pidió el orquestador): resuelta.**
   - `apps/bot/src/whatsapp.ts:26-52` envuelve en `try/catch` la resolución del tenant y el `upsert`.
   - El log lleva solo `{ code, connected }`, sin mensaje, QR ni ids.
   - `apps/bot/src/whatsapp.test.ts` fija cuatro cosas:
     - Con la base sana, la reconexión sale a los 3 s.
     - Un `P2002` (fila ajena) no rechaza y el log no filtra el mensaje.
     - Si el tenant no se resuelve, no escribe.
     - Si la base está caída al abrir, no rechaza.
   - No hay mensajes nuevos al paciente y el bot sigue en silencio por defecto.

No encontré regresiones: los consumidores de `recipesForTenant(...).foods()` (editor, nueva y revisar) conservan la forma de `RecipeCatalogFood`, y typecheck y tests pasan.

## Checkpoints

### C1 — Arnés
- [x] `backlog/` válido (`verify.sh` OK). Ni el reintento ni el diff tocan `backlog/` ni `progress/current-*`.
- [x] El diff no toca archivos de HU de la otra persona.
- [x] `./ops/harness/verify.sh` exit 0.

### C2 — Documentos
- [x] La HU y la SDD están completas, sin cambios desde la ronda 1.
- [x] Firmas: `activeForTenant` y `visibilityFor` pasan a exportarse. Son agregados internos de `domain/foods.ts` y no rompen el contrato 4.4. `recipesForTenant(tenantId).foods(includeIds)` mantiene su firma.

### C3 — Arquitectura
- [x] La regla de visibilidad se reutiliza desde `foods.ts`, sin duplicarla en `recipes.ts`.
- [x] Web y bot compilan. No hay migraciones nuevas ni cambios en `schema.prisma`.
- [x] Bot: no hay mensajes nuevos. Una falla del estado ya no corta la reconexión.
- [x] No hay `console.log` ni TODO nuevos.

### C4 — Verificación
- [x] `npm run typecheck` limpio.
- [x] `npm run test` pasa, con tests nuevos que prueban comportamiento real (where, valores de `active` y reconexión con timers falsos).
- [x] Probe de aislamiento contra Postgres descartable OK. No se mandó WhatsApp real ni se escribió en la base de desarrollo.

### C5 — Cierre
- [x] `progress/impl_HU-025b2.md` describe el reintento (sección "Reintento 1").
- [x] `progress/review_HU-025b2.md` (este archivo).
- [x] El comportamiento existente de ocultar un SARA 2 vuelve a aplicarse en recetas, ahora por consultorio.

## Cambios requeridos

Ninguno.

## Dudas (no bloqueantes)

- **Para el PR, antes de publicar:** llevar a la nota de deploy los chequeos de solo lectura de producción:
  - El SQL de la decisión 7 (y su remedio, si da más de 0).
  - `SELECT id, "tenantId" FROM "BotStatus";`
  - `SELECT id, "tenantId" FROM "MercadoPagoAccount";`
- Siguen vigentes las dudas no bloqueantes de la ronda 1:
  - Acciones `"use server"` inline que el test de guarda no recorre.
  - El detector de guarda es textual.
  - `removeTenantMember` sin probe real.
  - Fila perezosa de MP.
  - Acciones `void` sin `reauth`.
- `importRecipeBundle` (`recipeTransfer.ts:178-181`) sigue con la columna global y sin tenant. Es un script previo a esta HU y queda para HU-028.
