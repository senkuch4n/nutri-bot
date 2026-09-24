# SDD: HU-006 `antropometria-isak` (épicas 44 y 45)

HU validada: `docs/hu-antropometria-isak.md`. **Su sección "Resoluciones" manda:** se aceptan D1 a
D21 tal como las recomendó el afinador. Esta SDD las baja a código.

Skills aplicados: `migracion-prisma` (sección 3) y `ui` (sección 7).

Rama: `hu-006-antropometria-isak` (la actual). **No se commitea.** El orquestador hace el
recorrido (sección 12).

> **Material de validación (no versionado).** `docs/ISAKMetry_*.pdf` (caso A) y
> `docs/ISAKMetry_*.xlsx` (caso B) están en `.gitignore`: tienen datos de salud. **Ningún archivo
> versionado (código, tests, esta SDD, `progress/*`) puede llevar el nombre ni otro dato que
> identifique a la persona.** Los tests usan solo los números de la HU (casos A y B) y un caso
> sintético C. El script de validación local (sección 10.5) lee esos archivos si están y nunca
> imprime ni guarda el nombre.

> **Verificación del architect (2026-09-24).** Recalculé con un script aparte todas las fórmulas de
> la sección 4 con los casos A y B. **Todos los valores de la HU coinciden** al decimal que se
> muestra, salvo las diferencias ya documentadas (D5, D6, D7). Detalles que la HU no dejaba
> explícitos y que esta SDD fija:
> - El **Z del tejido adiposo** es el Z de Kerr del Σ6 **sin pasar por los kg redondeados** (caso
>   B: −0,944999… → −0,94; si se recalculara desde 17,96 kg daría −0,95).
> - Los **Z de los tejidos muscular, óseo y residual** se calculan con los **kg ya redondeados**
>   (así da el residual −5,57 en A y −3,20 en B, y el muscular 2,28 y 2,76).
> - Las **coordenadas de la somatocarta** salen de los componentes **sin redondear** (A: X =
>   −2,1157 → −2,12, Y = 5,4316 → 5,43; con los redondeados daría −2,11).
> - El **Z del brazo corregido** del caso B da **3,96**, que coincide con el Excel (la HU no lo
>   listaba).

---

## 1. Resumen funcional

El detalle de la consulta suma la tarjeta **"Antropometría ISAK"**, entre "Mediciones" y
"Diagnóstico antropométrico". Ahí la profesional carga el perfil restringido ISAK (24 campos: 4
básicas, 8 pliegues, 6 perímetros y 3 diámetros; 21 medidas más). El estudio se guarda como **una
fila de `EvolutionEntry` marcada `study = ISAK`**, con 11 columnas nuevas nullable (migración solo
aditiva), y hay **como máximo uno por consulta** (índice único). Se puede editar y borrar. Nada
calculado se guarda: `packages/core` calcula al vuelo la puntuación Z contra el Phantom, la
composición corporal (Durnin-Womersley + Siri; Kerr, Lee, Rocha y residual), la distribución
adiposo-muscular, los índices, la proporcionalidad y el somatotipo de Heath-Carter con su
somatocarta. Los índices de salud reusan `buildAnthropometricDiagnosis` de la HU-004. El estudio
completo se ve en `/pacientes/[id]/consultas/[consultationId]/antropometria`, comparado con el
estudio ISAK anterior del paciente si hay. A los menores de 18 se les ocultan la composición y los
índices adiposo muscular y músculo/óseo. La pestaña Evolución y el portal no cambian: leen el peso,
la talla, la cintura, etc. del estudio como cualquier medición. El bot no cambia.

---

## 2. Workspaces afectados

| Workspace | ¿Se toca? | Qué |
|---|---|---|
| `packages/core` | **Sí** | **Nuevos:** `isak.ts` (Phantom, fórmulas, clasificaciones), `isak-study.ts` (armado del estudio, resumen, comparación, textos), `isak-form.ts` (validación de la carga), cada uno con su `*.test.ts`. **Cambian:** `consultations.ts` (`ANTHROPOMETRY_MEASURE_KEYS` suma 11 claves), `consultations.test.ts` (helper `m()`), `patient-formula-data.ts` (`formatFixedEs`, `formatSignedFixedEs`), `index.ts` (exports). **Nuevo script** `scripts/validate-isakmetry.ts` (validación local) |
| `packages/db` | **Sí** | `schema.prisma` (enum `MeasurementStudy`, 11 columnas + `study` + `@@unique` en `EvolutionEntry`), 1 migración aditiva, **nuevo** `domain/isak.ts` (exportado en `domain/index.ts`), **nuevo** script `scripts/test-isak.ts` y su entrada `test:isak` en `package.json` |
| `apps/web` | **Sí** | Detalle de la consulta (tarjeta nueva, fila resumida en "Mediciones"), página nueva `.../antropometria`, server actions nuevas `isak-actions.ts`, `toEvolutionRow`/`EvolutionRow` (campos nuevos), etiquetas D2, `chart-theme.ts` (colores de tejidos con hex existentes), extracción de las filas del diagnóstico a un archivo compartido |
| `apps/bot` | **No** (solo tiene que compilar) | No usa `EvolutionEntry`. Consume `@nutri-bot/db` y `@nutri-bot/core`, que cambian: `npm run typecheck` tiene que pasar en el bot |

El portal (`(portal)`) **no se toca**: sus `findMany`/`findFirst` sobre `EvolutionEntry` no hacen
`select` explícito, así que las columnas nuevas solo se leen y se ignoran.
`tailwind.config.ts` **no se toca**: no hay tokens nuevos.

---

## 3. Esquema (Prisma) y migración: skill `migracion-prisma`

### 3.1 Cambios en `packages/db/prisma/schema.prisma`

Nuevo enum (al lado de `BiologicalSex`):

```prisma
/// Tipo de estudio de una medición (HU-006). null = medición común (la de siempre).
/// La épica 9 puede sumar valores (p. ej. BIOIMPEDANCE); agregar un valor es aditivo.
enum MeasurementStudy {
  ISAK
}
```

En `model EvolutionEntry`, **después** de `abdominalSkinfoldMm` y antes de `bodyFatPercent`, se
agregan (todas nullable, sin default):

```prisma
  // ── HU-006: perfil restringido ISAK (lado derecho, valor final: D3, D4) ──
  // armCm = brazo relajado, thighCm = muslo medio, calfCm = pierna (D2: solo cambian las etiquetas).
  sittingHeightCm        Decimal? @db.Decimal(5, 2) // talla sentado
  armSpanCm              Decimal? @db.Decimal(5, 2) // envergadura de brazos
  bicepsSkinfoldMm       Decimal? @db.Decimal(5, 2)
  iliacCrestSkinfoldMm   Decimal? @db.Decimal(5, 2) // cresta ilíaca
  supraspinaleSkinfoldMm Decimal? @db.Decimal(5, 2) // supraespinal
  thighSkinfoldMm        Decimal? @db.Decimal(5, 2) // muslo anterior
  calfSkinfoldMm         Decimal? @db.Decimal(5, 2) // pierna medial
  armFlexedCm            Decimal? @db.Decimal(5, 2) // brazo flexionado y contraído
  humerusBreadthCm       Decimal? @db.Decimal(5, 2) // húmero (biepicondilar)
  bistyloidBreadthCm     Decimal? @db.Decimal(5, 2) // biestiloideo (muñeca)
  femurBreadthCm         Decimal? @db.Decimal(5, 2) // fémur (bicondilar)
```

Y, después de `consultation`:

```prisma
  /// HU-006 (D1): ISAK = esta fila es el estudio antropométrico ISAK de la consulta.
  study          MeasurementStudy?
```

Y un índice más, junto a los existentes:

```prisma
  /// Un solo estudio ISAK por consulta (D1). En Postgres los NULL son distintos entre sí: las
  /// mediciones comunes (study NULL) y las filas sin consulta no chocan.
  @@unique([consultationId, study])
```

Por qué enum nullable y no booleano: el único con `(consultationId, study)` hace cumplir D1 en la
base sin índices parciales (que Prisma no modela y que en la próxima migración intentaría
borrar). Con un booleano `false` por defecto, todas las mediciones comunes de una consulta
chocarían entre sí.

`Consultation` **no cambia** (el comentario "estudios ISAK / bioimpedancia (HU-006)" ya lo
anticipa).

### 3.2 Migración

Nombre: **`isak_anthropometry`**. Pasos, desde la raíz salvo que se indique:

1. **Respaldo antes de tocar nada** (fuera del repo, en el scratchpad del implementer):
   `docker compose exec -T db pg_dump -U nutri -d nutribot -Fc > "$SCRATCHPAD/nutribot-pre-hu006.dump"`
   y comprobar que el archivo pesa más de 0 bytes.
2. `(cd packages/db && npx dotenv -e ../../.env -- prisma migrate status)`: tiene que decir
   "Database schema is up to date" con **13 migraciones** (la última `20260924090541_food_sara2`).
   Si hay drift o pendientes: **parar** y devolver `blocked` con la salida.
3. Editar `schema.prisma` (3.1).
4. `(cd packages/db && npx dotenv -e ../../.env -- prisma migrate dev --create-only --name isak_anthropometry)`.
   Si Prisma ofrece resetear la base: **responder que no** y devolver `blocked`.
5. Revisar el `migration.sql`. Tiene que ser **exactamente** de esta forma (el orden de las
   columnas puede variar):

   ```sql
   -- CreateEnum
   CREATE TYPE "MeasurementStudy" AS ENUM ('ISAK');

   -- AlterTable
   ALTER TABLE "EvolutionEntry" ADD COLUMN     "armFlexedCm" DECIMAL(5,2),
   ADD COLUMN     "armSpanCm" DECIMAL(5,2),
   ADD COLUMN     "bicepsSkinfoldMm" DECIMAL(5,2),
   ADD COLUMN     "bistyloidBreadthCm" DECIMAL(5,2),
   ADD COLUMN     "calfSkinfoldMm" DECIMAL(5,2),
   ADD COLUMN     "femurBreadthCm" DECIMAL(5,2),
   ADD COLUMN     "humerusBreadthCm" DECIMAL(5,2),
   ADD COLUMN     "iliacCrestSkinfoldMm" DECIMAL(5,2),
   ADD COLUMN     "sittingHeightCm" DECIMAL(5,2),
   ADD COLUMN     "study" "MeasurementStudy",
   ADD COLUMN     "supraspinaleSkinfoldMm" DECIMAL(5,2),
   ADD COLUMN     "thighSkinfoldMm" DECIMAL(5,2);

   -- CreateIndex
   CREATE UNIQUE INDEX "EvolutionEntry_consultationId_study_key" ON "EvolutionEntry"("consultationId", "study");
   ```

   Criterios: **ningún** `DROP`, `NOT NULL`, `ALTER COLUMN`, `RENAME` ni `ALTER TABLE` sobre otra
   tabla. Las 15 filas actuales de `EvolutionEntry` quedan con las columnas nuevas en NULL y
   `study` NULL: no hace falta default ni backfill (todo es nullable) y el índice único no puede
   fallar (todas tienen `study` NULL). Si el SQL difiere en algo más que el orden: parar.
6. Aplicar: `npm run db:migrate` (aplica la pendiente; si vuelve a ofrecer reset, **no**).
7. `npm run db:generate`.
8. `npm run typecheck`: tiene que pasar en `packages/core`, `packages/db`, `apps/web` **y**
   `apps/bot`.
9. Dejar escrito en `progress/impl_HU-006.md`: "**Cambió el schema: hay que reiniciar el `next
   dev` del usuario**" (lo hace el orquestador; el implementer no lo reinicia ni levanta otro).

**Prohibido:** `prisma migrate reset`, aceptar el reset por drift, `prisma db push`, editar una
migración ya aplicada.

---

## 4. Contrato compartido

Consumidor de todo lo nuevo: **solo `apps/web`**. El bot no lo usa, pero compila contra
`@nutri-bot/core` y `@nutri-bot/db`.

Convenciones que valen para toda la sección:
- Talla en cm salvo que diga "m"; pliegues en mm; perímetros y diámetros en cm.
- `k = 170.18 / talla(cm)` (escala al Phantom).
- Las funciones de fórmula devuelven el valor **exacto**. El redondeo se hace **una sola vez**,
  en `buildIsakStudy`, con `roundTo` de `anthropometry.ts`, y las clasificaciones usan el valor ya
  redondeado a lo que se muestra (convención de la HU-004).
- `Sex` es el de `patient-formula-data.ts` (`"FEMALE" | "MALE"`).

### 4.1 `packages/core/src/isak.ts` (nuevo): constantes y fórmulas puras

Encabezado del archivo con las referencias (en un comentario, como se listan en 4.1.x).

#### 4.1.1 Medidas

```ts
/** Las 21 medidas del perfil restringido ISAK, en el orden de ISAKMetry y del formulario.
 *  Coinciden 1:1 con columnas de EvolutionEntry. */
export const ISAK_MEASURE_KEYS = [
  "weightKg", "heightCm", "sittingHeightCm", "armSpanCm",
  "tricepsSkinfoldMm", "subscapularSkinfoldMm", "bicepsSkinfoldMm", "iliacCrestSkinfoldMm",
  "supraspinaleSkinfoldMm", "abdominalSkinfoldMm", "thighSkinfoldMm", "calfSkinfoldMm",
  "armCm", "armFlexedCm", "waistCm", "hipCm", "thighCm", "calfCm",
  "humerusBreadthCm", "bistyloidBreadthCm", "femurBreadthCm",
] as const;
export type IsakMeasureKey = (typeof ISAK_MEASURE_KEYS)[number];
export type IsakMeasures = Record<IsakMeasureKey, number | null>;

export type IsakMeasureGroupKey = "basic" | "skinfolds" | "girths" | "breadths";

export interface IsakMeasureDef {
  key: IsakMeasureKey;
  group: IsakMeasureGroupKey;
  /** Etiqueta de la tabla y del formulario. */
  label: string;
  unit: "kg" | "cm" | "mm";
  /** Lo que va en "Sin dato (falta …)". */
  missingLabel: string;
}

export const ISAK_MEASURE_GROUPS: ReadonlyArray<{ key: IsakMeasureGroupKey; title: string }> = [
  { key: "basic", title: "Medidas básicas" },
  { key: "skinfolds", title: "Pliegues (mm)" },
  { key: "girths", title: "Perímetros (cm)" },
  { key: "breadths", title: "Diámetros (cm)" },
];

