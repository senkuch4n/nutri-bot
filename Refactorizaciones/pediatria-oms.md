# SDD: HU-008 `pediatria-oms` (épica 56)

HU validada: `docs/hu-pediatria-oms.md`. **Su sección "Resoluciones" manda:** se aceptan D1 a D18
tal como las recomendó el afinador. Esta SDD las baja a código.

Skills aplicados: `migracion-prisma` (sección 3) y `ui` (sección 7).

Rama: `hu-008-pediatria-oms` (la actual). **No se commitea.** El orquestador hace el recorrido
(sección 12).

> **Verificación del architect (2026-09-24).**
> - **Tablas OMS bajadas de who.int con `curl`** (HTTP 200, archivos `.xlsx` válidos). Las URLs
>   salen de las páginas oficiales de cada indicador (sección 4.1). Parseé los 8 archivos y
>   comprobé que **los datos cierran con la fórmula LMS**:
>   - OMS 2007, IMC/E y T/E, niños y niñas: 168 filas cada uno (meses 61 a 228), columnas
>     `Month, L, M, S` y las DE. Recalcular cada DE (−3 a +3) con L, M y S da la columna
>     publicada con un error máximo de **0,0005** (el redondeo a 3 decimales de la OMS).
>   - En los archivos de IMC/E, las columnas `SD4` y `SD4neg` **no** salen de la fórmula LMS
>     (el error llega a 10 unidades). Salen de la extensión de la OMS para las Z extremas:
>     `SD4 = SD3 + (SD3 − SD2)` y `SD4neg = SD3neg − (SD2neg − SD3neg)`, con un error de 0,001.
>     Con la extensión (D6), `SD4` da Z = +4,0001 y `SD4neg` da Z = −4,0001. **Esto confirma la
>     fórmula de la D6 contra la tabla oficial y es un test.**
>   - En T/E, L = 1 en todas las filas (distribución normal). `SD5neg` da Z = −5,0000 con la
>     fórmula LMS directa, sin extensión.
>   - OMS 2006 (patrones 0 a 5 años), tablas mensuales de 2 a 5 años: la fila del **mes 60**
>     cierra con un error de 0,05, porque ahí la OMS publica las DE con 1 decimal.
> - **Coeficientes de Schofield (1985).** La publicación los da en MJ/día. Los de la HU son la
>   forma en kcal/día que se usa en clínica: MJ × 239. Por ejemplo, niños de 3 a 10 años con
>   peso: 0,095·P + 2,110 MJ → 22,706·P + 504,3 kcal. Los casos de la HU cierran:
>   - Tomás: 1365,64 kcal (peso) y 1371,30 kcal (peso y talla);
>   - Sofía: 1014,09 kcal (peso) y 1019,52 kcal (peso y talla).
> - **Base de desarrollo (solo lectura, antes de esta HU):**
>   - 15 migraciones; la última es `20260924111042_anthropometric_report`;
>   - **0** filas en `NutritionPrescription`;
>   - enum `BmrFormula` = `MIFFLIN_ST_JEOR, HARRIS_BENEDICT, KATCH_MCARDLE, CUNNINGHAM`;
>   - conteos: 15 `EvolutionEntry`, 18 `Consultation`, 4 `OutboundMessage`, 10 `Patient`, 0
>     `AnthropometricReport`;
>   - ningún paciente menor de 18;
>   - `Professional.timezone` = `America/Argentina/Buenos_Aires`.
> - **Diferencias con los ejemplos de la HU** (la HU los da "por ejemplo"; los números reales
>   salen de la tabla):
>   - **Tomás** (12 años, 149 meses, 40 kg, 150 cm) con la tabla real:
>     - IMC 17,8: **Z −0,02, P49, Normal**. La HU decía "Z +0,45, P67".
>     - Talla 150 cm: **Z −0,26, P40, Talla adecuada**.
>     - PDF: `"17,8 · Normal (Z −0,02, P49)"`.
>   - **Resumen de la prescripción:** en la HU-004, `prescriptionFormulaLine` escribe
>     "Mantenimiento" **sin** "0 %". Se mantiene así, para no cambiar a los adultos. Para Tomás
>     queda:
>     `"Schofield (peso y talla) · TMB 1.371 kcal · Ligero ×1,375 · GET 1.886 kcal · Mantenimiento"`.
>     Los espacios antes de "kcal" son NBSP, como hoy.
> - **La HU dice que no cambia el esquema. No es así.** `NutritionPrescription` exige
>   `bmrMifflinStJeorKcal`, `bmrHarrisBenedictKcal` e `idealWeightDevineKg`, y `BmrFormula` no
>   tiene Schofield. Hace falta una migración chica y aditiva (sección 3). Las tablas OMS no van
>   a la base.

---

## 1. Resumen funcional

Para pacientes de 5 a 17 años (edad a la fecha de la consulta), el diagnóstico antropométrico deja
de mostrar el IMC sin clasificar. En su lugar muestra dos indicadores de la OMS 2007:

- **IMC para la edad** (IMC/E);
- **Talla para la edad** (T/E).

Cada uno lleva su puntaje Z (LMS, con la extensión de la OMS para las Z extremas del IMC), el
percentil y la clasificación. Se calculan con la edad en **meses cumplidos a la fecha de cada
medición**, con tablas LMS oficiales versionadas en `packages/core`. Además:

- vuelve la sección "Requerimiento", con la TMB de **Schofield (1985)** en dos variantes;
- la calculadora aplica las reglas de menores:
  - sin peso ajustado ni ideal;
  - sin déficit agresivo;
  - VCT mínimo de 500 kcal;
  - macros con la referencia pediátrica;
  - aclaración de que los factores de actividad son de adultos.
- la página ISAK y el informe PDF muestran IMC/E y T/E;
- la tarjeta "Datos para cálculos" cambia su aviso.

Los menores de 5 ven un aviso y se comportan como hoy. Los adultos no cambian.

## 2. Workspaces afectados

| Workspace | ¿Cambia? | Qué |
|---|---|---|
| `packages/core` | **Sí** | Módulo nuevo `growth-reference.ts` (edad en meses, LMS, Z, percentil, clasificación, filas pediátricas) + datos generados `src/who/*` + script de conversión. `anthropometric-diagnosis.ts`, `energy-requirement.ts` (Schofield y reglas de menores), `patient-formula-data.ts` (edad en meses, grupo de edad, textos), `isak-study.ts` e `isak-report.ts`. Tests. |
| `packages/db` | **Sí** | Migración `pediatric_schofield` (enum + 2 columnas nuevas + 3 `DROP NOT NULL`). `domain/prescriptions.ts` (contexto pediátrico, columnas nuevas). `scripts/test-prescriptions.ts` (el paso del menor cambia). Script nuevo `scripts/hu008-walkthrough.ts` para el recorrido. |
| `apps/web` | **Sí** | Detalle de la consulta (diagnóstico, requerimiento, calculadora), `diagnosis-rows.tsx`, tarjeta "Datos para cálculos", página ISAK, loader del informe, editor del informe y PDF. |
| `apps/bot` | **No** en código. **Sí** hay que correr su `typecheck`: comparte el cliente Prisma y el enum `BmrFormula` cambia. |

## 3. Esquema (Prisma) y migración: skill `migracion-prisma`

### 3.1 Cambios en `packages/db/prisma/schema.prisma`

```prisma
enum BmrFormula {
  MIFFLIN_ST_JEOR
  HARRIS_BENEDICT
  KATCH_MCARDLE
  CUNNINGHAM
  SCHOFIELD_WEIGHT_HEIGHT // HU-008: menores de 5 a 17 (peso y talla)
  SCHOFIELD_WEIGHT        // HU-008: menores de 5 a 17 (solo peso)
}

model NutritionPrescription {
  // …
  idealWeightDevineKg Decimal?       @db.Decimal(5, 2) // HU-008: null en menores (D14)
  // …
  bmrMifflinStJeorKcal         Int? // HU-008: null en menores
  bmrHarrisBenedictKcal        Int? // HU-008: null en menores
  bmrKatchMcArdleKcal          Int?
  bmrCunninghamKcal            Int?
  bmrSchofieldWeightHeightKcal Int? // HU-008: solo menores
  bmrSchofieldWeightKcal       Int? // HU-008: solo menores
  // … el resto igual
}
```

Nada más cambia en el esquema. Las tablas OMS **no** van a la base (D1).

### 3.2 Migración

Desde `packages/db`, **después del respaldo** (3.3):

```bash
npx dotenv -e ../../.env -- prisma migrate dev --create-only --name pediatric_schofield </dev/null
```

SQL esperado. El orden puede variar; tiene que ser **solo aditivo**:

```sql
-- AlterEnum
ALTER TYPE "BmrFormula" ADD VALUE 'SCHOFIELD_WEIGHT_HEIGHT';
ALTER TYPE "BmrFormula" ADD VALUE 'SCHOFIELD_WEIGHT';

-- AlterTable
ALTER TABLE "NutritionPrescription" ADD COLUMN     "bmrSchofieldWeightHeightKcal" INTEGER,
ADD COLUMN     "bmrSchofieldWeightKcal" INTEGER,
ALTER COLUMN "idealWeightDevineKg" DROP NOT NULL,
ALTER COLUMN "bmrMifflinStJeorKcal" DROP NOT NULL,
ALTER COLUMN "bmrHarrisBenedictKcal" DROP NOT NULL;
```

- **Filas existentes.** No hay columnas `NOT NULL` nuevas: las dos nuevas son nullable y quedan
  en `NULL` en las prescripciones de adultos, que es su valor correcto. `DROP NOT NULL` no toca
  datos. En desarrollo hay 0 prescripciones. En producción, cualquier fila de adulto sigue
  válida.
- **Enum.** Postgres 16 permite `ALTER TYPE … ADD VALUE` dentro de la transacción de la
  migración, porque ningún valor nuevo se usa en el mismo SQL.
- **Si el SQL trae otra cosa, parar.** Por ejemplo, `DROP`, `SET NOT NULL`, `RENAME`, un cambio
  de tipo o algo sobre otra tabla.
- Revisión rápida:
  `grep -Ei 'drop (table|column|type)|set not null|rename' migration.sql` no tiene que devolver
  nada. `DROP NOT NULL` sí aparece y está bien.
- **Aplicar:** `npm run db:migrate </dev/null`, desde la raíz y con stdin cerrado para que no
  pueda aceptar un reset. Después, `npm run db:generate`.
- **Después:** `npx dotenv -e ../../.env -- prisma migrate status`, desde `packages/db`. Tiene
  que decir "Database schema is up to date!" con 16 migraciones.
- **Si aparece drift, parar:** `blocked` con la salida de `migrate status`.
- **Prohibido (incidente HU-007):**
  - `migrate reset` y `db push`;
  - aceptar el reset;
  - pasar `DATABASE_URL` como `--shadow-database-url`;
  - `migrate diff --from-migrations` contra la base de desarrollo.

  `migrate dev --create-only` usa una shadow temporal que crea y borra Prisma. Eso está bien.

### 3.3 Respaldo (antes de `--create-only`)

```bash
docker compose exec -T db pg_dump -U nutri -d nutribot -Fc > "$SCRATCHPAD/nutribot-pre-hu008.dump"
ls -la "$SCRATCHPAD/nutribot-pre-hu008.dump"   # > 0 bytes
docker compose exec -T db psql -U nutri -d nutribot -At -c 'select (select count(*) from "EvolutionEntry"),(select count(*) from "Consultation"),(select count(*) from "OutboundMessage"),(select count(*) from "Patient"),(select count(*) from "NutritionPrescription");'
```

Anotar los conteos en `progress/impl_HU-008.md`. Hoy dan `15|18|4|10|0`. `$SCRATCHPAD` es el
scratchpad de la sesión del implementer.

---

## 4. Datos de la OMS (D1, D2)

### 4.1 Fuentes oficiales (verificadas el 2026-09-24)

Páginas de origen:
- OMS 2007 (5 a 19 años), IMC/E: `https://www.who.int/tools/growth-reference-data-for-5to19-years/indicators/bmi-for-age`
- OMS 2007, T/E: `https://www.who.int/tools/growth-reference-data-for-5to19-years/indicators/height-for-age`
- OMS 2006, IMC/E: `https://www.who.int/toolkits/child-growth-standards/standards/body-mass-index-for-age-bmi-for-age`
- OMS 2006, talla/E: `https://www.who.int/tools/child-growth-standards/standards/length-height-for-age`

Archivos. Los 4 de la OMS 2007 son las tablas "z-scores expanded" por mes. De los 4 de la OMS
2006 solo se usa la fila del mes 60:

