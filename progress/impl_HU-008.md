# impl HU-008 — `pediatria-oms` (épica 56)

**Estado: done.** Rama `hu-008-pediatria-oms`, sin commit. `backlog.json` no se tocó.

> **Cambió el schema: hay que reiniciar el `next dev` del usuario** antes del recorrido (cliente
> Prisma nuevo, enum `BmrFormula` con 2 valores más).

## Restricciones (copiadas de la SDD, sección 13, más las del orquestador)

1. **Datos de desarrollo:** ningún dato de negocio preexistente se borra ni cambia. Solo se escribe
   con la migración (aditiva), `test-prescriptions.ts` (datos propios, borrados por id),
   `test:isak`/`test:report` existentes y `hu008-walkthrough.ts` (`create` y después `cleanup`
   con los mismos ids). Nada de `db:seed` ni `seed:demo`.
2. **Prisma:** `pg_dump` antes, `--create-only` y revisar el SQL; nada de `migrate reset` ni
   `db push`; no aceptar el reset por drift; **nunca** la base de desarrollo como
   `--shadow-database-url` ni `migrate diff --from-migrations` contra ella; con drift, `blocked`.
3. **WhatsApp:** ningún mensaje; los scripts no importan `whatsapp.ts` ni Baileys y no crean
   turnos; los jids de prueba terminan en `@test.invalid`. (Orquestador:) no correr
   `test:confirm-flow`; `OutboundMessage` queda en 4.
4. **Tablas OMS:** solo de who.int, con los scripts de 4.3 y los SHA-256 de 4.1; sin red o con un
   hash distinto, `blocked`; nunca valores a mano; los `.xlsx` no se commitean ni se copian al repo.
5. **Lógica:** Z, percentil, clasificación, meses, Schofield y reglas de menores en
   `packages/core`, con tests; la web solo muestra; el dominio solo arma `population`.
6. **React:** nunca `await confirm()` dentro de `<form action>` ni de `startTransition`; ninguna
   `key` que cambie con los datos guardados.
7. **UI:** solo el sistema de diseño actual; `tailwind.config.ts` no se toca; textos exactos de
   `PEDIATRIC_TEXT`/`REQUIREMENT_TEXT`.
8. **Adultos idénticos:** diagnóstico, calculadora, ISAK, informe y huella del PDF no cambian para
   ≥ 18 ni sin fecha de nacimiento.
9. No `next build` ni otro `next dev`.
10. Rama `hu-008-pediatria-oms`, sin commit, sin tocar `backlog.json`.

Todas se cumplieron. Las diferencias con la SDD están en la sección "Desvíos y decisiones".

## 1. Tablas de la OMS

`bash packages/core/scripts/who/download-who-lms.sh <scratchpad>/who`. La carpeta queda fuera del
repo, en el scratchpad de la sesión. HTTP OK en los 8. **Los 8 SHA-256 coinciden con la tabla
4.1 de la SDD:**

| Archivo | SHA-256 obtenido | ¿= SDD? |
|---|---|---|
| bmi-boys-z-who-2007-exp.xlsx | `0a60849673f34a06b8e2fe4defe5d00348de687b6c9fce0278f1525fff89eb6d` | sí |
| bmi-girls-z-who-2007-exp.xlsx | `66f5c6284b44579ad6135fc639f22c09e36fe5a695b04390377113f6a00deb72` | sí |
| hfa-boys-z-who-2007-exp.xlsx | `d78fa8cafcab77dcb5f03d71506d92bdcb28f89c642816b6bb0eef466b007466` | sí |
| hfa-girls-z-who-2007-exp.xlsx | `df07ee16d3d2916569f1d869b7c874d7b880a41321d871215ed0254cb16679b3` | sí |
| bmi_boys_2-to-5-years_zscores.xlsx | `874063e82b4592e4d2dc8b7534861d759541548abe38269fba50ba3861e9aff1` | sí |
| bmi_girls_2-to-5-years_zscores.xlsx | `9e27264b319e9290fc32b7896894da6c5b41b4f471695f2e13016cae8f329973` | sí |
| lhfa_boys_2-to-5-years_zscores.xlsx | `a44ed06039e0a9dd6920e4a4d928395c541c9732662e49eacd489d2194ccc80d` | sí |
| lhfa_girls_2-to-5-years_zscores.xlsx | `a976c56a6d36885cc32bf77c5539ca066e396ef2adad06011cd71d9eb0f0eb5c` | sí |