export const ISAK_MEASURES: ReadonlyArray<IsakMeasureDef>; // en el orden de ISAK_MEASURE_KEYS
```

Contenido exacto de `ISAK_MEASURES` (clave → grupo, label, unidad, missingLabel):

| key | grupo | label | unidad | missingLabel |
|---|---|---|---|---|
| weightKg | basic | Masa corporal | kg | masa corporal |
| heightCm | basic | Talla | cm | talla |
| sittingHeightCm | basic | Talla sentado | cm | talla sentado |
| armSpanCm | basic | Envergadura de brazos | cm | envergadura |
| tricepsSkinfoldMm | skinfolds | Tríceps | mm | tríceps |
| subscapularSkinfoldMm | skinfolds | Subescapular | mm | subescapular |
| bicepsSkinfoldMm | skinfolds | Bíceps | mm | bíceps |
| iliacCrestSkinfoldMm | skinfolds | Cresta ilíaca | mm | cresta ilíaca |
| supraspinaleSkinfoldMm | skinfolds | Supraespinal | mm | supraespinal |
| abdominalSkinfoldMm | skinfolds | Abdominal | mm | abdominal |
| thighSkinfoldMm | skinfolds | Muslo | mm | pliegue muslo |
| calfSkinfoldMm | skinfolds | Pierna | mm | pliegue pierna |
| armCm | girths | Brazo relajado | cm | brazo relajado |
| armFlexedCm | girths | Brazo flexionado y contraído | cm | brazo flexionado |
| waistCm | girths | Cintura | cm | cintura |
| hipCm | girths | Caderas | cm | caderas |
| thighCm | girths | Muslo medio | cm | muslo medio |
| calfCm | girths | Pierna | cm | perímetro pierna |
| humerusBreadthCm | breadths | Húmero | cm | húmero |
| bistyloidBreadthCm | breadths | Biestiloideo | cm | biestiloideo |
| femurBreadthCm | breadths | Fémur | cm | fémur |

`/** "Sin dato (falta fémur)"; varios: "Sin dato (falta biestiloideo, fémur)" en el orden de ISAK_MEASURE_KEYS. */`
`export function missingMeasuresNote(keys: readonly IsakMeasureKey[]): string`

#### 4.1.2 Phantom y puntuación Z (Ross y Wilson 1974)

Fórmula: `Z = (v · k^d − p) / s`, con `d = 1` para longitudes, pliegues, perímetros y diámetros y
`d = 3` para masas.

Fuentes: Ross W.D., Wilson N.C. (1974), "A stratagem for proportional growth assessment", *Acta
Paediatrica Belgica* 28 (Suppl.): 169-182; tabla del Phantom en Ross W.D., Marfell-Jones M.J.
(1991), "Kinanthropometry", en MacDougall, Wenger y Green (eds.), *Physiological Testing of the
High-Performance Athlete*; valores de tejidos y perímetros corregidos del Phantom de Kerr (1988).

```ts
export const PHANTOM_HEIGHT_CM = 170.18;
export interface PhantomRef { p: number; s: number; d: 1 | 3 }

/** k = 170.18 / talla(cm). */
export function phantomScale(heightCm: number): number;

/** (v · k^d − p) / s, exacto. */
export function phantomZ(value: number, heightCm: number, ref: PhantomRef): number;

export type PhantomKey =
  | Exclude<IsakMeasureKey, "heightCm">
  | "correctedArmCm" | "correctedThighCm" | "correctedCalfCm"
  | "fatMassKg" | "adiposeTissueKg" | "muscleTissueKg" | "boneTissueKg" | "residualTissueKg";

export const PHANTOM: Readonly<Record<PhantomKey, PhantomRef>>;
```

Valores exactos de `PHANTOM` (cada línea con un comentario de fuente en el código):

| clave | p | s | d | Nota |
|---|---|---|---|---|
| weightKg | 64.58 | 8.60 | 3 | Publicado. **D7:** no reproduce exacto a ISAKMetry (A 0,42 vs 0,40; B 1,27 vs 1,26). Se deja el publicado y el test tolera ±0,02 |
| sittingHeightCm | 89.92 | 4.50 | 1 | |
| armSpanCm | 172.35 | 7.41 | 1 | |
| tricepsSkinfoldMm | 15.4 | 4.47 | 1 | |
| subscapularSkinfoldMm | 17.2 | 5.07 | 1 | |
| bicepsSkinfoldMm | 8.0 | 2.00 | 1 | |
| iliacCrestSkinfoldMm | 22.4 | 6.80 | 1 | |
| supraspinaleSkinfoldMm | 15.4 | 4.47 | 1 | |
| abdominalSkinfoldMm | 25.4 | 7.78 | 1 | |
| thighSkinfoldMm | 27.0 | 8.33 | 1 | |
| calfSkinfoldMm | 16.0 | 4.67 | 1 | |
| armCm | 26.89 | 2.33 | 1 | |
| armFlexedCm | 29.41 | **2.27** | 1 | **D7:** la tabla de Ross y Marfell-Jones trae 2,37; ISAKMetry usa 2,27 (reproduce A 1,67 y B 2,18; con 2,37 daría 1,60 y 2,08). Se usa 2,27 y se deja el 2,37 en el comentario |
| waistCm | 71.91 | 4.45 | 1 | |
| hipCm | 94.67 | 5.58 | 1 | |
| thighCm | 53.20 | 4.56 | 1 | muslo medio |
| calfCm | 35.25 | 2.30 | 1 | |
| humerusBreadthCm | 6.48 | 0.35 | 1 | |
| bistyloidBreadthCm | 5.21 | 0.28 | 1 | |
| femurBreadthCm | 9.52 | 0.48 | 1 | |
| correctedArmCm | 22.05 | 1.91 | 1 | |
| correctedThighCm | 47.34 | 3.59 | 1 | **D5:** ISAKMetry muestra el Z del muslo medio sin corregir; acá se calcula bien (A 0,84, B 1,70) |
| correctedCalfCm | 30.22 | 1.97 | 1 | |
| fatMassKg | 12.13 | 3.25 | 3 | Ross y Wilson |
| adiposeTissueKg | 25.60 | 5.85 | 3 | Kerr 1988 |
| muscleTissueKg | 25.55 | 2.99 | 3 | Kerr 1988 |
| boneTissueKg | 10.49 | 1.57 | 3 | Kerr 1988 |
| residualTissueKg | 16.41 | 1.90 | 3 | Kerr 1988 |

Revisión contra la tabla original (lo que pedía D7/D5): los 26 valores coinciden con la tabla del
Phantom de Ross y Marfell-Jones (1991) y con el Phantom de tejidos de Kerr (1988), **salvo** el
*s* del brazo flexionado (2,37 en la tabla), que se reemplaza por 2,27 porque es lo que reproduce
ISAKMetry en los dos casos (D7). Masa y muslo corregido quedan con el valor publicado.

#### 4.1.3 Durnin-Womersley (1974) + Siri (1961)

- `D = c − m · log10(bíceps + tríceps + subescapular + cresta ilíaca)`.
- `%MG = 495 / D − 450` (Siri, 1961).
- `MG kg = masa · %MG / 100`; `MLG kg = masa − MG kg`.

Referencia: Durnin J.V.G.A., Womersley J. (1974), "Body fat assessed from total body density and
its estimation from skinfold thickness: measurements on 481 men and women aged from 16 to 72
years", *British Journal of Nutrition* 32: 77-97, tabla de ecuaciones con el log de la suma de
los 4 pliegues. Siri W.E. (1961), en Brozek y Henschel (eds.), *Techniques for Measuring Body
Composition*.

```ts
export interface DurninWomersleyCoefficients { c: number; m: number; ageRange: string }

/** Tramo por sexo y edad (años cumplidos). null si no hay ecuación: hombres < 17, mujeres < 16. */
export function durninWomersleyCoefficients(sex: Sex, ageYears: number): DurninWomersleyCoefficients | null;

/** Densidad corporal (g/ml), exacta. */
export function durninWomersleyDensity(p: { sex: Sex; ageYears: number; sum4SkinfoldsMm: number }): number | null;

/** 495 / D − 450, exacto. */
export function siriBodyFatPercent(density: number): number;
```

Tabla exacta (`DW_TABLE`), con **D21 resuelta**:

| Tramo | Hombres c / m | Mujeres c / m |
|---|---|---|
| 17–19 (H) / 16–19 (M) | 1.1620 / 0.0630 | 1.1549 / 0.0678 |
| 20–29 | 1.1631 / 0.0632 | 1.1599 / 0.0717 |
| 30–39 | 1.1422 / 0.0544 | 1.1423 / 0.0632 |
| 40–49 | 1.1620 / 0.0700 | 1.1333 / 0.0612 |
| 50 o más | 1.1715 / 0.0779 | 1.1339 / 0.0645 |

**D21:** los 20 coeficientes coinciden con la tabla publicada por Durnin y Womersley (1974) para
el log de la suma de 4 pliegues, tal como la reproduce la bibliografía de referencia. El tramo
hombres 20–29 además reproduce ISAKMetry en A y B. Los tramos 16–17 casi no se usan: a los menores
de 18 no se les muestra la composición (D13), así que en la práctica el primer tramo aplica a 18
y 19 años. La ecuación general (17–72 años) no se usa. Hay un test por tramo (10.1).

#### 4.1.4 Tejido adiposo: Kerr (1988), en Ross y Kerr (1991)

- `Σ6 = tríceps + subescapular + supraespinal + abdominal + muslo + pierna` (pliegues).
- `Z_adiposo = (Σ6 · k − 116.41) / 34.79`.
- `Tejido adiposo (kg) = (Z_adiposo · 5.85 + 25.6) / k³`.

Referencia: Kerr D.A. (1988), tesis de maestría, Simon Fraser University; Ross W.D., Kerr D.A.
(1991), "Fraccionamiento de la masa corporal…", *Apunts* 28. Solo el componente adiposo (no el
modelo de cinco componentes).

```ts
export function sum6SkinfoldsMm(m: Sum6Input): number;   // Sum6Input = Pick<Record<…, number>, las 6 claves>
export function sum8SkinfoldsMm(m: Sum8Input): number;   // Σ6 + bíceps + cresta ilíaca
export function kerrAdiposeZ(sum6Mm: number, heightCm: number): number;
export function kerrAdiposeTissueKg(sum6Mm: number, heightCm: number): number;
```

#### 4.1.5 Perímetros corregidos y tejido muscular: Lee et al. (2000)

- Perímetro corregido (cm) = perímetro(cm) − π · pliegue(mm) / 10:
  - brazo (PBC) = `armCm − π · tricepsSkinfoldMm / 10`;
  - muslo (PMC) = `thighCm − π · thighSkinfoldMm / 10`;
  - pierna (PPC) = `calfCm − π · calfSkinfoldMm / 10`.
- `MM (kg) = talla(m) · (0.00744 · PBC² + 0.00088 · PMC² + 0.00441 · PPC²) + 2.4 · sexo − 0.048 · edad + etnia + 7.8`,
  con `sexo = 1` hombres / `0` mujeres, edad en años a la fecha de la consulta, **etnia = 0 fijo
  (D14)**.

Referencia: Lee R.C., Wang Z., Heo M., Ross R., Janssen I., Heymsfield S.B. (2000), *American
Journal of Clinical Nutrition* 72: 796-803.

```ts
/** perímetro(cm) − π · pliegue(mm) / 10, exacto. */
export function correctedGirthCm(girthCm: number, skinfoldMm: number): number;

export const LEE_ETHNICITY_TERM = 0; // D14: 0 blancos/hispanos; −2,0 asiáticos; +1,1 afroamericanos. Patient no tiene el dato.

export function leeMuscleMassKg(p: {
  heightCm: number; sex: Sex; ageYears: number;
  correctedArmCm: number; correctedThighCm: number; correctedCalfCm: number;
}): number;
```

#### 4.1.6 Tejido óseo: Rocha (1975), Von Döbeln modificada

- `MO (kg) = 3.02 · (talla(m)² · biestiloideo(m) · fémur(m) · 400)^0.712`.

Referencia: Rocha M.S.L. (1975), *Arquivos de Anatomia e Antropologia* 1: 445-451 (ISAKMetry la
cita como "Rocha, 1974"; en la UI se muestra "Rocha, 1974" como en ISAKMetry).

```ts
export function rochaBoneMassKg(p: { heightCm: number; bistyloidBreadthCm: number; femurBreadthCm: number }): number;
```

#### 4.1.7 Distribución y distribución grasa

```ts
/** (tríceps + subescapular) / Σ6, (supraespinal + abdominal) / Σ6, (muslo + pierna) / Σ6. Fracciones 0..1, exactas. */
export function adiposeDistribution(m: Sum6Input): { upper: number; central: number; lower: number };

/** PBC / (PBC+PMC+PPC), PMC / …, PPC / …. Fracciones exactas. */
export function muscleDistribution(c: { arm: number; thigh: number; calf: number }): { arm: number; thigh: number; calf: number };

/** D11 (deducida, aislada para cambiarla fácil): (tríceps + muslo + pierna) / (subescapular + supraespinal + abdominal). */
export function fatDistributionIndex(m: Sum6Input): number;
```

#### 4.1.8 Índices de composición

```ts
/** adiposo / muscular, con los kg ya redondeados a 2 (lo hace el que llama). D8: sin categoría. */
export function adiposeMuscleIndex(adiposeKg: number, muscleKg: number): number;
/** muscular / óseo, con los kg redondeados a 2. */
export function muscleBoneIndex(muscleKg: number, boneKg: number): number;

export type MuscleBoneClass = "VERY_LOW" | "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH";
export const MUSCLE_BONE_CLASS_LABELS: Record<MuscleBoneClass, string> = {
  VERY_LOW: "Muy bajo", LOW: "Bajo", MEDIUM: "Medio", HIGH: "Alto", VERY_HIGH: "Muy alto",
};
/** Tabla para mostrar (desplegable): "< 2,34", "2,34 a < 2,44", "2,44 a < 3,11", "3,11 a 3,29", "> 3,29". */
export const MUSCLE_BONE_TABLE: ReadonlyArray<{ key: MuscleBoneClass; range: string }>;
/** D9. Con roundTo(v, 2): < 2.34 VERY_LOW; < 2.44 LOW; < 3.11 MEDIUM; <= 3.29 HIGH; resto VERY_HIGH. Misma tabla para los dos sexos. */
export function classifyMuscleBoneIndex(value: number): MuscleBoneClass;
```

#### 4.1.9 Proporcionalidad

```ts
export function cormicIndex(sittingHeightCm: number, heightCm: number): number;       // talla sentado / talla
export function manouvrierIndex(sittingHeightCm: number, heightCm: number): number;   // (talla − sentado) / sentado · 100
export function relativeArmSpan(armSpanCm: number, heightCm: number): number;         // envergadura / talla

export type CormicClass = "BRACHYCORMIC" | "METRICORMIC" | "MACROCORMIC";
export const CORMIC_CLASS_LABELS = {
  BRACHYCORMIC: "Braquicórmico (tronco corto)",
  METRICORMIC: "Metricórmico (tronco medio)",
  MACROCORMIC: "Macrocórmico (tronco largo)",
} as const;
/** D10. v = roundTo(x, 2): <= 0.50 BRACHY; <= 0.52 METRI; resto MACRO. Misma tabla para los dos sexos. */
export function classifyCormicIndex(value: number): CormicClass;

export type ManouvrierClass = "BRACHYSKELIC" | "MESATISKELIC" | "MACROSKELIC";
export const MANOUVRIER_CLASS_LABELS = {
  BRACHYSKELIC: "Miembros inferiores cortos",
  MESATISKELIC: "Miembros inferiores medios",
  MACROSKELIC: "Miembros inferiores largos",
} as const;
/** v = roundTo(x, 0) (se muestra entero): < 85 BRACHY; < 90 MESATI; resto MACRO. */
export function classifyManouvrierIndex(value: number): ManouvrierClass;