| # | Indicador · sexo | Ref. | URL | SHA-256 |
|---|---|---|---|---|
| 1 | IMC/E · niños | 2007 | `https://cdn.who.int/media/docs/default-source/child-growth/growth-reference-5-19-years/bmi-for-age-(5-19-years)/bmi-boys-z-who-2007-exp.xlsx?sfvrsn=a84bca93_2` | `0a60849673f34a06b8e2fe4defe5d00348de687b6c9fce0278f1525fff89eb6d` |
| 2 | IMC/E · niñas | 2007 | `https://cdn.who.int/media/docs/default-source/child-growth/growth-reference-5-19-years/bmi-for-age-(5-19-years)/bmi-girls-z-who-2007-exp.xlsx?sfvrsn=79222875_2` | `66f5c6284b44579ad6135fc639f22c09e36fe5a695b04390377113f6a00deb72` |
| 3 | T/E · niños | 2007 | `https://cdn.who.int/media/docs/default-source/child-growth/growth-reference-5-19-years/height-for-age-(5-19-years)/hfa-boys-z-who-2007-exp.xlsx?sfvrsn=7fa263d_2` | `d78fa8cafcab77dcb5f03d71506d92bdcb28f89c642816b6bb0eef466b007466` |
| 4 | T/E · niñas | 2007 | `https://cdn.who.int/media/docs/default-source/child-growth/growth-reference-5-19-years/height-for-age-(5-19-years)/hfa-girls-z-who-2007-exp.xlsx?sfvrsn=79d310ee_2` | `df07ee16d3d2916569f1d869b7c874d7b880a41321d871215ed0254cb16679b3` |
| 5 | IMC/E · niños, 2–5 años | 2006 | `https://cdn.who.int/media/docs/default-source/child-growth/child-growth-standards/indicators/body-mass-index-for-age/bmi_boys_2-to-5-years_zscores.xlsx?sfvrsn=73010c9b_5` | `874063e82b4592e4d2dc8b7534861d759541548abe38269fba50ba3861e9aff1` |
| 6 | IMC/E · niñas, 2–5 años | 2006 | `https://cdn.who.int/media/docs/default-source/child-growth/child-growth-standards/indicators/body-mass-index-for-age/bmi_girls_2-to-5-years_zscores.xlsx?sfvrsn=452aca36_7` | `9e27264b319e9290fc32b7896894da6c5b41b4f471695f2e13016cae8f329973` |
| 7 | Talla/E · niños, 2–5 años | 2006 | `https://cdn.who.int/media/docs/default-source/child-growth/child-growth-standards/indicators/length-height-for-age/lhfa_boys_2-to-5-years_zscores.xlsx?sfvrsn=17e5ad91_9` | `a44ed06039e0a9dd6920e4a4d928395c541c9732662e49eacd489d2194ccc80d` |
| 8 | Talla/E · niñas, 2–5 años | 2006 | `https://cdn.who.int/media/docs/default-source/child-growth/child-growth-standards/indicators/length-height-for-age/lhfa_girls_2-to-5-years_zscores.xlsx?sfvrsn=2ec187b9_11` | `a976c56a6d36885cc32bf77c5539ca066e396ef2adad06011cd71d9eb0f0eb5c` |

Formato real de los archivos: una sola hoja (`xl/worksheets/sheet1.xml`). La fila 1 tiene los
encabezados en `xl/sharedStrings.xml` y las demás son numéricas.
- **2007 IMC/E:** `Month, L, M, S, SD4neg, SD3neg, SD2neg, SD1neg, SD0, SD1, SD2, SD3, SD4`.
- **2007 T/E:** `Month, L, M, S, StDev, SD5neg, SD4neg, SD3neg, SD2neg, SD1neg, SD0, SD1, SD2,
  SD3, SD4`.
- **2006:**
  - talla/E: `Month, L, M, S, SD, SD3neg … SD3`;
  - IMC/E: `Month, L, M, S, SD3neg … SD3`, sin `SD`;
  - el encabezado `"M       "` trae espacios: se hace `trim`.

Fila del mes 60 (OMS 2006), para control:

| Tabla | L | M | S |
|---|---|---|---|
| IMC/E niños | −0,6892 | 15,1916 | 0,087 |
| IMC/E niñas | −0,5684 | 15,2747 | 0,09789 |
| Talla/E niños | 1 | 109,9638 | 0,04214 |
| Talla/E niñas | 1 | 109,4233 | 0,04347 |

### 4.2 Formato versionado en el repo

Los `.xlsx` **no se commitean**. Se bajan con el script de descarga a una carpeta fuera del repo.

```
packages/core/src/who/
  README.md                       ← origen, URLs, SHA-256, fecha de descarga, cómo regenerar
  who-lms-data.ts                 ← GENERADO: L, M, S por indicador, sexo y mes (60…228)
  who-sd-columns.test-data.ts     ← GENERADO: columnas de DE publicadas, solo para los tests
packages/core/scripts/who/
  download-who-lms.sh             ← curl de los 8 archivos + shasum
  build-who-lms.ts                ← xlsx → los dos .ts generados, con verificación
```

**Contenido de `who-lms-data.ts`.** Es un módulo TypeScript, no JSON, para no depender de
`resolveJsonModule` en Next ni en tsx. El encabezado dice que no se edita a mano:

```ts
// GENERADO por packages/core/scripts/who/build-who-lms.ts — NO EDITAR A MANO.
// Fuentes: ver ./README.md (OMS 2007 "z-scores expanded" meses 61–228; OMS 2006 solo mes 60).

/** [mes, L, M, S] */
export type WhoLmsTuple = readonly [month: number, L: number, M: number, S: number];
export type WhoIndicator = "BMI_FOR_AGE" | "HEIGHT_FOR_AGE";

export const WHO_LMS_FIRST_MONTH = 60;
export const WHO_LMS_LAST_MONTH = 228;
export const WHO_LMS_DOWNLOADED_AT = "2026-09-24";

/** 169 filas por tabla, ordenadas por mes (índice = mes − 60). La fila 60 es de la OMS 2006. */
export const WHO_LMS: Readonly<Record<WhoIndicator, Readonly<Record<"MALE" | "FEMALE", readonly WhoLmsTuple[]>>>> = {
  BMI_FOR_AGE: { MALE: [[60, -0.6892, 15.1916, 0.087], [61, -0.7387, 15.2641, 0.0839], /* … */], FEMALE: [/* … */] },
  HEIGHT_FOR_AGE: { MALE: [/* … */], FEMALE: [/* … */] },
};

export interface WhoLmsSource {
  indicator: WhoIndicator;
  sex: "MALE" | "FEMALE";
  reference: "OMS 2007" | "OMS 2006";
  months: string; // "61–228" | "60"
  url: string;
  file: string;
  sha256: string;
}
export const WHO_LMS_SOURCES: readonly WhoLmsSource[] = [/* las 8 filas de 4.1 */];
```

- **Números:** `String(Number(textoDelXml))`. Por ejemplo, `-0.73870000000000002` → `-0.7387` y
  `8.3900000000000002E-2` → `0.0839`.
- **Sin fecha de generación en el archivo:** correr el script dos veces da el mismo archivo, byte
  a byte.

**Contenido de `who-sd-columns.test-data.ts`.** Lo usan solo los tests:

```ts
// GENERADO … NO EDITAR A MANO.
/** [mes, SD3neg, SD2neg, SD1neg, SD0, SD1, SD2, SD3, SD4neg | null, SD4 | null]
 *  SD4neg/SD4 solo en IMC/E OMS 2007 (null en talla y en el mes 60). */
export type WhoSdTuple = readonly [number, number, number, number, number, number, number, number, number | null, number | null];
export const WHO_SD_COLUMNS: Readonly<Record<WhoIndicator, Readonly<Record<"MALE" | "FEMALE", readonly WhoSdTuple[]>>>> = { … };
```

### 4.3 Scripts

**`packages/core/scripts/who/download-who-lms.sh <carpeta>`** (bash, `set -euo pipefail`):
- crea la carpeta y baja las 8 URLs de 4.1 con
  `curl -fsSL -A "Mozilla/5.0" -o "<carpeta>/<archivo>.xlsx" "<url>"`. El nombre de archivo es el
  de la URL sin `?sfvrsn=…`;
- al final corre `shasum -a 256 <carpeta>/*.xlsx`;
- si `curl` falla (sin red, 404), termina con error. **Nunca inventa valores.**

**`packages/core/scripts/who/build-who-lms.ts <carpeta>`** (se corre con `npx tsx`, sin
dependencias nuevas):
1. Para cada uno de los 8 archivos, verifica que exista y que su SHA-256
   (`node:crypto`) sea **igual** al de 4.1, que el script tiene escrito como constante. Si no
   coincide, `exit 1` con el aviso "El archivo de la OMS cambió: revisar el origen y actualizar
   el hash a conciencia".
2. Lee el xlsx con `execFileSync("unzip", ["-p", file, "xl/sharedStrings.xml"])` y
   `… "xl/worksheets/sheet1.xml"` (`unzip` está en macOS y Linux). Parsea con regex:
   - los encabezados salen de `<si><t…>…</t></si>`, con `trim`;
   - las filas, de `<row …>…</row>`;
   - las celdas, de `<c r="…"( t="s")?…><v>…</v></c>`;
   - se mapea por nombre de columna, no por posición.
3. Filtra las filas:
   - archivos 2007: meses 61 a 228, **168 filas** exactas, contiguas;
   - archivos 2006: **solo el mes 60**.
4. **Autoverificación.** Si algo falla, `exit 1` y no escribe nada:
   - en cada fila y cada columna `SD3neg…SD3`, `|lmsValueAtZ(L,M,S,z) − columna| ≤ 0,0006`
     (2007) o `≤ 0,051` (2006);
   - en IMC/E 2007, `|SD3 + (SD3 − SD2) − SD4| ≤ 0,0011` y lo mismo con `SD4neg`;
   - en T/E, `L === 1` en todas las filas.
   - El script trae su propia copia mínima de `lmsValueAtZ`, para no importar `src/`.
5. Escribe `src/who/who-lms-data.ts` y `src/who/who-sd-columns.test-data.ts` con formato
   determinista: una fila por línea, dos espacios de indentación.
6. Imprime el resumen: filas por tabla y error máximo por tabla.

**`packages/core/src/who/README.md`** lleva:
- qué es cada tabla;
- la tabla de 4.1 (URL + SHA-256);
- la fecha de descarga (2026-09-24);
- por qué el mes 60 sale de la OMS 2006 (D2);
- la licencia/uso: son datos publicados por la OMS para uso clínico, citando la fuente;
- los dos comandos para regenerar:
  ```bash
  bash packages/core/scripts/who/download-who-lms.sh "$TMPDIR/who"
  npx tsx packages/core/scripts/who/build-who-lms.ts "$TMPDIR/who"
  git diff --exit-code packages/core/src/who/   # sin cambios si la OMS no tocó los archivos
  ```

**Bloqueo técnico.** Si el implementer no tiene red o who.int no responde, **no escribe valores a
mano ni los copia de otra fuente**. Para con `blocked`.

---

## 5. Contrato compartido

Consumidores: **W** = `apps/web`, **D** = `packages/db/domain`, **B** = `apps/bot` (no consume
nada de esto). Todo lo nuevo de `packages/core` se exporta desde `src/index.ts`, con
`export * from "./growth-reference";`.

### 5.1 `packages/core/src/patient-formula-data.ts` (agregados)

```ts
export const PEDIATRIC_MIN_AGE_YEARS = 5;

/** ADULT: ≥ 18 o sin fecha de nacimiento (HU-004, "se lo trata como adulto").
 *  PEDIATRIC: 5 a 17. UNDER_5: 0 a 4. */
export type AgeGroup = "ADULT" | "PEDIATRIC" | "UNDER_5";
export function ageGroupOf(ageYears: number | null): AgeGroup;

/**
 * Meses cumplidos. Misma regla que computeAgeYears: el día de nacimiento se lee en UTC (columna
 * @db.Date) y el "hoy" en `timeZone`.
 * meses = 12·(año − añoNac) + (mes − mesNac) − (día < díaNac ? 1 : 0).
 * Siempre vale Math.floor(computeAgeMonths(...) / 12) === computeAgeYears(...).
 * Nacidos un 31: el 28/02 todavía no cumplieron el mes (se documenta en un test).
 */
export function computeAgeMonths(birthDate: Date, at: Date, timeZone: string): number;

/** 149 → "12 años y 5 meses (149 meses)"; 96 → "8 años (96 meses)"; 61 → "5 años y 1 mes (61 meses)";
 *  12 → "1 año (12 meses)". */
export function ageMonthsLabel(months: number): string;

/** Textos de la HU-008 (D15), exactos. */
export const PEDIATRIC_TEXT = {
  formulaDataInfo:
    "Paciente pediátrico: el diagnóstico usa la referencia OMS 2007 y la TMB, las ecuaciones de Schofield.",
  diagnosisInfo: "Paciente pediátrico: referencia OMS 2007 (5 a 19 años).",
  under5: "Menor de 5 años: el sistema no tiene referencias para esta edad.",
  implausible: "Valor fuera de rango: revisá la medición.",
  noReferenceForMeasurementAge: "Sin referencia OMS para la edad de esta medición",
  bmiForAgeLabel: "IMC para la edad",
  heightForAgeLabel: "Talla para la edad",
  bmiForAgeReference: "Normal: Z −2 a +1",
  heightForAgeReference: "Adecuada: Z ≥ −2",
  reportBmiForAgeLabel: "IMC para la edad (OMS 2007)",
  reportHeightForAgeLabel: "Talla para la edad (OMS 2007)",
  activityHint: "Factores de actividad de adultos: usalos como orientación.",
  proteinGPerKgHint: "0,85–0,95 g/kg (IDR)",
} as const;
```

