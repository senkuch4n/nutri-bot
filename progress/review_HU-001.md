# Review — HU-001 `datos-paciente-calculos`

**Veredicto:** APPROVED

Ronda 1. Revisado contra `docs/hu-datos-paciente-calculos.md` (sección "Resoluciones"),
`Refactorizaciones/datos-paciente-calculos.md` y `CHECKPOINTS.md`, sobre el working tree de la rama
`hu-001-datos-paciente-calculos` (sin commits). Fuera del diff revisado, por indicación del
orquestador: `AGENTS.md`, `CLAUDE.md`, `backlog.json`, `progress/current.md`, `ops/harness/verify.sh`
y `docker-compose.prod.yml`.

## Verificación corrida por el reviewer (no la del implementer)

| Comando | Resultado |
|---|---|
| `npm run typecheck` | core, db, bot y web limpios |
| `npm run test` | 7 archivos, 49 tests OK (19 en `patient-formula-data.test.ts`) |
| `./ops/harness/verify.sh` | exit 0, "Arnés OK" (incluye `prisma validate` + generate; el falso FAIL que reportó el implementer ya está corregido en el script) |
| `npm run build --workspace apps/web` | exit 0, `/pacientes/[id]` compila (no había `next dev` de NutriBot corriendo; el único `next dev` activo es de Evidentia-GFD) |
| `psql` solo lectura sobre `Patient` | `total 10 · sex 0 · activityLevel 0 · nutritionGoal 0 · bodyFrame 0`; 0 pacientes `test-hu001-%` / phone `000`; última migración aplicada `20260924022353_patient_formula_data` |
| Chequeo solo lectura de `getLatestFormulaMeasurements` | Para el paciente real con más mediciones, el resultado coincide con 3 subconsultas SQL crudas (peso 71,5 del 09/09, talla 178 del 01/08, grasa 18,5 del 12/09: tres fechas distintas, como pide la SDD 4.2). Script temporal en scratchpad, no en el repo |

## Checkpoints

### C1 — El arnés está sano
- [x] `backlog.json` válido con 1 HU activa (lo valida `verify.sh`: "3 HU, 1 activa").
- [x] `progress/current.md` refleja HU-001 en `en_revision` (líneas 15-17).
- [x] `./ops/harness/verify.sh` exit 0.

### C2 — Cadena de documentos completa
- [x] `docs/hu-datos-paciente-calculos.md` con Contexto, Gherkin, Datos, Diseño UX, Fuera de alcance, Dudas y Resoluciones D1–D10.
- [x] `Refactorizaciones/datos-paciente-calculos.md` con workspaces, checklist 9.1–9.23 y "Contrato compartido" (sección 4).
- [x] Firmas y nombres del diff coinciden con el contrato:
  - Core (SDD 4.1) ↔ `packages/core/src/patient-formula-data.ts`: todos los exports, valores, etiquetas, factores, rangos, `hamwiAdjustmentPercent`, `DEFAULT_BODY_FRAME`, `computeAgeYears(birthDate, at, timeZone)`, `isMinor`, `MINOR_WARNING_TEXT`, `FormulaDataPresence` (sin `bodyFrame`/`bodyFatPercent`), `getMissingFormulaData` en el orden fijo, `missingFormulaDataMessage` con los textos exactos de 6.2, `formatDecimalEs(value, max = 3)`.
  - Domain (SDD 4.2) ↔ `packages/db/domain/patients.ts:33-51` (`PatientFormulaDataInput`, `updatePatientFormulaData` que solo escribe los 4 campos) y `packages/db/domain/clinical.ts:61-101` (`LatestMeasurement`, `LatestFormulaMeasurements`, `getLatestFormulaMeasurements` con 3 `findFirst` en `Promise.all` y `Decimal → Number`).
  - Server action (SDD 5.1) ↔ `apps/web/src/app/(panel)/pacientes/actions.ts:42-69`: `updateFormulaDataAction(_prev: PatientState, formData)`, zod `emptyOr(*_VALUES)` de core, `""` → `null`, `"Datos inválidos"` sin escribir, `revalidatePath`.
  - Payload IA (SDD 5.3) ↔ `ai-actions.ts:90-102` y `assistant-tools.ts:44-58`: campos nuevos con los nombres exactos, los existentes sin renombrar, system prompt intacto; `asistente/actions.ts:30` con la `description` nueva textual.
  - Alineación core ↔ Prisma (SDD 3.3): sin `as` en ninguna de las dos direcciones (`page.tsx:116-121` pasa `patient.sex` etc. a props tipadas con core; la action pasa los valores de zod directo a domain). Verificado con `typecheck`.

