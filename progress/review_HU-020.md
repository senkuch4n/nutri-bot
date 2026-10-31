# Review — HU-020

**Veredicto:** APPROVED

Verificado por mí: `npm run typecheck` limpio (core, db, web, bot), `npm run test` 169 archivos / 2526 tests OK, `./ops/harness/verify.sh` exit 0 (solo los WARN manuales esperados: migración nueva y "se tocó el bot" — el bot no tiene cambios en el diff, `git diff HEAD --stat -- apps/bot` vacío).

## Checkpoints
- C1: [x] verify.sh sale con 0. `backlog/HU-020.json` y `progress/current-senkuch4n.md` son de senkuch4n; el diff no toca archivos de la otra persona.
- C2: [x] existen `docs/hu-importar-planes-pdf.md` y `Refactorizaciones/importar-planes-pdf.md`; los nombres del contrato (5.1, 5.2, 5.7: `TemplateStatusKey`, `parseTemplateHints`, `canPublishTemplate`, `PLAN_IMPORT_TEXT`, `planImportKey`, `upsertImportedTemplate`, `deleteUnreviewedTemplateDrafts`, `markTemplateReviewed`, `publishTemplate`, `dismissTemplateHint`, `resolveUnplacedHint`, `linkHintRecipe`) existen y compilan en web y bot.
- C3: [x] lógica pura en `packages/core` (`plan-templates.ts`, `plan-import/`, `sara2/lines.ts`); operaciones de base en `packages/db/domain` (`planTemplateImport.ts`, `planSections.ts`, `planTemplates.ts`), sin duplicar en web. Migración `20261025173320_plan_template_import`: solo `CREATE TYPE`, `ADD COLUMN`, `CREATE TABLE/INDEX` y FKs `ON DELETE CASCADE`; 0 `DROP`; `status` (default `PUBLISHED`) y `origin` (default `MANUAL`) son `NOT NULL` con default en el mismo `ALTER`, `importKey`/`importHints`/`reviewedAt` nullable; coincide columna por columna con `schema.prisma` y con SDD 4.2 (incluidos `PlanTemplate_importKey_key` único y `PlanTemplate_status_title_idx`). `listTemplates({status:"PUBLISHED"})` alimenta "Aplicar plantilla" (`pacientes/[id]/page.tsx:66`). Acciones nuevas del panel validan sesión con `hasPanelSession`. Sin `console.log` de debug en código de producción (los de scripts son salida CLI).
- C4: [x] typecheck y tests OK; los tests de db/web son con mocks (sin base), no escriben datos; `plans:undo` → `deleteUnreviewedTemplateDrafts` borra solo `id IN corrida` con `status DRAFT`, `origin IMPORT`, `reviewedAt null` (`planTemplateImport.ts:173-180`); `upsertImportedTemplate` devuelve `skipped-published` / `skipped-reviewed` sin tocar y el re-pisado va con `updateMany` guardado por `status DRAFT, reviewedAt null` dentro de transacción (`:151-157`). `applyTemplateToPatient` lanza `TemplateNotPublishedError` si es `DRAFT` (`planTemplates.ts:107`) y copia `sections` con título, cuerpo y orden; la acción lo traduce a `draftNotApplicable`. No se tocó el flujo del bot. Sin PDF/documento generado nuevo salvo secciones en `plan-pdf.tsx` (con test).
- C5: [x] `progress/impl_HU-020.md` existe; este archivo es el veredicto; sin scripts sueltos (los scripts de `packages/db/scripts/plans/` son parte de la HU).

## Revisión específica pedida
1. Datos personales (D12): [x]
   - Busqué en todos los archivos modificados/nuevos (excluyendo los ignorados indicados) las palabras capitalizadas y las fechas de la portada del PDF real, y todas las líneas de ≥28 caracteres de los PDF: ningún nombre, apellido ni fecha de la paciente aparece en fixtures, tests, código ni progress. Los datos del fixture son inventados (`Marta`, `Ejemplar`, `03/04/25`).
   - `plans/import.ts`: la consola imprime solo contadores, `PDF n de N`, el id de plantilla y la ruta del archivo de corrida (nombre generado por fecha ISO); el reporte con texto va a `docs/planes-alimentacion/_importacion/reporte.md`, ignorado por git (`.gitignore:24`). El `catch` imprime solo la primera línea del mensaje. `importKey` = `pdf-sha256:<hex>` (nunca el nombre del archivo; `types.ts`/`parse.ts:31`). La base guarda `importKey`, `importHints` (avisos y líneas sin ubicar ya filtradas) y comidas/secciones; no PDF, no texto crudo, no nombre de archivo.
   - El descarte vive en `plan-import/personal-data.ts` y `parse.ts:10,189` es su único consumidor.
2. Migración: [x] ver C3. SQL generado con `migrate diff` equivale al esperado por la SDD.
3. Contrato compartido: [x] ver C2; `apps/bot` compila.
4. Limpieza por ids: [x] ver C4.
5. Refactor `recipe-import/extract.ts` → `sara2/lines.ts` y `scripts/lib/cli.ts`: [x] `pageWords` es idéntico al bloque inline eliminado; `median`, `buildLines`, `isRotated`, `Word`/`Seg`/`Line` movidos sin cambios; los tests de recetas siguen verdes. `confirmWrite()` conserva el mensaje por defecto original, `describeDbTarget` equivale a la función `target` anterior, `run`/`argValues`/`hasFlag` iguales.

## Cambios requeridos
Ninguno.

## Dudas (no bloqueantes)
- Frases genéricas de comidas del PDF real (p. ej. un par de líneas de menú tipo "Panqueques (2 unidades) con fruta" en `synthetic-plan.ts`, `parse.test.ts`, `recipe-match.test.ts` y en la SDD, y varias en `docs/hu-importar-planes-pdf.md`) coinciden literalmente con el PDF. No son datos personales, pero si D12 se lee como "ninguna frase copiada", conviene reemplazarlas por otras inventadas. El documento HU (afinador) es el que más copia.
- `progress/current-senkuch4n.md` menciona el nombre de la profesional (línea 182, HU-018, anterior a esta HU): no pertenece a esta HU.
- Antes de correr `plans:import --write` contra producción, la migración debe aplicarse en Neon (SDD 10.3) y hacer `plans:import` en seco primero.