- `isMinor`, `ADULT_AGE_YEARS` y `MINOR_WARNING_TEXT` **no cambian**. `MINOR_WARNING_TEXT`
  queda exportado, aunque la web deja de usarlo (lo usa un test).
- `noReferenceForMeasurementAge` es una **decisión del architect**. Cubre un caso de borde de la
  D8: un chico que ya cumplió 5 en la consulta, pero cuya medición es de cuando tenía 59 meses.
- Los textos con "−" usan U+2212.

### 5.2 `packages/core/src/growth-reference.ts` (nuevo, puro)

```ts
import { WHO_LMS, WHO_LMS_FIRST_MONTH, WHO_LMS_LAST_MONTH, type WhoIndicator } from "./who/who-lms-data";
export { WHO_LMS_SOURCES, WHO_LMS_DOWNLOADED_AT, type WhoIndicator } from "./who/who-lms-data";

export interface LmsRow { month: number; L: number; M: number; S: number }

/** Fila del mes exacto; null si el mes está fuera de 60…228. */
export function whoLmsRow(indicator: WhoIndicator, sex: Sex, ageMonths: number): LmsRow | null;

/** Z LMS directa: L ≠ 0 → ((x/M)^L − 1)/(L·S); L = 0 → ln(x/M)/S. */
export function lmsZScore(value: number, row: LmsRow): number;
/** Valor en la Z dada: M·(1 + L·S·z)^(1/L) (L = 0 → M·e^(S·z)). */
export function lmsValueAtZ(row: LmsRow, z: number): number;

/** IMC/E con la extensión de la OMS (D6), exacta (sin redondear):
 *  z = lmsZScore; si z > 3: 3 + (x − SD3)/(SD3 − SD2); si z < −3: −3 + (x − SD3neg)/(SD2neg − SD3neg),
 *  con SDk = lmsValueAtZ(row, k). */
export function bmiForAgeZScore(bmi: number, row: LmsRow): number;
/** T/E: lmsZScore directa, sin extensión. */
export function heightForAgeZScore(heightCm: number, row: LmsRow): number;

/** Φ(z), normal estándar. 0.5·erfc(−z/√2), con erfc de Numerical Recipes (erfcc, Chebyshev;
 *  error < 1,2e-7). Se escribe la fórmula en el código. */
export function normalCdf(z: number): number;

/** Percentil entero sobre la Z YA redondeada a 2 decimales (la que se muestra):
 *  r = Math.round(Φ(zRounded)·100); r < 1 → "< P1"; r > 99 → "> P99"; si no, `P${r}`. */
export function formatPercentile(zRounded: number): string;

/** "Z +0,45 · P67" (formatSignedFixedEs(z, 2): U+2212, sin signo en 0,00). */
export function growthZText(zRounded: number, percentileText: string): string;

export type BmiForAgeClass = "SEVERE_THINNESS" | "THINNESS" | "NORMAL" | "OVERWEIGHT" | "OBESITY";
export type HeightForAgeClass = "SEVERELY_STUNTED" | "STUNTED" | "ADEQUATE";
export const BMI_FOR_AGE_CLASS_LABELS: Record<BmiForAgeClass, string>;
  // "Delgadez severa", "Delgadez", "Normal", "Sobrepeso", "Obesidad"
export const HEIGHT_FOR_AGE_CLASS_LABELS: Record<HeightForAgeClass, string>;
  // "Talla baja severa", "Talla baja", "Talla adecuada"

/** Sobre la Z redondeada (D4): < −3 severa; −3 ≤ z < −2 delgadez; −2 ≤ z ≤ +1 normal;
 *  +1 < z ≤ +2 sobrepeso; > +2 obesidad. */
export function classifyBmiForAge(zRounded: number): BmiForAgeClass;
/** < −3 talla baja severa; −3 ≤ z < −2 talla baja; ≥ −2 adecuada (D5). */
export function classifyHeightForAge(zRounded: number): HeightForAgeClass;

export const IMPLAUSIBLE_Z_LIMIT: Record<WhoIndicator, number>; // { BMI_FOR_AGE: 5, HEIGHT_FOR_AGE: 6 }
/** |zRounded| > límite (estricto): −5,00 no es implausible; −5,01 sí. */
export function isImplausibleZ(indicator: WhoIndicator, zRounded: number): boolean;

/** Fila de un indicador pediátrico. value ya redondeado a lo que se muestra
 *  (IMC 1 decimal; talla tal cual se midió). z redondeada a 2 decimales. */
export type GrowthRow<K extends string> =
  | { status: "classified"; value: number; ageMonths: number; z: number; percentileText: string; classKey: K; classLabel: string }
  | { status: "implausible"; value: number; ageMonths: number; z: number; note: string }
  | { status: "unclassified"; value: number; ageMonths: number | null; note: string }
  | { status: "missing"; note: string };

/** Orden de los chequeos:
 *  1) weightKg null → missing DIAGNOSIS_TEXT.missingWeight;
 *  2) heightCm null → missing DIAGNOSIS_TEXT.missingHeight;
 *  3) value = roundTo(bmiExact(w, h), 1);
 *  4) ageMonths null → unclassified DIAGNOSIS_TEXT.missingBirthDate (ageMonths null);
 *  5) sex null → unclassified DIAGNOSIS_TEXT.missingSex (con ageMonths);
 *  6) whoLmsRow null → unclassified PEDIATRIC_TEXT.noReferenceForMeasurementAge;
 *  7) z = roundTo(bmiForAgeZScore(bmiExact, row), 2)  ← la Z sale del IMC EXACTO;
 *  8) isImplausibleZ → implausible con PEDIATRIC_TEXT.implausible;
 *  9) classified con formatPercentile(z) y classifyBmiForAge(z). */
export function buildBmiForAgeRow(input: {
  sex: Sex | null; ageMonths: number | null; weightKg: number | null; heightCm: number | null;
}): GrowthRow<BmiForAgeClass>;

/** Igual, con heightCm (missingHeight si null), heightForAgeZScore, límite 6 y classifyHeightForAge.
 *  value = heightCm tal cual. */
export function buildHeightForAgeRow(input: {
  sex: Sex | null; ageMonths: number | null; heightCm: number | null;
}): GrowthRow<HeightForAgeClass>;

export interface PediatricDiagnosis {
  bmiForAge: GrowthRow<BmiForAgeClass>;
  heightForAge: GrowthRow<HeightForAgeClass>;
  /** Pie gris (ver pediatricFooterText). */
  footer: string;
}

/** Con los ageMonths no nulos de las dos filas:
 *  - ninguno: "Referencia: OMS 2007."
 *  - iguales: `Referencia: OMS 2007. Edad: ${ageMonthsLabel(m)}.` → "… Edad: 12 años y 5 meses (149 meses)."
 *  - distintos (D8): `Referencia: OMS 2007. Edad a cada medición: IMC/E ${a} meses, T/E ${b} meses.` */
export function pediatricFooterText(
  bmiForAge: GrowthRow<string>,
  heightForAge: GrowthRow<string>,
): string;

/** Celda del informe (HU-007) para IMC/E:
 *  classified   → "17,8 · Normal (Z −0,02, P49)"
 *  implausible  → "9,3 · Valor fuera de rango (Z −6,46)"
 *  unclassified → "17,8"
 *  missing      → "Sin dato" (ISAK_REPORT_TEXT.noData; el caller la pasa) */
export function growthReportCell(row: GrowthRow<string>, unit: "" | "cm", noData: string): string;
  // T/E: "150,0 cm · Talla adecuada (Z −0,26, P40)"; unclassified "150,0 cm" (formatFixedEs(value, 1)).
```

`bmiExact` y `roundTo` vienen de `./anthropometry`. `DIAGNOSIS_TEXT` viene de
`./anthropometric-diagnosis`: si eso arma un ciclo de imports, mover los 4 textos que se usan a
una constante compartida sin cambiar su valor.

### 5.3 `packages/core/src/anthropometric-diagnosis.ts` (cambio compatible)

```ts
export interface DiagnosisInput {
  // … igual que hoy …
  /** HU-008 (D8): meses cumplidos a la fecha de la medición del PESO. Solo se usa en PEDIATRIC.
   *  Opcional para no romper a quien no lo pasa; los callers de producción lo pasan SIEMPRE. */
  weightAgeMonths?: number | null;
  /** Ídem, a la fecha de la medición de la TALLA. */
  heightAgeMonths?: number | null;
}

export interface AnthropometricDiagnosis {
  /** true para PEDIATRIC y UNDER_5 (igual que hoy: isMinor). */
  minor: boolean;
  /** HU-008. */
  ageGroup: AgeGroup;
  // … bmi y el resto igual: en menores (PEDIATRIC y UNDER_5) bmi sigue "unclassified" y el resto null …
  /** HU-008: solo PEDIATRIC; null en ADULT y UNDER_5. */
  pediatric: PediatricDiagnosis | null;
}
```

`buildAnthropometricDiagnosis`:
- `ageGroup = ageGroupOf(input.ageYears)`.
- En `PEDIATRIC` arma estas filas y el pie:

  ```ts
  bmiForAge = buildBmiForAgeRow({ sex, ageMonths: weightAgeMonths ?? null, weightKg, heightCm });
  heightForAge = buildHeightForAgeRow({ sex, ageMonths: heightAgeMonths ?? null, heightCm });
  footer = pediatricFooterText(bmiForAge, heightForAge);
  ```

- Todo lo demás queda **idéntico** en los 3 grupos: los adultos no cambian y los menores siguen
  con `bmi` sin clasificar y el resto `null`.
- **IMC/E con peso y talla de fechas distintas (D8):** se usa la edad del **peso**.

Consumidores: **W** (detalle de la consulta) y core (`isak-study.ts`).

### 5.4 `packages/core/src/isak-study.ts` (cambio compatible)

```ts
export interface IsakStudyInput {
  measures: IsakMeasures;
  sex: Sex | null;
  ageYears: number | null;
  /** HU-008: meses cumplidos a la fecha de la consulta del estudio. Opcional; producción lo pasa. */
  ageMonths?: number | null;
}
```

`buildIsakStudy` pasa `weightAgeMonths: ageMonths ?? null` y `heightAgeMonths: ageMonths ?? null`
a `buildAnthropometricDiagnosis`. Nada más cambia. `IsakStudyResult` no suma campos: la parte
pediátrica viaja en `health.diagnosis.pediatric`. Consumidores: **W** y core (`isak-report.ts`).

### 5.5 `packages/core/src/isak-report.ts`

- `IsakReportModel.measurements` suma un campo:

  ```ts
  /** HU-008: solo si el estudio ACTUAL es PEDIATRIC; null en el resto. */
  heightForAge: IsakReportRow | null;
  ```

- **Fila `bmi`:**
  - `label` = `PEDIATRIC_TEXT.reportBmiForAgeLabel` si el actual es `PEDIATRIC`; si no,
    `"IMC (OMS)"`, como hoy;
  - celda de cada estudio (actual o anterior): si **ese** estudio es `PEDIATRIC`,
    `growthReportCell(diagnosis.pediatric.bmiForAge, "", NO_DATA)`; si no, `bmiCell` de hoy;
  - `diff`/`change` null.
- **Fila `heightForAge`** (key `"heightForAge"`, label `PEDIATRIC_TEXT.reportHeightForAgeLabel`):
  - `current` = `growthReportCell(cur.health.diagnosis.pediatric.heightForAge, "cm", NO_DATA)`;
  - `previous`: si hay anterior y es `PEDIATRIC`, lo mismo con el anterior; si hay anterior de
    otro grupo, `NO_DATA`; si no hay anterior, `null`;
  - `diff`/`change` null;
  - pasa por `track()`, así que "Sin dato" en el actual marca `hasMissingData`.
