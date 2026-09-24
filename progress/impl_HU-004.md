# impl HU-004: calculadora-requerimiento (épicas 18 y 19)

**Estado: done**. Rama `hu-004-calculadora-requerimiento`, sin commitear. `backlog.json` no se tocó.

> **Para el orquestador: hay que reiniciar el `next dev` del usuario** (puerto 3000) antes del
> recorrido: el cliente de Prisma se regeneró (modelo `NutritionPrescription` nuevo). No se levantó
> ningún `next dev` ni se corrió `next build`.

## Restricciones (copiadas de la SDD, sección 13, y del prompt)

1. Datos de desarrollo: no se borró ni cambió ningún dato preexistente. Las únicas escrituras
   fueron la migración (aditiva) y el script de 10.4, que limpia por id.
2. Prisma: `pg_dump` antes; `--create-only` y SQL revisado; sin `migrate reset`, sin `db push`, sin
   drift.
3. WhatsApp: nada. El script no usa `createAppointment` y comprueba que no se encoló nada. El bot no
   se levantó.
4. Lógica en `packages/core` (fórmulas, clasificaciones, validaciones, textos); carga y guardado en
   `packages/db/domain`. La web no recalcula nada por su cuenta ni duplica rangos.
5. `useConfirm`: `await confirm()` en el handler, fuera de toda transición; sin `<form action>` en la
   calculadora (guardar = `onClick` + `startTransition`).
6. UI: solo el sistema de diseño actual; `tailwind.config.ts` no se tocó.
7. Sin `next build` ni `next dev`.
8. Rama `hu-004-calculadora-requerimiento`, sin commitear, sin tocar `backlog.json`.
9. Decisión del orquestador: kcal con separador de miles es-AR vía `formatMacroAmount(v, "kcal")`.
   **No existe `formatKcalEs`** (no se creó).

## Respaldo y migración

- Respaldo: `/private/tmp/claude-501/-Users-joelmiguelserrudo-Documents-Projects-Nutri-Bot/95bd3b1f-af2d-449f-b816-a2a22d5cd1a4/scratchpad/backup-antes-HU-004.sql`
  (77.667 bytes, 22 `CREATE TABLE`). No se restauró.
- `migrate status` antes: 11 migraciones, "up to date" (sin drift).
- Creada: `packages/db/prisma/migrations/20260924080713_nutrition_prescription/migration.sql`.
  Contenido (solo lo esperado por la SDD 3.2): 5 × `CREATE TYPE` (`BmrFormula`, `WeightBasis`,
  `BodyFatSource`, `AdjustmentRange`, `MacroMode`), `CREATE TABLE "NutritionPrescription"` (NOT NULL
  en tabla nueva y vacía), `CREATE UNIQUE INDEX "NutritionPrescription_consultationId_key"`, `ALTER
  TABLE "NutritionPrescription" ADD CONSTRAINT ..._consultationId_fkey ... ON DELETE CASCADE ON UPDATE
  CASCADE`. Ningún `DROP`, ningún `ALTER` sobre tablas o enums existentes.
- Aplicada con `npm run db:migrate`; después `npm run db:generate`.
- Después: `migrate status` 12 migraciones, up to date. `NutritionPrescription` = 0 filas.
  `Consultation` = 18 (igual que antes).
- Nota: para crear la migración corrí `prisma format`, que reformateó todo el schema. Restauré el
  schema desde `HEAD` y reapliqué solo las adiciones con el mismo formato del archivo; `prisma
  migrate diff` entre ambas versiones da migración vacía (semánticamente idénticos). El diff de
  `schema.prisma` son 82 líneas agregadas, 0 borradas.

## Archivos

**packages/core**
- `src/anthropometry.ts` (ampliado, 4.1): `roundTo`, `bmiExact`, clasificaciones IMC/cintura/ICC/
  índices, `waistHipThresholdText`, Deurenberg, 5 pesos ideales (Hamwi usa `BODY_FRAMES`), peso
  ajustado y umbral 130. `computeBmi`/`computeWaistHipRatio` sin cambios.
- `src/patient-formula-data.ts` (4.2): `ADJUSTMENT_RANGE_VALUES`, `key`/`shortLabel` en los rangos,
  `goalAdjustmentRange`, `formatSignedPercentEs`, `formatSignedIntEs`. Sin `formatKcalEs`.