`npx tsx packages/core/scripts/who/build-who-lms.ts <scratchpad>/who` dio este resumen
(autoverificación LMS, sin fallas):

```
BMI_FOR_AGE    MALE   OMS 2006:   1 filas, error máx. DE 0.049964
BMI_FOR_AGE    FEMALE OMS 2006:   1 filas, error máx. DE 0.041913
HEIGHT_FOR_AGE MALE   OMS 2006:   1 filas, error máx. DE 0.037824
HEIGHT_FOR_AGE FEMALE OMS 2006:   1 filas, error máx. DE 0.046593
BMI_FOR_AGE    MALE   OMS 2007: 168 filas, error máx. DE 0.000500, error máx. SD4/SD4neg 0.001000
BMI_FOR_AGE    FEMALE OMS 2007: 168 filas, error máx. DE 0.000500, error máx. SD4/SD4neg 0.001000
HEIGHT_FOR_AGE MALE   OMS 2007: 168 filas, error máx. DE 0.000500
HEIGHT_FOR_AGE FEMALE OMS 2007: 168 filas, error máx. DE 0.000500
```

- **Determinismo:** corrido 3 veces (la última después de todo el trabajo). Los dos `.ts`
  generados dieron siempre `shasum` `73fd487c…` (`who-lms-data.ts`) y `57eb961c…`
  (`who-sd-columns.test-data.ts`). Como la carpeta todavía no está versionada,
  `git diff --exit-code` no aplica; se comparó con `shasum`. Una vez commiteada, el comando del
  README funciona tal cual.
- Las filas de control de la SDD aparecen exactas: mes 60 (OMS 2006), mes 96, 143 y 149 de
  niños.
- No se versionó ningún `.xlsx` ni se escribió ningún valor a mano.

## 2. Migración (skill `migracion-prisma`)

- **Respaldo:** `pg_dump -Fc` en `<scratchpad>/nutribot-pre-hu008.dump` (173.738 bytes).
- **Conteos antes** (`EvolutionEntry|Consultation|OutboundMessage|Patient|NutritionPrescription`):
  `15|18|4|10|0`.
- `migrate status` antes: 15 migraciones, "Database schema is up to date!".
- `prisma migrate dev --create-only --name pediatric_schofield </dev/null` →
  `20260924121148_pediatric_schofield`. SQL generado, idéntico al esperado en la SDD 3.2:

```sql
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "BmrFormula" ADD VALUE 'SCHOFIELD_WEIGHT_HEIGHT';
ALTER TYPE "BmrFormula" ADD VALUE 'SCHOFIELD_WEIGHT';

-- AlterTable
ALTER TABLE "NutritionPrescription" ADD COLUMN     "bmrSchofieldWeightHeightKcal" INTEGER,
ADD COLUMN     "bmrSchofieldWeightKcal" INTEGER,
ALTER COLUMN "idealWeightDevineKg" DROP NOT NULL,
ALTER COLUMN "bmrMifflinStJeorKcal" DROP NOT NULL,
ALTER COLUMN "bmrHarrisBenedictKcal" DROP NOT NULL;
```

- `grep -Ei 'drop (table|column|type)|set not null|rename'` → sin coincidencias.
- `npm run db:migrate </dev/null` la aplicó sin drift ni ofrecer reset. Después,
  `npm run db:generate`.
- `migrate status` después: **16 migraciones, "Database schema is up to date!"**.
- **Conteos después:** `15|18|4|10|0`. Iguales, y siguen así al final de todo.
- No se usó `--shadow-database-url`, ni `migrate diff`, ni `reset`, ni `db push`.

## 3. Archivos