- `minorNote`, `composition`, borradores y `textKeys` **no cambian**.
- `isakReportSourceKey`: `SourceStudy` suma `ageMonths?: number | null`. En `canon`, **solo si
  `ageGroupOf(s.ageYears) === "PEDIATRIC"`**, se agrega `ageMonths: s.ageMonths ?? null`. Así el
  hash de los adultos y de los menores de 5 **no cambia** (sus PDFs no pasan a "desactualizados")
  y en chicos un cambio de meses sí invalida el PDF.

Consumidores: **W** (`lib/anthropometric-report.ts`, `report-editor.tsx`,
`anthropometric-report-pdf.tsx`).

### 5.6 `packages/core/src/energy-requirement.ts`

**TMB:**

```ts
export const BMR_FORMULA_VALUES = [
  "MIFFLIN_ST_JEOR", "HARRIS_BENEDICT", "KATCH_MCARDLE", "CUNNINGHAM",
  "SCHOFIELD_WEIGHT_HEIGHT", "SCHOFIELD_WEIGHT",
] as const;  // mismo orden que el enum de Prisma

export type RequirementPopulation = "ADULT" | "PEDIATRIC";

export const BMR_FORMULAS: ReadonlyArray<{
  value: BmrFormula; label: string; needsBodyFat: boolean; population: RequirementPopulation;
}> = [
  { value: "MIFFLIN_ST_JEOR", label: "Mifflin-St Jeor", needsBodyFat: false, population: "ADULT" },
  { value: "HARRIS_BENEDICT", label: "Harris-Benedict", needsBodyFat: false, population: "ADULT" },
  { value: "KATCH_MCARDLE", label: "Katch-McArdle", needsBodyFat: true, population: "ADULT" },
  { value: "CUNNINGHAM", label: "Cunningham", needsBodyFat: true, population: "ADULT" },
  { value: "SCHOFIELD_WEIGHT_HEIGHT", label: "Schofield (peso y talla)", needsBodyFat: false, population: "PEDIATRIC" },
  { value: "SCHOFIELD_WEIGHT", label: "Schofield (peso)", needsBodyFat: false, population: "PEDIATRIC" },
];
export function bmrFormulasFor(population: RequirementPopulation): typeof BMR_FORMULAS;  // filtra, conserva el orden
export function defaultBmrFormula(population: RequirementPopulation): BmrFormula;
  // ADULT → "MIFFLIN_ST_JEOR" (DEFAULT_BMR_FORMULA sigue igual); PEDIATRIC → "SCHOFIELD_WEIGHT_HEIGHT" (D9)

// Schofield (1985), kcal/día; P en kg, T en METROS (heightCm / 100).
export type SchofieldBand = "3_TO_9" | "10_TO_17";
/** 3 ≤ edad < 10 → "3_TO_9"; 10 ≤ edad < 18 → "10_TO_17"; si no, null. */
export function schofieldBand(ageYears: number): SchofieldBand | null;
export const SCHOFIELD_COEFFICIENTS: Record<Sex, Record<SchofieldBand, {
  weight: { perKg: number; constant: number };
  weightHeight: { perKg: number; perM: number; constant: number };
}>> = {
  MALE: {
    "3_TO_9":   { weight: { perKg: 22.706, constant: 504.3 }, weightHeight: { perKg: 19.59, perM: 130.3, constant: 414.9 } },
    "10_TO_17": { weight: { perKg: 17.686, constant: 658.2 }, weightHeight: { perKg: 16.25, perM: 137.2, constant: 515.5 } },
  },
  FEMALE: {
    "3_TO_9":   { weight: { perKg: 20.315, constant: 485.9 }, weightHeight: { perKg: 16.97, perM: 161.8, constant: 371.2 } },
    "10_TO_17": { weight: { perKg: 13.384, constant: 692.6 }, weightHeight: { perKg: 8.365, perM: 465, constant: 200.0 } },
  },
};
/** null si la edad no tiene banda. */
export function schofieldWeightBmr(p: BmrPersonInput): number | null;
export function schofieldWeightHeightBmr(p: BmrPersonInput): number | null;
/** "Schofield (1985), 10 a 17 años, masculino" | "Schofield (1985), 3 a 9 años, femenino"; null sin banda. */
export function schofieldBandLabel(sex: Sex, ageYears: number): string | null;
```

**Contexto y reglas de menores:**

```ts
export interface RequirementContext {
  /** HU-008: la arma el dominio con ageGroupOf (ADULT o PEDIATRIC; UNDER_5 no tiene contexto). */
  population: RequirementPopulation;
  sex: Sex; ageYears: number; heightCm: number; actualWeightKg: number; measuredBodyFatPercent: number | null;
}

export type MacroReference = Record<"proteinPercent" | "fatPercent" | "carbPercent" | "proteinGPerKg", { min: number; max: number }>;
// MACRO_REFERENCE sigue igual (adultos).
export const MACRO_REFERENCE_PEDIATRIC: MacroReference = {
  proteinPercent: { min: 10, max: 30 }, fatPercent: { min: 25, max: 35 },
  carbPercent: { min: 45, max: 65 }, proteinGPerKg: { min: 0.85, max: 0.95 },
};
export function macroReferenceFor(population: RequirementPopulation): MacroReference;
/** "15–25 %" / "1,2–2,2 g/kg" (formatDecimalEs a ambos lados, guion "–" U+2013). */
export function macroReferenceHint(range: { min: number; max: number }, unit: "%" | "g/kg"): string;

// PRESCRIBED_VCT_BOUNDS sigue igual (adultos, 800–6000).
export const PRESCRIBED_VCT_BOUNDS_PEDIATRIC = { min: 500, max: 6000 } as const;  // D13
export function prescribedVctBoundsFor(population: RequirementPopulation): { min: number; max: number };

/** Rangos de ajuste del objetivo para la población: PEDIATRIC saca AGGRESSIVE_DEFICIT (D11). */
export function adjustmentRangesFor(goal: NutritionGoal, population: RequirementPopulation): ReadonlyArray<GoalAdjustmentRange>;
/** goalAdjustmentRange + filtro de población (null si no corresponde). */
export function adjustmentRangeFor(goal: NutritionGoal, key: AdjustmentRangeKey, population: RequirementPopulation): GoalAdjustmentRange | null;
/** Firma ampliada, compatible: population por defecto "ADULT". */
export function initialAdjustmentRange(goal: NutritionGoal | null, preferred: AdjustmentRangeKey | null, population?: RequirementPopulation): GoalAdjustmentRange | null;
```

**`REQUIREMENT_TEXT`.** Agregados, exactos:

```ts
formulaNotForAge: "La fórmula elegida no corresponde a la edad del paciente",
adjustedWeightNotForMinors: "En menores se usa el peso actual",
vctOutOfRangePediatric: "El VCT indicado va de 500 a 6.000 kcal",
```

`proteinGPerKgWarning(gPerKg, ref = MACRO_REFERENCE.proteinGPerKg)` suma el 2.º parámetro
opcional. En adultos el texto no cambia.

**`computeMacros(p)`.** Suma `reference?: MacroReference` (por defecto `MACRO_REFERENCE`) y la usa
en todos los warnings: %, g/kg, grasas y carbohidratos.

**`RequirementCalculation`.** Cambian estos tipos:

```ts
idealWeightDevineKg: number | null;      // null en PEDIATRIC
adjustedWeightKg: number | null;         // null en PEDIATRIC
deurenbergBodyFatPercent: number | null; // null en PEDIATRIC
// bmrByFormula: Record<BmrFormula, number | null> — ahora con las 6 claves
```

**`calculateRequirement(ctx, draft)`.** El resto del flujo queda como hoy.

- **ADULT:** exactamente igual que hoy. Además:
  - `bmrByFormula.SCHOFIELD_* = null`;
  - si `draft.bmrFormula` es de Schofield, `bmrKcal = null` y el error es
    `formulaNotForAge`, **no** `bodyFatNeeded`.
- **PEDIATRIC:**
  - **Peso:**
    - `idealWeightDevineKg`, `adjustedWeightKg` y `deurenbergBodyFatPercent` = `null`;
    - `suggestAdjustedWeight` = false;
    - `weightUsedKg` = `ctx.actualWeightKg`;
    - si `draft.weightBasis === "ADJUSTED"`, error `adjustedWeightNotForMinors`.
  - **Grasa:** `bodyFatPercent` = `null`, cualquiera sea `bodyFatSource`.
  - **TMB:**
    - `bmrByFormula`: Mifflin, HB, Katch y Cunningham = `null`;
      `SCHOFIELD_WEIGHT_HEIGHT = schofieldWeightHeightBmr(person)` y
      `SCHOFIELD_WEIGHT = schofieldWeightBmr(person)`, con `person` en el peso actual;
    - si `draft.bmrFormula` es de adultos, `bmrKcal = null` y el error es `formulaNotForAge`.
  - **Ajuste:** el rango sale de `adjustmentRangeFor(goal, key, "PEDIATRIC")`. Con
    `AGGRESSIVE_DEFICIT` da `null` → error `rangeMissing`.
  - **VCT:**
    - límites: `PRESCRIBED_VCT_BOUNDS_PEDIATRIC`;
    - fuera de rango: `vctOutOfRangePediatric`;
    - no entero: `vctNotInteger`, como hoy.
  - **Macros:** `computeMacros({ …, reference: MACRO_REFERENCE_PEDIATRIC })`.

**`PrescriptionSnapshot`.** Estos campos cambian. Los nombres son las columnas de
`NutritionPrescription`:

```ts
idealWeightDevineKg: number | null;         // roundTo 2; null en PEDIATRIC
bmrMifflinStJeorKcal: number | null;        // null en PEDIATRIC
bmrHarrisBenedictKcal: number | null;       // null en PEDIATRIC
bmrSchofieldWeightHeightKcal: number | null; // Math.round; null en ADULT
bmrSchofieldWeightKcal: number | null;       // Math.round; null en ADULT
```

**`buildPrescriptionSnapshot`.** Usa `roundOrNull` para las 6 TMB, y
`idealWeightDevineKg: calc.idealWeightDevineKg === null ? null : roundTo(…, 2)`. En PEDIATRIC,
`weightBasis` es `"ACTUAL"` (si viniera `ADJUSTED`, ya hay error), `bodyFatPercent` es `null` y
`bodyFatSource` es `null`.

**`initialRequirementDraft({ ctx, … })`:**
- **`bmrFormula`:** la de `reference` si está en `bmrFormulasFor(ctx.population)` y, cuando
  `needsBodyFat`, hay grasa medida. Si no, `defaultBmrFormula(ctx.population)`.
- **`weightBasis`:** en PEDIATRIC, `"ACTUAL"`; en adultos, como hoy.
- **`bodyFatSource`:** en PEDIATRIC, `null`; en adultos, como hoy.
- **`adjustmentRange` y `adjustmentPercent`:**
  `initialAdjustmentRange(goal, reference?.adjustmentRange ?? null, ctx.population)`, con el
  resto de la lógica de hoy.
- **Resultado:** en PEDIATRIC con "Bajar de peso", `MODERATE_DEFICIT` y −20, aunque la referencia
  sea `AGGRESSIVE_DEFICIT`.

**`draftFromPrescription(p, ctx)`.** Mismas correcciones cuando la población de `ctx` no coincide
con lo guardado (por ejemplo, si se corrigió la fecha de nacimiento):
- una fórmula que no es de la población pasa a `defaultBmrFormula`;
- en PEDIATRIC, `weightBasis` pasa a `"ACTUAL"` y `bodyFatSource` a `null`;
- un rango que no es de la población pasa a `initialAdjustmentRange(goal, null, population)`,
  con `defaultAdjustmentPercent`.

**`prescriptionWeightLine(p)`.** Usa el texto "ajustado; ideal Devine" solo si
`weightBasis === "ADJUSTED" && idealWeightDevineKg !== null`. En cualquier otro caso usa
"(actual)". Los adultos no cambian. Para Tomás: `"Peso usado: 40,0 kg (actual)"`.

**`prescriptionFormulaLine(p)`.** Sin cambios de código: toma la etiqueta de Schofield de
`BMR_FORMULAS`.

Consumidores: **W** (calculadora, sección y action) y **D** (`prescriptions.ts`).

### 5.7 `packages/db/domain/prescriptions.ts`

- `RequirementContextForConsultation` suma `ageGroup: AgeGroup`.
- `getRequirementContextForConsultation`:

  ```ts
  const ageGroup = ageGroupOf(ageYears);
  const ctx = patient.sex !== null && ageYears !== null && ageGroup !== "UNDER_5" && weight && height
    ? { population: ageGroup === "PEDIATRIC" ? "PEDIATRIC" : "ADULT", sex, ageYears, heightCm, actualWeightKg,
        measuredBodyFatPercent: measurements.bodyFatPercent?.value ?? null }
    : null;
  ```

  El comentario cambia a "`ctx` null si falta algo bloqueante o si es menor de 5". Se deja de
  importar `isMinor`.