- `src/consultations.ts` (4.3): chip "Requerimiento", `hasPrescription` en las 3 funciones, texto
  nuevo de `notDeletable`.
- Nuevos: `src/formula-measurements.ts` (4.4), `src/anthropometric-diagnosis.ts` (4.5),
  `src/energy-requirement.ts` (4.6), cada uno con su `*.test.ts`. Exportados en `src/index.ts` (sin
  nombres duplicados: `BmrFormula` etc. solo en `energy-requirement.ts`).
- Tests ampliados: `anthropometry.test.ts`, `patient-formula-data.test.ts`, `consultations.test.ts`.

**packages/db**
- `prisma/schema.prisma`: 5 enums, `NutritionPrescription`, back-relation `prescription` en
  `Consultation`.
- `domain/clinical.ts`: `getFormulaMeasurementsAsOf`; `getLatestFormulaMeasurements` delega sin
  cambiar firma ni tipo de retorno.
- `domain/prescriptions.ts` (nuevo, 4.8) + export en `domain/index.ts`.
- `domain/consultations.ts` (4.9): include `prescription`, `deleteConsultation` con
  `hasPrescription` y `prescription: { is: null }` en la guarda.
- `domain/appointments.ts` (4.10): `setAppointmentStatus` cuenta la prescripción y la guarda del
  `deleteMany` suma `prescription: { is: null }`.
- `scripts/test-prescriptions.ts` (10.4). **Se conserva** porque la SDD lo lista en "Crear".

**apps/web**
- `src/lib/consultation-guard.ts` (nuevo, `server-only`, sin `"use server"`): `belongsToPatient`;
  `consultation-actions.ts` lo usa.
- `pacientes/[id]/prescription-actions.ts` (nuevo, 5.2): `savePrescriptionAction(input: unknown)`,
  `deletePrescriptionAction(patientId, consultationId)`.
- `pacientes/actions.ts`: `updateFormulaDataAction` suma `revalidatePath(..., "layout")`.
- `api/appointments/route.ts`: `hasPrescription` en `hasContent`.
- `pacientes/[id]/formula-data-sheet.tsx`: prop `trigger?`.
- `consultas/[consultationId]/anthropometric-diagnosis.tsx` (server, 7.2),
  `requirement-calculator.tsx` (cliente, 7.3 paso a paso), `requirement-section.tsx` (cliente, 3
  estados + `PrescriptionSummary` en el mismo archivo), `page.tsx` (datos 7.1, tarjetas, `canDelete`
  con prescripción, Requerimiento oculto a menores).
- `pacientes/[id]/requirement-summary-card.tsx` (server, 7.4) y `pacientes/[id]/page.tsx` (chips con
  `hasPrescription`, `listLatestPrescriptions(id, 2)`, tarjeta en la columna derecha dentro de un
  `div.space-y-6` junto a "Datos para cálculos").

**apps/bot**: sin cambios de código.

## Verificación

- `npm run test`: 11 archivos, **218 tests OK** (nuevos: 54 en anthropometry, 51 en
  energy-requirement, 8 en anthropometric-diagnosis, 8 en formula-measurements, y casos nuevos en
  consultations y patient-formula-data). Cada valor de referencia lleva la cuenta en un comentario.
- `npm run typecheck`: core, db, bot y web limpios (exit 0).
- `(cd packages/db && npx dotenv -e ../../.env -- tsx scripts/test-prescriptions.ts)`: 11 pasos
  `ok` + `OK` (D4 nunca posterior; guardar 1481/1347/74/49/185 con `bodyFatRecordedAt`; cambiar el
  paciente no toca la fila; editar −15 → una sola fila con 1574; −35, VCT 7000, Katch sin grasa y
  suma 95 → `InvalidPrescriptionError` sin cambios; `deleteConsultation` bloqueado por prescripción;
  turno COMPLETED → prescripción → CONFIRMED conserva la consulta; menor → `ctx` null y no guarda;
  borrar idempotente; orden del Resumen; 0 `OutboundMessage`). Después: 0 prescripciones, 18
  consultas, 0 pacientes/servicios de prueba.
- `npm run test:confirm-flow --workspace apps/bot`: 5/5 escenarios OK (sin WhatsApp real; el script
  limpia sus propios datos).
- `./ops/harness/verify.sh`: "Arnés OK" (solo el WARN esperado de migración nueva, ya revisada).