export type RelativeSpanClass = "GREATER" | "EQUAL" | "LESS";
export const RELATIVE_SPAN_CLASS_LABELS = {
  GREATER: "Envergadura mayor a la talla",
  EQUAL: "Envergadura igual a la talla",
  LESS: "Envergadura menor a la talla",
} as const;
/** v = roundTo(x, 2): > 1 GREATER; === 1 EQUAL; < 1 LESS. */
export function classifyRelativeArmSpan(value: number): RelativeSpanClass;
```

#### 4.1.10 Somatotipo de Heath-Carter

Referencia: Carter J.E.L. (2002), *The Heath-Carter Anthropometric Somatotype - Instruction
Manual*; categorías de Carter J.E.L., Heath B.H. (1990), *Somatotyping: Development and
Applications*, Cambridge University Press.

- **Endomorfia:** `X = (tríceps + subescapular + supraespinal) · k`;
  `endo = −0.7182 + 0.1451·X − 0.00068·X² + 0.0000014·X³`.
- **Mesomorfia:**
  `meso = 0.858·húmero + 0.601·fémur + 0.188·(brazo flexionado − tríceps/10) + 0.161·(perímetro pierna − pliegue pierna/10) − 0.131·talla + 4.5`
  (todo en cm; los pliegues en mm divididos por 10).
- **Ectomorfia:** `HWR = talla / masa^(1/3)`; si `HWR >= 40.75` → `0.732·HWR − 28.58`; si
  `38.25 < HWR < 40.75` → `0.463·HWR − 17.63`; si `HWR <= 38.25` → `0.1`.
- **Piso 0,1:** si cualquier componente da ≤ 0, se usa 0,1. Para la ectomorfia es la regla del
  manual; para la endomorfia y la mesomorfia es una decisión de diseño (la escala no tiene
  valores ≤ 0 y solo pasa con medidas absurdas). Queda comentado en el código.
- **Somatocarta:** `X = ecto − endo`, `Y = 2·meso − (endo + ecto)`, con los componentes **sin
  redondear**.

```ts
export function endomorphy(p: { tricepsSkinfoldMm: number; subscapularSkinfoldMm: number; supraspinaleSkinfoldMm: number; heightCm: number }): number;
export function mesomorphy(p: { humerusBreadthCm: number; femurBreadthCm: number; armFlexedCm: number; tricepsSkinfoldMm: number; calfCm: number; calfSkinfoldMm: number; heightCm: number }): number;
export function heightWeightRatio(heightCm: number, weightKg: number): number;
export function ectomorphy(heightCm: number, weightKg: number): number;
export function somatochartPoint(s: { endo: number; meso: number; ecto: number }): { x: number; y: number };

export type SomatotypeCategory =
  | "BALANCED_ENDOMORPH" | "MESOMORPHIC_ENDOMORPH" | "ENDOMORPH_MESOMORPH" | "ENDOMORPHIC_MESOMORPH"
  | "BALANCED_MESOMORPH" | "ECTOMORPHIC_MESOMORPH" | "MESOMORPH_ECTOMORPH" | "MESOMORPHIC_ECTOMORPH"
  | "BALANCED_ECTOMORPH" | "ENDOMORPHIC_ECTOMORPH" | "ENDOMORPH_ECTOMORPH" | "ECTOMORPHIC_ENDOMORPH"
  | "CENTRAL";
export const SOMATOTYPE_CATEGORY_LABELS: Record<SomatotypeCategory, string>;
/** Con los componentes ya redondeados a 2 (lo que se muestra). */
export function classifySomatotype(s: { endo: number; meso: number; ecto: number }): SomatotypeCategory;
```

Etiquetas exactas (convención en castellano: "X-Y" = Y dominante con X segundo; "Xmorfo-Ymorfo" =
dos componentes iguales):

| Clave | Etiqueta | Regla |
|---|---|---|
| BALANCED_ENDOMORPH | Endomorfo balanceado | endo dominante; meso ≈ ecto |
| MESOMORPHIC_ENDOMORPH | Meso-endomorfo | endo dominante; meso > ecto |
| ENDOMORPH_MESOMORPH | Endomorfo-mesomorfo | endo ≈ meso; ecto menor |
| ENDOMORPHIC_MESOMORPH | **Endo-mesomorfo** | meso dominante; endo > ecto (casos A y B) |
| BALANCED_MESOMORPH | Mesomorfo balanceado | meso dominante; endo ≈ ecto |
| ECTOMORPHIC_MESOMORPH | Ecto-mesomorfo | meso dominante; ecto > endo |
| MESOMORPH_ECTOMORPH | Mesomorfo-ectomorfo | meso ≈ ecto; endo menor |
| MESOMORPHIC_ECTOMORPH | Meso-ectomorfo | ecto dominante; meso > endo |
| BALANCED_ECTOMORPH | Ectomorfo balanceado | ecto dominante; endo ≈ meso |
| ENDOMORPHIC_ECTOMORPH | Endo-ectomorfo | ecto dominante; endo > meso |
| ENDOMORPH_ECTOMORPH | Endomorfo-ectomorfo | endo ≈ ecto; meso menor |
| ECTOMORPHIC_ENDOMORPH | Ecto-endomorfo | endo dominante; ecto > meso |
| CENTRAL | Central | ningún componente difiere en más de 1 de los otros dos |

Algoritmo exacto (`EPS = 1e-9`, `eq(a, b) = |a − b| <= 0.5 + EPS`):
1. Si `max − min <= 1 + EPS` → `CENTRAL`.
2. Ordenar los tres de mayor a menor (en empate exacto, orden endo, meso, ecto): `first`,
   `second`, `third`.
3. Si `eq(first, second)` → la categoría de "dos iguales" del par {first, second}.
4. Si no, si `eq(second, third)` → "balanceado" de `first`.
5. Si no → `second`-`first` (p. ej. first meso, second endo → `ENDOMORPHIC_MESOMORPH`).

(Si 1 no se cumple, 3 y 4 no pueden cumplirse a la vez: con los dos pares ≤ 0,5 el rango sería
≤ 1.)

Constantes de la somatocarta para la UI:

```ts
export const SOMATOCHART_VERTICES = {
  endomorph: { x: -6, y: -6 },   // 7-1-1
  mesomorph: { x: 0, y: 12 },    // 1-7-1
  ectomorph: { x: 6, y: -6 },    // 1-1-7
} as const;
export const SOMATOCHART_DOMAIN = { x: [-8, 8], y: [-10, 16] } as const;
```

### 4.2 `packages/core/src/isak-study.ts` (nuevo): el estudio armado

#### 4.2.1 Tipos

```ts
/** Valor de un cálculo del estudio. `value` ya redondeado a lo que se muestra. */
export type IsakValue =
  | { status: "ok"; value: number }
  | { status: "missing"; note: string }
  | { status: "not_for_minors" };

/** Igual, con clasificación. */
export type IsakClassified<K extends string> =
  | { status: "ok"; value: number; classKey: K; classLabel: string }
  | { status: "missing"; note: string }
  | { status: "not_for_minors" };

export interface IsakStudyInput {
  measures: IsakMeasures;
  sex: Sex | null;
  /** A la fecha de la consulta; null = sin fecha de nacimiento. */
  ageYears: number | null;
}

export interface IsakMeasureRow {
  key: IsakMeasureKey;
  group: IsakMeasureGroupKey;
  label: string;
  unit: "kg" | "cm" | "mm";
  /** El medido, tal cual (se muestra con 1 decimal). */
  value: number | null;
  /** null solo en heightCm (la talla no tiene Z). Missing → note "Sin dato". */
  z: IsakValue | null;
}

export interface IsakTissue { kg: IsakValue; percent: IsakValue; z: IsakValue }

export interface IsakStudyResult {
  minor: boolean;
  /** Para el aviso de la HU-001 (solo sexo y fecha de nacimiento). */
  missingSex: boolean;
  missingBirthDate: boolean;
  measures: IsakMeasureRow[];                       // 21 filas, orden de ISAK_MEASURE_KEYS
  molecular: { fatMass: IsakTissue; fatFreeMass: { kg: IsakValue; percent: IsakValue } };
  tissues: {
    adipose: IsakTissue; muscle: IsakTissue; bone: IsakTissue;
    residual: IsakTissue & { negative: boolean };
  };
  distribution: {
    adipose: { upper: IsakValue; central: IsakValue; lower: IsakValue };   // en %, 2 decimales
    muscle: { arm: IsakValue; thigh: IsakValue; calf: IsakValue };         // en %, 2 decimales
  };
  compositionIndices: {
    adiposeMuscle: IsakValue;                        // D8: sin categoría
    muscleBone: IsakClassified<MuscleBoneClass>;
  };
  adiposity: { sum6: IsakValue; sum8: IsakValue };   // 1 decimal
  muscularity: {
    correctedArm: { value: IsakValue; z: IsakValue };
    correctedThigh: { value: IsakValue; z: IsakValue };
    correctedCalf: { value: IsakValue; z: IsakValue };
    armDifference: IsakValue;                        // flexionado − relajado, 1 decimal
  };
  proportionality: {
    cormic: IsakClassified<CormicClass>;             // 2 decimales
    manouvrier: IsakClassified<ManouvrierClass>;     // entero
    relativeSpan: IsakClassified<RelativeSpanClass>; // 2 decimales
  };
  somatotype: {
    endo: IsakValue; meso: IsakValue; ecto: IsakValue;   // 2 decimales
    category: { status: "ok"; key: SomatotypeCategory; label: string } | { status: "missing"; note: string };
    chart: { status: "ok"; x: number; y: number } | { status: "missing"; note: string }; // x, y a 2 decimales
  };
  health: {
    /** buildAnthropometricDiagnosis con las medidas del estudio (bodyFrame null). La UI usa
     *  solo bmi, waistHipRatio, waistToHeight y conicity. */
    diagnosis: AnthropometricDiagnosis;
    fatDistributionIndex: IsakValue;                 // 2 decimales, sin rango (D11)
  };
}
```

#### 4.2.2 `buildIsakStudy`

```ts
export function buildIsakStudy(input: IsakStudyInput): IsakStudyResult;
```

Reglas (orden de chequeo para cada valor: **menor → medidas faltantes → sexo → fecha de
nacimiento**). `minor = isMinor(ageYears)` (de `patient-formula-data.ts`). `talla` y `masa`
vienen siempre (las exige la validación), pero si llegaran null, todo lo que las usa da
`missing` con su nota.

| Valor | Necesita | Cálculo y redondeo | Sujeto a menor |
|---|---|---|---|
| `measures[i].z` | la medida y talla | `roundTo(phantomZ(v, talla, PHANTOM[key]), 2)`; falta → `{missing, note: "Sin dato"}` | No |
| `molecular.fatMass` | bíceps, tríceps, subescapular, cresta ilíaca, masa; sexo; edad | `D` por DW; `pf = siri(D)`; `kg = roundTo(masa·pf/100, 2)`; `percent = roundTo(pf, 2)`; `z = roundTo(phantomZ(masa·pf/100, talla, PHANTOM.fatMassKg), 2)` (kg sin redondear). Sin tramo DW para la edad → `missing` "Falta fecha de nacimiento" no aplica: si `ageYears` no es null y no hay tramo (menor de 16/17), ya salió por menor | **Sí** |
| `molecular.fatFreeMass` | lo mismo | `kg = roundTo(masa − fatMass.kg, 2)`; `percent = roundTo(100 − pf, 2)` | **Sí** |
| `tissues.adipose` | Σ6 (6 pliegues), talla, masa | `kgR = roundTo(kerrAdiposeTissueKg(Σ6, talla), 2)`; `percent = roundTo(kgR/masa·100, 2)`; **`z = roundTo(kerrAdiposeZ(Σ6, talla), 2)`** (D6) | **Sí** |
| `tissues.muscle` | tríceps, pliegue muslo, pliegue pierna, brazo relajado, muslo medio, perímetro pierna; sexo; edad | `kgR = roundTo(leeMuscleMassKg(…), 2)`; `percent = roundTo(kgR/masa·100, 2)`; `z = roundTo(phantomZ(kgR, talla, PHANTOM.muscleTissueKg), 2)` | **Sí** |
| `tissues.bone` | biestiloideo, fémur, talla | `kgR = roundTo(rochaBoneMassKg(…), 2)`; % igual; `z` con `PHANTOM.boneTissueKg` sobre `kgR` | **Sí** |
| `tissues.residual` | los 3 tejidos ok | `kg = roundTo(masa − (adiposo + muscular + óseo), 2)` con los kgR; `percent = roundTo(kg/masa·100, 2)`; `z` con `PHANTOM.residualTissueKg` sobre `kg`; `negative = kg < 0`. Falta algún tejido → `missing` `"Sin dato (falta tejido muscular)"` (varios: `"Sin dato (falta tejido adiposo, tejido muscular)"`, orden adiposo, muscular, óseo) | **Sí** |
| `distribution.adipose.*` | los 6 pliegues del Σ6 | `roundTo(fracción·100, 2)` | No |
| `distribution.muscle.*` | los 3 perímetros corregidos | `roundTo(fracción·100, 2)` | No |
| `compositionIndices.adiposeMuscle` | adiposo y muscular ok | `roundTo(adiposo.kgR / muscular.kgR, 2)`; falta → `"Sin dato (falta tejido muscular)"` (o adiposo) | **Sí** |
| `compositionIndices.muscleBone` | muscular y óseo ok | `v = roundTo(muscular.kgR / óseo.kgR, 2)`; clasifica `v` | **Sí** |
| `adiposity.sum6` / `sum8` | los 6 / los 8 pliegues | `roundTo(Σ, 1)` | No |
| `muscularity.corrected*` | perímetro + pliegue | `value = roundTo(corregido, 2)`; `z = roundTo(phantomZ(corregido, talla, PHANTOM.corrected*), 2)` (corregido sin redondear) | No |
| `muscularity.armDifference` | brazo flexionado y relajado | `roundTo(flexionado − relajado, 1)` | No |
| `proportionality.cormic` | talla sentado | `v = roundTo(cormicIndex, 2)`; clasifica `v` | No |
| `proportionality.manouvrier` | talla sentado | `v = roundTo(manouvrierIndex, 0)`; clasifica `v` | No |
| `proportionality.relativeSpan` | envergadura | `v = roundTo(relativeArmSpan, 2)`; clasifica `v` | No |
| `somatotype.endo/meso/ecto` | endo: tríceps, subescapular, supraespinal; meso: húmero, fémur, brazo flexionado, tríceps, perímetro pierna, pliegue pierna; ecto: masa y talla | `roundTo(componente con piso 0,1, 2)` | No |
| `somatotype.category` | los 3 ok | `classifySomatotype` con los redondeados; falta → `"Sin dato (falta endomorfia)"` (o mesomorfia; varios separados por coma) | No |
| `somatotype.chart` | los 3 ok | `somatochartPoint` con los **sin redondear**, después `roundTo(…, 2)` | No |
| `health.diagnosis` | — | `buildAnthropometricDiagnosis({ sex, ageYears, bodyFrame: null, weightKg, heightCm, waistCm, hipCm })` (**reuso de la HU-004**: IMC, ICC, cintura/talla y conicidad salen de ahí, con sus etiquetas y umbrales; en menores ya devuelve solo el IMC sin clasificar) | lo resuelve la HU-004 |
| `health.fatDistributionIndex` | los 6 pliegues del Σ6 | `roundTo(fatDistributionIndex, 2)` | No |

Textos de faltantes: los de `missingMeasuresNote` (4.1.1), `"Falta sexo"` y `"Falta fecha de
nacimiento"` (reusar `DIAGNOSIS_TEXT.missingSex` y `DIAGNOSIS_TEXT.missingBirthDate` de
`anthropometric-diagnosis.ts`, no duplicar los strings).