- `saveConsultationPrescription`: sin cambios de lógica. El snapshot trae las columnas nuevas.
- `toPrescriptionSnapshot`: mapea las columnas nuevas y ahora nullable:
  - `idealWeightDevineKg: decimalOrNull(p.idealWeightDevineKg)`;
  - `bmrMifflinStJeorKcal: p.bmrMifflinStJeorKcal`;
  - `bmrHarrisBenedictKcal: p.bmrHarrisBenedictKcal`;
  - `bmrSchofieldWeightHeightKcal: p.bmrSchofieldWeightHeightKcal`;
  - `bmrSchofieldWeightKcal: p.bmrSchofieldWeightKcal`.
- `getReferencePrescription`: sin cambios (el enum suma valores).

Consumidor: **W**. El bot no importa este archivo, pero su `typecheck` corre igual.

---

## 6. Rutas, server actions y API

- **No hay rutas nuevas ni API.**
- `apps/web/src/app/(panel)/pacientes/[id]/prescription-actions.ts` no cambia de código. El zod
  usa `z.enum(BMR_FORMULA_VALUES)` y acepta los dos valores de Schofield solo. Las reglas
  (fórmula por población, peso ajustado, rango, VCT mínimo) las valida
  `buildPrescriptionSnapshot` en el dominio.
- Se sigue guardando con `onClick` + `startTransition`. No se agrega ningún `confirm`.

## 7. UI (skill `ui`): vistas, estructura y componentes

Sistema de diseño de la HU-002: `Card`, `Badge`, `Alert`, `Quantity`, `Row`, `Muted`, números
es-AR y `tabular-nums`. `tailwind.config.ts` **no se toca**. Tonos: `success`, `warning`,
`danger`. El texto de "implausible" usa `text-warning`, un token que ya existe. Ninguna `key`
nueva depende de datos guardados: todas las `key` son constantes o valores de enum.

### 7.1 Componente compartido `GrowthIndicatorRow` (en `diagnosis-rows.tsx`, server-safe)

```ts
export const BMI_FOR_AGE_TONES: Record<BmiForAgeClass, Tone> =
  { SEVERE_THINNESS: "danger", THINNESS: "warning", NORMAL: "success", OVERWEIGHT: "warning", OBESITY: "danger" };
export const HEIGHT_FOR_AGE_TONES: Record<HeightForAgeClass, Tone> =
  { SEVERELY_STUNTED: "danger", STUNTED: "warning", ADEQUATE: "success" };
export function GrowthIndicatorRow<K extends string>(props: {
  label: string; row: GrowthRow<K>; tones: Record<K, Tone>; unit?: string; decimals: number;
  reference: string; source: string | null;
}): JSX.Element;
```

Estructura: un `Row` (`dt` label / `dd` flex), en el mismo orden que `IndicatorRow`:
- `missing` → `<Muted>{note}</Muted>`.
- `Quantity` con unidad, o `fixedDecimals(value, decimals)` → `source` en `Muted`, si hay.
  Según el estado:
  - `classified`: `<Muted>{growthZText(z, percentileText)}</Muted>` +
    `<Badge tone={tones[classKey]}>{classLabel}</Badge>` + `<Muted>{reference}</Muted>`;
  - `implausible`: `<Muted>{growthZText sin percentil → "Z −6,46"}</Muted>` +
    `<span className="text-xs font-medium text-warning">{note}</span>`, sin `Badge`. En core,
    `growthZText(z, "")` devuelve solo `"Z −6,46"` cuando el percentil es `""`;
  - `unclassified`: `<Muted>{note}</Muted>`.

### 7.2 Vista "Detalle de la consulta": tarjeta "Diagnóstico antropométrico" (cambia)

**Archivo:** `consultas/[consultationId]/anthropometric-diagnosis.tsx`, server component.

**Estructura:** un `Card` con el título "Diagnóstico antropométrico" y la misma `description` que
hoy. El orden de los casos es este:
1. `noMeasurements`: como hoy.
2. **`ageGroup === "PEDIATRIC"`:**
   - `Alert tone="info"` con `PEDIATRIC_TEXT.diagnosisInfo`;
   - `dl.divide-y` con dos filas `GrowthIndicatorRow`:
     - "IMC para la edad": `row = pediatric.bmiForAge`, `tones = BMI_FOR_AGE_TONES`,
       `decimals = 1`, `reference = PEDIATRIC_TEXT.bmiForAgeReference` y
       `source = datesOf("weightKg", "heightCm")`;
     - "Talla para la edad": `row = pediatric.heightForAge`, `tones = HEIGHT_FOR_AGE_TONES`,
       `unit = "cm"`, `decimals = 1`, `reference = PEDIATRIC_TEXT.heightForAgeReference` y
       `source = datesOf("heightCm")`;
   - pie: `<p className="mt-3 text-xs text-muted-foreground">{pediatric.footer}</p>`;
   - **no** hay cintura, ICC, cintura/talla, conicidad, Deurenberg, peso ideal ni peso ajustado.
3. **`ageGroup === "UNDER_5"`:** `Alert tone="warning"` con `PEDIATRIC_TEXT.under5` y la fila
   `IndicatorRow` "IMC" sin clasificar, como hoy.
4. **`ADULT`:** idéntico a hoy.

**Faltantes.** Con "Falta sexo", las filas muestran el valor y "Falta sexo". El `Alert` de
faltantes con "Completar datos para cálculos" ya lo muestra la sección "Requerimiento", que ahora
aparece en pediátricos.

### 7.3 Vista "Detalle de la consulta": sección "Requerimiento" y calculadora (cambia)

**Archivos:** `consultas/[consultationId]/page.tsx` (server), `requirement-section.tsx` y
`requirement-calculator.tsx` (cliente).

- **`page.tsx`:**
  - la sección se muestra si `diagnosis.ageGroup !== "UNDER_5"`; hoy es `!diagnosis.minor`.
    Con eso el botón "Calcular requerimiento" aparece para 5 a 17;
  - la sección no cambia de estructura: vacío → `Alert` de bloqueantes → botón; o resumen.
- **Calculadora, con `pediatric = calculator.ctx.population === "PEDIATRIC"`.** Estructura: la
  lista numerada de pasos (`Step`), que se renumera: `const n = pediatric ? 0 : 1`.
  1. **"Peso para las fórmulas":** solo si `!pediatric`. Es el `ToggleGroup` de hoy, que usa
     `calc.adjustedWeightKg!` (en adultos nunca es `null`; usar un guard, no `!`, si
     `strict` lo pide).
  2. **"Tasa metabólica basal (TMB)":**
     - `RadioGroup` + `Table` con `bmrFormulasFor(ctx.population)`. En pediátricos son 2
       filas: Schofield (peso y talla) y Schofield (peso);
     - columna "Dato que usa":
       - `SCHOFIELD_WEIGHT_HEIGHT` → `con ${kg1(weightUsed)} kg y ${formatDecimalEs(ctx.heightCm, 1)} cm`;
       - `SCHOFIELD_WEIGHT` → `con ${kg1} kg`;
       - las fórmulas de adultos, como hoy;
     - debajo de la tabla, en pediátricos:
       `<p className="mt-2 text-xs text-muted-foreground">{schofieldBandLabel(ctx.sex, ctx.ageYears)}</p>`;
     - los botones de grasa ("Usar el estimado de Deurenberg" y "Usar el % medido") **solo si
       `!pediatric`**;
     - "Medido por bioimpedancia: …" se mantiene igual.
  3. **"Actividad":** el mismo `Select` con los 5 niveles. En pediátricos, debajo del `Field`:
     `<p className="mt-2 text-xs text-muted-foreground">{PEDIATRIC_TEXT.activityHint}</p>`.
  4. **"Objetivo":**
     - los mismos 4 objetivos;
     - el `Select` "Tipo de ajuste" se muestra si `adjustmentRangesFor(goal, population).length > 1`.
       En pediátricos, "Bajar de peso" tiene un solo rango (Déficit moderado), así que el
       `Select` no aparece;
     - `changeGoal` usa `initialAdjustmentRange(goal, null, ctx.population)`;
     - `range` sale de `adjustmentRangeFor(goal, key, ctx.population)`.
  5. **"VCT indicado":** sin cambios de UI. El error de rango sale de core.
  6. **"Macronutrientes":**
     - `const ref = macroReferenceFor(ctx.population)`;
     - las ayudas de los `Field` salen de `macroReferenceHint(ref.proteinPercent, "%")` y de los
       demás rangos (en adultos, el texto es idéntico al de hoy);
     - en modo g/kg, la ayuda de proteínas es `PEDIATRIC_TEXT.proteinGPerKgHint` en pediátricos
       y `macroReferenceHint(ref.proteinGPerKg, "g/kg")` en adultos.
- `requirement-section.tsx`: sin cambios de código. `prescriptionFormulaLine` y
  `prescriptionWeightLine` ya dan los textos pediátricos, y el encabezado g/kg sigue usando
  `weightBasis`.

### 7.4 Vista "Ficha del paciente", pestaña Resumen: tarjeta "Datos para cálculos" (cambia)

**Archivo:** `pacientes/[id]/formula-data-section.tsx`. Se agrega `const group = ageGroupOf(ageYears)`.

**Estructura:** el `Card` de hoy. El bloque de avisos se muestra si hay `missingMessage` o
`group !== "ADULT"`:
- `PEDIATRIC` → `Alert tone="info"` con `PEDIATRIC_TEXT.formulaDataInfo`;
- `UNDER_5` → `Alert tone="warning"` con `PEDIATRIC_TEXT.under5`.

Se deja de importar `MINOR_WARNING_TEXT` e `isMinor`.

### 7.5 Vista "Estudio antropométrico ISAK": tarjeta "Índices de salud" (cambia)

**Archivo:** `consultas/[consultationId]/antropometria/page.tsx`.
- Suma `const monthsAt = (at: Date) => patient.birthDate ? computeAgeMonths(patient.birthDate, at, tz) : null;`
  y pasa `ageMonths: monthsAt(consultation.consultedAt)` y `ageMonths: monthsAt(previousAt)` a los
  dos `buildIsakStudy`.
- En "Índices de salud":
  - **`health.ageGroup === "PEDIATRIC"`:** en lugar del `IndicatorRow` "IMC" van dos filas
    `GrowthIndicatorRow`, "IMC para la edad" y "Talla para la edad", con las mismas props que en
    7.2 y `source={null}`. El resto sigue igual: en menores, ICC, cintura/talla y conicidad ya
    vienen `null` y no se muestran.
  - **`ADULT` y `UNDER_5`:** como hoy.
- El `Alert` de composición corporal para menores y las secciones ocultas no cambian.

### 7.6 Informe: página del editor y PDF (cambian poco)

- `apps/web/src/lib/anthropometric-report.ts`:
  - `const monthsAt = …`, igual que en 7.5;
  - pasa `ageMonths` a los dos `buildIsakStudy` y a `isakReportSourceKey` (en `current` y en
    `previous`, `ageMonths: monthsAt(fecha)`).
- `antropometria/informe/report-editor.tsx`: la tabla de mediciones pasa a
  `[...model.measurements.rows, model.measurements.bmi, ...(model.measurements.heightForAge ? [model.measurements.heightForAge] : [])]`.
  **No** se agregan textos editables.
- `apps/web/src/lib/anthropometric-report-pdf.tsx`: el mismo cambio en `Rows`.
- Adultos: el modelo da `heightForAge: null` y `bmi.label` "IMC (OMS)", así que el PDF queda
  idéntico.

### 7.7 Detalle de la consulta: cálculo de meses (en `page.tsx`)

```ts
const monthsAt = (at: Date) => (patient.birthDate ? computeAgeMonths(patient.birthDate, at, tz) : null);
const diagnosis = buildAnthropometricDiagnosis({
  …,
  weightAgeMonths: m.weightKg ? monthsAt(m.weightKg.recordedAt) : null,
  heightAgeMonths: m.heightCm ? monthsAt(m.heightCm.recordedAt) : null,
});
```

Las dos llamadas a `buildIsakStudy` de la tarjeta ISAK pasan `ageMonths`: la del estudio actual,
`monthsAt(consultation.consultedAt)`; la del anterior, `monthsAt(previousAt)`.

### 7.8 Bot y portal

Sin cambios. **No hay mensajes de WhatsApp nuevos.**

---

## 8. Archivos

**Nuevos:**
- `packages/core/src/growth-reference.ts`, `packages/core/src/growth-reference.test.ts`
- `packages/core/src/who/who-lms-data.ts` (generado), `packages/core/src/who/who-sd-columns.test-data.ts` (generado), `packages/core/src/who/README.md`
- `packages/core/scripts/who/download-who-lms.sh`, `packages/core/scripts/who/build-who-lms.ts`
- `packages/db/prisma/migrations/<timestamp>_pediatric_schofield/migration.sql`
- `packages/db/scripts/hu008-walkthrough.ts`