### C3 — Arquitectura del repo
- [x] Lógica pura en `packages/core` (constantes, edad, faltantes, formato); consultas compartidas en `packages/db/domain`. Los `findFirst` duplicados de `ai-actions.ts` y `assistant-tools.ts` se reemplazaron por `getLatestFormulaMeasurements` (SDD 5.3), sin dejar copias en `apps/web`.
- [x] `schema.prisma` y `domain` cambiaron; web **y** bot compilan. `apps/bot` sin cambios (`git diff HEAD --stat -- apps/bot` vacío). `findOrCreatePatient*` intactos: los pacientes nuevos nacen con los 4 campos `NULL`.
- [x] Migración `20260924022353_patient_formula_data/migration.sql`: 4 `CREATE TYPE` + 1 `ALTER TABLE "Patient" ADD COLUMN ×4` nullable. Sin `NOT NULL`, `DEFAULT`, `DROP`, `UPDATE` ni otras tablas. Coherente con el schema (enums `BiologicalSex`, `ActivityLevel`, `NutritionGoal`, `BodyFrame`; campos `sex`, `activityLevel`, `nutritionGoal`, `bodyFrame` opcionales sin default). Los 10 pacientes existentes siguen con los 4 campos en `NULL`.
- [x] Sin rutas nuevas. La action vive en `(panel)/pacientes/actions.ts`, protegida por `apps/web/src/middleware.ts` (matcher global) y `(panel)/layout.tsx` (redirect si no hay sesión). Portal sin cambios (`git diff` vacío en `apps/web/src/app/(portal)`).
- [x] Bot: ningún mensaje nuevo ni cambio de comportamiento (SDD 7).
- [x] Sin `console.log`, `TODO` ni `FIXME` en los archivos nuevos/modificados de la HU.

### C4 — Verificación real
- [x] `npm run typecheck` limpio (corrido por el reviewer).
- [x] Lógica nueva de core con 19 tests en vitest que cubren todos los casos de la SDD 10.1 (constantes, etiquetas, edad con zona horaria y 29/02, faltantes con los 3 mensajes exactos, `weightKg: 0`, tipo sin `bodyFrame`/`bodyFatPercent`, formato es-AR). `npm run test` pasa.
- [x] No se tocó el flujo del bot → la simulación no aplica. Ver "Dudas" sobre `test:confirm-flow`.
- [x] No hay PDF ni documento generado → no aplica.

### C5 — Cierre
- [x] `progress/impl_HU-001.md` existe y describe archivos, migración, verificación y decisiones.
- [x] `progress/review_HU-001.md` (este archivo).
- [x] Sin scripts sueltos (`packages/db/scripts/` no existe) ni datos de prueba en la base (0 pacientes `test-hu001-%`, total 10 como al inicio).

## Revisión funcional contra la HU (Resoluciones)