#### 4.2.3 Textos, formato, resumen y comparación

```ts
export const ISAK_TEXT = {
  cardTitle: "Antropometría ISAK",
  empty: "Todavía no hay un estudio antropométrico ISAK en esta consulta.",
  load: "Cargar antropometría ISAK",
  save: "Guardar estudio",
  saving: "Guardando…",
  saved: "Estudio ISAK guardado",
  deleted: "Estudio ISAK borrado",
  saveError: "No se pudo guardar el estudio. Probá de nuevo.",
  deleteError: "No se pudo borrar el estudio. Probá de nuevo.",
  alreadyExists: "Esta consulta ya tiene un estudio ISAK.",
  discardTitle: "¿Descartar los cambios del estudio?",
  discardDescription: "Se pierden las medidas que cargaste.",
  deleteTitle: "¿Borrar el estudio ISAK de esta consulta?",
  deleteDescription: "No se puede deshacer.",
  deleteLabel: "Borrar estudio",
  viewFull: "Ver estudio completo",
  measurementRow: "Antropometría ISAK",
  measurementRowLink: "ver estudio",
  minorWarning: "Las fórmulas de composición corporal son para adultos.",
  zFootnote: "Z: puntuación contra el Phantom (Ross y Wilson). 0 = proporcional al Phantom",
  adiposeMuscleHint:
    "Cuántos kg de tejido adiposo transporta cada kg de tejido muscular. Cuanto menor, más eficiente el desplazamiento.",
  fatDistributionHint: "Un menor valor implica mayor acumulación de grasa en el tronco.",
  negativeResidual: "El residual dio negativo: revisá las medidas cargadas",
  methods:
    "Métodos: Durnin-Womersley (1974), Kerr (1991), Lee (2000), Rocha (1974), Phantom (Ross y Wilson, 1974), Heath-Carter.",
  comparedWith: (dateLabel: string, days: number) =>
    `Comparado con el estudio del ${dateLabel} (${days} ${days === 1 ? "día" : "días"} antes)`,
  sumsLive: (sum6: number | null, sum8: number | null) => string, // "Σ 6 pliegues: 71,0 mm · Σ 8 pliegues: 94,0 mm"; si falta: "Σ 6 pliegues: — · Σ 8 pliegues: —"
} as const;

/** Nombres de las fórmulas en la tabla de composición. */
export const ISAK_METHOD_LABELS = {
  fatMass: "Masa grasa (Durnin-Womersley, 1974)",
  fatFreeMass: "Masa libre de grasa",
  adipose: "Tejido adiposo (Kerr, 1991)",
  muscle: "Tejido muscular (Lee, 2000)",
  bone: "Tejido óseo (Rocha, 1974)",
  residual: "Tejido residual (por diferencia)",
} as const;

/** Resumen de la tarjeta de la consulta. Cada línea es null si no tiene nada para mostrar. */
export function buildIsakSummary(
  current: IsakStudyResult,
  previous: { result: IsakStudyResult; dateLabel: string } | null,
): {
  /** "Adiposo 27,02 % · Muscular 47,49 % · Óseo 16,95 % · Residual 8,54 %". Solo las partes ok; null si ninguna (o menor). */
  tissuesLine: string | null;
  /** "Somatotipo 4,03 – 5,69 – 1,92 (Endo-mesomorfo) · IMO 2,80". Sin somatotipo completo se omite
   *  esa parte; sin IMO ok (o menor) se omite " · IMO …". null si no queda nada. */
  somatotypeLine: string | null;
  /** Para el Badge al lado de la línea 2. null si el IMO no está ok. */
  muscleBone: { key: MuscleBoneClass; label: string } | null;
  /** "Σ 6 pliegues 71,0 mm", más " (−9,5 respecto del 05/11/2025)" si el anterior tiene Σ6. null si falta Σ6. */
  sum6Line: string | null;
};

/** current − previous redondeado a `decimals`; null si alguno no está ok. */
export function isakDifference(current: IsakValue, previous: IsakValue | null | undefined, decimals: number): number | null;

/** Días de calendario entre dos "yyyy-MM-dd" (later − earlier). */
export function daysBetweenDayKeys(earlierDayKey: string, laterDayKey: string): number;
```

El separador entre componentes del somatotipo es " – " (U+2013 con espacios). Los números de las
líneas usan `formatFixedEs` (4.4) con los decimales de la tabla de redondeo de la HU.

### 4.3 `packages/core/src/isak-form.ts` (nuevo): validación de la carga (D20)

```ts
export const ISAK_RANGES: Record<IsakMeasureKey, { min: number; max: number }>;
// weightKg 10–300; heightCm 50–230; sittingHeightCm 30–130; armSpanCm 50–250;
// pliegues 1–80; perímetros 10–200; diámetros 2–20.

export const ISAK_FORM_TEXT = {
  requiredWeight: "La masa corporal es obligatoria para el estudio ISAK",
  requiredHeight: "La talla es obligatoria para el estudio ISAK",
  invalidNumber: "Revisá el valor: usá un número con hasta 1 decimal",
  sittingAboveHeight: "La talla sentado no puede ser mayor que la talla",
  range: {
    weightKg: "Revisá el valor: la masa corporal va de 10 a 300 kg",
    heightCm: "Revisá el valor: la talla va de 50 a 230 cm",
    sittingHeightCm: "Revisá el valor: la talla sentado va de 30 a 130 cm",
    armSpanCm: "Revisá el valor: la envergadura va de 50 a 250 cm",
    skinfolds: "Revisá el valor: los pliegues van de 1 a 80 mm",
    girths: "Revisá el valor: los perímetros van de 10 a 200 cm",
    breadths: "Revisá el valor: los diámetros van de 2 a 20 cm",
  },
} as const;

/** "" / espacios / undefined → null. Acepta coma o punto y hasta 1 decimal ("11", "11,5", "11.5").
 *  Cualquier otra cosa (letras, 2 decimales, negativos, miles) → undefined (inválido). */
export function parseIsakNumber(raw: string | null | undefined): number | null | undefined;

export type IsakFieldErrors = Partial<Record<IsakMeasureKey, string>>;

/** Valida los 21 campos crudos (FormData). Un error por campo, en este orden de prioridad:
 *  formato → obligatorio (masa, talla) → rango → talla sentado > talla (solo si las dos son válidas;
 *  el error va en sittingHeightCm). ok → las 21 medidas como números o null (masa y talla no null). */
export function validateIsakForm(
  raw: Partial<Record<IsakMeasureKey, string | null | undefined>>,
): { ok: true; measures: IsakMeasures & { weightKg: number; heightCm: number } } | { ok: false; errors: IsakFieldErrors };
```

Los rangos son inclusivos en los dos extremos. La talla sentado **igual** a la talla es válida.

### 4.4 `packages/core/src/patient-formula-data.ts` (cambio aditivo)

```ts
/** Decimales fijos es-AR: (71, 1) → "71,0"; (2.8, 2) → "2,80"; (-0.04, 2) → "-0,04". */
export function formatFixedEs(value: number, decimals: number): string;
/** Con signo U+2212 / "+": (−9.5, 1) → "−9,5"; (1.2, 1) → "+1,2"; (0, 1) → "0,0". */
export function formatSignedFixedEs(value: number, decimals: number): string;
```

`formatFixedEs` usa `Intl.NumberFormat("es-AR", { minimumFractionDigits: d, maximumFractionDigits:
d })`. Para negativos, `formatFixedEs` deja el "-" de Intl (así se ve en las tablas de Z); la
diferencia firmada usa el U+2212 de `signPrefix`, que ya existe en el archivo.

### 4.5 `packages/core/src/consultations.ts` (cambia)

`ANTHROPOMETRY_MEASURE_KEYS` suma, al final y en este orden: `"sittingHeightCm"`, `"armSpanCm"`,
`"bicepsSkinfoldMm"`, `"iliacCrestSkinfoldMm"`, `"supraspinaleSkinfoldMm"`, `"thighSkinfoldMm"`,
`"calfSkinfoldMm"`, `"armFlexedCm"`, `"humerusBreadthCm"`, `"bistyloidBreadthCm"`,
`"femurBreadthCm"`. `MeasurementValues` se amplía sola (se deriva del array). `measurementKinds`,
`consultationChips`, `isConsultationEmpty` y `canDeleteConsultation` **no cambian de firma**. Una
medición que solo tiene diámetros cae en Antropometría y no en Bioimpedancia.

Impacto: todo el que construye un `MeasurementValues` necesita los campos nuevos. Hoy son
`toEvolutionRow` (web) y el helper `m()` de `consultations.test.ts`.

### 4.6 `packages/core/src/index.ts`

Agregar `export * from "./isak";`, `export * from "./isak-study";`, `export * from "./isak-form";`.

### 4.7 `packages/db/domain/isak.ts` (nuevo), exportado en `domain/index.ts`

```ts
import type { IsakMeasures } from "@nutri-bot/core";
import { prisma, type EvolutionEntry } from "../index";

export class IsakStudyExistsError extends Error {}      // message = ISAK_TEXT.alreadyExists
export class IsakStudyNotFoundError extends Error {}    // message = "El estudio ISAK no existe"

/** Decimal → number de las 21 columnas ISAK de una fila. */
export function toIsakMeasures(entry: EvolutionEntry): IsakMeasures;

/** El estudio de la consulta (findFirst { consultationId, study: "ISAK" }), o null. */
export function getIsakStudy(consultationId: string): Promise<EvolutionEntry | null>;

/** Alta. Misma fecha que addEvolutionEntryToConsultation (mediodía del día de la consulta en la
 *  zona de la profesional), patientId de la consulta, study "ISAK", las 21 medidas (null donde no
 *  hay), note null. Si Prisma tira P2002 (el @@unique) → IsakStudyExistsError. */
export function createIsakStudy(params: {
  consultationId: string;
  measures: IsakMeasures;
}): Promise<EvolutionEntry>;

/** Edición (D17): updateMany where { id: entryId, consultationId, study: "ISAK" } con las 21
 *  medidas (las vacías pasan a null). count 0 → IsakStudyNotFoundError. No toca recordedAt ni note. */
export function updateIsakStudy(params: {
  consultationId: string;
  entryId: string;
  measures: IsakMeasures;
}): Promise<void>;

/** Borrado: deleteMany where { id: entryId, consultationId, study: "ISAK" }. count 0 →
 *  IsakStudyNotFoundError. Nunca borra otra medición. */
export function deleteIsakStudy(params: { consultationId: string; entryId: string }): Promise<void>;

/** D15: el último estudio ISAK del paciente en una consulta con consultedAt < `before`.
 *  findFirst where { patientId, study: "ISAK", consultation: { consultedAt: { lt: before } } },
 *  orderBy [{ consultation: { consultedAt: "desc" } }, { createdAt: "desc" }],
 *  include { consultation: { select: { id: true, consultedAt: true } } }. */
export function getPreviousIsakStudy(params: {
  patientId: string;
  before: Date;
}): Promise<(EvolutionEntry & { consultation: { id: string; consultedAt: Date } | null }) | null>;
```

`createIsakStudy` resuelve el mediodía con `getProfessional()` y `dayKeyToNoonUtc(dayKeyInTz(…))`,
igual que `addEvolutionEntryToConsultation` (copiar ese bloque o extraerlo a una función privada
compartida en `clinical.ts`; no cambiar la firma de `addEvolutionEntryToConsultation`).
`EvolutionMeasures` y `addEvolutionEntryToConsultation` **no cambian**: el formulario común de
"Agregar medición" no escribe columnas ISAK ni `study`.

---

## 5. Rutas, server actions y API (apps/web)

### 5.1 Rutas

| Ruta | Qué | Tipo |
|---|---|---|
| `/pacientes/[id]/consultas/[consultationId]` | Cambia: tarjeta "Antropometría ISAK"; lee `searchParams.isak === "editar"` para abrir el formulario en modo edición | server |
| `/pacientes/[id]/consultas/[consultationId]/antropometria` | **Nueva**: el estudio completo. Si la consulta no es del paciente → `notFound()`. Si no hay estudio → `redirect` a la consulta | server |

### 5.2 Server actions nuevas: `apps/web/src/app/(panel)/pacientes/[id]/isak-actions.ts` (`"use server"`)

```ts
export type IsakFormState = { ok: boolean; error?: string; fieldErrors?: IsakFieldErrors };

/** useActionState. FormData: patientId, consultationId, entryId (vacío = alta) y las 21 claves de
 *  ISAK_MEASURE_KEYS como name. */
export async function saveIsakStudyAction(prev: IsakFormState, formData: FormData): Promise<IsakFormState>;

export async function deleteIsakStudyAction(
  patientId: string, consultationId: string, entryId: string,
): Promise<ActionState>;
```

`saveIsakStudyAction`:
1. `z.object({ patientId, consultationId, entryId: z.string().optional() })` con `idSchema`; si
   falla → `{ ok: false, error: "Datos inválidos" }`.
2. `belongsToPatient(patientId, consultationId)` o "Datos inválidos".
3. `validateIsakForm(raw)` (core). Con errores → `{ ok: false, fieldErrors }` (sin `error`).
4. Con `entryId` → `updateIsakStudy`; sin él → `createIsakStudy`.
5. `IsakStudyExistsError` → `{ ok: false, error: ISAK_TEXT.alreadyExists }`;
   `IsakStudyNotFoundError` → "Datos inválidos"; otro → `{ ok: false, error: ISAK_TEXT.saveError }`.
6. `revalidatePath` de `/pacientes/${patientId}`, `…/consultas/${consultationId}` y
   `…/consultas/${consultationId}/antropometria`. `{ ok: true }`.

`deleteIsakStudyAction`: valida los 3 ids, `belongsToPatient`, `deleteIsakStudy`, revalida las
mismas 3 rutas. Error → `{ ok: false, error: ISAK_TEXT.deleteError }`.

Las acciones existentes **no cambian**. `deleteConsultationMeasurementAction` podría borrar la
fila ISAK si le pasan su id, pero la UI de "Mediciones" ya no muestra el tacho en esa fila (7.4).

### 5.3 API

Sin cambios.

---

## 6. Mensajes del bot

**Ninguno.** El bot no cambia y no hay textos nuevos de WhatsApp.