**Modificados:**
- `packages/core/src/index.ts`, `patient-formula-data.ts`, `anthropometric-diagnosis.ts`, `energy-requirement.ts`, `isak-study.ts`, `isak-report.ts`
- `packages/core/src/patient-formula-data.test.ts`, `anthropometric-diagnosis.test.ts`, `energy-requirement.test.ts`, `isak-study.test.ts`, `isak-report.test.ts` (solo casos **agregados**, salvo lo que dice 10.6)
- `packages/db/prisma/schema.prisma`, `packages/db/domain/prescriptions.ts`, `packages/db/scripts/test-prescriptions.ts`, `packages/db/package.json` (script `walkthrough:hu008`)
- `apps/web/src/app/(panel)/pacientes/[id]/formula-data-section.tsx`
- `apps/web/src/app/(panel)/pacientes/[id]/consultas/[consultationId]/page.tsx`, `anthropometric-diagnosis.tsx`, `diagnosis-rows.tsx`, `requirement-calculator.tsx`
- `apps/web/src/app/(panel)/pacientes/[id]/consultas/[consultationId]/antropometria/page.tsx`, `antropometria/informe/report-editor.tsx`
- `apps/web/src/lib/anthropometric-report.ts`, `apps/web/src/lib/anthropometric-report-pdf.tsx`

**No se tocan:**
- `apps/bot/**`;
- `prescription-actions.ts`, `requirement-section.tsx` y `requirement-summary-card.tsx`;
- `tailwind.config.ts`;
- `backlog.json`.

## 9. Checklist atómico

### packages/core
- [ ] `scripts/who/download-who-lms.sh` (4.3). Correrlo a una carpeta del scratchpad y anotar en
      `progress/impl_HU-008.md` los SHA-256 que dio. Si no hay red: `blocked`.
- [ ] `scripts/who/build-who-lms.ts` (4.3). Correrlo: genera `src/who/who-lms-data.ts` y
      `src/who/who-sd-columns.test-data.ts`. Anotar el resumen (filas y error máximo por tabla).
- [ ] Correrlo **otra vez** y `git diff --exit-code packages/core/src/who/`: tiene que dar
      idéntico.
- [ ] `src/who/README.md` (4.3).
- [ ] `patient-formula-data.ts`: `PEDIATRIC_MIN_AGE_YEARS`, `AgeGroup`, `ageGroupOf`,
      `computeAgeMonths`, `ageMonthsLabel` y `PEDIATRIC_TEXT` (5.1). Tests (10.1).
- [ ] `growth-reference.ts` (5.2) + export en `index.ts`. Tests (10.2).
- [ ] `anthropometric-diagnosis.ts` (5.3). Tests (10.3).
- [ ] `isak-study.ts` (5.4). Test (10.4).
- [ ] `isak-report.ts` (5.5). Tests (10.5).
- [ ] `energy-requirement.ts` (5.6): Schofield, población, referencias, VCT, rangos, textos,
      snapshot, borradores y línea de peso. En `energy-requirement.test.ts`, agregar
      `population: "ADULT"` a los fixtures `ana` y `luis` (única edición permitida de casos
      existentes, 10.6) y sumar los tests nuevos (10.7).
- [ ] `npm run test` y `npm run typecheck --workspace packages/core` en verde.

### packages/db
- [ ] Respaldo `pg_dump` y conteos (3.3).
- [ ] `schema.prisma` (3.1).
- [ ] `migrate dev --create-only --name pediatric_schofield </dev/null`. Revisar el SQL (3.2) y
      copiarlo en `progress/impl_HU-008.md`.
- [ ] `npm run db:migrate </dev/null` y `npm run db:generate`. Después, `migrate status`.
- [ ] `domain/prescriptions.ts` (5.7).
- [ ] `scripts/test-prescriptions.ts`: agregar `population: "ADULT"` al `deepEqual` del ctx
      adulto y reescribir el paso 11 (10.8). Correrlo.
- [ ] `scripts/hu008-walkthrough.ts` y el script `walkthrough:hu008` en `package.json` (12.1).
      Correr **`create` y después `cleanup`** una vez, para probarlo, y dejar la base como
      estaba. **No** dejar los datos creados: los crea el orquestador.

### apps/bot
- [ ] Sin cambios de código. `npm run typecheck --workspace apps/bot` y
      `npm run test:confirm-flow --workspace apps/bot` en OK.

### apps/web
- [ ] `diagnosis-rows.tsx`: tonos y `GrowthIndicatorRow` (7.1).
- [ ] `consultas/[consultationId]/page.tsx`: meses (7.7) y condición de la sección (7.3).
- [ ] `anthropometric-diagnosis.tsx` (7.2).
- [ ] `requirement-calculator.tsx` (7.3).
- [ ] `formula-data-section.tsx` (7.4).
- [ ] `antropometria/page.tsx` (7.5).
- [ ] `lib/anthropometric-report.ts`, `report-editor.tsx` y `anthropometric-report-pdf.tsx` (7.6).
- [ ] `grep -rn "MINOR_WARNING_TEXT" apps/web/src` sin resultados.
- [ ] `npm run typecheck` (todos los workspaces) en verde.

## 10. Tests (vitest, `packages/core`)

Todos los valores esperados de abajo salen de las filas oficiales de 4.1. Las filas que usan los
tests van **escritas en el test**, además de leerse de `WHO_LMS`: así se verifica que los datos
generados las contienen.

### 10.1 `patient-formula-data.test.ts` (agregados)
- **`ageGroupOf`:** `null` → ADULT; 4 → UNDER_5; 5 → PEDIATRIC; 17 → PEDIATRIC; 18 → ADULT.
- **`computeAgeMonths`**, con `tz = "America/Argentina/Buenos_Aires"`:
  - **Tomás:** nacido `new Date("2014-03-15")` (medianoche UTC), consulta
    `2026-09-10T15:00:00Z` → **149**;
  - **en el día del cumpleaños mensual:** `2026-09-15T15:00:00Z` → 150;
  - **zona horaria:** nacido `2014-03-10`, `at = 2026-09-10T02:00:00Z` (09/09 a las 23:00 en
    AR) → **149**, no 150;
  - **fin de mes:** nacido `2020-01-31`, `at = 2020-02-28T15:00Z` → 0; `2020-03-01T15:00Z` → 1;
  - **consistencia:** en un loop de 40 fechas (una por mes desde 2024-01-05), con nacimiento
    `2014-03-15`, `Math.floor(months / 12) === computeAgeYears(...)`.
- **`ageMonthsLabel`:**
  - 149 → `"12 años y 5 meses (149 meses)"`;
  - 96 → `"8 años (96 meses)"`;
  - 61 → `"5 años y 1 mes (61 meses)"`;
  - 12 → `"1 año (12 meses)"`.

### 10.2 `growth-reference.test.ts` (nuevo)

1. **Integridad de las tablas.** Para cada indicador y sexo:
   - 169 filas, meses 60…228 contiguos, `L`, `M` y `S` finitos, `M > 0` y `S > 0`;
   - en T/E, `L === 1`.
2. **Filas contra las DE publicadas** (`WHO_SD_COLUMNS`). Para cada fila y cada
   `k ∈ {−3, −2, −1, 0, 1, 2, 3}`:
   - `|lmsValueAtZ(row, k) − SDk|` ≤ 0,0006, y ≤ 0,051 en el mes 60;
   - IMC/E 2007: `bmiForAgeZScore(SD4, row)` ≈ +4 y `bmiForAgeZScore(SD4neg, row)` ≈ −4
     (tolerancia 0,002);
   - en esas filas, `lmsZScore(SD4)` **no** da 4. Por ejemplo, en niños del mes 96 da 3,71: la
     extensión es necesaria.
3. **Filas concretas, escritas en el test:**
   - IMC/E niños, mes 149: `L −1.7559, M 17.8124, S 0.11688`.
     `whoLmsRow("BMI_FOR_AGE", "MALE", 149)` las devuelve. Z (a 2 decimales):
     - 17,8124 → 0,00;
     - SD2 24,067 → 2,00;
     - SD2neg 14,644 → −2,00;
     - SD1 20,302 → 1,00;
     - SD3 30,708 → 3,00.
   - T/E niños, mes 149: `L 1, M 151.8623, S 0.04762`. Z:
     - 151,8623 → 0,00;
     - SD2neg 137,399 → −2,00;
     - SD5neg 115,704 → −5,00, **sin** extensión.
   - IMC/E niños, mes 96: `L −1.4629, M 15.7368, S 0.09526`. Tiene `SD2 19.675`, `SD3 22.785`,
     `SD4 25.895`, `SD2neg 13.302`, `SD3neg 12.394` y `SD4neg 11.486`.
   - Mes 60 (OMS 2006): niños IMC/E `L −0.6892, M 15.1916, S 0.087`; niñas talla
     `M 109.4233, S 0.04347`.
   - `whoLmsRow(…, 59)` → `null`; `whoLmsRow(…, 229)` → `null`; mes 228 → fila.
4. **Fila ficticia de la HU**, construida a mano (IMC `L −1, M 17, S 0.12`):
   - IMC 20 → Z 1,25 y `formatPercentile(1.25)` → `"P89"`;
   - IMC 30 → `lmsZScore` ≈ 3,61; `bmiForAgeZScore` → **3,82**
     (DE3 = 26,5625; DE2 = 22,3684);
   - IMC 12 → **−3,41** (DE3neg = 12,50; DE2neg = 13,7097).
   - Talla con `L 1, M 150, S 0.045`: 140 → **−1,48** con `heightForAgeZScore` (sin extensión).
5. **`normalCdf`**, con una tolerancia de 1e-7:

   | z | Φ(z) |
   |---|---|
   | 0 | 0,5 |
   | 1 | 0,841344746 |
   | −1 | 0,158655254 |
   | 1,25 | 0,894350226 |
   | 2 | 0,977249868 |
   | −1,96 | 0,024997895 |
   | 3 | 0,998650102 |
   | −3 | 0,001349898 |

6. **`formatPercentile`:**
   - 0 → `"P50"`;
   - 2,33 → `"P99"`;
   - 2,6 → `"> P99"`;
   - −2,33 → `"P1"`;
   - −2,6 → `"< P1"`;
   - −0,02 → `"P49"`.
7. **Clasificación con la Z redondeada (D4, D5):**
   - IMC/E:
     - −3,01 → `SEVERE_THINNESS`;
     - −3,00 → `THINNESS`;
     - −2,01 → `THINNESS`;
     - −2,00 → `NORMAL`;
     - 1,00 → `NORMAL`;
     - 1,01 → `OVERWEIGHT`;
     - 2,00 → `OVERWEIGHT`;
     - 2,01 → `OBESITY`.
   - T/E:
     - −3,01 → `SEVERELY_STUNTED`;
     - −3,00 → `STUNTED`;
     - −2,01 → `STUNTED`;
     - −2,00 → `ADEQUATE`;
     - 3,5 → `ADEQUATE`.
   - Etiquetas exactas.
8. **`isImplausibleZ`:**
   - IMC/E: −5,00 → false; −5,01 → true; 5,01 → true;
   - T/E: −6,00 → false; −6,01 → true.
9. **`buildBmiForAgeRow` y `buildHeightForAgeRow`:**
   - **Tomás** (`MALE`, 149, 40 kg, 150 cm):
     - IMC/E: `{ status: "classified", value: 17.8, ageMonths: 149, z: -0.02, percentileText: "P49", classKey: "NORMAL", classLabel: "Normal" }`;
     - T/E: `{ status: "classified", value: 150, ageMonths: 149, z: -0.26, percentileText: "P40", classKey: "ADEQUATE", classLabel: "Talla adecuada" }`.
   - **Chico del recorrido** (`MALE`, 96 meses, 127,3 cm):
     - 30 kg → IMC 18,5, Z 1,52, `"P94"`, `OVERWEIGHT`;
     - 45 kg → IMC 27,8, Z **4,60** (la directa daría 4,05), `"> P99"`, `OBESITY`;
     - 18 kg → Z −4,42, `"< P1"`, `SEVERE_THINNESS`;
     - 15 kg → `{ status: "implausible", value: 9.3, ageMonths: 96, z: -6.46, note: "Valor fuera de rango: revisá la medición." }`;
     - T/E 127,3 → Z 0,01, `"P50"`, `ADEQUATE`;
     - T/E 108 → Z −3,41, `SEVERELY_STUNTED`.
   - **Sofía** (`FEMALE`, 96, 26 kg, 128 cm): IMC/E Z 0,10 `"P54"` Normal; T/E Z 0,25 `"P60"`.
   - **Faltantes:**
     - sin peso → `missing "Sin dato (falta peso)"`;
     - sin talla → las dos `missing "Sin dato (falta talla)"`;
     - sexo null → `unclassified` con el valor y `"Falta sexo"`;
     - `ageMonths` 59 → `unclassified` con `"Sin referencia OMS para la edad de esta medición"`.