**Nuevos**
- `packages/core/scripts/who/download-who-lms.sh`, `packages/core/scripts/who/build-who-lms.ts`
- `packages/core/src/who/README.md`, `who-lms-data.ts` (generado), `who-sd-columns.test-data.ts` (generado)
- `packages/core/src/growth-reference.ts`, `packages/core/src/growth-reference.test.ts`
- `packages/core/src/diagnosis-missing-text.ts` (evita el ciclo de imports, ver decisiones)
- `packages/db/prisma/migrations/20260924121148_pediatric_schofield/migration.sql`
- `packages/db/scripts/hu008-walkthrough.ts`

**Modificados**
- core: `index.ts`, `patient-formula-data.ts`, `anthropometric-diagnosis.ts`, `isak-study.ts`,
  `isak-report.ts`, `energy-requirement.ts`. Tests con casos agregados:
  `patient-formula-data.test.ts`, `anthropometric-diagnosis.test.ts`, `isak-study.test.ts`,
  `isak-report.test.ts` y `energy-requirement.test.ts`. En este último, la única edición de
  casos existentes es `population: "ADULT"` en `ana` y `luis` (10.6).
- db: `prisma/schema.prisma` (solo las líneas de 3.1), `domain/prescriptions.ts`,
  `scripts/test-prescriptions.ts`, `package.json` (script `walkthrough:hu008`).
- web: `consultas/[consultationId]/diagnosis-rows.tsx`, `anthropometric-diagnosis.tsx`,
  `page.tsx`, `requirement-calculator.tsx`, `antropometria/page.tsx`,
  `antropometria/informe/report-editor.tsx`, `pacientes/[id]/formula-data-section.tsx`,
  `lib/anthropometric-report.ts`, `lib/anthropometric-report-pdf.tsx`.
- **No se tocaron:** `apps/bot/**`, `prescription-actions.ts`, `requirement-section.tsx`,
  `requirement-summary-card.tsx`, `tailwind.config.ts`, `backlog.json`.

## 4. Verificación

| Comando | Resultado |
|---|---|
| `npm run typecheck` (core, db, bot, web) | limpio, 0 errores |
| `npm run test` | **28 archivos, 505 tests OK**. Los 407 de antes pasan sin cambiar asserts; 98 son nuevos |
| `build-who-lms.ts` ×3 | archivos idénticos (shasum) |
| `migrate status` | 16 migraciones, up to date |
| `tsx scripts/test-prescriptions.ts` | 12 pasos OK, incluidos "menor de 5 a 17: ctx pediátrico y se guarda con Schofield" (bmrKcal 1371, Schofield 1371/1366, Mifflin/HB/ideal null, GET 1886) y "menor de 5: ctx null y ageGroup UNDER_5" |
| `npm run test:isak --workspace packages/db` | OK |
| `npm run test:report --workspace packages/db` | OK |
| `walkthrough:hu008 create` y después `cleanup` | create: 2 pacientes, 4 consultas y 5 mediciones/estudios; cleanup borró lo mismo, 0 prescripciones. Conteos: `20\|22\|4\|12\|0` después del create y `15\|18\|4\|10\|0` después del cleanup |
| Conteos finales | `15\|18\|4\|10\|0` (**`OutboundMessage` = 4**) |
| `grep -rn MINOR_WARNING_TEXT apps/web/src` | sin salida |
| `./ops/harness/verify.sh` | **Arnés OK**. 1 WARN informativo: hay una migración nueva (revisada arriba) |
| `npm run test:confirm-flow --workspace apps/bot` | **No se corrió**, por orden del orquestador (puede encolar WhatsApp real). El bot no tiene cambios de código y su typecheck está limpio |

No se corrió `next dev` ni `next build`. El bot no estaba corriendo.

### 4.1 PDF (SDD 11.2)
Render en memoria en `apps/web/.tmp-pdf-test/`, con copias de los módulos del PDF (el alias `@/lib`
se reescribió a rutas relativas y hubo que agregar `"type":"module"` por `@react-pdf/hyphenate`).
Variantes: chico del caso 10.5 y adulto AB, este último con el componente de antes (`git show
HEAD:`) y el nuevo.
- `pdftotext` del chico: aparecen "IMC para la edad (OMS 2007): 17,8 · Normal (Z −0,02, P49)",
  el anterior "(Z +0,17, P57)" y "Talla para la edad (OMS 2007): 150,0 cm · Talla adecuada
  (Z −0,26, P40)", con el anterior "146,0 cm · … (Z −0,36, P36)". **Ningún número con punto
  decimal.**