---

## 7. UI (skill `ui`): vistas, estructura y componentes

Sistema de diseño actual (`@/components/ui`: `Card`, `PageHeader`, `Button`, `ButtonLink`,
`Badge`, `Alert`, `Field`, `FormError`, `Quantity`, `EmptyState`; `NumberInput`; `Table*` de
`@/components/primitives/table`; `ChartContainer`/`ChartTooltip`/`ChartLegend` de
`@/components/primitives/chart`; `useConfirm`; `notify`/`useActionToast`). **Sin colores ni tokens
nuevos.** Números con `formatFixedEs` / `formatSignedFixedEs` / `Quantity`.

### 7.1 Vista "Detalle de la consulta" (cambia, `consultas/[consultationId]/page.tsx`)

- **Estructura:** igual que hoy. En la columna principal, el orden pasa a ser "Mediciones" →
  **"Antropometría ISAK"** → "Diagnóstico antropométrico" → "Requerimiento".
- **Datos que arma el server:**
  - `isakEntry = consultation.evolutionEntries.find(e => e.study === "ISAK") ?? null` (no hace
    falta otra consulta: `getConsultation` ya trae las mediciones).
  - `ageYears` con `computeAgeYears(patient.birthDate, consultation.consultedAt, tz)`.
  - Si hay estudio: `result = buildIsakStudy({ measures: toIsakMeasures(isakEntry), sex, ageYears })`;
    `previous = getPreviousIsakStudy({ patientId, before: consultation.consultedAt })`; si hay,
    `buildIsakStudy` del anterior con la edad a **su** fecha y `buildIsakSummary(result, {result: prev, dateLabel})`.
  - `prefill` para el alta: el `weightKg` y el `heightCm` más recientes (por `createdAt` desc)
    entre las mediciones **no ISAK** de esta consulta; null si no hay.
  - `startEditing = searchParams.isak === "editar"` (el `page` recibe `searchParams: Promise<…>`).
- **Componentes:** `<IsakCard …/>` (7.2).

### 7.2 Vista "Tarjeta Antropometría ISAK": `IsakCard` (`consultas/[consultationId]/isak-card.tsx`, **cliente**)

Props:
```ts
{
  patientId: string; consultationId: string;
  study: null | {
    entryId: string;
    values: IsakMeasures;               // para precargar el formulario al editar
    summary: ReturnType<typeof buildIsakSummary>;
  };
  prefill: { weightKg: number | null; heightCm: number | null };
  startEditing: boolean;
}
```

- **Estructura:** `Card` con `title="Antropometría ISAK"` y un `id="antropometria-isak"` en un
  wrapper (para el ancla `#antropometria-isak`). Estado local `mode: "view" | "form"` (inicial
  `"form"` si `startEditing && study`).
- **Estado 1 (sin estudio, `mode = "view"`):** `<p className="text-sm text-muted-foreground">`
  con `ISAK_TEXT.empty` y `Button` primario "Cargar antropometría ISAK" → `mode = "form"`.
- **Estado 2 (formulario):** `<IsakForm …/>` (7.3) dentro de la tarjeta, sin las acciones del
  encabezado.
- **Estado 3 (con estudio, `mode = "view"`):**
  - Línea 1: `summary.tissuesLine` (si no es null).
  - Línea 2: `summary.somatotypeLine` y, si `summary.muscleBone`, `Badge` con su label
    (`VERY_LOW`/`LOW` → tono `warning`; `MEDIUM`/`HIGH`/`VERY_HIGH` → `neutral`).
  - Línea 3: `summary.sum6Line`.
  - Si las tres son null: "Estudio cargado. Faltan medidas para los cálculos." en gris.
  - Acciones al pie (`flex flex-wrap gap-2`): `ButtonLink` primario "Ver estudio completo" →
    `/pacientes/${patientId}/consultas/${consultationId}/antropometria`; `Button` secundario
    "Editar" → `mode = "form"`; `Button` `danger` `size="sm"` "Borrar estudio".
  - **Borrar:** handler `async` del `onClick` (fuera de toda transición y de `<form action>`):
    `const ok = await confirm({ title: ISAK_TEXT.deleteTitle, description: ISAK_TEXT.deleteDescription, confirmLabel: ISAK_TEXT.deleteLabel });`
    si ok → `startTransition(async () => { const res = await deleteIsakStudyAction(…); res.ok ? notify.saved(ISAK_TEXT.deleted) : notify.error(res.error); })`.
    Reusar este botón en la página del estudio: extraerlo como `DeleteIsakStudyButton` (mismo
    archivo o `delete-isak-study-button.tsx`) con prop opcional `redirectTo` (si viene y `res.ok`,
    `router.push(redirectTo)`).

### 7.3 Vista "Formulario del estudio ISAK": `IsakForm` (`consultas/[consultationId]/isak-form.tsx`, **cliente**)

Props: `{ patientId; consultationId; entryId: string | null; initial: Partial<IsakMeasures>; onDone: () => void }`.
Al editar, `initial = study.values`; al cargar, `initial = { weightKg: prefill.weightKg, heightCm: prefill.heightCm }`.

- **Estructura:** `<form action={action} noValidate onSubmit={…} onChange={() => setDirty(true)}>`
  con `useActionState(saveIsakStudyAction, { ok: false })`. Hidden: `patientId`,
  `consultationId`, `entryId` (vacío si es alta).
- **4 grupos**, en el orden de `ISAK_MEASURE_GROUPS`, cada uno con su título como
  `<h3 className="text-sm font-semibold">` y una grilla `grid gap-4 sm:grid-cols-2 lg:grid-cols-4`.
  Dentro, un `Field` por medida de `ISAK_MEASURES` del grupo (label = `def.label`; en
  "Básicas" masa y talla llevan " *" visual y `aria-required`), con
  `<NumberInput name={def.key} unit={def.unit} step="0.1" min="0" defaultValue={initial[key] ?? ""} />`.
  El orden del DOM es el de `ISAK_MEASURE_KEYS`: el Tab recorre el formulario en ese orden (no
  poner `tabIndex`).
- **Sumatorias en vivo:** debajo del grupo de pliegues, `<p className="text-sm tabular-nums text-muted-foreground" aria-live="polite">`
  con `ISAK_TEXT.sumsLive(sum6, sum8)`. Se recalcula en `onChange` leyendo los 8 inputs del form
  con `parseIsakNumber`; `sum6`/`sum8` son null si falta alguno de sus pliegues o alguno es
  inválido. Usa `sum6SkinfoldsMm`/`sum8SkinfoldsMm` de core, con `roundTo(…, 1)`.
- **Errores en línea:** `Field error={fieldErrors[key]}`. Fuente de los errores:
  1. `onSubmit`: arma el objeto con los 21 valores del `FormData` del form y llama a
     `validateIsakForm` (core). Si hay errores → `event.preventDefault()`, se guardan en el
     estado local y se enfoca el primer campo con error. Es síncrono (sin `await`).
  2. La respuesta del server (`state.fieldErrors`), que manda si llega.
  Al editar un campo se borra su error local.
- **Pie:** `Button type="submit" loading={pending}` con "Guardar estudio" / "Guardando…" y
  `Button variant="secondary" type="button"` "Cancelar". Debajo, `<FormError message={state.error} />`
  (p. ej. `ISAK_TEXT.saveError` o `alreadyExists`).
- **Cancelar:** `onClick` `async` fuera de toda transición: si `dirty`,
  `await confirm({ title: ISAK_TEXT.discardTitle, description: ISAK_TEXT.discardDescription, confirmLabel: "Descartar", destructive: true })`;
  si confirma (o no estaba sucio) → `onDone()`.
- **Guardado ok:** `useActionToast(state, { success: ISAK_TEXT.saved })` y, al detectar un
  `state` nuevo con `ok` (patrón `lastState` de `ConsultationMeasurementForm`), `onDone()`.
- **Regla dura:** nunca `await confirm()` dentro de `<form action>` ni de `startTransition`.

### 7.4 Vista "Mediciones" (cambia, `consultation-measurements.tsx`)

- `EvolutionRow` suma `study: "ISAK" | null` y las 11 medidas nuevas (7.8).
- En el grupo "Antropometría", la fila con `study === "ISAK"` **no** lista sus valores ni lleva
  el tacho: muestra una sola línea
  `Antropometría ISAK · <Link href=".../antropometria">ver estudio</Link>` (texto de
  `ISAK_TEXT.measurementRow` y `measurementRowLink`, enlace con `underline-offset-4 hover:underline`).
  Si esa fila también tuviera bioimpedancia (no pasa con el formulario ISAK), no se muestra en
  Bioimpedancia: filtrar las filas ISAK del grupo Bioimpedancia.
- El resto, igual.

### 7.5 Vista "Estudio antropométrico ISAK" (nueva, `consultas/[consultationId]/antropometria/page.tsx`, **server component**)

Datos: `getConsultation`, `getProfessional`, `getIsakStudy`, `getPreviousIsakStudy`;
`buildIsakStudy` del actual y del anterior (edad a la fecha de cada consulta). `export const
dynamic = "force-dynamic"`. Un `loading.tsx` con el mismo patrón del de la consulta.

- **`PageHeader`:** `title="Antropometría ISAK"`; `description` = `"Consulta del dd/MM/yyyy"` +
  `" · N años"` (si hay edad) + `" · Masculino|Femenino"` (con `sexLabel`, si hay sexo), unidos
  con " · "; `back={{ href: consulta, label: "Volver a la consulta" }}`; `action` =
  `ButtonLink` secundario "Editar" → `…/consultas/[consultationId]?isak=editar#antropometria-isak`
  y `DeleteIsakStudyButton` con `redirectTo` a la consulta.
- **Avisos, arriba y en este orden:**
  1. Menor: `Alert tone="info"` con `ISAK_TEXT.minorWarning`.
  2. Falta sexo o fecha de nacimiento: `Alert tone="warning"` con
     `missingFormulaDataMessage(getMissingFormulaData({...}).filter(i => i.key === "sex" || i.key === "birthDate"))`
     y, como en `RequirementSection`, `FormulaDataSheet` con trigger "Completar datos para
     cálculos" (si falta sexo) y `ButtonLink` "Ir a Datos" (si falta la fecha).
  3. Comparación: `<p className="text-sm text-muted-foreground">` con
     `ISAK_TEXT.comparedWith(dd/MM/yyyy del anterior, daysBetweenDayKeys(…))`.
- **Secciones** (`Card` cada una, `space-y-6`, en este orden). Cuando hay anterior, **todas las
  tablas** suman las columnas "Anterior" (el valor del anterior, mismo formato) y "Dif."
  (`isakDifference`, con `formatSignedFixedEs`; "—" si es null). Un valor `missing` se muestra
  con su `note` en `text-muted-foreground`; `not_for_minors` no se muestra (la sección entera se
  oculta).
  1. **"Medidas"** (`isak-measures-table.tsx`, server): una `Table` con 4 subgrupos (fila de
     encabezado de grupo con el título de `ISAK_MEASURE_GROUPS`, `colSpan` completo). Columnas:
     Medida / Valor (`Quantity` 1 decimal + unidad) / Z (2 decimales fijos, "—" en talla) /
     barra Z / [Anterior / Dif.]. Barra Z: componente `ZScoreBar` (`z-score-bar.tsx`, server,
     `aria-hidden`): pista `h-2 w-24 rounded-full bg-secondary`, marca central `bg-border`, tramo
     de 0 a z en `bg-muted-foreground`, recortado a ±3. Nota al pie `text-xs
     text-muted-foreground`: `ISAK_TEXT.zFootnote`.
  2. **"Composición corporal"** (se oculta si `minor`): dos `Table` con título `h3`
     "Fraccionamiento molecular" (filas `ISAK_METHOD_LABELS.fatMass`, `fatFreeMass`) y
     "Fraccionamiento tisular" (adiposo, muscular, óseo, residual). Columnas: Componente / kg / %
     / Z (MLG sin Z: "—") / [Anterior (kg) / Dif. (kg)]. Si `residual.negative`, `Alert
     tone="warning"` con `ISAK_TEXT.negativeResidual`. Debajo, `TissueStackedBar`
     (`tissue-stacked-bar.tsx`, server): una barra horizontal `h-3 rounded-full overflow-hidden
     flex` con 4 tramos de ancho = % (solo si los 4 están ok y ninguno es negativo) y leyenda con
     un cuadrado de color + "Adiposo 27,02 %" etc. Colores: `isakTissueColors` en
     `lib/chart-theme.ts` (7.9).
  3. **"Distribución adiposo-muscular"**: dos listas `dl` lado a lado (`sm:grid-cols-2`):
     "Adiposa" (Superior, Central, Inferior) y "Muscular" (Brazo, Muslo, Pierna), valores en %
     con 2 decimales.
  4. **"Índices de composición corporal"** (se oculta si `minor`): filas con el patrón `Row` del
     diagnóstico (7.7): "Índice adiposo muscular" con el valor y debajo
     `ISAK_TEXT.adiposeMuscleHint` en gris (sin categoría, D8); "Índice músculo/óseo" con el
     valor y `Badge` (tonos de 7.2). Debajo, `<details>` nativo con `<summary>` "Ver tabla de
     categorías" y una `Table` chica con `MUSCLE_BONE_TABLE` (Rango / Categoría).
  5. **"Adiposidad y muscularidad"**: `Table` Indicador / Valor / Z / [Anterior / Dif.] con
     "Sumatoria de 6 pliegues", "Sumatoria de 8 pliegues" (mm, 1 decimal, sin Z), "Brazo
     corregido", "Muslo corregido", "Pierna corregida" (cm, 2 decimales, con Z) y "Diferencia
     brazo flexionado − brazo relajado" (cm, 1 decimal, sin Z).
  6. **"Proporcionalidad"**: filas "Índice córmico" (2 decimales), "Índice de Manouvrier"
     (entero), "Envergadura relativa" (2 decimales), cada una con su `classLabel` en **texto
     gris**, sin `Badge`.
  7. **"Somatotipo"**: tres `StatTile` (Endomorfia, Mesomorfia, Ectomorfia, 2 decimales), la
     categoría (`<p className="font-medium">`), y la `Somatochart` (7.6). Con anterior, debajo de
     cada tile "Anterior 4,95 (−0,92)".
  8. **"Índices de salud"**: reusa las filas del diagnóstico de la HU-004 (7.7) con
     `result.health.diagnosis`: "IMC" (`bmi`, 1 decimal, rango `BMI_HEALTHY_RANGE_TEXT`),
     "Índice cintura/cadera" (`waistHipRatio`, si no es null), "Cintura/talla"
     (`waistToHeight`, "<0,50") e "Índice de conicidad" (`conicity`, "<1,4"). Mismos `Badge`,
     tonos y referencias que `AnthropometricDiagnosisCard`. Menor: solo el IMC sin clasificar
     (lo resuelve `buildAnthropometricDiagnosis`). Más la fila "Índice de distribución grasa"
     (2 decimales) con `ISAK_TEXT.fatDistributionHint` en gris, sin rango (D11). Sin columna
     "Anterior" en esta sección salvo el IDG (el diagnóstico de la HU-004 no la tiene).