10. **`pediatricFooterText`:**
    - Tomás → `"Referencia: OMS 2007. Edad: 12 años y 5 meses (149 meses)."`;
    - meses 150 y 149 → `"Referencia: OMS 2007. Edad a cada medición: IMC/E 150 meses, T/E 149 meses."`;
    - las dos filas `missing` → `"Referencia: OMS 2007."`.
11. **`growthZText` y `growthReportCell`:**
    - `growthZText(-0.02, "P49")` → `"Z −0,02 · P49"`;
    - `growthZText(0, "P50")` → `"Z 0,00 · P50"`;
    - celda de Tomás IMC/E → `"17,8 · Normal (Z −0,02, P49)"`;
    - celda de Tomás T/E → `"150,0 cm · Talla adecuada (Z −0,26, P40)"`;
    - implausible → `"9,3 · Valor fuera de rango (Z −6,46)"`.

### 10.3 `anthropometric-diagnosis.test.ts` (agregados)
- **Tomás.** `ageYears 12`, `weightAgeMonths 149`, `heightAgeMonths 149`, `sex MALE`, 40 kg y
  150 cm, con cintura y cadera:
  - `ageGroup "PEDIATRIC"` y `minor true`;
  - `bmi` sin clasificar (17,8), como hoy;
  - `pediatric.bmiForAge` y `pediatric.heightForAge` como en 10.2 y `footer` como en 10.2;
  - `waist`, `idealWeights` y `adjustedWeightSuggestion` en `null`.
- **D8.** `weightAgeMonths 150` y `heightAgeMonths 149`: el IMC/E usa la fila 150 (su
  `ageMonths` es 150) y el pie es el de "Edad a cada medición".
- **Menor de 5.** `ageYears 4` → `ageGroup "UNDER_5"`, `pediatric null` y `bmi` sin
  clasificar.
- **Adulto.** El caso `ana` de hoy da `ageGroup "ADULT"` y `pediatric null`. El resto de sus
  asserts queda igual.
- **Sin meses.** `ageYears 12` sin `weightAgeMonths`/`heightAgeMonths` → las dos filas
  `unclassified` con "Falta fecha de nacimiento".

### 10.4 `isak-study.test.ts` (agregado)
- `buildIsakStudy({ measures: { ...CASE_A, weightKg: 40, heightCm: 150 }, sex: "MALE", ageYears: 12, ageMonths: 149 })`
  → `health.diagnosis.pediatric.bmiForAge.z === -0.02` y `heightForAge.classKey === "ADEQUATE"`.
  El resto de los `not_for_minors` queda igual.

### 10.5 `isak-report.test.ts` (agregados)
- **Menor pediátrico.**
  - Entradas:
    - actual: `{ ...CASE_A, weightKg: 40, heightCm: 150 }`, 12 años, 149 meses, "10/09/2026";
    - anterior: `{ ...CASE_B, weightKg: 38, heightCm: 146 }`, 11 años, 143 meses, "10/03/2026".
  - `measurements.bmi.label` → `"IMC para la edad (OMS 2007)"`.
  - `bmi.current` → `"17,8 · Normal (Z −0,02, P49)"`; `bmi.previous` →
    `"17,8 · Normal (Z +0,17, P57)"`. La fila de IMC/E niños del mes 143 es
    `L −1.778, M 17.4799, S 0.11487`.
  - `heightForAge.current` → `"150,0 cm · Talla adecuada (Z −0,26, P40)"`.
    `heightForAge.previous` → `"146,0 cm · Talla adecuada (Z −0,36, P36)"`, con T/E niños del
    mes 143 `M 148.5478, S 0.0475`.
  - `composition` sigue en `null`.
- **Adulto.** El caso AB de hoy da `heightForAge null` y `bmi.label "IMC (OMS)"`.
- **`isakReportSourceKey`:**
  - con adultos, agregar `ageMonths` a `current`/`previous` **no cambia** la clave (igual a la
    que da sin `ageMonths`);
  - con `ageYears 12`, cambiar `ageMonths` de 149 a 150 **sí** la cambia.

### 10.6 Tests existentes

Tienen que seguir en verde **sin cambiar asserts**. Hay una sola edición mecánica permitida:
agregar `population: "ADULT"` a los fixtures `ana` y `luis` de `energy-requirement.test.ts`. Los
casos de menores de la HU-004, HU-006 y HU-007 no pasan meses:
- el `bmi` sigue sin clasificar;
- en el informe, `bmi.current` sigue siendo `"22,7"`;
- `hasMissingData` sigue en false, porque la T/E sin meses muestra el valor y no "Sin dato".

Si algún assert existente cambia, el implementer para y lo explica en `progress/impl_HU-008.md`.

### 10.7 `energy-requirement.test.ts` (agregados)
- **Schofield** (P, T):

  | Paciente | Peso | Peso y talla |
  |---|---|---|
  | Tomás (M, 12, 40, 1,50) | 1365,64 | 1371,3 |
  | Sofía (F, 8, 26, 1,28) | 1014,09 | 1019,524 |
  | F 12, 40, 1,50 | 1227,96 | 1232,1 |
  | M 8, 30, 1,273 | 1185,48 | 1168,472 |

  Tolerancia 1e-6. `Math.round`: Tomás 1366/1371 y Sofía 1014/1020.
- **Bandas:**
  - 9 → `"3_TO_9"`; 10 → `"10_TO_17"`; 2 → null; 18 → null;
  - `schofieldBandLabel("MALE", 12)` → `"Schofield (1985), 10 a 17 años, masculino"`;
    `("FEMALE", 8)` → `"Schofield (1985), 3 a 9 años, femenino"`.
- **`calculateRequirement` pediátrico.** `ctx` de Tomás, `population "PEDIATRIC"`,
  `SCHOFIELD_WEIGHT_HEIGHT`, `ACTUAL`, `LIGHT`, `MAINTAIN`/`MAINTENANCE` 0, VCT 1886, macros
  20/30/50:
  - `bmrKcal` 1371,3;
  - `totalExpenditureKcal` 1885,5375;
  - `calculatedVctKcal` 1885,5375;
  - Mifflin, HB, Katch y Cunningham = `null`;
  - `idealWeightDevineKg`, `adjustedWeightKg` y `deurenbergBodyFatPercent` = `null`;
  - sin errores ni warnings.
- **Snapshot:**
  - `bmrKcal` 1371 y `totalExpenditureKcal` 1886;
  - `bmrSchofieldWeightHeightKcal` 1371 y `bmrSchofieldWeightKcal` 1366;
  - `bmrMifflinStJeorKcal`, `bmrHarrisBenedictKcal` e `idealWeightDevineKg` = `null`;
  - `bodyFatSource` = `null`.
- **`prescriptionFormulaLine(snapshot)`:**
  `` `Schofield (peso y talla) · TMB ${formatMacroAmount(1371,"kcal")} · Ligero ×1,375 · GET ${formatMacroAmount(1886,"kcal")} · Mantenimiento` ``.
  `prescriptionWeightLine` → `"Peso usado: 40,0 kg (actual)"`.
- **Errores:**
  - pediátrico con `MIFFLIN_ST_JEOR` → contiene `formulaNotForAge` y **no** `bodyFatNeeded`;
  - adulto (`ana`) con `SCHOFIELD_WEIGHT` → `formulaNotForAge`;
  - pediátrico con `ADJUSTED` → `adjustedWeightNotForMinors`;
  - pediátrico con `LOSE_WEIGHT`/`AGGRESSIVE_DEFICIT` → `rangeMissing`;
  - VCT 766 en pediátrico → sin error de VCT;
  - VCT 499 en pediátrico → `vctOutOfRangePediatric`;
  - VCT 766 en adulto → `vctOutOfRange` (igual que hoy).
- **Macros pediátricas:**
  - 20/30/50 → sin warnings;
  - 35/25/40 → warnings `"Proteínas 35 %: fuera del rango de referencia (10–30 %)"` y
    `"Carbohidratos 40 %: fuera del rango de referencia (45–65 %)"`. `formatDecimalEs` no fuerza
    decimales: es `REQUIREMENT_TEXT.macroPercentWarning` de hoy. Las grasas en 25 % no avisan,
    porque los bordes están incluidos;
  - g/kg 1,6 → `"Proteínas 1,6 g/kg: fuera del rango de referencia (0,85–0,95 g/kg)"`.
  - Los mismos casos en adultos dan los textos de hoy.
- **`macroReferenceHint`:**
  - `MACRO_REFERENCE.proteinPercent` → `"15–25 %"`;
  - `MACRO_REFERENCE.proteinGPerKg` → `"1,2–2,2 g/kg"`;
  - pediátrico `carbPercent` → `"45–65 %"`.
- **`adjustmentRangesFor`:** `("LOSE_WEIGHT", "PEDIATRIC")` → solo `MODERATE_DEFICIT`;
  `("LOSE_WEIGHT", "ADULT")` → los 2.
- **`initialRequirementDraft`, pediátrico:**
  - con referencia `{ bmrFormula: "MIFFLIN_ST_JEOR", adjustmentRange: "AGGRESSIVE_DEFICIT", adjustmentPercent: -28, … }`
    y objetivo `LOSE_WEIGHT` → `bmrFormula "SCHOFIELD_WEIGHT_HEIGHT"`, `weightBasis "ACTUAL"`,
    `bodyFatSource null`, `adjustmentRange "MODERATE_DEFICIT"` y −20;
  - con `measuredBodyFatPercent` 20 → `bodyFatSource` sigue en `null`.
- **`draftFromPrescription`:** un snapshot de adulto (Mifflin, `ADJUSTED`) con `ctx` pediátrico
  → `SCHOFIELD_WEIGHT_HEIGHT` y `ACTUAL`.

### 10.8 Prueba contra la base: `packages/db/scripts/test-prescriptions.ts` (se actualiza)
- El `deepEqual` del ctx adulto suma `population: "ADULT"`.
- El paso 11 pasa a **"menor de 5 a 17: ctx pediátrico y se guarda con Schofield"**. El menor es
  el que el script ya crea: nacido el 10/01/2014, `MALE`, consulta del 12/09/2026, 40 kg y
  150 cm.
  - `r.ageYears === 12` y `r.ageGroup === "PEDIATRIC"`;
  - `r.ctx` es igual a
    `{ population: "PEDIATRIC", sex: "MALE", ageYears: 12, heightCm: 150, actualWeightKg: 40, measuredBodyFatPercent: null }`;
  - guardar con `baseChoices` (Mifflin, déficit moderado) → `InvalidPrescriptionError` y 0 filas;
  - guardar con
    `{ ...baseChoices, bmrFormula: "SCHOFIELD_WEIGHT_HEIGHT", bodyFatSource: null, nutritionGoal: "MAINTAIN", adjustmentRange: "MAINTENANCE", adjustmentPercent: 0, prescribedVctKcal: 1886 }`
    → OK. Empujar el id a `prescriptionIds`;
  - la fila leída tiene `bmrKcal` 1371, `bmrSchofieldWeightHeightKcal` 1371,
    `bmrSchofieldWeightKcal` 1366, y `bmrMifflinStJeorKcal`, `bmrHarrisBenedictKcal` e
    `idealWeightDevineKg` en `null`;
  - `toPrescriptionSnapshot(fila).idealWeightDevineKg === null`.
- Paso nuevo: un paciente propio de 4 años (nacido el 2022-05-01, con consulta y medición
  propias) → `ctx === null` y `ageGroup === "UNDER_5"`. Sus ids van a los arrays de limpieza.
- La limpieza sigue siendo **solo por ids propios**.

---

## 11. Verificación (el implementer la corre antes de declararse `done`)

### 11.1 Comandos (desde la raíz)

```bash
npm run db:generate
npm run typecheck                                   # core, db, web y bot en verde
npm run test                                        # vitest core en verde (los existentes + los nuevos)
npx tsx packages/core/scripts/who/build-who-lms.ts "$SCRATCHPAD/who" && git diff --exit-code packages/core/src/who/
(cd packages/db && npx dotenv -e ../../.env -- prisma migrate status)                 # up to date, 16 migraciones
(cd packages/db && npx dotenv -e ../../.env -- tsx scripts/test-prescriptions.ts)     # OK
npm run test:isak --workspace packages/db           # OK
npm run test:report --workspace packages/db         # OK
npm run test:confirm-flow --workspace apps/bot      # OK
npm run walkthrough:hu008 --workspace packages/db -- create "$SCRATCHPAD/hu008-ids.json"
npm run walkthrough:hu008 --workspace packages/db -- cleanup "$SCRATCHPAD/hu008-ids.json"
docker compose exec -T db psql -U nutri -d nutribot -At -c 'select (select count(*) from "EvolutionEntry"),(select count(*) from "Consultation"),(select count(*) from "OutboundMessage"),(select count(*) from "Patient"),(select count(*) from "NutritionPrescription");'
#   ↑ igual que antes (hoy 15|18|4|10|0)
grep -rn "MINOR_WARNING_TEXT" apps/web/src          # sin salida
./ops/harness/verify.sh
```