## Firmas vs. "Contrato compartido"

Coinciden con la sección 4 de la SDD, con estas diferencias deliberadas:
- **`formatKcalEs` no existe** (decisión del orquestador). Todas las kcal se muestran con
  `formatMacroAmount(v, "kcal")` → "1.481 kcal" (con espacio duro antes de la unidad). Los tests
  comparan contra eso.
- `formatSignedIntEs` usa separador de miles es-AR ("+1.200") para ser coherente con la decisión de
  kcal; para |x| < 1000 da lo mismo que la SDD ("−119", "+50", "0").
- `REQUIREMENT_TEXT.vctOutOfRange` = "El VCT indicado va de 800 a 6.000 kcal" (separador de miles).
- Agregados (no renombran nada): `REQUIREMENT_TEXT.proteinGPerKgDecimals` ("La proteína en g/kg
  admite un decimal", la columna es `Decimal(3,1)` y sin esto se guardaría redondeado en silencio);
  `adjustmentRangeHint` ("Entre −15 % y −25 %"), `vctDifferenceText` ("Difiere del calculado en +19
  kcal"), `formatKgFixed1`, `initialAdjustmentRange`, `MACRO_LABELS`, `MACRO_MODE_VALUES`,
  `WEIGHT_BASIS_VALUES`, `BODY_FAT_SOURCE_VALUES` en `energy-requirement.ts`; tipo
  `RequirementContextForConsultation` en `prescriptions.ts`.
- `CalculatorProps.measuredBmr` suma `fromOtherConsultation: boolean` (la SDD pide la fecha solo si
  es de otra consulta).
- `adjustmentOutOfRange` con MAINTENANCE: "El ajuste para mantenimiento es 0 %" (el formato "va de 0
  % a 0 %" no tenía sentido).

## Decisiones no obvias

- `computeMacros` emite `warnings` solo si no hay `errors` (con carbohidratos negativos el aviso de
  "fuera de rango" repetía el error).
- En `calculateRequirement`, sin objetivo solo aparece `goalMissing` (no `rangeMissing` ni
  `adjustmentMissing`); el ajuste se valida solo si el rango es del objetivo.
- `buildPrescriptionSnapshot` guarda `bodyFatSource` en null si no se usó ningún % (p. ej. MEASURED
  elegido pero sin medición y fórmula Mifflin).
- En el diagnóstico, IMC e índices se muestran con decimales fijos ("25,0", "0,80") para que el
  número coincida con lo que se clasifica; cintura y kg con `Quantity`.
- Pasos de la calculadora con `h3` (la `Card` ya tiene el `h2`) en lugar de `SectionLabel`, que
  renderiza `h2`: jerarquía de encabezados correcta.
- Errores bloqueantes: lista al pie (`aria-live="polite"`) y el botón "Guardar prescripción"
  deshabilitado con `aria-describedby` a esa lista. El error del servidor va con `FormError`.
  Resultados de cada paso ("GET 1.851 kcal", "VCT calculado 1.481 kcal") en `<output
  aria-live="polite">`.
- Si la prescripción usó Deurenberg y hoy hay % medido, además de "Usar el estimado de Deurenberg"
  aparece "Usar el % medido (…)" para poder volver.
- Los inputs numéricos de la calculadora son controlados como texto (se puede escribir a medias);
  vacío → error de core ("Ingresá el ajuste", "Cada porcentaje va de 0 a 100 %").

## Skills de UI

- `ui-ux-pro-max` (antes del JSX del diagnóstico, la calculadora y la tarjeta del Resumen): errores
  identificables, resultados con live region, clasificación con texto además del color.
- `ui-styling` (antes de formularios y tablas): columnas numéricas a la derecha con
  `tabular-nums`, labels asociados, primitivos existentes.
- `web-design-guidelines` (autochequeo final): se agregaron `name` y `autoComplete="off"` a los
  inputs numéricos. Pendientes menores no bloqueantes: sin aviso de cambios sin guardar al salir de
  la calculadora; el radio de TMB y su label están en celdas distintas (label clickeable con
  `htmlFor`, sin hit target único).

## Pendiente para el orquestador

- Reiniciar el `next dev` del usuario antes del recorrido (sección 12 de la SDD).
- Recorrido en navegador (sección 12): no lo hice (no levanto servidores).