- **Pie:** `<p className="text-xs text-muted-foreground">` con `ISAK_TEXT.methods`.

### 7.6 Vista "Somatocarta": `Somatochart` (`consultas/[consultationId]/antropometria/somatochart.tsx`, **cliente, Recharts**)

Props: `{ current: { x: number; y: number; label: string } | null; previous: { x; y; label } | null }`
(`label` = "4,03 – 5,69 – 1,92"). Si `current` es null: texto gris con la nota del faltante y no
se dibuja.

- `ChartContainer` (`config` con `current: { label: "Actual", color: chartDefaultColor }` y
  `previous: { label: "Anterior", color: chartStudyColors[1] }`), `className="aspect-auto
  w-full max-w-md mx-auto"`, `style={{ height: 380 }}`.
- `ScatterChart` con `accessibilityLayer` y `title="Somatocarta"`:
  - `CartesianGrid` (horizontal y vertical);
  - `XAxis type="number" dataKey="x"` con dominio
    `[min(SOMATOCHART_DOMAIN.x[0], puntos), max(…)]`, ticks cada 2;
    `YAxis type="number" dataKey="y"` igual con `SOMATOCHART_DOMAIN.y`;
  - los 3 ejes como `ReferenceLine` con `segment` del origen `(0, 0)` a cada vértice de
    `SOMATOCHART_VERTICES`, y el contorno como 3 `ReferenceLine` con `segment` entre vértices
    (trazo `stroke="var(--border)"`/`hsl(var(--border))` según lo que use `chart.tsx`, sin
    colores nuevos; el contorno curvo del informe es de la HU-007);
  - etiquetas de los ejes con `Label`: "Mesomorfia" arriba del vértice meso, "Endomorfia" abajo a
    la izquierda, "Ectomorfia" abajo a la derecha;
  - dos `Scatter` (`name="current"` y `name="previous"`, un punto cada uno, `fill` =
    `var(--color-current|previous)`); el anterior solo si existe;
  - `ChartTooltip` con contenido propio: "Actual · 4,03 – 5,69 – 1,92 · X −2,12 · Y 5,43"
    (`formatFixedEs`, 2 decimales);
  - `ChartLegend` con `ChartLegendContent` ("Actual", "Anterior").

### 7.7 Filas del diagnóstico compartidas (refactor chico, sin cambio visual)

Mover `Row`, `Muted`, `IndicatorRow`, `fixedDecimals` y los mapas de tonos (`BMI_TONES`,
`WAIST_HIP_TONES`, `HEALTHY_TONES`, `WAIST_TONES`) de `anthropometric-diagnosis.tsx` a
`consultas/[consultationId]/diagnosis-rows.tsx` (server-safe, exportados).
`AnthropometricDiagnosisCard` los importa de ahí y **se ve igual**. La sección 8 de la página ISAK
usa esos mismos componentes: así no hay una segunda implementación de filas, etiquetas ni tonos.

### 7.8 Evolución y etiquetas D2

- `EvolutionRow` (`evolution-types.ts`) suma: `study: "ISAK" | null` y las 11 medidas nuevas
  (`number | null`), con los mismos nombres de columna. `toEvolutionRow` (`lib/evolution-rows.ts`)
  las mapea con `num(…)` y `study: e.study`.
- Etiquetas D2 (solo texto; las columnas no cambian):
  - `PERIMETER_MEASURES`: `armCm` "Brazo relajado", `thighCm` "Muslo medio", `calfCm` "Pierna
    (pantorrilla)";
  - `measurement-fields.tsx`: los `Field` "Brazo" → "Brazo relajado", "Muslo" → "Muslo medio",
    "Pantorrilla" → "Pierna (pantorrilla)";
  - `evolution-table.tsx` (`detailText`): "Brazo relajado …", "Muslo medio …", "Pierna …" en
    lugar de "Brazo/Muslo/Pantorrilla".
- La pestaña Evolución **no suma** gráficos ni columnas de las medidas nuevas (épica 9).

### 7.9 `lib/chart-theme.ts` (aditivo)

```ts
/** Tejidos del estudio ISAK (HU-006). Hex ya existentes en este archivo: sin colores nuevos. */
export const isakTissueColors = {
  adipose: "#B37D19",   // ámbar (chartSeriesColors[2])
  muscle: "#396F51",    // verde (chartSeriesColors[1])
  bone: "#65635D",      // gris (chartStudyColors[1])
  residual: "#7959A6",  // violeta (chartSeriesColors[3])
} as const;
```

### 7.10 Lista de consultas, Resumen, bot y portal

Sin cambios de código: el chip sigue siendo "Antropometría" (el estudio es una medición con
claves de `ANTHROPOMETRY_MEASURE_KEYS`) y las reglas de vacía/borrable ya cuentan mediciones.

---

## 8. Archivos

**Crear**
- `packages/core/src/isak.ts`, `isak.test.ts`
- `packages/core/src/isak-study.ts`, `isak-study.test.ts`
- `packages/core/src/isak-form.ts`, `isak-form.test.ts`
- `packages/core/scripts/validate-isakmetry.ts` (10.5)
- `packages/db/prisma/migrations/<timestamp>_isak_anthropometry/migration.sql` (generada)
- `packages/db/domain/isak.ts`
- `packages/db/scripts/test-isak.ts`
- `apps/web/src/app/(panel)/pacientes/[id]/isak-actions.ts`
- `apps/web/src/app/(panel)/pacientes/[id]/consultas/[consultationId]/isak-card.tsx`
- `apps/web/src/app/(panel)/pacientes/[id]/consultas/[consultationId]/isak-form.tsx`
- `apps/web/src/app/(panel)/pacientes/[id]/consultas/[consultationId]/delete-isak-study-button.tsx`
- `apps/web/src/app/(panel)/pacientes/[id]/consultas/[consultationId]/diagnosis-rows.tsx`
- `apps/web/src/app/(panel)/pacientes/[id]/consultas/[consultationId]/antropometria/page.tsx`
- `.../antropometria/loading.tsx`, `isak-measures-table.tsx`, `z-score-bar.tsx`,
  `tissue-stacked-bar.tsx`, `somatochart.tsx`

**Modificar**
- `packages/core/src/consultations.ts`, `consultations.test.ts`, `patient-formula-data.ts`,
  `index.ts` (y `patient-formula-data.test.ts` para los formatos nuevos)
- `packages/db/prisma/schema.prisma`, `packages/db/domain/index.ts`, `packages/db/package.json`
  (script `test:isak`)
- `package.json` de la raíz: script `"isak:validate": "tsx packages/core/scripts/validate-isakmetry.ts"`
- `apps/web/src/app/(panel)/pacientes/[id]/consultas/[consultationId]/page.tsx`,
  `consultation-measurements.tsx`, `anthropometric-diagnosis.tsx`
- `apps/web/src/app/(panel)/pacientes/[id]/evolution-types.ts`, `measurement-fields.tsx`,
  `evolution-table.tsx`
- `apps/web/src/lib/evolution-rows.ts`, `apps/web/src/lib/chart-theme.ts`

**No tocar:** `apps/bot/**`, `apps/web/src/app/(portal)/**`, `tailwind.config.ts`,
`backlog.json`, las migraciones existentes, `docs/ISAKMetry_*`.

---

## 9. Checklist atómico

### packages/core
- [ ] `patient-formula-data.ts`: `formatFixedEs` y `formatSignedFixedEs` (4.4) + tests.
- [ ] `isak.ts`: `ISAK_MEASURE_KEYS`, `ISAK_MEASURES`, `ISAK_MEASURE_GROUPS`, `missingMeasuresNote`.
- [ ] `isak.ts`: `PHANTOM_HEIGHT_CM`, `PHANTOM` (tabla 4.1.2 con comentarios de fuente y de D5/D7), `phantomScale`, `phantomZ`.
- [ ] `isak.ts`: `DW_TABLE`, `durninWomersleyCoefficients`, `durninWomersleyDensity`, `siriBodyFatPercent`.
- [ ] `isak.ts`: `sum6SkinfoldsMm`, `sum8SkinfoldsMm`, `kerrAdiposeZ`, `kerrAdiposeTissueKg`.
- [ ] `isak.ts`: `correctedGirthCm`, `LEE_ETHNICITY_TERM`, `leeMuscleMassKg`, `rochaBoneMassKg`.
- [ ] `isak.ts`: `adiposeDistribution`, `muscleDistribution`, `fatDistributionIndex`.
- [ ] `isak.ts`: índices de composición + `classifyMuscleBoneIndex` + `MUSCLE_BONE_TABLE`.
- [ ] `isak.ts`: proporcionalidad + 3 clasificaciones.
- [ ] `isak.ts`: Heath-Carter (`endomorphy`, `mesomorphy`, `heightWeightRatio`, `ectomorphy`, piso 0,1), `somatochartPoint`, `classifySomatotype` + labels, `SOMATOCHART_*`.
- [ ] `isak-study.ts`: tipos, `buildIsakStudy` (tabla 4.2.2), `ISAK_TEXT`, `ISAK_METHOD_LABELS`, `buildIsakSummary`, `isakDifference`, `daysBetweenDayKeys`.
- [ ] `isak-form.ts`: `ISAK_RANGES`, `ISAK_FORM_TEXT`, `parseIsakNumber`, `validateIsakForm`.
- [ ] `consultations.ts`: 11 claves nuevas en `ANTHROPOMETRY_MEASURE_KEYS`; `consultations.test.ts`: helper `m()` con las 11 en null + caso "solo diámetros".
- [ ] `index.ts`: 3 exports nuevos.
- [ ] Tests 10.1–10.4. `npm run test` en verde.
- [ ] `scripts/validate-isakmetry.ts` (10.5) y script `isak:validate` en la raíz.

### packages/db
- [ ] Respaldo `pg_dump` (3.2 paso 1) y `migrate status` limpio (paso 2).
- [ ] `schema.prisma` (3.1).
- [ ] `migrate dev --create-only --name isak_anthropometry`; revisar el SQL contra 3.2 paso 5.
- [ ] `npm run db:migrate`, `npm run db:generate`.
- [ ] `domain/isak.ts` (4.7) y su export en `domain/index.ts`.
- [ ] `scripts/test-isak.ts` (10.6) y `"test:isak": "dotenv -e ../../.env -- tsx scripts/test-isak.ts"`.

### apps/web
- [ ] `evolution-types.ts` + `lib/evolution-rows.ts`: `study` y 11 campos (7.8).
- [ ] Etiquetas D2 en `evolution-types.ts`, `measurement-fields.tsx`, `evolution-table.tsx`.
- [ ] `diagnosis-rows.tsx` extraído; `anthropometric-diagnosis.tsx` lo importa (sin cambio visual).
- [ ] `lib/chart-theme.ts`: `isakTissueColors`.
- [ ] `isak-actions.ts` (5.2).
- [ ] `delete-isak-study-button.tsx`, `isak-form.tsx`, `isak-card.tsx` (7.2, 7.3).
- [ ] `page.tsx` de la consulta: datos de 7.1 y la tarjeta en su lugar; `searchParams.isak`.
- [ ] `consultation-measurements.tsx`: fila ISAK resumida y sin tacho (7.4).
- [ ] Página `antropometria/` con sus 8 secciones, `loading.tsx`, `z-score-bar.tsx`, `tissue-stacked-bar.tsx`, `isak-measures-table.tsx` (7.5).
- [ ] `somatochart.tsx` con Recharts (7.6).
- [ ] `npm run typecheck` en verde.

### apps/bot
- [ ] Ningún cambio de código. `npm run typecheck` (incluye el bot) y `npm run test:confirm-flow --workspace apps/bot` en verde.

---

## 10. Tests

Todos en `packages/core` con vitest. Regla de comparación: **cada valor que se muestra se compara
exacto con `toBe` sobre el valor ya redondeado que devuelve `buildIsakStudy`** (o `roundTo(…, n)`
en los tests de fórmulas sueltas), salvo las tolerancias documentadas en el propio test:

| Diferencia | Qué se testea | Tolerancia |
|---|---|---|
| D7 masa corporal | Z de la masa, casos A y B | `Math.abs(z − esperadoISAKMetry) <= 0.02` (A 0,42 vs 0,40; B 1,27 vs 1,26). Además, `toBe(0.42)` y `toBe(1.27)` para fijar lo que da el sistema |
| D7 brazo flexionado | Z con *s* = 2,27 | exacto: A 1,67; B 2,18 |
| D5 muslo corregido | Z con 47,34 / 3,59 | exacto contra el valor **del sistema**: A 0,84; B 1,70 (ISAKMetry muestra 0,17 y 0,62: comentario en el test) |
| D6 Z adiposo | Z de Kerr del Σ6 | exacto: A −1,23; B −0,94 (el Excel dice 2,44: comentario en el test, excluido) |

Casos de datos (constantes al inicio de `isak.test.ts` / `isak-study.test.ts`, **solo números**):

- **Caso A:** masculino, 22 años; las 21 medidas de la HU.
- **Caso B:** masculino, 21 años; las 21 medidas de la HU.
- **Caso C (sintético):** femenino, 35 años; masa 58, talla 160, sentado 85, envergadura 158;
  pliegues tríceps 18, subescapular 14, bíceps 8, cresta ilíaca 16, supraespinal 12, abdominal
  20, muslo 24, pierna 15; perímetros brazo 27,5, flexionado 28,4, cintura 70, caderas 96, muslo
  medio 52, pierna 34; diámetros húmero 6,0, biestiloideo 4,9, fémur 8,8.

### 10.1 `isak.test.ts` (fórmulas sueltas)

- `phantomScale(164)` → 1.0376829… (`toBeCloseTo(1.037683, 6)`).
- **Z de las 20 medidas** del caso A (tabla del Gherkin "Z de cada medida", con la masa por la
  tolerancia D7) y las 10 del caso B listadas en la HU. Además, B: tríceps −0,66, subescapular
  −0,53, bíceps −1,92, abdominal −0,86, pierna (pliegue) −1,87, caderas 0,51, muslo medio 0,62,
  húmero 0,76, talla sentado −0,84, envergadura 0,09.
- **DW por tramo** con Σ4 = 40 mm (`toBeCloseTo` a 4 decimales la densidad y a 2 el %):

  | Sexo / edad | D | %MG |
  |---|---|---|
  | H 18 | 1,0611 | 16,51 |
  | H 25 | 1,0618 | 16,17 |
  | H 35 | 1,0550 | 19,17 |
  | H 45 | 1,0499 | 21,49 |
  | H 60 | 1,0467 | 22,92 |
  | M 18 | 1,0463 | 23,10 |
  | M 25 | 1,0450 | 23,67 |
  | M 35 | 1,0410 | 25,48 |
  | M 45 | 1,0353 | 28,14 |
  | M 60 | 1,0306 | 30,32 |

  Bordes: H 16 → `null`; H 17 → tramo 17–19; M 15 → `null`; M 16 → tramo 16–19; H 29 → 20–29;
  H 30 → 30–39; H 50 → 50+.