- Página 1 a 60 dpi, revisada con `Read`: las filas nuevas pasan a 2 líneas dentro de su columna,
  sin cortes ni desbordes. La nota de adultos para menores sigue.
- **Adulto AB, antes y después:** el texto de `pdftotext` es idéntico y **los 4 PNG son iguales
  byte a byte** (`cmp`). El PDF difiere en bytes solo por los metadatos de fecha de creación.
- La carpeta se borró y `git status` no la muestra.

## 5. Contrato compartido (SDD 5): las firmas coinciden

- `patient-formula-data.ts`: `PEDIATRIC_MIN_AGE_YEARS`, `AgeGroup`, `ageGroupOf`,
  `computeAgeMonths`, `ageMonthsLabel` y `PEDIATRIC_TEXT`, con las claves y los textos exactos
  (U+2212, U+2013, U+2265). `isMinor`, `ADULT_AGE_YEARS` y `MINOR_WARNING_TEXT` no cambian.
- `growth-reference.ts`: todo lo de 5.2 con esos nombres y tipos (`LmsRow`, `whoLmsRow`,
  `lmsZScore`, `lmsValueAtZ`, `bmiForAgeZScore`, `heightForAgeZScore`, `normalCdf`,
  `formatPercentile`, `growthZText`, `BmiForAgeClass`, `HeightForAgeClass`, `*_CLASS_LABELS`,
  `classifyBmiForAge`, `classifyHeightForAge`, `IMPLAUSIBLE_Z_LIMIT`, `isImplausibleZ`,
  `GrowthRow`, `buildBmiForAgeRow`, `buildHeightForAgeRow`, `PediatricDiagnosis`,
  `pediatricFooterText` y `growthReportCell`). Reexporta `WHO_LMS_SOURCES`,
  `WHO_LMS_DOWNLOADED_AT` y `WhoIndicator`. Se exporta desde `index.ts`.
- `anthropometric-diagnosis.ts`: `DiagnosisInput.weightAgeMonths?` y `heightAgeMonths?`;
  `AnthropometricDiagnosis.ageGroup` y `pediatric`.
- `isak-study.ts`: `IsakStudyInput.ageMonths?`.
- `isak-report.ts`: `measurements.heightForAge: IsakReportRow | null`; `SourceStudy.ageMonths?`,
  que entra en la huella solo en PEDIATRIC.
- `energy-requirement.ts`: `BMR_FORMULA_VALUES` (6, en el orden del enum),
  `RequirementPopulation`, `BMR_FORMULAS[].population`, `bmrFormulasFor`, `defaultBmrFormula`,
  `SchofieldBand`, `schofieldBand`, `SCHOFIELD_COEFFICIENTS`, `schofieldWeightBmr`,
  `schofieldWeightHeightBmr`, `schofieldBandLabel`, `RequirementContext.population`,
  `MacroReference`, `MACRO_REFERENCE_PEDIATRIC`, `macroReferenceFor`, `macroReferenceHint`,
  `PRESCRIBED_VCT_BOUNDS_PEDIATRIC` y `prescribedVctBoundsFor`. También `adjustmentRangesFor`,
  `adjustmentRangeFor`, `initialAdjustmentRange(goal, preferred, population = "ADULT")`,
  `REQUIREMENT_TEXT.formulaNotForAge`, `adjustedWeightNotForMinors` y `vctOutOfRangePediatric`,
  `proteinGPerKgWarning(g, ref?)`, `computeMacros({ …, reference? })`, los tipos nullable de
  `RequirementCalculation` y `PrescriptionSnapshot`, y `bmrSchofieldWeightHeightKcal` /
  `bmrSchofieldWeightKcal`.
- `domain/prescriptions.ts`: `RequirementContextForConsultation.ageGroup`; el ctx con
  `population`; `toPrescriptionSnapshot` mapea las columnas nuevas y las nullable.