### 11.2 Informe PDF de un chico

Se hace como en la HU-007 (11.3): una carpeta temporal `apps/web/.tmp-pdf-test/` que se borra al
terminar, con un render en memoria de `renderAnthropometricReportPdf`. El modelo es el del caso
10.5 (menor pediátrico).
- `pdftotext` contiene "IMC para la edad (OMS 2007)", "17,8 · Normal (Z −0,02, P49)" y
  "Talla para la edad (OMS 2007)", y no tiene números con punto decimal;
- `pdftoppm -png -r 60` y mirar la página de mediciones con `Read`: las filas nuevas no se cortan
  ni se desbordan.
- Hacer lo mismo con la variante adulta AB y confirmar que su texto es igual al de antes de la HU
  (`pdftotext` antes y después).
- Borrar la carpeta y verificar que `git status` no la muestre.

En `progress/impl_HU-008.md` va el SQL de la migración, las salidas resumidas y el aviso:
"**Cambió el schema: hay que reiniciar el `next dev` del usuario**".

---

## 12. Recorrido en el navegador (lo hace el orquestador, en `localhost:3000`)

Antes: reiniciar el `next dev` del usuario (cambió el cliente Prisma). No levantar otro.

### 12.1 Datos de prueba propios: `packages/db/scripts/hu008-walkthrough.ts`

Se usa así (desde la raíz):
- `npm run walkthrough:hu008 --workspace packages/db -- create <ids.json>`;
- `… -- cleanup <ids.json>`.

Script en `package.json`:
`"walkthrough:hu008": "dotenv -e ../../.env -- tsx scripts/hu008-walkthrough.ts"`.

**`create`** usa las funciones de dominio: `createManualConsultation`,
`addEvolutionEntryToConsultation` y `createIsakStudy`, con las 21 medidas en `null` salvo las
indicadas. **No** crea turnos ni `OutboundMessage`. Crea:

| Qué | Datos |
|---|---|
| Paciente A | `name "Prueba HU-008 Juan (TEST)"`, `whatsappJid "test-hu008-a-<stamp>@test.invalid"`, `phone "000"`, `birthDate 2018-09-01`, `sex MALE`, `activityLevel LIGHT`, `nutritionGoal MAINTAIN` |
| Consulta A1 | día `2026-09-10` (8 años, **96 meses**). Medición común: 30 kg, 127,3 cm. ISAK: 30 kg, 127,3 cm, cintura 58, cadera 66, pliegues tríceps 9, subescapular 7, supraespinal 6, abdominal 9, muslo 12, pierna 10 |
| Consulta A2 | día `2026-09-17` (96 meses). **Solo** ISAK: 45 kg, 127,3 cm, cintura 75, cadera 80, los mismos pliegues + 4 mm cada uno |
| Consulta A3 | día `2026-09-24` (96 meses). Medición común: **solo peso** 15 kg (la talla sale de A2, D8) |
| Paciente B | `name "Prueba HU-008 Menor 4 (TEST)"`, `whatsappJid "test-hu008-b-<stamp>@test.invalid"`, `phone "000"`, `birthDate 2022-05-01`, `sex FEMALE` |
| Consulta B1 | día `2026-09-10` (4 años). Medición común: 16 kg, 102 cm |

Escribe `{ patientIds, consultationIds, entryIds }` en `<ids.json>` y los imprime, con las URLs
`/pacientes/<id>/consultas/<id>`.

**`cleanup`** lee el JSON y borra en este orden, siempre con `where: { id: { in: … } }` y los ids
propios:
1. `nutritionPrescription` por `consultationId in consultationIds`. Son prescripciones que el
   orquestador pudo guardar desde la UI en **estas** consultas, que son propias.
2. `evolutionEntry` por `patientId in patientIds`. Son los pacientes propios; cubre los estudios
   ISAK que se hayan editado. `AnthropometricReport` cae en cascada.
3. `consultation` por id.
4. `patient` por id.

Antes de borrar, verifica que `outboundMessage.count({ where: { toJid: { in: jids } } }) === 0`.
Si no es 0, **no** borra ningún mensaje: avisa y sale con error. Nunca filtra por nombre ni por
fecha.

Todas las Z de abajo salen de la fila del **mes 96** (niños) de la OMS 2007:
- IMC/E: `L −1.4629, M 15.7368, S 0.09526`, `SD1 17.437`, `SD2 19.675`, `SD3 22.785`,
  `SD2neg 13.302`, `SD3neg 12.394`;
- T/E: `L 1, M 127.2651, S 0.04438`.

Por ejemplo, la talla 127,3 da Z = (127,3/127,2651 − 1)/0,04438 = +0,006 → "+0,01".

### 12.2 Recorrido

1. **Consulta A1 (10/09/2026), "Diagnóstico antropométrico":**
   - `Alert` info "Paciente pediátrico: referencia OMS 2007 (5 a 19 años).";
   - "IMC para la edad" `18,5 · Z +1,52 · P94 · [Sobrepeso]`, "Normal: Z −2 a +1";
   - "Talla para la edad" `127,3 cm · Z +0,01 · P50 · [Talla adecuada]`, "Adecuada: Z ≥ −2";
   - pie: "Referencia: OMS 2007. Edad: 8 años (96 meses).";
   - no hay cintura, ICC, peso ideal ni Deurenberg.
2. **Consulta A1, "Requerimiento" → "Calcular requerimiento":**
   - no está el paso "Peso para las fórmulas"; el primer paso es "1. Tasa metabólica basal";
   - la TMB tiene 2 filas: Schofield (peso y talla) **1.168 kcal**, preseleccionada, y Schofield
     (peso) **1.185 kcal**;
   - debajo: "Schofield (1985), 3 a 9 años, masculino";
   - en "Actividad" se lee "Factores de actividad de adultos: usalos como orientación.". Con
     Ligero, GET **1.607 kcal**;
   - con "Bajar de peso", **no** aparece el `Select` "Tipo de ajuste" y el ajuste es −20 %;
     volver a "Mantener";
   - las ayudas de macros son 10–30 %, 25–35 % y 45–65 %. En g/kg, "0,85–0,95 g/kg (IDR)";
   - poner un VCT indicado de 766 y ver que no da error. Poner 499 y ver "El VCT indicado va de
     500 a 6.000 kcal". Volver al calculado;
   - "Guardar prescripción" → toast "Prescripción guardada". El resumen dice
     "Schofield (peso y talla) · TMB 1.168 kcal · Ligero ×1,375 · GET 1.607 kcal · Mantenimiento"
     y "Peso usado: 30,0 kg (actual)";
   - "Editar" reabre con Schofield (peso y talla) y los valores guardados. Cancelar.
3. **Consulta A2 (17/09/2026):**
   - "IMC para la edad" `27,8 · Z +4,60 · > P99 · [Obesidad]`. Es la extensión de la OMS: la
     fórmula LMS directa daría +4,05.
   - Abrir "Ver estudio completo". En "Índices de salud" aparecen las mismas dos filas, sin ICC,
     cintura/talla ni conicidad, con el aviso de composición corporal.
   - "Informe PDF" → generar:
     - la fila "IMC para la edad (OMS 2007)": actual "27,8 · Obesidad (Z +4,60, > P99)" y
       anterior "18,5 · Sobrepeso (Z +1,52, P94)";
     - "Talla para la edad (OMS 2007)": "127,3 cm · Talla adecuada (Z +0,01, P50)" en las dos
       columnas;
     - sigue la nota de composición corporal.
   - **No** enviar por WhatsApp.
4. **Consulta A3 (24/09/2026):**
   - "IMC para la edad" `9,3 · Z −6,46` y, en lugar del `Badge`, "Valor fuera de rango: revisá la
     medición.";
   - "Talla para la edad" con la fecha "(17/09/2026)" (D8).
5. **Ficha del paciente A, pestaña Resumen:**
   - "Datos para cálculos" muestra el `Alert` info "Paciente pediátrico: el diagnóstico usa la
     referencia OMS 2007 y la TMB, las ecuaciones de Schofield.";
   - "Requerimiento indicado" muestra 1.607 kcal.
6. **Paciente B:**
   - la consulta B1 tiene el `Alert` warning "Menor de 5 años: el sistema no tiene referencias
     para esta edad.", el IMC 15,4 sin clasificar y **ninguna** sección "Requerimiento";
   - en el Resumen, el mismo aviso en tono warning.
7. **Adultos:** abrir, **solo mirando**, una consulta y un estudio ISAK de un paciente adulto
   existente. Todo tiene que verse igual que antes: IMC con su clasificación, cintura, peso
   ideal y las 4 fórmulas de TMB.
8. **Limpieza:** `cleanup` con el mismo JSON. Los conteos de 11.1 vuelven a los de antes.

---

## 13. Restricciones para el implementer (obligatorias)

1. **Datos de desarrollo:**
   - ningún dato de negocio preexistente se borra ni cambia;
   - solo se escribe con:
     - la migración (aditiva);
     - `test-prescriptions.ts` (datos propios, borrados por id);
     - `test:isak`/`test:report` existentes;
     - `hu008-walkthrough.ts` (`create` y después `cleanup` con los mismos ids);
   - nada de `db:seed` ni `seed:demo`.
2. **Prisma:**
   - `pg_dump` antes, `--create-only` y revisar el SQL;
   - nada de `migrate reset` ni `db push`;
   - no aceptar el reset por drift;
   - **nunca** usar la base de desarrollo como shadow (`--shadow-database-url`) ni correr
     `migrate diff --from-migrations` contra ella;
   - si hay drift: `blocked` con la salida de `migrate status`.
3. **WhatsApp:**
   - ningún mensaje;
   - los scripts no importan `whatsapp.ts` ni Baileys y no crean turnos;
   - los jids de prueba terminan en `@test.invalid`.
4. **Tablas OMS:**
   - solo de who.int, con los scripts de 4.3 y los SHA-256 de 4.1;
   - sin red, o si el hash no coincide: `blocked`, **nunca** valores escritos a mano ni sacados
     de otra fuente;
   - los `.xlsx` no se commitean ni se copian al repo.
5. **Lógica:**
   - Z, percentil, clasificación, meses, Schofield y reglas de menores van en `packages/core`,
     con tests;
   - la web solo muestra lo que devuelve core;
   - el dominio solo arma `population`.
6. **React:**
   - nunca `await confirm()` dentro de `<form action>` ni de `startTransition` (esta HU no agrega
     ningún `confirm`);
   - ninguna `key` que cambie con los datos guardados.
7. **UI:**
   - solo el sistema de diseño actual;
   - `tailwind.config.ts` no se toca;
   - los textos son los de `PEDIATRIC_TEXT` y `REQUIREMENT_TEXT`, exactos.
8. **Adultos idénticos:**
   - diagnóstico, calculadora, ISAK, informe y huella del PDF (`isakReportSourceKey`) no cambian
     para ≥ 18 ni para pacientes sin fecha de nacimiento.
9. **No** correr `next build` ni levantar otro `next dev`.
10. **Rama** `hu-008-pediatria-oms`: sin commit y sin tocar `backlog.json`.

## 14. Fuera de alcance (no implementar)

- Patrones OMS 2006 para menores de 5 (solo se usa la fila del mes 60) y peso para la edad.
- Curvas de crecimiento, percentiles en el tiempo y tabla de Evolución con Z.
- Factores de actividad pediátricos, otras ecuaciones de TMB y composición corporal pediátrica.
- Cintura/talla y cintura en menores (D17).
- Guardar Z o diagnósticos.
- Cambios en el bot o el portal.
- Cualquier cambio en la tabla "Requerimiento indicado" del Resumen, más allá de mostrar el VCT
  como hoy.

## 15. Dudas técnicas

Ninguna bloqueante. Hay decisiones del architect que no cambian el negocio y el orquestador puede
revisar:
- el texto `"Sin referencia OMS para la edad de esta medición"`, para el borde de la D8 (5.1);
- el pie con "Edad a cada medición" cuando peso y talla tienen edades distintas (5.2);
- los textos de error `formulaNotForAge`, `adjustedWeightNotForMinors` y
  `vctOutOfRangePediatric` (5.6). Solo aparecen si alguien manipula el payload o si cambió la
  fecha de nacimiento entre guardar y editar;
- el resumen dice "Mantenimiento" sin "0 %", como en la HU-004.