- **Kerr:** A Σ6 71 → `kerrAdiposeZ` −1,2284 (`toBeCloseTo(-1.2284, 4)`), kg 16,48; B Σ6 80,5 →
  Z −0,94 (`roundTo`), kg 17,96.
- **Corregidos:** A 26,74 / 48,54 / 32,62; B 28,53 / 51,49 / 31,80.
- **Lee:** A (22 años) 28,97; B (21) 30,26; C (mujer, 35) 20,64.
- **Rocha:** A 10,34; B 10,13; C 8,69.
- **Heath-Carter:** A 4,03 / 5,69 / 1,92 (HWR 41,66, tramo ≥ 40,75); B 4,95 / 5,72 / 1,01 (HWR
  40,26, tramo intermedio); C 4,73 / 4,21 / 1,68. Ecto con talla 150 y masa 70 (HWR 36,40) →
  0,1. Piso: endomorfia con los 3 pliegues en 1 mm y talla 200 → 0,1.
- **Somatocarta:** A → (−2,12; 5,43); B → (−3,94; 5,48); C → (−3,05; 2,02).
- **`classifySomatotype`** (con valores redondeados): (4,03; 5,69; 1,92) y (4,95; 5,72; 1,01) →
  `ENDOMORPHIC_MESOMORPH` "Endo-mesomorfo"; (4,73; 4,21; 1,68) → `MESOMORPHIC_ENDOMORPH`;
  (3; 3; 3) y (3,5; 3; 2,6) → `CENTRAL`; (6; 2; 2) → `BALANCED_ENDOMORPH`; (2; 6; 2) →
  `BALANCED_MESOMORPH`; (2; 2; 6) → `BALANCED_ECTOMORPH`; (5; 5,3; 2) → `ENDOMORPH_MESOMORPH`;
  (5; 4,5; 1) → `ENDOMORPH_MESOMORPH` (0,5 exacto cuenta como iguales); (1,5; 4; 4,4) →
  `MESOMORPH_ECTOMORPH`; (4; 1; 4,3) → `ENDOMORPH_ECTOMORPH`; (2; 5; 3) →
  `ECTOMORPHIC_MESOMORPH`; (1; 3; 5) → `MESOMORPHIC_ECTOMORPH`; (3; 1; 5) →
  `ENDOMORPHIC_ECTOMORPH`; (5; 1; 3) → `ECTOMORPHIC_ENDOMORPH`.
- **IMO:** 2,33 → Muy bajo; 2,34 → Bajo; 2,3449 → Bajo; 2,43 → Bajo; 2,44 → Medio; 2,80 →
  Medio; 3,10 → Medio; 3,11 → Alto; 3,29 → Alto; 3,30 → Muy alto.
- **Córmico:** 0,50 → Braqui; 0,5061 → Metri (se redondea a 0,51); 0,52 → Metri; 0,53 → Macro.
  **Manouvrier:** 84 → cortos; 84,6 → medios (redondea a 85); 89 → medios; 97,59 → largos.
  **Envergadura relativa:** 1,0165 → mayor; 1,004 → igual (1,00); 0,9875 → menor.
- **Distribución:** A adiposa 30,99 / 45,07 / 23,94 y muscular 24,79 / 44,99 / 30,23. IDG A
  0,65; B 0,50 (`0.5046…` → 0,50; **ojo: la HU dice 0,51 para B**, ver 10.1.1).

#### 10.1.1 Fe de erratas técnica de la HU: IDG del caso B

Con la fórmula D11, B da (12 + 8 + 7) / (14 + 21,5 + 18) = 27 / 53,5 = **0,5047 → 0,50**, no
0,51 como dice el escenario "El índice de distribución grasa baja…". El Excel del caso B (versión
vieja de ISAKMetry) **no trae** ese índice, así que el 0,51 de la HU no tiene fuente contra la
cual contrastarlo. El test fija **0,50** y deja un comentario: "HU decía 0,51; la fórmula D11 da
0,5047; validar con el próximo PDF de ISAKMetry (D11)". El sentido del escenario (B < A) se
mantiene.

### 10.2 `isak-study.test.ts` (`buildIsakStudy` y resumen)

- **Caso A completo:** todas las tablas de la HU (Medidas, molecular 10,73 / 17,59 / −0,04 y
  50,27 / 82,41; tisular 16,48 / 27,02 / −1,23 · 28,97 / 47,49 / 2,28 · 10,34 / 16,95 / 0,68 ·
  5,21 / 8,54 / −5,57; los 4 kg suman 61,00 y los % 100,00 ± 0,01; distribución; IAM 0,57; IMO
  2,80 "Medio"; Σ6 71,0; Σ8 94,0; corregidos 26,74 (Z 2,99) / 48,54 (Z 0,84) / 32,62 (Z 1,84);
  diferencia brazo 1,8; córmico 0,51 "Metricórmico (tronco medio)"; Manouvrier 98 "Miembros
  inferiores largos"; envergadura 1,02 "Envergadura mayor a la talla"; somatotipo y categoría;
  somatocarta; salud: IMC 22,7 "Normal", ICC 0,83 "Sin riesgo aumentado", cintura/talla 0,45 "En
  rango saludable", conicidad 1,10 "En rango saludable", IDG 0,65).
- **Caso B:** adiposo 17,96, muscular 30,26 (Z 2,76), óseo 10,13 (Z 0,53), residual 9,25 (Z
  −3,20); % 26,57 / 44,76 / 14,99 / 13,68; IAM 0,59; IMO 2,99 "Medio"; Σ6 80,5; Σ8 114,5; brazo
  corregido Z 3,96; pierna corregida Z 1,41; diferencia brazo 0,8; IMC 25,1 "Sobrepeso"; ICC 0,87;
  conicidad 1,17; MG 14,27 kg / 21,11 % (sin contraste en el Excel).
- **Caso C:** composición 20,32 / 20,64 / 8,69 / 8,35 kg; % 35,03 / 35,59 / 14,98 / 14,40; MG
  17,25 kg / 29,74 % (tramo mujeres 30–39); IMO 2,38 "Bajo"; córmico 0,53 "Macrocórmico (tronco
  largo)"; Manouvrier 88 "Miembros inferiores medios"; envergadura 0,99 "Envergadura menor a la
  talla"; categoría "Meso-endomorfo".
- **Sin sexo** (A con `sex: null`): `fatMass.kg` y `muscle.kg` → `{ missing, note: "Falta sexo" }`;
  residual, IAM e IMO → "Sin dato (falta tejido muscular)"; adiposo y óseo ok; `missingSex: true`.
- **Sin fecha de nacimiento** (`ageYears: null`): DW y Lee → "Falta fecha de nacimiento";
  `minor: false`.
- **Estudio incompleto** (solo masa, talla y 8 pliegues del caso A): óseo → "Sin dato (falta
  biestiloideo, fémur)"; mesomorfia → "Sin dato (falta brazo flexionado, perímetro pierna,
  húmero, fémur)" (orden de `ISAK_MEASURE_KEYS`); categoría y somatocarta → "Sin dato (falta mesomorfia)"; Z de fémur →
  "Sin dato"; Σ6/Σ8, endomorfia, ectomorfia, adiposo y MG ok.
- **Residual negativo:** A con masa 50 → `residual.kg` −5,79 (50 − 55,79), `negative: true`.
- **Menor (12 años):** `minor: true`; `molecular.*`, `tissues.*` y `compositionIndices.*` →
  `not_for_minors`; medidas con Z, Σ, corregidos, distribución, proporcionalidad y somatotipo
  ok; `health.diagnosis.bmi.status === "unclassified"` y `waistHipRatio === null`.
- **`buildIsakSummary`** A con B como anterior (fecha "05/11/2025"): `tissuesLine` "Adiposo 27,02 %
  · Muscular 47,49 % · Óseo 16,95 % · Residual 8,54 %"; `somatotypeLine` "Somatotipo 4,03 – 5,69 –
  1,92 (Endo-mesomorfo) · IMO 2,80"; `muscleBone` `{ key: "MEDIUM", label: "Medio" }`;
  `sum6Line` "Σ 6 pliegues 71,0 mm (−9,5 respecto del 05/11/2025)" (U+2212). Sin anterior:
  "Σ 6 pliegues 71,0 mm". Menor: `tissuesLine` null y sin " · IMO".
- **`ISAK_TEXT.sumsLive(71, 94)`** → "Σ 6 pliegues: 71,0 mm · Σ 8 pliegues: 94,0 mm".
- **`isakDifference`**: (71,0; 80,5; 1) → −9,5; missing → null.
- **`daysBetweenDayKeys("2025-11-05", "2026-05-08")`** → 184;
  `ISAK_TEXT.comparedWith("05/11/2025", 184)` → "Comparado con el estudio del 05/11/2025 (184
  días antes)".
- **Reuso de la HU-004:** `result.health.diagnosis` es `toEqual` a
  `buildAnthropometricDiagnosis({ sex: "MALE", ageYears: 22, bodyFrame: null, weightKg: 61, heightCm: 164, waistCm: 73, hipCm: 88 })`.

### 10.3 `isak-form.test.ts`

- `parseIsakNumber`: "11" → 11; "11,5" → 11.5; "11.5" → 11.5; " 6 " → 6; "" → null; "11,55" →
  undefined; "abc" → undefined; "-3" → undefined; "1.234" → undefined.
- `validateIsakForm`: caso A como strings → ok; sin talla → `errors.heightCm` "La talla es
  obligatoria para el estudio ISAK"; sin masa → "La masa corporal es obligatoria para el estudio
  ISAK"; tríceps "110" → "Revisá el valor: los pliegues van de 1 a 80 mm"; tríceps "80" ok y "1"
  ok; talla 164 + sentado 170 → `errors.sittingHeightCm` "La talla sentado no puede ser mayor que
  la talla"; sentado = talla → ok; fémur "25" → diámetros; cintura "5" → perímetros; masa "9,9" →
  masa; "11,55" → "Revisá el valor: usá un número con hasta 1 decimal"; solo masa + talla + 8
  pliegues → ok con el resto null.

### 10.4 Tests que cambian

- `consultations.test.ts`: `m()` suma las 11 claves en null; nuevo caso
  `measurementKinds(m({ femurBreadthCm: 9.7 }))` → `{ anthropometry: true, bioimpedance: false }`.
- `patient-formula-data.test.ts`: `formatFixedEs(71, 1)` "71,0", `(2.8, 2)` "2,80", `(-0.04, 2)`
  "-0,04"; `formatSignedFixedEs(-9.5, 1)` "−9,5", `(1.2, 1)` "+1,2", `(0, 1)` "0,0".

### 10.5 Validación local contra ISAKMetry: `packages/core/scripts/validate-isakmetry.ts`

Script versionado **sin datos**: solo lee los archivos no versionados si están. Se corre con
`npm run isak:validate` (raíz) = `tsx packages/core/scripts/validate-isakmetry.ts`. Usa solo
`node:fs`, `node:path`, `node:child_process` y `@nutri-bot/core` (sin dependencias nuevas).

1. Busca en `docs/` los archivos que empiezan con `ISAKMetry_` y terminan en `.xlsx` o `.pdf`.
   Si no hay ninguno: imprime "No está el material de ISAKMetry en docs/ (no se versiona). Nada
   que validar." y **sale con 0**.
2. **Excel** (formato de la versión vieja, el del caso B): extrae
   `xl/sharedStrings.xml` y `xl/worksheets/sheet1.xml` con
   `execFileSync("unzip", ["-p", archivo, ruta])`; parsea las celdas `<c r="…" t="s"?><v>…</v></c>`
   con regex. Lee **por dirección** y comprueba el rótulo de la celda vecina antes de usar el
   valor (si no coincide: "Formato de Excel no reconocido", sigue con el siguiente archivo):
   - edad `B7` (rótulo `A7` "Edad"), sexo `B8` ("Masculino"/"Femenino"). La validación **no
     lee** `B6` (nombre) ni `H6`/`H7` (evaluador); solo `--check-leaks` (paso 6) lee `B6`, en
     memoria.
   - medidas: valor en `D13:D36` y Z en `G13:G36` según el rótulo de la columna B (tabla de
     rótulos → `IsakMeasureKey`; "Pierna (mm)" y "Pierna (cm)" se distinguen por la unidad);
   - tejidos `C40:C43` (kg) y Z en `J40:J43`; Σ6 `C68`, Σ8 `C69`; corregidos `H68:H70` y Z
     `H72:H74`; IAM `C82`; IMO `C83`; endo/meso/ecto `F87`, `F89`, `F91`; ICC `D114`; conicidad
     `D115`; IMC `D117`; diferencia de brazo `D122`; córmico `D125`; Manouvrier `D126`;
     envergadura relativa `D127`.
3. **PDF** (versión nueva, el del caso A): `execFileSync("pdftotext", ["-layout", archivo, "-"])`.
   Si `pdftotext` no está: "Falta pdftotext (poppler): se saltea el PDF" y sigue. Parseo por
   secciones (líneas "Medidas Básicas", "Pliegues", "Perímetros", "Diámetros", "Fraccionamiento
   molecular", "Fraccionamiento tisular", "Distribución adiposo muscular", "Índices de
   composición corporal", "Adiposidad", "Muscularidad", "Índices y razones de proporcionalidad",
   "Somatotipo", "Índices de salud"), con números en formato es-AR (`parseEsArNumber`). Lee
   `Edad:` y `Género:` del encabezado; **ignora la línea `Nombre:`** (salvo `--check-leaks`) y las de "Evaluado por",
   "Realizado por" y "E-mail". La "Masa grasa (kg) (Durnin-" ocupa 3 líneas: el número está en
   la línea siguiente al rótulo.
4. Arma `IsakMeasures` + sexo + edad, llama a `buildIsakStudy` y compara cada número extraído con
   el del sistema. Tolerancia 0 al decimal que se muestra, salvo:
   - Z de la masa: ±0,02 (D7) → estado `TOLERADA`;
   - Z del muslo corregido (D5) y Z del tejido adiposo del Excel (D6) → estado `CONOCIDA`, no
     cuentan como fallo;
   - las clasificaciones de texto (IAM "Bueno", IMO "Promedio", ICC "< 1,00") no se comparan.
5. Imprime, por archivo, `Caso: <pdf|xlsx> · <sexo> · <edad> años` (sin nombre ni fecha) y una
   tabla `Campo | ISAKMetry | Sistema | Dif. | Tolerancia | Estado (OK/TOLERADA/CONOCIDA/DIF)`,
   y al final `N OK · N TOLERADA · N CONOCIDA · N DIF`. **No escribe archivos.** Sale con 1 si
   hay algún `DIF`; si no, 0.