- D1: label `Sexo (para fórmulas)` con hint exacto (`formula-data-form.tsx:41-42`).
- D3/D4: 4 objetivos en `NUTRITION_GOALS`, "Bajar de peso" único, "Subir de peso" y "Ganar masa muscular" separados.
- D5: contextura fuera de `FormulaDataPresence`; en el resumen, `<Badge>Sin cargar, se asume Mediana</Badge>` (`formula-data-section.tsx:56`); hint del select con la aclaración.
- D6: aviso `MINOR_WARNING_TEXT` si `isMinor(ageYears)` (`formula-data-section.tsx:63`).
- D8: IA (plan y asistente) recibe sexo, edad, actividad, factor y objetivo.
- D9: tarjeta entre "Datos" y "Ficha clínica" (`page.tsx:113-130`).
- D10: fecha por medición con `formatInTimeZone(..., pro.timezone, "dd/MM/yyyy")` (`page.tsx:57-58`).
- % de grasa: `<Badge>Sin dato</Badge>`, no bloqueante.
- Textos de las opciones de actividad: `` `${label} (×${formatDecimalEs(factor)}) — ${description}` `` (`formula-data-form.tsx:58`).
- Clases de UI: solo componentes de `ui.tsx` y tokens existentes (`bg-amber-50 text-amber-700`, `text-ink`, `text-ink-soft`, `text-ink-faint`, `border-line`, `text-leaf-deep`, `.reveal`).

## Cambios requeridos

Ninguno.

## Dudas (no bloqueantes)

- **Prueba en navegador pendiente.** Nadie abrió la ficha con la tarjeta nueva; yo tampoco (no hay
  `next dev` de NutriBot ni login disponibles para el reviewer). `next build` pasa y los límites
  server/client están bien (`formula-data-section.tsx` es server y solo importa el tipo del client),
  así que no espero errores de render. Sugerencia: que el usuario abra la ficha de un paciente y
  guarde/borre un valor una vez antes de mergear.
- **`test:confirm-flow` no corrido: aceptado.** Verifiqué la razón del implementer:
  `packages/db/domain/reminders.ts:51-54` (`enqueueAttendanceConfirmations`) y
  `enqueuePrepInstructions` buscan turnos `CONFIRMED` por ventana de `startsAt` **sin filtrar por
  paciente**, y el script `apps/bot/scripts/test-confirm-attendance.ts:76-145` los invoca tal cual.
  Con turnos reales en la ventana encolarían `OutboundMessage` a JIDs reales. Como la HU no toca
  `apps/bot` ni `reminders.ts` y el typecheck del bot pasa con el schema nuevo, saltearlo es lo
  correcto. Observación para el arnés: ese comando no debería figurar en la verificación de HU que
  no tocan el bot, o el script debería acotar los crons a los datos que él mismo crea.
- **Script de prueba contra la base borrado.** La SDD (sección 8, "Crear") pide
  `packages/db/scripts/test-formula-data.ts`, pero el orquestador indicó borrarlo y `CHECKPOINTS.md`
  C5 pide que no queden scripts sueltos. Resultado: el reviewer no pudo re-correrlo. Lo compensé con
  un chequeo de solo lectura de `getLatestFormulaMeasurements` contra SQL crudo sobre datos reales
  (coincide), y `updatePatientFormulaData` es un `update` de 4 campos verificado por typecheck.
  Convendría que SDD y CHECKPOINTS acuerden si estos scripts se conservan (como los de
  `apps/bot/scripts/`) o se descartan.
- **Desvíos menores respecto de la SDD, razonables y documentados en `impl_HU-001.md`:**
  `ai-actions.ts:90-93` usa `p?.` porque `findUnique` puede devolver `null`; `peso_kg`/`talla_cm`
  ahora pasan `0` como `0` en vez de `null` (antes usaban truthiness). Ninguno cambia el
  comportamiento real.
- **Fuera de alcance, ya anotado en SDD 13:** `apps/web/src/lib/age.ts` (`calculateAge`) sigue
  leyendo `birthDate` con getters locales; la página del plan puede mostrar un año menos el día del
  cumpleaños. `updatePatientAction` escribe `birthDate` como `new Date("YYYY-MM-DDT12:00:00")`
  (mediodía local), lo que en UTC-3 preserva la fecha. No lo toca esta HU.