- web: `BMI_FOR_AGE_TONES`, `HEIGHT_FOR_AGE_TONES` y `GrowthIndicatorRow` con las props de 7.1.

## 6. Desvíos y decisiones no obvias

1. **El orquestador dijo que el esquema no debería cambiar; la SDD dice que sí** (y es cierto:
   `NutritionPrescription` exigía Mifflin, HB y Devine). Seguí la SDD con todas las salvaguardas
   del orquestador: respaldo, `--create-only`, SQL solo aditivo y ninguna shadow sobre la base de
   desarrollo.
2. **`test:confirm-flow` no se corrió** (lo pide la SDD 11.1, pero lo prohíbe el orquestador).
3. **Ciclo de imports:** `growth-reference.ts` necesita 4 textos de `DIAGNOSIS_TEXT` y
   `anthropometric-diagnosis.ts` importa `growth-reference.ts`. Como permite la SDD, los 4 textos
   se movieron a `diagnosis-missing-text.ts` (`DIAGNOSIS_MISSING_TEXT`, sin exportar desde
   `index`). `DIAGNOSIS_TEXT` los reusa y tiene **los mismos valores**.
4. **Schofield M 8 años, 30 kg, 1,273 m (tabla 10.7):** la SDD dice 1168,472, pero el valor exacto
   es 19,59·30 + 130,3·1,273 + 414,9 = **1168,4719**. Con tolerancia 1e-6, el número de la SDD
   (redondeado) no pasa, así que el test usa el exacto y lo aclara en un comentario. Los otros 7
   valores de la tabla son exactos. No cambia nada visible: `Math.round` da 1168, como en el
   recorrido.
5. **`pediatricFooterText`** cuando solo una fila tiene meses (la otra `missing` o sin fecha):
   se usa "Edad: …" con esa edad. La SDD solo define "ninguno / iguales / distintos".
6. **`growthZText(z, "")`** devuelve solo "Z −6,46" (caso implausible, 7.1).
7. **La Z se normaliza para no dar −0** (`roundZ`), así un 0,00 nunca sale como "−0,00" ni falla
   un `toEqual`.
8. **`calculateRequirement`** con fórmula de la población correcta pero TMB `null` (Schofield sin
   banda, que en 5 a 17 nunca pasa): en pediátricos da `formulaNotForAge`; en adultos,
   `bodyFatNeeded`, como hoy.
9. **`draftFromPrescription` en PEDIATRIC:** `bodyFatSource` queda `null` aunque lo guardado sea
   `MEASURED`.
10. **Calculadora:** el paso "Peso para las fórmulas" se muestra con el guard
    `!pediatric && calc.adjustedWeightKg !== null`, sin `!`. En adultos, las ayudas de macros salen
    de `macroReferenceHint` y dan exactamente el texto de antes ("15–25 %", "20–35 %", "45–60 %",
    "1,2–2,2 g/kg"). Todas las `key` son constantes o valores de enum. No se agregó ningún
    `confirm`.
11. **`prisma format`:** lo corrí sin querer y reformateó todo `schema.prisma`. Volví el archivo con
    `git checkout` y reapliqué solo las líneas de 3.1 (el diff final de `schema.prisma` son 11+/7−).
    La migración ya estaba generada y no depende del formato.
12. **Skills de UI:** se aplicaron `ui-ux-pro-max`, `ui-styling` y `web-design-guidelines`
    (autochequeo sobre los 5 archivos de UI tocados, sin hallazgos). La clasificación siempre va en
    texto (`Badge`) y el implausible en texto `text-warning`, así que el color nunca es la única
    señal. Z y percentil llevan `tabular-nums` y las filas usan el `Row` con `flex-wrap`. Solo se
    usaron tokens existentes.

## 7. Pendiente para el orquestador

- Reiniciar el `next dev` del usuario (cliente Prisma nuevo) y hacer el recorrido de la sección 12:
  `npm run walkthrough:hu008 --workspace packages/db -- create <ids.json>` y, al final, `cleanup`
  con el mismo JSON.
- Si se commitea: incluir `packages/core/src/who/*` y `packages/core/scripts/who/*`, **no** el
  `docker-compose.prod.yml` sin trackear (ajeno a esta HU).