6. **`--check-leaks`** (control de privacidad, porque el nombre no puede escribirse en ningún
   archivo versionado, ni siquiera en un `grep` de esta SDD): lee **en memoria** el nombre de la
   celda `B6` del Excel y de la línea `Nombre:` del PDF, parte cada nombre en palabras de 4 o más
   letras y busca cada una, sin distinguir mayúsculas, en el contenido de **los archivos que
   toca esta HU**: los de `git status --porcelain` (modificados y no ignorados nuevos; recorriendo
   carpetas nuevas). Antes de buscar, quita del texto `os.homedir()` y `process.cwd()` (el usuario
   del sistema contiene el apellido: las rutas absolutas no cuentan como fuga). Imprime solo
   "Sin fugas del nombre en archivos versionados" o la lista de **rutas** con coincidencias (nunca
   la palabra encontrada) y sale con 1 en ese caso. Sin material local: "Nada que validar", 0.

   Nota para el orquestador (fuera del alcance de esta HU): `docs/EJEMPLO DE INFORME
   ANTROPOMETRICO.pdf` **está versionado** y contiene el nombre del evaluado. No se toca acá;
   conviene decidir aparte si se saca del repo.

### 10.6 Prueba contra la base: `packages/db/scripts/test-isak.ts`

Mismo patrón que `test-prescriptions.ts` (`node:assert/strict`, ids en arrays, borrado por id en
`finally`). **Solo datos propios.**
1. Paciente propio: `whatsappJid: test-hu006-${Date.now()}@test.invalid`, `phone: "000"`, `name:
   "Prueba HU-006 (TEST)"`, `sex: MALE`, `birthDate: 2004-01-15`.
2. `createManualConsultation` 2025-11-05 y 2026-05-08.
3. En la del 08/05: `addEvolutionEntryToConsultation({ weightKg: 61, bodyFatPercent: 17 })`
   (una "bioimpedancia" propia) y `createIsakStudy` con el caso A. `getIsakStudy` la devuelve con
   `study === "ISAK"`, `recordedAt` = mediodía del 08/05 y `toIsakMeasures` igual al caso A.
4. Segundo `createIsakStudy` en la misma consulta → `IsakStudyExistsError`.
5. En la del 05/11: `createIsakStudy` con el caso B. `getPreviousIsakStudy({ patientId, before:
   consulta08.consultedAt })` → la fila del 05/11. Con `before` = la del 05/11 → null.
6. `updateIsakStudy` (08/05, tríceps 12) → `getIsakStudy` trae 12. `updateIsakStudy` con el id de
   la medición de bioimpedancia → `IsakStudyNotFoundError` y esa fila no cambió.
7. `deleteIsakStudy` (08/05) → `getIsakStudy` null; la medición de bioimpedancia **sigue**
   (`findUnique` por su id).
8. `deleteConsultation(08/05)` → `ConsultationNotDeletableError` (le queda la bioimpedancia).
9. `prisma.outboundMessage.count({ where: { toJid: jid propio } }) === 0`.
10. `finally`, por id y en orden: `evolutionEntry.deleteMany({ where: { id: { in: entryIds } } })`
    (juntando los ids devueltos y `findMany({ where: { consultationId: { in: consultationIds } } })`),
    `consultation`, `patient`. **Prohibidos** los filtros amplios.
11. Imprime `OK` o sale con código ≠ 0.

---

## 11. Verificación (el implementer la corre antes de declararse `done`)

Desde la raíz:

```bash
git branch --show-current                                                # hu-006-antropometria-isak
ls -la "$SCRATCHPAD/nutribot-pre-hu006.dump"                             # respaldo previo existe y pesa > 0
(cd packages/db && npx dotenv -e ../../.env -- prisma migrate status)    # up to date, 14 migraciones
cat packages/db/prisma/migrations/*_isak_anthropometry/migration.sql | grep -Ei 'drop|not null|alter column|rename'   # sin salida
npm run db:generate
npm run test                                                             # vitest core en verde
npm run typecheck                                                        # core, db, web y bot en verde
npm run isak:validate                                                    # 0 DIF (con el material local) o "Nada que validar"
npm run test:isak --workspace packages/db                                # OK
npm run test:confirm-flow --workspace apps/bot                           # sin WhatsApp real, limpia por id
docker compose exec -T db psql -U nutri -d nutribot -c 'select count(*) from "EvolutionEntry";'   # 15 (igual que antes)
docker compose exec -T db psql -U nutri -d nutribot -c 'select count(*) from "Consultation";'     # 18 (igual que antes)
docker compose exec -T db psql -U nutri -d nutribot -c 'select count(*) from "EvolutionEntry" where study is not null;'   # 0
git status --porcelain | grep -i isakmetry                               # sin salida (el material no se versiona)
npm run isak:validate -- --check-leaks                                   # "Sin fugas del nombre en archivos versionados" (10.5, paso 6)
./ops/harness/verify.sh
```

(Los conteos de 15 y 18 son los de hoy, 2026-09-24; si el usuario cargó datos desde entonces,
comparar con los que haya **antes** de empezar, anotados en `progress/impl_HU-006.md`.)

Salidas resumidas en `progress/impl_HU-006.md`: el SQL de la migración, el resumen de
`isak:validate` (solo el conteo y las filas no OK; **sin nombre**) y el aviso "**Cambió el
schema: hay que reiniciar el `next dev` del usuario**".

**Prohibido en esta HU:** `next build`; levantar otro `next dev`; `prisma migrate reset`; aceptar
el reset por drift; `prisma db push`; editar una migración aplicada; `db:seed`/`seed:demo`;
escribir en la base fuera de la migración y de `test-isak.ts`; cargar datos desde la UI; copiar
el nombre o cualquier dato identificatorio de `docs/ISAKMetry_*` a un archivo versionado. No
commitear. No tocar `backlog.json`.

---

## 12. Recorrido en el navegador (lo hace el orquestador, en `localhost:3000`)

**Antes:** reiniciar el `next dev` del usuario (cambió el cliente de Prisma).

### 12.1 Solo lectura (datos reales, no tocar botones que guarden)

1. En la ficha de un paciente real con mediciones: pestaña **Evolución** igual que antes, salvo
   las etiquetas "Brazo relajado", "Muslo medio" y "Pierna (pantorrilla)". Pestaña
   **Consultas**: los mismos chips.
2. Una consulta real con mediciones: "Mediciones" igual; debajo, la tarjeta "Antropometría ISAK"
   con "Todavía no hay un estudio antropométrico ISAK en esta consulta." y el botón "Cargar
   antropometría ISAK" (**no** abrirlo para guardar). "Diagnóstico antropométrico" se ve igual
   que antes (refactor de filas sin cambio visual).
3. Entrar a `.../consultas/<id>/antropometria` de esa consulta → redirige a la consulta.

### 12.2 Con un paciente de prueba propio (borrado por id al final)

Crear por SQL (id fijo, sin teléfono real):
```sql
insert into "Patient"(id,"whatsappJid",phone,name,"birthDate",sex,"updatedAt")
values ('hu006_walk_a','hu006-walk@test.invalid','000','Prueba HU-006 ISAK','2004-01-15','MALE',now());
```
(Con esa fecha tiene 21 años el 05/11/2025 y 22 el 08/05/2026, como los casos B y A.)

4. Ficha → Consultas → "Nueva consulta" **05/11/2025** → "Cargar antropometría ISAK" → cargar el
   **caso B** con el teclado (Tab en el orden básicas → pliegues → perímetros → diámetros) →
   "Guardar estudio" → toast "Estudio ISAK guardado". La tarjeta muestra "Adiposo 26,57 % ·
   Muscular 44,76 % · Óseo 14,99 % · Residual 13,68 %", "Somatotipo 4,95 – 5,72 – 1,01
   (Endo-mesomorfo) · IMO 2,99" con `Badge` "Medio", "Σ 6 pliegues 80,5 mm".
5. "Nueva consulta" **08/05/2026**. Antes del estudio, "Agregar medición" solo con grasa 17 %
   (bioimpedancia de prueba). "Cargar antropometría ISAK":
   - Validaciones sin guardar: dejar la talla vacía → "La talla es obligatoria para el estudio
     ISAK"; tríceps 110 → "Revisá el valor: los pliegues van de 1 a 80 mm"; talla 164 y sentado
     170 → "La talla sentado no puede ser mayor que la talla".
   - Cargar el **caso A**. Al terminar los 8 pliegues: "Σ 6 pliegues: 71,0 mm · Σ 8 pliegues:
     94,0 mm". Guardar.
   - Tarjeta: "Adiposo 27,02 % · Muscular 47,49 % · Óseo 16,95 % · Residual 8,54 %",
     "Somatotipo 4,03 – 5,69 – 1,92 (Endo-mesomorfo) · IMO 2,80" + "Medio", "Σ 6 pliegues 71,0 mm
     (−9,5 respecto del 05/11/2025)".
   - "Mediciones": en Antropometría, "Antropometría ISAK · ver estudio" (sin tacho); en
     Bioimpedancia, la de 17 %.
   - Lista de consultas: chip "Antropometría" (y "Bioimpedancia") en la del 08/05. Evolución:
     peso 61, cintura 73, cadera 88 con fecha 08/05/2026.
   - "Diagnóstico antropométrico" de la consulta: IMC 22,7 "Normal", ICC 0,83, cintura/talla
     0,45, conicidad 1,10 (con los datos del estudio).
6. "Ver estudio completo". **Comparar pantalla contra la HU (caso A) número por número:**
   - Encabezado "Consulta del 08/05/2026 · 22 años · Masculino"; "Comparado con el estudio del
     05/11/2025 (184 días antes)".
   - Medidas: los 21 valores y Z de la tabla del Gherkin (masa **0,42**, D7; el resto igual);
     columnas Anterior (caso B) y Dif. (p. ej. masa 67,6 / −6,6; tríceps 12,0 / −1,0). Barras Z
     recortadas en ±3.
   - Composición: 10,73 / 17,59 / −0,04 y 50,27 / 82,41; 16,48 / 27,02 / −1,23 · 28,97 / 47,49 /
     2,28 · 10,34 / 16,95 / 0,68 · 5,21 / 8,54 / −5,57; barra apilada con 4 colores y leyenda.
   - Distribución: 30,99 / 45,07 / 23,94 y 24,79 / 44,99 / 30,23.
   - Índices: IAM 0,57 con la interpretación; IMO 2,80 "Medio"; desplegable con la tabla.
   - Adiposidad y muscularidad: 71,0 / 94,0; 26,74 (2,99) · 48,54 (**0,84**, D5; ISAKMetry dice
     0,17) · 32,62 (1,84); 1,8.
   - Proporcionalidad: 0,51 "Metricórmico (tronco medio)"; 98 "Miembros inferiores largos"; 1,02
     "Envergadura mayor a la talla".
   - Somatotipo: 4,03 / 5,69 / 1,92, "Endo-mesomorfo"; somatocarta con "Actual" en (−2,12;
     5,43) y "Anterior" en (−3,94; 5,48), leyenda y tooltip.
   - Salud: IMC 22,7 Normal, ICC 0,83 Sin riesgo aumentado, cintura/talla 0,45 y conicidad 1,10
     En rango saludable (mismos `Badge` que el diagnóstico), IDG 0,65 con su interpretación.
   - Pie "Métodos: …".
   - En la consulta del 05/11 (caso B): residual 9,25 (Z −3,20), muscular Z 2,76, óseo Z 0,53,
     adiposo Z **−0,94** (D6; el Excel dice 2,44), IDG 0,50 (10.1.1). Sin línea de comparación.
7. "Editar" (desde la página) → vuelve a la consulta con el formulario abierto y los valores
   cargados → tríceps 12 → guardar → el estudio recalcula (Σ6 72,0; ver que cambian adiposo,
   muscular y endomorfia). "Cancelar" con cambios → "¿Descartar los cambios del estudio?".
8. "Borrar estudio" (consulta del 08/05) → "¿Borrar el estudio ISAK de esta consulta?" →
   confirmar → vuelve el estado vacío; la medición de bioimpedancia 17 % **sigue**.
9. Falta sexo: `update "Patient" set sex = null where id = 'hu006_walk_a';` → en el estudio del
   05/11: aviso "Faltan datos para los cálculos: sexo." con "Completar datos para cálculos"
   (abrir y **cerrar sin guardar**); MG y muscular "Falta sexo"; residual, IAM e IMO "Sin dato
   (falta tejido muscular)"; adiposo y óseo con valor.
10. Menor: `update "Patient" set sex='MALE', "birthDate"='2013-06-01' where id = 'hu006_walk_a';`
    → en el estudio del 05/11 (12 años): `Alert` "Las fórmulas de composición corporal son para
    adultos.", sin "Composición corporal" ni "Índices de composición corporal"; Salud solo con el
    IMC sin clasificar.
11. Incompleto: nueva consulta propia con solo masa, talla y 8 pliegues del caso A → "Sin dato
    (falta biestiloideo, fémur)" en óseo, somatotipo con "Sin dato (falta mesomorfia)", Σ6/Σ8 y
    adiposo con valor.
12. `select count(*) from "OutboundMessage" where "toJid" = 'hu006-walk@test.invalid';` → 0.

Limpieza (por id propio; la cascada se lleva consultas y mediciones de **ese** paciente):
```sql
delete from "Patient" where id = 'hu006_walk_a';
```

---

## 13. Restricciones para el implementer (obligatorias)

1. **Datos de desarrollo:** ningún dato de negocio preexistente se borra ni cambia. Las únicas
   escrituras son la migración (aditiva) y `test-isak.ts`, que limpia por id.
2. **Prisma:** `pg_dump` antes; `--create-only` y revisar el SQL; nada de `migrate reset`, `db
   push` ni aceptar el reset por drift. Drift → `blocked` con `migrate status`.
3. **WhatsApp:** nada. Ningún script usa Baileys ni encola en `OutboundMessage`.
4. **Lógica:** fórmulas, constantes, clasificaciones, textos y validación en `packages/core`;
   lectura y escritura del estudio en `packages/db/domain/isak.ts`. La web no recalcula nada por
   su cuenta. IMC, ICC, cintura/talla y conicidad salen de `buildAnthropometricDiagnosis` (HU-004),
   **no se reimplementan**.
5. **`useConfirm`:** nunca `await confirm()` dentro de `<form action>` ni de `startTransition`.
6. **UI:** solo el sistema de diseño actual; `tailwind.config.ts` no se toca; los colores de la
   barra y la somatocarta son hex que ya están en `chart-theme.ts`.
7. **Material ISAKMetry:** no se versiona, no se copia, no se imprime el nombre. Los tests usan
   los números de la HU y el caso C.
8. **No** correr `next build` ni levantar otro `next dev`. Avisar en `progress/impl_HU-006.md` que
   hay que reiniciar el `next dev` del usuario.
9. **Rama** `hu-006-antropometria-isak`, sin commitear, sin tocar `backlog.json`.

## 14. Fuera de alcance (no implementar)

Todo lo de "Fuera de alcance" de la HU: el informe PDF y sus gráficos (tortas, figura del cuerpo,
contorno curvo de la somatocarta, textos por componente del somatotipo: HU-007), pediatría
(HU-008), ArgoRef y el modelo de cinco componentes, bilaterales (D3), repeticiones y ETM (D4),
importar el historial de ISAKMetry (D19), gráficos de las medidas nuevas en Evolución y estudios
por tipo (épica 9), categoría del índice adiposo muscular (D8), rango del índice de distribución
grasa (D11), campo de etnia (D14), mostrar resultados ISAK en el portal.
