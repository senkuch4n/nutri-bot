# SDD: HU-005 `base-alimentos-sara2` (épica 20)

HU validada: `docs/hu-base-alimentos-sara2.md`. **Su sección "Resoluciones" manda:** se aceptan
D1 a D16 tal como las recomendó el afinador. Esta SDD las baja a código.

Skills aplicados: `migracion-prisma` (sección 4) y `ui` (sección 9).

Rama: `hu-005-base-alimentos-sara2` (ya es la rama actual). **No se commitea.** El orquestador hace
el recorrido (sección 14).

> ## ⚠ Estado: BLOQUEADA por 2 preguntas técnicas (sección 16)
>
> Medí el PDF entero con el lector que propone esta SDD (prototipo en el scratchpad, sección 3).
> **Con las reglas de D6 al pie de la letra, la importación da "fallida"**: 85 de las 906 filas
> de las tablas 1 a 25 (9,4 %) quedan fuera del rango 97–103 g de la suma de macros o de Atwater,
> y el freno del 5 % impide cargar nada. No es un problema del lector: los valores leídos
> coinciden con el PDF (se verificaron a mano Palta, Galletitas de agua PROMEDIO, Soja, Yogur
> descremado, Margarina). Además, **237 filas no tienen cenizas** (celda vacía real en la parte
> B), así que la suma "con cenizas" no se puede calcular en ellas.
>
> La sección 16 trae las opciones con números medidos y una **recomendación por defecto (Q1-b)**.
> Todo el resto de la SDD ya está escrito con esa recomendación: si el orquestador la acepta,
> alcanza con marcar Q1 y Q2 como resueltas y pasar a `arquitectura_lista`. Si elige otra opción,
> cambia **solo** la constante `SARA2_VALIDATION` (sección 5.1.6) y los números esperados de las
> secciones 3.5, 13 y 14.

---

## 1. Resumen funcional

Se carga la tabla oficial SARA 2 (Ministerio de Salud, 2022) como alimentos con fuente "SARA 2",
en dos pasos: un **lector** de desarrollo lee el PDF con `pdftotext -bbox`, valida cada fila
(Atwater y suma de macros) y escribe un **JSON versionado** más un **reporte** en Markdown; un
**cargador** idempotente hace upsert por clave de origen en la base (desarrollo o producción),
sin tocar los alimentos propios y sin borrar. `Food` suma fuente, clave de origen, referencia,
alcohol, sodio, azúcar agregado, grasas saturadas, colesterol y una columna JSON con el resto de
los 39 componentes. El enum `FoodGroup` pasa de 10 a 27 grupos: la migración mapea los viejos en
el mismo SQL (D2), y los 90 alimentos existentes conservan id y valores, pasan a "Propio" y quedan
marcados para revisar el grupo. Las kcal pasan a ser Atwater (4/4/9/7) con desglose: los propios
nuevos o editados las calculan solas; los viejos muestran un aviso con "Usar X kcal" (D1). Un
alimento SARA 2 no se edita: se activa/desactiva o se duplica como propio. La lista `/alimentos`
suma filtros de fuente e inactivos y pagina; el editor de comidas cambia el `<select>` por un
combobox con búsqueda y muestra el desglose de kcal de cada ítem en un popover. El asistente de
IA recibe el catálogo en formato compacto. El bot y el portal no cambian.

---

## 2. Workspaces afectados

| Workspace | ¿Se toca? | Qué |
|---|---|---|
| `packages/core` | **Sí** | Nuevos: `food-groups.ts`, `food-nutrients.ts`, `food-search.ts`, `es-ar-number.ts`, `ai-food-catalog.ts`, carpeta `sara2/` (lector puro), cada uno con tests. Se amplía `nutrition.ts` (Atwater y desglose). Export nuevo `"./sara2"` en `package.json` |
| `packages/db` | **Sí** | `schema.prisma` (enum `FoodSource`, `FoodGroup` de 27 valores, columnas nuevas en `Food`), 1 migración, `domain/foods.ts` (reescrito), `domain/foodImport.ts` (nuevo), `prisma/seed.ts` (grupos), scripts `scripts/sara2/read-pdf.ts`, `scripts/sara2/load.ts`, `scripts/test-foods-sara2.ts`, datos `data/sara2/alimentos.json` y `data/sara2/reporte.md` |
| `apps/web` | **Sí** | `/alimentos` (lista, ficha, nuevo, actions), `meals-editor.tsx` (combobox + popover), `meal-view.ts`, `lib/food-groups.ts`, `ai-actions.ts`, páginas de plan y plantilla (mapeo de `foods`), `data-table.tsx` (paginación opcional), primitivo `popover.tsx` (dependencia nueva `@radix-ui/react-popover`) |
| `apps/bot` | **No** (solo tiene que compilar) | No usa `Food`. Comparte el cliente Prisma: `npm run typecheck` tiene que pasar |

El portal (`(portal)`) no se toca: `toMealView` suma un campo que el portal ignora.
`tailwind.config.ts` no se toca: no hay colores nuevos.

---

## 3. El PDF y la estrategia del lector (medido, no supuesto)

### 3.1 Qué se midió

Con `pdftotext -layout` (poppler 26.09) y con `pdftotext -bbox` / `pymupdf` sobre las 142
páginas. Resultados:

- **Las tablas van de la página 18 a la 139**, alternando A (página par) y B (página impar). Las
  páginas 92, 99, 122 y 139 tienen A y B en la misma página.
- **El texto está rotado 90°** dentro de páginas A4 verticales (`rot: 0`): las filas de la tabla
  avanzan en `x` creciente y las columnas en `y` decreciente. `-layout` las "endereza", pero
  pierde precisión vertical (ver 3.2).
- **El ancla confiable no es el título, es el renglón de unidades.** Cada sección tiene un
  renglón con solo unidades: **20 tokens** en las A (`Kcal g g g mg g g g g g g g g g g g g g g g`)
  y **19** en las B (`g mg mg mg mg mg mg mg mg mg µg µg µg µg mg mg µg mg µg`). Aparece en
  **todas** las secciones (122 páginas, 4 con dos secciones). La cantidad define A o B.
- **Títulos no confiables** (confirmado): "Tabla 5A" (sin punto) para A **y** para B de yogures;
  "Tabla 16.B" en la B de azúcares (p. 105, debería ser 12); "Tabla19.B" sin espacio; "tabla
  9.A" en minúscula; mayúsculas ("ACEITES, MACRONUTRIENTES"); 13.A se repite sin
  "(continuación)" (p. 110); en la p. 92 la sección A está debajo de un título "Tabla 7.B …". El
  título solo aporta **el número de tabla**, y solo el de la sección A.
- **Decimales con coma**, sin separador de miles en ninguna celda (sodio de la sal: `38758`,
  potasio de sal modificada: `52300`). **Una sola celda con punto:** `0.121` en "Salvado de
  avena" (p. 58), que es un error de tipeo de la tabla.
- **Celdas vacías reales:** en la parte A solo en 4 columnas (linoleico, ALA, araquidónico, CHO
  totales; 10 celdas en total). En la B, **cenizas vacía en 237 de las 905 filas** de las tablas
  1–25, y otras 60 celdas sueltas. Kcal, proteínas, lípidos y CHO disponibles nunca vienen vacíos.
- **Nombres en varios renglones** (hasta 5): el bloque de renglones del nombre está **centrado
  verticalmente** sobre el renglón de números. Casos: prefijo + (nombre y números) ("Ají verde o
  amarillo / morrón verde" / "o amarillo, crudo 17 93,9 …"); prefijo / números solos / sufijo
  (en las B: "… morrón verde o" / `0,43 3 175 …` / "amarillo, crudo"); corte con guion en
  minúscula ("des-" / "cremada", "consu-" / "mir") y en mayúscula ("PRO-" / "MEDIO"); marcas de
  nota al pie pegadas al nombre ("semigrasos***,"); notas al pie debajo de la tabla ("*ej:
  asado, vacío…").
- **Columnas "cortadas"**: con `-layout` a 400 caracteres de ancho las columnas de la derecha
  quedan alineadas pero lejos del nombre; con coordenadas no hay corte.
- **Pie y encabezado de página** ("18 SARA 2: Tabla de composición…", "19 ENNYS 2").

### 3.2 Estrategias comparadas (mismo PDF completo)

| Estrategia | Filas A / B leídas | A sin pareja en B | Problemas |
|---|---|---|---|
| `-layout` + nombre = texto a la izquierda | 945 / 979 | 72 | pierde palabras que caen en la zona de números ("patitas de getales", "varios bores"); mezcla sufijos y prefijos de nombres vecinos |
| `-layout` + partición óptima de renglones | 930 / 929 | 7 | con granularidad de renglón, el nombre de 2 renglones con los números en el 2º se asigna mal ("Ají verde…"); "McNuggets x 10" toma el 10 como valor |
| **`-bbox` (coordenadas) + partición óptima** | **930 / 929** | **1** (real) | ninguno de lector. Idéntico con `pymupdf` (0 diferencias en 1.859 filas) |

**Elegida: `pdftotext -bbox` + partición óptima de renglones de nombre.** Justificación: es la
única que resuelve los nombres partidos por geometría (centro vertical) y no por heurística de
texto; usa la misma herramienta del sistema (poppler) que `-layout`, sin Python; la salida
(XHTML con `<word xMin yMin xMax yMax>`) es texto, así que los tests usan **fragmentos reales**
de esa salida.

### 3.3 Algoritmo (lo implementa `packages/core/src/sara2/`, puro)

1. **Palabras** (`parseBboxXhtml`): cada `<page width height>` y sus `<word>` (con
   `&amp;`/`&lt;`/`&gt;`/`&quot;`/`&#39;` decodificados).
2. **Marco de lectura** (`toReadingFrame`): `u0 = height − yMax`, `u1 = height − yMin` (eje de
   columnas, izquierda→derecha), `v0 = xMin`, `v1 = xMax` (eje de filas, arriba→abajo). Centro
   `uc`, `vc`.
3. **Renglones**: agrupar palabras por `vc` con tolerancia **1,5 pt** (orden por `u`).
4. **Encabezados de sección**: renglón cuyos tokens son todos unidades (`Kcal|kcal|g|mg|µg`),
   con ≥ 19 tokens y el primero `Kcal`/`kcal` o `g`. 20 → parte A; 19 → parte B. Se exige la
   secuencia exacta de unidades de `SARA2_A_COLUMNS` / `SARA2_B_COLUMNS` (5.1.6); si no coincide,
   error de lector (la sección entera va al reporte como `COLUMNAS`).
5. **Títulos**: renglón que matchea `/tabla\s*(\d+)\s*\.?\s*([AB])?/i` y contiene
   "macronutrientes" o "vitaminas" (sin importar mayúsculas). El título de una sección es el
   último título arriba de su encabezado. La **región** de la sección va desde el encabezado
   hasta el próximo título (o el fin de la página).
6. **Tokens de valor**: dentro de la región, token con `/^-?[\d.,]*\d[\d.,]*$/` y `uc ≥ u0 del
   primer encabezado − 12 pt`. Se asigna a la columna de encabezado con centro `u` más cercano.
   Dos tokens en la misma columna de una fila → fila rechazada `COLUMNAS`.
7. **Filas numéricas**: tokens de valor agrupados por `vc` con tolerancia **2,5 pt**.
8. **Renglones de nombre**: el resto de las palabras de la región, agrupadas en renglones
   (1,5 pt). Se descartan: renglones que contienen "ENNYS" o "SARA 2:", renglones que empiezan
   con `*` (notas al pie), y renglones a más de 40 pt por arriba de la primera fila o por debajo
   de la última.
9. **Partición óptima** (`assignNameLines`): se reparten los renglones de nombre (ordenados por
   `v`) en grupos **contiguos y en orden**, uno por fila numérica, minimizando
   `Σ |centro(grupo) − v(fila)|`, con `centro = (v primer renglón + v último) / 2`. Restricciones:
   ≤ 6 renglones por grupo; dos renglones consecutivos del grupo a ≤ 14 pt. Un grupo vacío se
   permite con costo 1000 (la fila queda sin nombre y se rechaza `NOMBRE_ILEGIBLE`).
   Programación dinámica O(renglones × filas × 6). Medido: costo máximo por fila 5,4 pt; si una
   fila supera 8 pt, advertencia en el reporte.
10. **Unir el nombre** (`joinNameLines`): si el acumulado termina en `letra-` y el renglón
    siguiente empieza con letra, se quita el guion y se pega sin espacio ("des-"+"cremada" →
    "descremada", "PRO-"+"MEDIO" → "PROMEDIO"); si no, se une con un espacio. Después: quitar
    los `*`, colapsar espacios, `" ,"` → `","`, `trim`.
11. **Número de tabla**: el del título de la sección A. Cada B se empareja con **la sección A
    inmediatamente anterior** en orden de documento y hereda su número; si el título de la B
    dice otro número (p. 105: "16.B"), advertencia `TITULO_B_DISTINTO`. Los números de tabla de
    las A tienen que ser no decrecientes (error de lector si no).
12. **Emparejar A con B** (`pairSections`): dentro de cada par (sección A, sección B siguiente),
    por **clave de emparejamiento** = nombre sin tildes, en minúsculas, sin `"- "` entre letras,
    sin nada que no sea `[a-z0-9%]`. El nombre que se guarda es **el de la A**. Fila A sin B →
    `SIN_PAREJA_B`; fila B sin A → `SIN_PAREJA_A`. Nombre repetido dentro del par → las dos filas
    `CLAVE_DUPLICADA`.
13. **Tabla 26**: todas sus filas (A y B) van a "excluidas" con el motivo
    `excluidas: no vienen cada 100 g` (D7), antes de validar.
14. **Validar** cada par (`validateSaraPair`, sección 5.1.6) y armar el resultado
    (`readSara2`).

### 3.4 Resultados medidos con este algoritmo (prototipo)

| Medida | Valor |
|---|---|
| Secciones encontradas | 61 A + 61 B (tablas 1 a 26), todas con su par |
| Filas A de las tablas 1–25 | **906** |
| Filas B de las tablas 1–25 | 905 |
| Emparejadas por nombre | **905** (99,9 %). La única A sin B es "Salmón blanco, crudo" (p. 97): **la fila no está en la parte B del PDF** |
| Excluidas (tabla 26) | 24 |
| Nombres rotos (terminan en `-`, empiezan en minúscula, `*`) | 0 |
| Número con formato inválido | 1: `0.121` en "Salvado de avena" (p. 58) → se rechaza, no se corrige |

### 3.5 Criterio de éxito medible (lo chequea el lector y lo repite el implementer)

El lector sale con código 0 y escribe el JSON **solo si** se cumplen todos:

| # | Criterio | Esperado con Q1-b |
|---|---|---|
| L1 | Secciones: 61 A y 61 B, cada A con su B, tablas 1–26 presentes | 61 / 61 |
| L2 | Filas A de las tablas 1–25 emparejadas con su B | ≥ 99 % (medido 905/906) |
| L3 | **Filas A de las tablas 1–25 importadas y validadas** | **≥ 95 %** (medido 889/906 = **98,1 %**); el resto en el reporte con su motivo |
| L4 | Nombres importados rotos (`/-$/`, `/^[a-záéíóúñ]/`, `*`, longitud < 2) | 0 |
| L5 | Filas excluidas de la tabla 26, listadas en el reporte | 24 |
| L6 | Rechazo total (freno de D6) | ≤ 5 % (medido 17/906 = 1,9 %) |

Y el implementer verifica a mano en el JSON (sección 13): "Arroz blanco, hervido" (P 2,4 · CHO
28,6 · G 0,2 · `kcalPer100` 125,8 · `kcalPublicada` 126); "Sal dietética o modificada,
PROMEDIO"; "Bebida láctea parcialmente descremada fluida, baja en lactosa, fortificada con
vitaminas A, D, B2, B9 y Zinc"; "Vacuno, cortes semigrasos, PROMEDIO, crudo"; "Ají verde o
amarillo / morrón verde o amarillo, crudo"; "Queso Cremoso" (310,3 kcal); "Limón"; "Cerveza con
alcohol" (alcohol 3,9 g → 7 × 3,9 = 27,3 kcal en el desglose).

Rechazos esperados con Q1-b (17): Atwater 6 (Banana 92 vs 88,2; Durazno enlatado light 43 vs
21,5; Facturas rellenas 339 vs 369,3; Harina de maíz hervida 108 vs 101,6; Caramelos duros light
236 vs 394,4; Mayonesa light 270 vs 214,6); suma fuera de 90–110 g 9 (Capelettis frescos
artesanal crudo 112,8; Ravioles frescos artesanal crudos 112,8; Yogur descremado 88,9; Yogur
descremado bebible 87,9; Vizcacha cruda 111,9; Chicles sin azúcar 70,6; Medallón de menta y
chocolate 114,9; Margarina 80,5; Jugo en polvo light 73,0); `SIN_PAREJA_B` 1 (Salmón blanco,
crudo); `NUMERO_INVALIDO` 1 (Salvado de avena). Advertencias: 68 filas con suma fuera de 97–103
(dentro de 90–110) y 237 sin cenizas.

---

## 4. Esquema (Prisma) y migración: skill `migracion-prisma`

### 4.1 El enum `FoodGroup`: por qué se reemplaza y no se conservan los valores viejos

Opciones evaluadas:

1. **Conservar los 10 valores viejos y agregar 17** (solo `ALTER TYPE … ADD VALUE`). No es
   destructivo, pero deja valores "fantasma" (`LACTEOS`, `CARNES_Y_HUEVOS`, `CEREALES`…) que
   `Record<FoodGroup, string>` obliga a etiquetar, que zod tiene que excluir a mano, que el
   selector no debe ofrecer y que un propio podría seguir teniendo. Además, Postgres no deja usar
   en la misma transacción un valor recién agregado con `ADD VALUE`, así que el mapeo de D2
   tendría que ir en otra migración. Descartada.
2. **Enum nuevo con otro nombre** (`FoodGroupSara`) y columna nueva + backfill + borrar la vieja:
   tres pasos, un rename de columna y un período con dos columnas de grupo. Descartada: más
   superficie para lo mismo.
3. **Elegida: reemplazar el tipo `FoodGroup` en una sola transacción**, con el patrón que
   genera Prisma (`CREATE TYPE "FoodGroup_new"` → `ALTER COLUMN … TYPE … USING` → rename →
   `DROP TYPE` viejo), **editando el `USING` para mapear cada valor viejo** (D2). Es atómica: si
   algún valor no mapeara, el `CASE` sin `ELSE` devuelve `NULL`, la columna `NOT NULL` hace fallar
   el `ALTER` y la transacción entera se revierte. Ningún alimento pierde id ni datos; el grupo
   cambia solo según la tabla de D2. Los nombres viejos se van del tipo porque ya no los usa
   ninguna fila.

**Trampa que el implementer tiene que evitar:** Prisma genera
`USING ("group"::text::"FoodGroup_new")`. Eso **falla** con `CEREALES`, `LACTEOS`, etc. (no
existen en el tipo nuevo) y, peor, **manda `GRASAS` viejo a `GRASAS` nuevo** (tabla 14: manteca,
margarina, crema) en vez de a `ACEITES` como pide D2. Por eso el `USING` se reescribe entero con el
`CASE` de 4.3.

### 4.2 Cambios en `packages/db/prisma/schema.prisma`

Reemplazar el `enum FoodGroup` y el `model Food` por:

```prisma
/// Grupos de SARA 2 (tablas 1 a 26) + OTROS (solo propios). El orden es el de la tabla.
enum FoodGroup {
  VERDURAS
  FRUTAS
  LEGUMBRES_CEREALES
  LECHE_Y_POSTRES
  YOGURES
  QUESOS
  CARNES
  HUEVOS
  PESCADOS_Y_MARISCOS
  ACEITES
  FRUTAS_SECAS_Y_SEMILLAS
  AZUCARES_MERMELADAS_Y_DULCES
  GOLOSINAS_Y_CHOCOLATES
  GRASAS
  SNACKS_SALADOS
  ADEREZOS
  CALDOS_Y_SOPAS
  POSTRES_Y_HELADOS
  SALES
  BEBIDAS_CON_AZUCAR
  BEBIDAS_SIN_AZUCAR
  BEBIDAS_ALCOHOLICAS_Y_ENERGIZANTES
  BEBIDAS_DE_FRUTAS
  INFUSIONES
  COMIDAS_RAPIDAS
  SUPLEMENTOS
  OTROS
}

enum FoodSource {
  SARA2
  PROPIO
}

model Food {
  id                  String     @id @default(cuid())
  name                String
  group               FoodGroup
  /// SARA2 = dato oficial (no se edita, D3). PROPIO = cargado por la profesional.
  source              FoodSource @default(PROPIO)
  /// Solo SARA2, único: "sara2:t03:arroz-blanco-hervido". Lo usa el cargador para el upsert (D14).
  sourceKey           String?    @unique
  /// Solo propios: marca, rótulo, de dónde salió el dato (D13).
  reference           String?
  /// true = el grupo lo asignó la migración de la HU-005 (D2); se apaga al guardar el propio.
  groupAutoAssigned   Boolean    @default(false)
  /// SARA2: Atwater calculado sobre los valores guardados (D5). Propio nuevo/editado: Atwater.
  /// Propio anterior a la HU-005: el valor cargado a mano, hasta que ella lo cambie (D1).
  kcalPer100          Decimal    @db.Decimal(6, 2)
  proteinPer100       Decimal    @db.Decimal(5, 2)
  /// Carbohidratos DISPONIBLES (sin fibra), como SARA 2 y el rótulo argentino (D15).
  carbsPer100         Decimal    @db.Decimal(5, 2)
  fatPer100           Decimal    @db.Decimal(5, 2)
  fiberPer100         Decimal?   @db.Decimal(5, 2)
  alcoholPer100       Decimal?   @db.Decimal(5, 2)
  sodiumMgPer100      Decimal?   @db.Decimal(8, 2)
  addedSugarPer100    Decimal?   @db.Decimal(5, 2)
  saturatedFatPer100  Decimal?   @db.Decimal(6, 3)
  cholesterolMgPer100 Decimal?   @db.Decimal(7, 2)
  /// Resto de los 39 componentes + kcalPublicada (D4, D5). Claves fijas: FOOD_EXTRA_NUTRIENTS
  /// de packages/core. null = propio sin estos datos.
  nutrients           Json?
  unitHint            String?
  active              Boolean    @default(true)
  createdAt           DateTime   @default(now())
  updatedAt           DateTime   @updatedAt

  planItems     PlanMealItem[]
  templateItems TemplateMealItem[]

  @@index([group])
  @@index([source, active])
}
```

Escalas (medidas sobre el PDF, tablas 1–25): kcal máx. 900; macros máx. 100,00 con 2 decimales
(las columnas existentes alcanzan); saturadas máx. 82,48 con 3 decimales → `(6,3)`; sodio máx.
40.000 mg → `(8,2)`; colesterol máx. 3.100 mg → `(7,2)`; azúcar agregado 1 decimal y alcohol 2
decimales, máx. 99,8 y 42,5 → `(5,2)`. Las columnas existentes **no cambian de tipo**.

### 4.3 La migración: `food_sara2`

Proceso (desde `packages/db`, sin `migrate reset`, sin `db push`, sin aceptar el reset por drift):

```bash
# 0. estado limpio (si dice drift o migraciones pendientes: PARAR y reportar blocked)
npx dotenv -e ../../.env -- prisma migrate status
# 1. respaldo (fuera del repo) y foto de los 90 alimentos
mkdir -p ~/nutribot-backups
docker compose -f ../../docker-compose.yml exec -T db pg_dump -U nutri -d nutribot -Fc > ~/nutribot-backups/pre-hu005-$(date +%Y%m%d-%H%M%S).dump
docker compose -f ../../docker-compose.yml exec -T db pg_restore --list < "$(ls -t ~/nutribot-backups/pre-hu005-*.dump | head -1)" | head -5   # el dump se lee
docker compose -f ../../docker-compose.yml exec -T db psql -U nutri -d nutribot -At -c 'select id,name,"kcalPer100","proteinPer100","carbsPer100","fatPer100","fiberPer100","unitHint",active,"group" from "Food" order by id' > ~/nutribot-backups/foods-before-hu005.txt
# 2. editar schema.prisma (4.2) y crear la migración SIN aplicarla
npx dotenv -e ../../.env -- prisma migrate dev --create-only --name food_sara2
```

Si `--create-only` se niega por las advertencias de pérdida de datos del enum (entorno no
interactivo), generar el SQL con
`npx dotenv -e ../../.env -- prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script`
(solo lee la base), crear a mano la carpeta `prisma/migrations/<AAAAMMDDhhmmss>_food_sara2/` y
pegar el SQL de abajo en `migration.sql`.

**El `migration.sql` final tiene que quedar así** (el generado se reemplaza por este; se revisa
contra el schema antes de aplicar). Todo en **una** transacción:

```sql
-- HU-005: fuente SARA 2 / Propio, 27 grupos y nutrientes nuevos en "Food".
-- Editado a mano: mapeo de grupos viejos (D2) y backfill. Todo o nada.
BEGIN;

-- CreateEnum
CREATE TYPE "FoodSource" AS ENUM ('SARA2', 'PROPIO');

-- AlterEnum: FoodGroup de 10 a 27 valores. NO usar "group"::text::"FoodGroup_new":
-- falla con los valores viejos y mandaría GRASAS (aceites, palta, nueces) a GRASAS (tabla 14).
CREATE TYPE "FoodGroup_new" AS ENUM (
  'VERDURAS', 'FRUTAS', 'LEGUMBRES_CEREALES', 'LECHE_Y_POSTRES', 'YOGURES', 'QUESOS', 'CARNES',
  'HUEVOS', 'PESCADOS_Y_MARISCOS', 'ACEITES', 'FRUTAS_SECAS_Y_SEMILLAS',
  'AZUCARES_MERMELADAS_Y_DULCES', 'GOLOSINAS_Y_CHOCOLATES', 'GRASAS', 'SNACKS_SALADOS',
  'ADEREZOS', 'CALDOS_Y_SOPAS', 'POSTRES_Y_HELADOS', 'SALES', 'BEBIDAS_CON_AZUCAR',
  'BEBIDAS_SIN_AZUCAR', 'BEBIDAS_ALCOHOLICAS_Y_ENERGIZANTES', 'BEBIDAS_DE_FRUTAS', 'INFUSIONES',
  'COMIDAS_RAPIDAS', 'SUPLEMENTOS', 'OTROS'
);
ALTER TABLE "Food" ALTER COLUMN "group" TYPE "FoodGroup_new" USING (
  (CASE "group"::text
    WHEN 'CEREALES'          THEN 'LEGUMBRES_CEREALES'
    WHEN 'LEGUMBRES'         THEN 'LEGUMBRES_CEREALES'
    WHEN 'LACTEOS'           THEN 'LECHE_Y_POSTRES'
    WHEN 'CARNES_Y_HUEVOS'   THEN 'CARNES'
    WHEN 'FRUTAS'            THEN 'FRUTAS'
    WHEN 'VERDURAS'          THEN 'VERDURAS'
    WHEN 'GRASAS'            THEN 'ACEITES'
    WHEN 'AZUCARES_Y_DULCES' THEN 'AZUCARES_MERMELADAS_Y_DULCES'
    WHEN 'BEBIDAS'           THEN 'BEBIDAS_SIN_AZUCAR'
    WHEN 'OTROS'             THEN 'OTROS'
  END)::"FoodGroup_new"
);
ALTER TYPE "FoodGroup" RENAME TO "FoodGroup_old";
ALTER TYPE "FoodGroup_new" RENAME TO "FoodGroup";
DROP TYPE "FoodGroup_old";

-- AlterTable: todas nullable o con default (la tabla tiene filas).
ALTER TABLE "Food"
  ADD COLUMN "source"              "FoodSource" NOT NULL DEFAULT 'PROPIO',
  ADD COLUMN "sourceKey"           TEXT,
  ADD COLUMN "reference"           TEXT,
  ADD COLUMN "groupAutoAssigned"   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "alcoholPer100"       DECIMAL(5,2),
  ADD COLUMN "sodiumMgPer100"      DECIMAL(8,2),
  ADD COLUMN "addedSugarPer100"    DECIMAL(5,2),
  ADD COLUMN "saturatedFatPer100"  DECIMAL(6,3),
  ADD COLUMN "cholesterolMgPer100" DECIMAL(7,2),
  ADD COLUMN "nutrients"           JSONB;

-- Backfill (D2): todo alimento que existía antes de esta HU tiene el grupo asignado por la migración.
UPDATE "Food" SET "groupAutoAssigned" = true;

-- Coherencia fuente <-> clave de origen (Prisma no modela CHECK; no genera drift).
ALTER TABLE "Food" ADD CONSTRAINT "Food_source_sourceKey_check"
  CHECK (("source" = 'SARA2') = ("sourceKey" IS NOT NULL));

-- CreateIndex
CREATE UNIQUE INDEX "Food_sourceKey_key" ON "Food"("sourceKey");
CREATE INDEX "Food_source_active_idx" ON "Food"("source", "active");

COMMIT;
```

Revisión del SQL antes de aplicar (checklist del implementer): no hay `DROP COLUMN` ni
`DROP TABLE`; el único `DROP` es `DROP TYPE "FoodGroup_old"` después del rename; el `CASE` cubre
los 10 valores viejos; `GRASAS → ACEITES`; ninguna columna existente cambia de tipo.

Aplicar y regenerar:

```bash
cd /Users/joelmiguelserrudo/Documents/Projects/Nutri-Bot
npm run db:migrate      # aplica la pendiente; si ofrece reset o detecta drift: NO aceptar, parar
npm run db:generate
```

Chequeo posterior (solo lectura):

```sql
select "group", count(*) from "Food" group by 1 order by 1;
-- esperado: ACEITES 9, AZUCARES_MERMELADAS_Y_DULCES 9, BEBIDAS_SIN_AZUCAR 9, CARNES 9, FRUTAS 9,
--           LECHE_Y_POSTRES 9, LEGUMBRES_CEREALES 18, OTROS 9, VERDURAS 9  (total 90, GRASAS 0)
select source, "groupAutoAssigned", count(*) from "Food" group by 1,2;   -- PROPIO | t | 90
```
y la foto: repetir el `psql -At … order by id` **sin la columna `group`** antes y después
(cortar la última columna con `cut -d'|' -f1-9`) → `diff` vacío.

Producción: `prisma migrate deploy` aplica la misma migración (el `CASE` no depende de nombres,
D2). **Reiniciar el `next dev`** después del `db:generate` lo hace el orquestador, no el
implementer.

### 4.4 Filas existentes

| Columna nueva | Filas existentes |
|---|---|
| `source` | `PROPIO` por el default |
| `groupAutoAssigned` | `true` por el `UPDATE` |
| `sourceKey`, `reference`, nutrientes nuevos, `nutrients` | `NULL` ("sin dato") |
| `kcalPer100` | **no cambia** (D1) |

---

## 5. Contrato compartido

Nombres de campo exactos. "Consume" = quién la importa.

### 5.1 `packages/core`

#### 5.1.1 `src/food-groups.ts` (nuevo, exportado desde `src/index.ts`) — web, db

```ts
export const FOOD_GROUP_VALUES = [
  "VERDURAS", "FRUTAS", "LEGUMBRES_CEREALES", "LECHE_Y_POSTRES", "YOGURES", "QUESOS", "CARNES",
  "HUEVOS", "PESCADOS_Y_MARISCOS", "ACEITES", "FRUTAS_SECAS_Y_SEMILLAS",
  "AZUCARES_MERMELADAS_Y_DULCES", "GOLOSINAS_Y_CHOCOLATES", "GRASAS", "SNACKS_SALADOS",
  "ADEREZOS", "CALDOS_Y_SOPAS", "POSTRES_Y_HELADOS", "SALES", "BEBIDAS_CON_AZUCAR",
  "BEBIDAS_SIN_AZUCAR", "BEBIDAS_ALCOHOLICAS_Y_ENERGIZANTES", "BEBIDAS_DE_FRUTAS", "INFUSIONES",
  "COMIDAS_RAPIDAS", "SUPLEMENTOS", "OTROS",
] as const;
export type FoodGroupKey = (typeof FOOD_GROUP_VALUES)[number];

/** Etiqueta completa (tooltip, ficha, selector del formulario). */
export const FOOD_GROUP_LABELS: Record<FoodGroupKey, string>;
/** Etiqueta corta (tabla, combobox, catálogo de la IA). */
export const FOOD_GROUP_SHORT_LABELS: Record<FoodGroupKey, string>;
/** Tabla SARA 2 (1..26) → grupo. */
export const SARA2_TABLE_GROUPS: Readonly<Record<number, FoodGroupKey>>;
export function sara2TableGroup(table: number): FoodGroupKey | null;

export const FOOD_SOURCE_VALUES = ["SARA2", "PROPIO"] as const;
export type FoodSourceKey = (typeof FOOD_SOURCE_VALUES)[number];
export const FOOD_SOURCE_LABELS: Record<FoodSourceKey, string>; // { SARA2: "SARA 2", PROPIO: "Propio" }
```

Etiquetas (completa / corta):

| Valor | Completa | Corta |
|---|---|---|
| VERDURAS | Verduras | Verduras |
| FRUTAS | Frutas | Frutas |
| LEGUMBRES_CEREALES | Legumbres, cereales, papa, choclo, batata, pan y pastas | Cereales, papa, pan y pastas |
| LECHE_Y_POSTRES | Leche y postres de leche | Leche y postres |
| YOGURES | Yogures | Yogures |
| QUESOS | Quesos | Quesos |
| CARNES | Carnes | Carnes |
| HUEVOS | Huevos | Huevos |
| PESCADOS_Y_MARISCOS | Pescados y mariscos | Pescados y mariscos |
| ACEITES | Aceites | Aceites |
| FRUTAS_SECAS_Y_SEMILLAS | Frutas secas y semillas | Frutas secas y semillas |
| AZUCARES_MERMELADAS_Y_DULCES | Azúcares, mermeladas y dulces | Azúcares y dulces |
| GOLOSINAS_Y_CHOCOLATES | Golosinas y chocolates | Golosinas |
| GRASAS | Grasas | Grasas |
| SNACKS_SALADOS | Snacks salados | Snacks |
| ADEREZOS | Aderezos | Aderezos |
| CALDOS_Y_SOPAS | Caldos y sopas industriales | Caldos y sopas |
| POSTRES_Y_HELADOS | Postres industriales y helados | Postres y helados |
| SALES | Sales | Sales |
| BEBIDAS_CON_AZUCAR | Bebidas con azúcar | Bebidas con azúcar |
| BEBIDAS_SIN_AZUCAR | Bebidas sin azúcar | Bebidas sin azúcar |
| BEBIDAS_ALCOHOLICAS_Y_ENERGIZANTES | Bebidas alcohólicas y energizantes | Bebidas alcohólicas |
| BEBIDAS_DE_FRUTAS | Bebidas de frutas naturales sin azúcar agregada | Jugos naturales |
| INFUSIONES | Infusiones | Infusiones |
| COMIDAS_RAPIDAS | Comidas rápidas | Comidas rápidas |
| SUPLEMENTOS | Suplementos nutricionales | Suplementos |
| OTROS | Otros | Otros |

`SARA2_TABLE_GROUPS`: tabla N → valor N-ésimo de `FOOD_GROUP_VALUES` (1 → VERDURAS … 26 →
SUPLEMENTOS). OTROS no tiene tabla.

#### 5.1.2 `src/food-nutrients.ts` (nuevo, exportado) — web, db, sara2

```ts
export type FoodNutrientSection = "grasas" | "carbohidratos" | "minerales" | "vitaminas" | "otros";
export const FOOD_NUTRIENT_SECTION_LABELS: Record<FoodNutrientSection, string>;
// { grasas: "Grasas", carbohidratos: "Carbohidratos", minerales: "Minerales", vitaminas: "Vitaminas", otros: "Otros" }

export const FOOD_EXTRA_NUTRIENTS: readonly {
  key: FoodNutrientKey; label: string; unit: "g" | "mg" | "µg"; section: FoodNutrientSection;
}[];
export type FoodNutrientKey =
  | "grasasMono" | "grasasPoli" | "grasasTrans" | "linoleico" | "alfaLinolenico"
  | "araquidonico" | "epa" | "dha"
  | "choTotales" | "azucarTotal"
  | "potasio" | "calcio" | "cobre" | "fosforo" | "hierro" | "magnesio" | "zinc"
  | "niacina" | "folatoEfd" | "acidoFolico" | "vitaminaARae" | "retinol" | "tiamina"
  | "riboflavina" | "vitaminaB12" | "vitaminaC" | "vitaminaD"
  | "agua" | "cenizas";

/** Lo que se guarda en Food.nutrients. Las 29 claves siempre presentes (null = sin dato). */
export type FoodNutrients = Record<FoodNutrientKey, number | null> & { kcalPublicada: number | null };

/** Lee Food.nutrients (Prisma.JsonValue) de forma tolerante. null si no es un objeto. */
export function readFoodNutrients(json: unknown): FoodNutrients | null;
```

Las 29 definiciones, en este orden (etiqueta, unidad, sección):

| key | Etiqueta | Unidad | Sección |
|---|---|---|---|
| grasasMono | Monoinsaturadas | g | grasas |
| grasasPoli | Poliinsaturadas | g | grasas |
| grasasTrans | Trans | g | grasas |
| linoleico | 18:2 Linoleico | g | grasas |
| alfaLinolenico | 18:3 Alfa-linolénico (ALA) | g | grasas |
| araquidonico | 20:4 Araquidónico | g | grasas |
| epa | 20:5 EPA | g | grasas |
| dha | 22:6 DHA | g | grasas |
| choTotales | Carbohidratos totales | g | carbohidratos |
| azucarTotal | Azúcar total | g | carbohidratos |
| potasio | Potasio | mg | minerales |
| calcio | Calcio | mg | minerales |
| cobre | Cobre | mg | minerales |
| fosforo | Fósforo | mg | minerales |
| hierro | Hierro | mg | minerales |
| magnesio | Magnesio | mg | minerales |
| zinc | Zinc | mg | minerales |
| niacina | Niacina | mg | vitaminas |
| folatoEfd | Folato (EFD) | µg | vitaminas |
| acidoFolico | Ácido fólico | µg | vitaminas |
| vitaminaARae | Vitamina A (RAE) | µg | vitaminas |
| retinol | Retinol | µg | vitaminas |
| tiamina | Tiamina (B1) | mg | vitaminas |
| riboflavina | Riboflavina (B2) | mg | vitaminas |
| vitaminaB12 | Vitamina B12 | µg | vitaminas |
| vitaminaC | Vitamina C | mg | vitaminas |
| vitaminaD | Vitamina D | µg | vitaminas |
| agua | Agua | g | otros |
| cenizas | Cenizas | g | otros |

(10 componentes van a columnas: kcal, proteínas, lípidos, CHO disponibles, fibra, alcohol,
sodio, azúcar agregado, saturadas, colesterol. 10 + 29 = 39.)

#### 5.1.3 `src/nutrition.ts` (se amplía) — web, db, sara2

```ts
export const ATWATER = { protein: 4, carbs: 4, fat: 9, alcohol: 7 } as const;

export interface AtwaterMacros {
  protein: number;
  carbs: number;          // CHO disponibles
  fat: number;
  alcohol?: number | null; // null/undefined = 0
}

/** 4·P + 4·CHO + 9·G + 7·alcohol, redondeado a 2 decimales (lo que se guarda en kcalPer100). */
export function atwaterKcal(m: AtwaterMacros): number;

export type AtwaterPartKey = "protein" | "carbs" | "fat" | "alcohol";
export interface AtwaterPart {
  key: AtwaterPartKey;
  label: string;   // "Proteínas" | "Carbohidratos" | "Grasas" | "Alcohol"
  short: string;   // "P" | "CHO" | "G" | "Alc"
  grams: number;   // gramos de la porción, sin redondear
  factor: 4 | 7 | 9;
  kcal: number;    // redondeado a 1 decimal
}
export interface AtwaterBreakdown {
  grams: number;       // tamaño de la porción (100 = cada 100 g)
  parts: AtwaterPart[]; // P, CHO, G siempre; Alcohol solo si > 0
  totalKcal: number;   // atwater(per100) × grams / 100, redondeado a 1 decimal (no la suma de redondeos)
}
/** Desglose de una porción a partir de los valores cada 100 g. grams por defecto 100; ≤ 0 → todo 0. */
export function atwaterBreakdown(per100: AtwaterMacros, grams?: number): AtwaterBreakdown;

/** "Proteínas 2,4 g × 4 = 9,6 kcal" (gramos con hasta 2 decimales, kcal con hasta 1). */
export function formatAtwaterPart(part: AtwaterPart): string;
/** "P 14,4 kcal · CHO 171,6 kcal · G 2,7 kcal" (+ " · Alc 27,3 kcal" si hay alcohol). */
export function formatAtwaterCompact(b: AtwaterBreakdown): string;
/** "125,8 kcal" (hasta 1 decimal, miles con punto). */
export function formatKcalOneDecimal(value: number): string;

/** true si las kcal guardadas no coinciden con Atwater al décimo (aviso de D1). */
export function kcalDiffersFromAtwater(kcalPer100: number, m: AtwaterMacros): boolean;

export type OwnFoodIssue = "MISSING_MACROS" | "MACROS_OVER_100";
export const OWN_FOOD_ISSUE_MESSAGES: Record<OwnFoodIssue, string>;
// MISSING_MACROS: "Completá proteínas, carbohidratos y grasas."
// MACROS_OVER_100: "Los nutrientes suman más de 100 g cada 100 g de alimento."
/** P + CHO + G + fibra + alcohol > 100 → MACROS_OVER_100. Falta P, CHO o G → MISSING_MACROS. */
export function validateOwnFoodMacros(m: {
  protein: number | null; carbs: number | null; fat: number | null;
  fiber?: number | null; alcohol?: number | null;
}): OwnFoodIssue[];
```

`computeItemMacros`, `sumMacros`, `Macros`, `formatMacrosLine` **no cambian**.

#### 5.1.4 `src/food-search.ts` (nuevo, exportado) — web, db

```ts
/** normalize() de wake.ts + colapsar espacios + puntuación → espacio. "Limón, crudo" → "limon crudo". */
export function foodSearchText(name: string): string;
/** Todas las palabras de la consulta están en el texto (sin tildes ni mayúsculas). Consulta vacía → true. */
export function matchesFoodQuery(searchText: string, query: string): boolean;
export interface SearchableFood { name: string; searchText: string }
/** Filtra con matchesFoodQuery y ordena: 0) empieza con la consulta; 1) alguna palabra empieza con
 *  la 1ª palabra de la consulta; 2) el resto. Empate: nombre más corto, después alfabético (es). */
export function searchFoods<T extends SearchableFood>(foods: readonly T[], query: string, limit?: number): T[];
/** Para comparar nombres duplicados (D12): foodSearchText sin espacios. */
export function foodNameCompareKey(name: string): string;
```

#### 5.1.5 `src/es-ar-number.ts` (nuevo, exportado) — sara2, db (validación del dataset)

```ts
export type EsArNumberResult = { ok: true; value: number | null } | { ok: false; raw: string };
/**
 * "2,4" → 2.4 · "0" → 0 · "-1,5" → -1.5 · "" / null / undefined → null (celda vacía).
 * Con allowThousands (default false): "38.758" → 38758, "1.234,5" → 1234.5; el primer grupo no
 * puede empezar con 0 ("0.121" es inválido siempre). Cualquier otra cosa → { ok: false }.
 */
export function parseEsArNumber(raw: string | null | undefined, options?: { allowThousands?: boolean }): EsArNumberResult;
```

#### 5.1.6 `src/sara2/` (nuevo, export `"./sara2": "./src/sara2/index.ts"` en `packages/core/package.json`; **no** se exporta desde `src/index.ts` para no inflar el bundle del cliente) — script lector, db

```ts
// bbox.ts
export interface BboxWord { x0: number; y0: number; x1: number; y1: number; text: string }
export interface BboxPage { pageNumber: number; width: number; height: number; words: BboxWord[] }
export function parseBboxXhtml(xhtml: string, firstPageNumber?: number): BboxPage[];
export interface FrameWord { u0: number; u1: number; v0: number; v1: number; uc: number; vc: number; text: string }
export function toReadingFrame(page: BboxPage): FrameWord[];

// columns.ts
export const SARA2_A_COLUMNS: readonly { field: SaraAField; unit: "Kcal" | "g" | "mg" }[]; // 20
export const SARA2_B_COLUMNS: readonly { field: SaraBField; unit: "g" | "mg" | "µg" }[];   // 19
// A: kcalPublicada, agua, proteinPer100, fatPer100, cholesterolMgPer100, saturatedFatPer100,
//    grasasMono, grasasPoli, grasasTrans, linoleico, alfaLinolenico, araquidonico, epa, dha,
//    carbsPer100, choTotales, azucarTotal, addedSugarPer100, fiberPer100, alcoholPer100
// B: cenizas, sodiumMgPer100, potasio, calcio, cobre, fosforo, hierro, magnesio, zinc, niacina,
//    folatoEfd, acidoFolico, vitaminaARae, retinol, tiamina, riboflavina, vitaminaB12, vitaminaC, vitaminaD

// names.ts
export function joinNameLines(lines: readonly string[]): string;
export function isBrokenName(name: string): boolean;          // /-$/, /^[a-záéíóúñ]/, "*", length < 2
export function sara2PairKey(name: string): string;            // clave de emparejamiento A↔B (3.3.12)
export function sara2SourceKey(table: number, name: string): string; // "sara2:t03:arroz-blanco-hervido"

// layout.ts
export interface SaraRawRow {
  page: number; part: "A" | "B"; name: string; cells: (string | null)[]; rawText: string; nameCost: number;
}
export interface SaraSection {
  page: number; part: "A" | "B"; titleTable: number | null; titleText: string;
  rows: SaraRawRow[]; errors: string[];
}
export function extractSections(page: BboxPage): SaraSection[];
/** Partición óptima (3.3.9). Devuelve, por fila, los índices de renglones asignados. */
export function assignNameLines(lineYs: readonly number[], rowYs: readonly number[]): number[][];

// validate.ts
export const SARA2_VALIDATION = {
  macroSumReject: [90, 110],   // Q1-b. Con Q1-a sería [97, 103]; con Q1-c, null
  macroSumWarn: [97, 103],
  atwaterAbsKcal: 2,           // D6: máx(2 kcal, 3 %)
  atwaterRel: 0.03,
  maxRejectedRatio: 0.05,      // freno de D6
  nameCostWarnPt: 8,
} as const;
export type SaraRejectReason =
  | "SIN_PAREJA_B" | "SIN_PAREJA_A" | "NUMERO_INVALIDO" | "FALTA_KCAL" | "FALTA_MACRO"
  | "SUMA_MACROS" | "ATWATER" | "CLAVE_DUPLICADA" | "NOMBRE_ILEGIBLE" | "COLUMNAS";
export interface SaraRejection { table: number | null; page: number; name: string; reason: SaraRejectReason; detail: string; rawText: string }
export interface SaraWarning { table: number; page: number; name: string; code: string; detail: string }
export function validateSaraPair(table: number, a: SaraRawRow, b: SaraRawRow):
  | { ok: true; food: Sara2Food; warnings: SaraWarning[] }
  | { ok: false; rejection: SaraRejection };

// dataset.ts
export interface Sara2Food {
  sourceKey: string; table: number; group: FoodGroupKey; name: string; pages: [number, number];
  kcalPer100: number; proteinPer100: number; carbsPer100: number; fatPer100: number;
  fiberPer100: number | null; alcoholPer100: number | null; sodiumMgPer100: number | null;
  addedSugarPer100: number | null; saturatedFatPer100: number | null; cholesterolMgPer100: number | null;
  nutrients: FoodNutrients;
}
export interface Sara2TableStats {
  table: number; group: FoodGroupKey; rowsA: number; rowsB: number; paired: number;
  imported: number; rejected: Partial<Record<SaraRejectReason, number>>; warnings: number;
}
export interface Sara2Summary { rowsA: number; imported: number; rejected: number; excluded: number; rejectedPct: number }
export interface Sara2Dataset {
  format: 1;
  source: { title: string; publisher: string; year: 2022; file: string; sha256: string };
  status: "ok";
  summary: Sara2Summary;
  tables: Sara2TableStats[];
  foods: Sara2Food[];
}
/** JSON estable para el diff: metadatos indentados y UN alimento por línea, ordenados por sourceKey. Sin fecha. */
export function serializeSara2Dataset(ds: Sara2Dataset): string;
/** Lo usa el cargador: forma, format === 1, status "ok", rejectedPct ≤ 5, sourceKey únicos con
 *  prefijo "sara2:", grupos válidos (nunca SUPLEMENTOS ni OTROS), números finitos ≥ 0. */
export function validateSara2Dataset(json: unknown): { ok: true; dataset: Sara2Dataset } | { ok: false; errors: string[] };

// read.ts
export interface Sara2ReadResult {
  status: "ok" | "fallida";
  failures: string[];            // criterios L1–L6 que no se cumplen (3.5)
  foods: Sara2Food[];
  rejected: SaraRejection[];
  excluded: { page: number; name: string; reason: "excluidas: no vienen cada 100 g" }[];
  warnings: SaraWarning[];
  tables: Sara2TableStats[];
  summary: Sara2Summary;
}
export function readSara2(xhtml: string): Sara2ReadResult;

// report.ts
export function renderSara2Report(result: Sara2ReadResult, meta: { file: string; sha256: string; generatedAt: string }): string;
```

Reglas de `validateSaraPair` (en este orden; la primera que falla rechaza):

1. Parsear las 39 celdas con `parseEsArNumber(raw, { allowThousands: false })`. Una inválida →
   `NUMERO_INVALIDO`, detalle `número inválido «0.121» en <etiqueta de la columna>`.
2. `kcalPublicada` null → `FALTA_KCAL`. Proteínas, lípidos o CHO disponibles null →
   `FALTA_MACRO`, detalle `falta un macro (proteínas|lípidos|carbohidratos disponibles)` (D8).
3. Atwater: `calc = atwaterKcal({ protein, carbs, fat, alcohol })`; si
   `|kcalPublicada − calc| > max(2, 0,03 × calc)` → `ATWATER`, detalle
   `kcal publicadas 92, calculadas 88,2, diferencia 3,8`.
4. Suma: `agua + proteínas + lípidos + CHO disp. + fibra + cenizas + alcohol` (null → 0). Fuera de
   `macroSumReject` → `SUMA_MACROS`, detalle `suma de macros = 88,9 g` (+ ` (sin cenizas)` si
   cenizas es null). Fuera de `macroSumWarn` → advertencia `SUMA_FUERA_97_103`. Cenizas null →
   advertencia `SIN_CENIZAS` ("suma calculada sin cenizas").
5. Advertencias (no rechazan, D6): `saturadas + mono + poli > lípidos + 0,05` →
   `GRASAS_INCONSISTENTES`; `azúcar agregado > azúcar total + 0,05` o
   `azúcar total > CHO disp. + 0,05` → `AZUCARES_INCONSISTENTES`.
6. OK → `Sara2Food` con `kcalPer100 = calc` (D5), `nutrients.kcalPublicada = kcalPublicada`,
   `group = sara2TableGroup(table)`, `sourceKey = sara2SourceKey(table, name)`.

`readSara2` además rechaza `NOMBRE_ILEGIBLE` (fila sin nombre o `isBrokenName`), `COLUMNAS`
(colisión o encabezado de unidades que no coincide) y `CLAVE_DUPLICADA` (dos alimentos con el
mismo `sourceKey`). `summary.rejectedPct = rejected / rowsA × 100` (2 decimales) con `rowsA` =
filas A de las tablas 1–25 + filas `SIN_PAREJA_A`. `status = "fallida"` si falla algún criterio
L1–L6.

#### 5.1.7 `src/ai-food-catalog.ts` (nuevo, exportado) — web (`ai-actions.ts`)

```ts
export interface AiCatalogFood { id: string; name: string; group: FoodGroupKey; kcalPer100: number }
export const AI_CATALOG_MAX_CHARS = 60_000;
export const AI_EXCLUDABLE_GROUPS: readonly FoodGroupKey[]; // COMIDAS_RAPIDAS, GOLOSINAS_Y_CHOCOLATES,
// BEBIDAS_ALCOHOLICAS_Y_ENERGIZANTES, SNACKS_SALADOS, SALES, SUPLEMENTOS (D10)
/**
 * Una línea por alimento: "ref|nombre|grupo corto|kcal enteras" (ref = 1..N; "|" del nombre → "/").
 * Si el texto supera maxChars, saca los grupos excluibles y lo informa en excludedGroups.
 */
export function buildAiFoodCatalog(foods: readonly AiCatalogFood[], options?: { maxChars?: number }):
  { text: string; idsByRef: string[]; excludedGroups: FoodGroupKey[] };
```

Medido con los nombres reales: ~980 alimentos en el formato actual (objetos JSON con cuid) =
~116.000 caracteres; en el formato compacto = **~36.000**. Queda por debajo del umbral: hoy no se
excluye ningún grupo.

### 5.2 `packages/db/domain`

#### 5.2.1 `domain/foods.ts` (reescrito) — web

```ts
export const FOOD_SUMMARY_SELECT = {
  id: true, name: true, group: true, source: true, active: true,
  kcalPer100: true, proteinPer100: true, carbsPer100: true, fatPer100: true,
} satisfies Prisma.FoodSelect;
export type FoodSummary = Prisma.FoodGetPayload<{ select: typeof FOOD_SUMMARY_SELECT }>;

/** Sin el JSON de nutrientes (liviano para ~1000 filas). Orden por nombre. */
export function listFoods(params?: { group?: FoodGroup; source?: FoodSource; activeOnly?: boolean }): Promise<FoodSummary[]>;
export function getFood(id: string): Promise<Food | null>;
/** Planes y plantillas DISTINTOS que tienen al menos un ítem con este alimento. */
export function getFoodUsage(foodId: string): Promise<{ plans: number; templates: number }>;

export interface OwnFoodInput {
  name: string; group: FoodGroup; reference: string | null;
  proteinPer100: number; carbsPer100: number; fatPer100: number;
  fiberPer100: number | null; alcoholPer100: number | null; sodiumMgPer100: number | null;
  addedSugarPer100: number | null; saturatedFatPer100: number | null; cholesterolMgPer100: number | null;
  unitHint: string | null;
}
export class InvalidOwnFoodError extends Error { readonly issues: OwnFoodIssue[] }
export class DuplicateOwnFoodNameError extends Error { readonly existingId: string }
export class FoodNotEditableError extends Error {}   // SARA2 (D3)

/** Conflictos de nombre por foodNameCompareKey (D12). excludeId = el propio que se edita. */
export function findFoodNameConflicts(name: string, excludeId?: string):
  Promise<{ own: { id: string; name: string } | null; sara: { id: string; name: string } | null }>;
/** source PROPIO, kcal = atwaterKcal (nunca del input), sourceKey null, nutrients null,
 *  groupAutoAssigned false. Valida validateOwnFoodMacros y el nombre contra otros propios. */
export function createOwnFood(input: OwnFoodInput): Promise<Food>;
/** Solo PROPIO (si no, FoodNotEditableError). Recalcula kcal por Atwater (D1) y apaga groupAutoAssigned. */
export function updateOwnFood(id: string, input: OwnFoodInput): Promise<Food>;
export function setFoodActive(id: string, active: boolean): Promise<void>;
/** Solo PROPIO: kcalPer100 = atwaterKcal de sus macros guardados ("Usar X kcal", D1). */
export function applyAtwaterKcal(id: string): Promise<Food>;
```

Se **eliminan** `createFood` y `updateFood` (el único consumidor es web; `updateFood` permitiría
editar un SARA 2). Al final del archivo, un chequeo de tipos de que el enum de Prisma y
`FoodGroupKey` de core son iguales:

```ts
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const _groupsInSync: Same<FoodGroup, FoodGroupKey> = true;
const _sourcesInSync: Same<FoodSource, FoodSourceKey> = true;
```

#### 5.2.2 `domain/foodImport.ts` (nuevo, exportado desde `domain/index.ts`) — script cargador, script de prueba

```ts
export interface LoadSara2Result {
  total: number; created: number; updated: number; unchanged: number; deactivated: number;
}
export class Sara2LoadAbortedError extends Error {}
/**
 * Upsert por sourceKey. Recibe el cliente para poder correr dentro de $transaction.
 * - Solo toca filas con source SARA2 (todas las consultas filtran por source: "SARA2").
 * - Crea: source SARA2, active true, unitHint null, reference null, groupAutoAssigned false.
 * - Actualiza SOLO si cambió algo: name, group, kcal y los 9 nutrientes en columnas, nutrients.
 *   Nunca cambia active (respeta lo que ella desactivó), unitHint ni reference.
 * - SARA2 activos cuyo sourceKey no está en el dataset → active false (D14). Nunca borra.
 * - Aborta (Sara2LoadAbortedError) si desactivaría > 10 % de los SARA2 existentes, salvo
 *   options.allowMassDeactivation.
 */
export function loadSara2Dataset(
  db: Prisma.TransactionClient,
  dataset: Sara2Dataset,
  options?: { allowMassDeactivation?: boolean },
): Promise<LoadSara2Result>;
```

Implementación: una lectura de todos los SARA2 (`select` de los campos comparables), comparación
en memoria (Decimal → `Number`, redondeo a la escala de la columna; `nutrients` con
`JSON.stringify` de claves ordenadas), `createMany` en lotes de 200 para los nuevos, `update` por
id para los cambiados, `updateMany({ where: { source: "SARA2", sourceKey: { in: faltantes }, active: true } })`
para desactivar.

### 5.3 Consumidores

| Función / tipo | web | bot | db |
|---|---|---|---|
| `FOOD_GROUP_*`, `FOOD_SOURCE_LABELS` | sí | no | sí |
| `atwater*`, `formatAtwater*`, `kcalDiffersFromAtwater`, `validateOwnFoodMacros` | sí | no | sí |
| `foodSearchText`, `searchFoods`, `matchesFoodQuery`, `foodNameCompareKey` | sí | no | sí |
| `FOOD_EXTRA_NUTRIENTS`, `readFoodNutrients` | sí | no | sí |
| `buildAiFoodCatalog` | sí | no | no |
| `@nutri-bot/core/sara2` | no | no | scripts |
| `listFoods`, `getFood`, `getFoodUsage`, `createOwnFood`, `updateOwnFood`, `setFoodActive`, `applyAtwaterKcal`, `findFoodNameConflicts` | sí | no | — |
| `loadSara2Dataset` | no | no | scripts |

---

## 6. Lector y cargador

### 6.1 Archivos de datos (versionados)

- `packages/db/data/sara2/alimentos.json`: `serializeSara2Dataset` (≈ 1 MB, un alimento por
  línea, orden por `sourceKey`, sin fecha: correr el lector dos veces da el mismo archivo).
- `packages/db/data/sara2/reporte.md`: `renderSara2Report`. Secciones: encabezado (fuente,
  sha256 del PDF, fecha de generación, estado), resumen (filas A, importadas, rechazadas,
  excluidas, %), tabla por grupo (tabla, grupo, filas A, filas B, emparejadas, importadas,
  rechazadas por motivo, advertencias), "Rechazadas" (nombre, tabla, página, motivo, detalle y
  texto crudo en bloque de código), "Excluidas (tabla 26)", "Advertencias" (agrupadas por código).
  Si el estado es "fallida", arriba de todo: `**Importación fallida:** <criterios>. No se generó
  alimentos.json; revisar el lector antes de cargar nada.`

### 6.2 Lector: `packages/db/scripts/sara2/read-pdf.ts`

- Uso: `npm run sara2:read` (raíz). Opcional `--pdf <ruta>`; por defecto
  `docs/tabla-composicion-quimica-alimentos-argentina_ennys2__.pdf` resuelto desde la raíz del
  repo.
- `execFileSync("pdftotext", ["-bbox", pdf, "-"], { maxBuffer: 64 * 1024 * 1024 })`. Si falla con
  `ENOENT`: `Falta pdftotext (poppler). En macOS: brew install poppler` y exit 1.
- `sha256` del PDF → `readSara2(xhtml)` → escribe **siempre** `reporte.md`; escribe
  `alimentos.json` **solo si** `status === "ok"`; exit 0 si ok, 1 si fallida.
- Imprime una línea: `SARA 2: 889 importadas de 906 (17 rechazadas, 1,88 %), 24 excluidas → packages/db/data/sara2/`.
- No toca la base. No lo necesita producción.

### 6.3 Cargador: `packages/db/scripts/sara2/load.ts`

- Lee `packages/db/data/sara2/alimentos.json`, `validateSara2Dataset` (si falla, imprime los
  errores y exit 1), corre `loadSara2Dataset` dentro de
  `prisma.$transaction(fn, { timeout: 300_000, maxWait: 10_000 })` (todo o nada).
- `--dry-run`: hace todo dentro de la transacción y la revierte a propósito (tirando un
  `DryRunRollback` que se atrapa), imprimiendo lo que habría pasado.
- `--allow-mass-deactivation`: pasa la opción del mismo nombre.
- Imprime: `SARA 2: 889 en el archivo · 889 creados · 0 actualizados · 0 sin cambios · 0 desactivados`.
- **Fuera de las migraciones de Prisma** (D14). Es idempotente: se puede correr en cada deploy.

Cómo se corre:

| Entorno | Comando |
|---|---|
| Desarrollo | `npm run sara2:load -- --dry-run` y después `npm run sara2:load` (desde la raíz; usa el `.env`) |
| Producción | después de `migrate deploy`: `docker compose run --rm bot npm run sara2:load:prod --workspace packages/db` (la imagen del bot copia el repo entero, incluido `packages/db/data`). Si en esa imagen no está `tsx`, correrlo desde una máquina de desarrollo con `DATABASE_URL` de producción por túnel: `DATABASE_URL=… npx tsx packages/db/scripts/sara2/load.ts` |

Se documenta en `README.md` (sección Despliegue, después del `migrate deploy`) y en la tabla de
comandos.

### 6.4 Scripts npm

`packages/db/package.json`:

```json
"sara2:read": "tsx scripts/sara2/read-pdf.ts",
"sara2:load": "dotenv -e ../../.env -- tsx scripts/sara2/load.ts",
"sara2:load:prod": "tsx scripts/sara2/load.ts",
"test:foods": "dotenv -e ../../.env -- tsx scripts/test-foods-sara2.ts"
```

Raíz: `"sara2:read": "npm run sara2:read --workspace packages/db"`,
`"sara2:load": "npm run sara2:load --workspace packages/db --"`.

`packages/db/tsconfig.json`: sumar `"scripts/sara2/**/*.ts"` y `"scripts/test-foods-sara2.ts"`
al `include` (así los typechequea `npm run typecheck`; los scripts viejos no se agregan).

---

## 7. Rutas y server actions (apps/web)

### 7.1 Rutas

| Ruta | Cambio |
|---|---|
| `/alimentos` | lista con fuente, filtros, inactivos ocultos por defecto, paginación (9.1) |
| `/alimentos/[id]` | ficha: SARA 2 solo lectura (9.2) o propio con formulario (9.3) |
| `/alimentos/nuevo` | formulario de propio; `?desde=<id>` precarga desde otro alimento (9.4) |

Todas bajo `(panel)`: ya protegidas por el middleware. No hay API nueva.

### 7.2 `apps/web/src/app/(panel)/alimentos/actions.ts` (`"use server"`, reescrito)

```ts
export type OwnFoodState = {
  ok: boolean;
  error?: string;
  /** Advertencia no bloqueante (nombre igual a un SARA 2, D12): el form muestra "Guardar igual". */
  saraDuplicate?: { id: string; name: string };
  foodId?: string;
};
export async function createOwnFoodAction(prev: OwnFoodState, formData: FormData): Promise<OwnFoodState>;
export async function updateOwnFoodAction(id: string, prev: OwnFoodState, formData: FormData): Promise<OwnFoodState>;
export async function setFoodActiveAction(id: string, active: boolean): Promise<void>;
export async function applyAtwaterKcalAction(id: string): Promise<void>;
```

- zod `ownFoodSchema`: `name` trim 2–200; `group` `z.enum(FOOD_GROUP_VALUES)`; `reference` ≤ 120;
  `proteinPer100`, `carbsPer100`, `fatPer100`: vacío → null, si no número 0–100;
  `fiberPer100`, `alcoholPer100`, `addedSugarPer100`, `saturatedFatPer100` 0–100 o vacío;
  `sodiumMgPer100` 0–100000 o vacío; `cholesterolMgPer100` 0–10000 o vacío; `unitHint` ≤ 120;
  `confirmSaraDuplicate` `"1"` opcional.
- Errores (exactos): macro vacío → `OWN_FOOD_ISSUE_MESSAGES.MISSING_MACROS`; suma > 100 →
  `MACROS_OVER_100`; otro fallo de zod → "Revisá los datos: hay valores fuera de rango.";
  `DuplicateOwnFoodNameError` → "Ya tenés un alimento propio con ese nombre.";
  `FoodNotEditableError` → "Los alimentos de SARA 2 no se editan. Duplicalo como propio."
- Create: si `findFoodNameConflicts` trae `sara` y no vino `confirmSaraDuplicate=1` → devuelve
  `{ ok: false, saraDuplicate }` sin guardar. Si guarda: `revalidatePath("/alimentos")` y
  `{ ok: true, foodId }` (el cliente navega, 9.4). **No** `redirect` (así hay toast).
- Update: igual, más `revalidatePath("/alimentos/<id>")`.
- `applyAtwaterKcalAction`: `applyAtwaterKcal(id)` + revalidar lista y ficha.

### 7.3 Otras actions que cambian

- `ai-actions.ts` (`generateAiPlanAction`): catálogo con `buildAiFoodCatalog` a partir de
  `listFoods({ activeOnly: true })`; el mensaje de usuario pasa a
  `JSON.stringify({ paciente, formato_alimentos: "ref|nombre|grupo|kcal cada 100 g", alimentos: text })`;
  el prompt de sistema cambia "referenciándolos por su `id` EXACTO" por "referenciándolos por su
  número `ref` EXACTO (la primera columna de cada línea de `alimentos`)" y la forma de respuesta
  por `{"meals":[{"name":string,"items":[{"ref":number,"quantityGrams":number,"note"?:string}]}]}`.
  `aiResponseSchema`: `ref: z.number().int().positive()` en lugar de `foodId`. Mapeo
  `idsByRef[ref - 1]`; ref inexistente → el ítem se descarta (igual que hoy con ids inválidos).
- Las actions de planes y plantillas (`addItemAction`) **no cambian**: siguen recibiendo `foodId`
  por `FormData` (lo pone el `<input type="hidden" name="foodId">` del combobox).

---

## 8. Mensajes del bot

No aplica: el bot no cambia.

---

## 9. UI (skill `ui`): vistas, estructura y componentes

Sistema de diseño de la HU-002 (Notion, neutro). Solo componentes que ya existen, más dos
nuevos (`Popover` primitivo, `FoodPicker`). `Badge`: "SARA 2" tono `neutral`, "Propio" tono
`info`. Nada de colores nuevos. Números con `Quantity` / formatters de core (es-AR).

### 9.1 Vista "Lista de alimentos" — `/alimentos`

- **Estructura:** `page.tsx` (server) → `PageHeader` "Alimentos", descripción "Base de alimentos
  con valores cada 100 g: SARA 2 (Ministerio de Salud, 2022) y tus alimentos propios.", acción
  primaria `ButtonLink` "Nuevo alimento" (icono `Plus`). Debajo, `FoodsList` (cliente).
- **Datos:** `listFoods({ activeOnly: false })` → filas `{ id, name, group, source, active,
  kcalPer100, proteinPer100, carbsPer100, fatPer100 }` (Decimal → string, como hoy). El
  `searchText` se calcula en el cliente una vez (`useMemo` con `foodSearchText`).
- **Barra de filtros** (flex-wrap, gap-3): `Input` búsqueda con icono `Search` (placeholder
  "Buscar alimento…", `matchesFoodQuery`); `ToggleGroup` type single "Fuente": "Todas" / "SARA 2"
  / "Propios" (`aria-label="Filtrar por fuente"`); `Select` "Grupo" ("Todos los grupos" + 27
  etiquetas completas); `Switch` + `Label` "Mostrar inactivos" (apagado por defecto, D16);
  contador `Mostrando 42 de 1.012 alimentos` (es-AR; total = todas las filas cargadas).
- **Tabla:** `Card padding="none"` + `DataTable` con columnas: Alimento (nombre en `font-medium` +
  `Badge` neutral "Inactivo" si corresponde), Fuente (`FoodSourceBadge`), Grupo (etiqueta corta en
  `text-muted-foreground` con `title` = etiqueta completa), Energía (kcal), Proteínas (g),
  Carbohidratos (g), Grasas (g). Fila clickeable a la ficha. Orden inicial por nombre.
- **Paginación (decisión: paginar, no virtualizar):** `DataTable` suma dos props opcionales,
  `pageSize?: number` y `pageResetKey?: string`. Con `pageSize` (acá 50) muestra solo esa página
  del orden actual y un pie: "Página 1 de 20" + `Button` secondary sm "Anterior" / "Siguiente"
  (deshabilitados en los extremos). Cambiar `pageResetKey` (acá, la concatenación de los filtros)
  vuelve a la página 1. Sin `pageSize`, la tabla se comporta como hoy (los demás usos no cambian).
- **Vacíos:** sin alimentos → el `EmptyState` actual; por filtro → `EmptyState` icono `SearchX`,
  título "No hay alimentos que coincidan", descripción "Probá con otro nombre, otra fuente u otro
  grupo.", acción "Limpiar filtros" (resetea búsqueda, fuente, grupo; no toca inactivos).

### 9.2 Vista "Ficha de alimento SARA 2 (solo lectura)" — `/alimentos/[id]`, `source = SARA2`

- **Datos:** `getFood(id)` + `getFoodUsage(id)`; `readFoodNutrients(food.nutrients)`.
- **Encabezado:** `PageHeader` title = nombre, description = "<Grupo completo> · SARA 2", back
  "Volver a alimentos". Acción: `Badge` Activo (success) / Inactivo (neutral), form con
  `SubmitButton` secondary sm "Desactivar"/"Activar" (patrón actual), y `ButtonLink` secondary sm
  "Duplicar como propio" (icono `Copy`) → `/alimentos/nuevo?desde=<id>`.
- `Alert` info (max-w-3xl): "Dato oficial de SARA 2 (Ministerio de Salud, 2022). No se puede
  editar: si necesitás otros valores, duplicalo como propio."
- Si inactivo: el `Alert` info actual ("Este alimento está inactivo…").
- Si `usage.plans + usage.templates > 0`: línea `text-sm text-muted-foreground` "Lo usan 1 plan y
  0 plantillas" (singular/plural).
- Grilla `lg:grid-cols-2 gap-6`:
  - **`FoodEnergyCard`** (cliente, `alimentos/food-energy-card.tsx`), `Card` title "Energía",
    description "Cada 100 g · 4 kcal/g proteínas y carbohidratos, 9 grasas, 7 alcohol":
    kcal en grande (`text-3xl font-semibold tabular-nums`, `formatKcalOneDecimal`); si hay
    `kcalPublicada`, debajo en muted "La tabla publica 126 kcal"; tabla chica (primitivos
    `Table`) Nutriente / Gramos / Factor / kcal con `atwaterBreakdown`, fila Total en negrita; debajo
    `Field` "Calcular porción" con `NumberInput unit="g"` (default 100, min 0, step 1): recalcula
    kcal, gramos y desglose al tipear; el título de la tabla cambia a "Porción de 150 g".
    Props: `{ protein: number; carbs: number; fat: number; alcohol: number | null; kcalPer100: number; kcalPublished: number | null }`.
    Si `kcalDiffersFromAtwater` (solo puede pasar en propios viejos), bajo el total:
    "El desglose suma 125,5 kcal; el alimento tiene cargadas 130."
  - **`FoodMainNutrientsCard`** (server, `alimentos/food-nutrients.tsx`), `Card` title
    "Nutrientes principales", lista `dl` dos columnas: Proteínas, Carbohidratos disponibles,
    Grasas totales, Grasas saturadas, Fibra, Azúcar agregado, Sodio (mg), Colesterol (mg),
    Alcohol (solo si > 0). Null → "Sin dato" en `text-muted-foreground` (distinto de "0 g").
- **"Más nutrientes"** (server, mismo archivo, `FoodMoreNutrients`), solo si `nutrients` no es
  null: `<details>` nativo estilado como `Card` (summary "Más nutrientes" con `ChevronDown`),
  adentro una sub-lista por sección de `FOOD_EXTRA_NUTRIENTS` (Grasas, Carbohidratos, Minerales,
  Vitaminas, Otros), cada ítem "Etiqueta — valor unidad" con hasta 3 decimales o "Sin dato".

### 9.3 Vista "Ficha de alimento propio" — `/alimentos/[id]`, `source = PROPIO`

- Encabezado igual que 9.2 con description "<Grupo completo> · Propio" (+ " · <referencia>" si
  hay); sin "Duplicar como propio".
- Avisos (orden, max-w-3xl):
  1. Si `kcalDiffersFromAtwater`: `Alert` warning title "Las kcal cargadas (130) no coinciden con
     el cálculo por macros (125,5)", texto "Se cargaron a mano antes de que el sistema las
     calculara. Si las cambiás, cambian los totales de los planes que usan este alimento." y un
     `<form action={applyAtwaterKcalAction.bind(null, id)}>` con `SubmitButton` secondary sm
     "Usar 125,5 kcal" (pendingLabel "Aplicando…"). Sin confirmación (es un clic explícito).
  2. Si `groupAutoAssigned`: `Alert` info "Revisá el grupo: se asignó automáticamente al pasar a
     los grupos de SARA 2."
  3. Inactivo y "Lo usan …" como en 9.2.
- Grilla: `FoodEnergyCard` (con los valores guardados) + `FoodMainNutrientsCard`.
- Debajo, `Card` title "Editar alimento" con `OwnFoodForm` (9.4) en modo edición
  (`usage` para la confirmación).

### 9.4 Vista "Nuevo alimento propio" — `/alimentos/nuevo` (y `?desde=<id>`)

- `page.tsx` (server): `PageHeader` "Nuevo alimento", description "Alimento propio. Los valores
  son cada 100 g; las kcal se calculan solas." Con `searchParams.desde` válido: `getFood` y
  defaults = sus valores, nombre `"<nombre> (copia)"`, mismo grupo, referencia vacía,
  `unitHint` igual. `nutrients` **no** se copia (los propios no tienen "Más nutrientes"). Sin
  `desde` o id inválido: vacío, grupo `OTROS`.
- **`OwnFoodForm`** (cliente, `alimentos/own-food-form.tsx`, reemplaza a `food-form.tsx`, que se
  borra). Props: `{ action; defaults: OwnFoodDefaults; submitLabel: string; usage?: { plans: number; templates: number } }`.
  - `Card` sin título (la da la página). Grupo 1 (grid sm:2): `Field` "Nombre" (`Input`),
    `Field` "Grupo" (`Select` con las 27 etiquetas completas), `Field` "Referencia" hint
    "Opcional" (placeholder "Ej.: rótulo de la marca").
  - `fieldset` "Composición cada 100 g" (grid sm:3): Proteínas, "Carbohidratos disponibles"
    (hint "Los del rótulo argentino: sin la fibra"), "Grasas totales" — `NumberInput unit="g"`,
    step 0.1, **controlados** (estado local) para el cálculo en vivo.
  - Recuadro en vivo (`rounded-md border bg-muted/40 p-4`, `aria-live="polite"`):
    "= 125,5 kcal cada 100 g" (`text-lg font-semibold`) y debajo una línea por parte con
    `formatAtwaterPart`. Si falta un macro: "Completá proteínas, carbohidratos y grasas para ver
    las kcal." Si la suma > 100: el mensaje de `MACROS_OVER_100` en `text-destructive`.
  - `fieldset` "Opcionales" (grid sm:3): Grasas saturadas (g), Fibra (g), Azúcar agregado (g),
    Sodio (mg), Colesterol (mg), Alcohol (g; controlado, entra al Atwater); y `Field`
    "Unidad de referencia" (`Input name="unitHint"`, hint 'Ej.: "1 taza ≈ 180 g". Solo informativo.').
  - Pie: `Button type="submit"` (submitLabel / "Guardando…") + `FormError`.
  - Advertencia D12: si `state.saraDuplicate`, `Alert` warning "Ya existe «Acelga, cruda» en SARA
    2. Podés usar ese o guardar el tuyo igual." con `Button` secondary sm "Guardar igual" que
    reenvía el mismo form con `<input type="hidden" name="confirmSaraDuplicate" value="1">`
    (estado local que agrega el hidden y hace `requestSubmit()`).
  - **Envío (regla aprendida):** `<form onSubmit={handleSubmit}>`, nunca `<form action>` con
    `confirm` adentro. `handleSubmit`: `e.preventDefault()`; `const fd = new FormData(e.currentTarget)`;
    si `usage` y `usage.plans + usage.templates > 0` → `const ok = await confirm({ title: "¿Guardar los cambios?", description: "Cambiar este alimento cambia los totales de los planes que lo usan (1 plan, 0 plantillas), incluidos los ya entregados. ¿Guardar igual?", confirmLabel: "Guardar igual", destructive: false })`
    **fuera** de la transición; si `!ok` return; recién ahí `startTransition(() => formAction(fd))`.
    `formAction` sale de `useActionState(action, initial)`.
  - Éxito: `useEffect` sobre `state`: si `state.ok` → `notify.saved("Alimento guardado")` y, si
    `state.foodId` (alta), `router.push("/alimentos/" + state.foodId)`.

### 9.5 Vista "Editor de comidas": combobox `FoodPicker` — planes y plantillas

- **`FoodCatalogProvider`** (cliente, `components/food-catalog.tsx`): recibe
  `foods: FoodOption[]` **una sola vez** (así la lista viaja una vez al cliente aunque haya 5
  comidas) y expone por contexto `{ foods: (FoodOption & { searchText: string })[] }`.
  `FoodOption = { id: string; name: string; group: string; source: "SARA2" | "PROPIO" }`.
  `MealsEditor` (sigue siendo server) envuelve su contenido en el provider. Se borra
  `foodsByGroup`.
- **Decisión: filtra el cliente** (~1000 filas livianas, ~60 KB), con `searchFoods(foods, q, 20)`:
  respuesta inmediata al tipear y sin round-trips.
- **`FoodPicker`** (cliente, `components/food-picker.tsx`), reemplaza al `<Select name="foodId">`
  dentro del `Field` "Alimento":
  - `Input` con `role="combobox"`, `aria-expanded`, `aria-controls`, `aria-autocomplete="list"`,
    `aria-activedescendant`, placeholder "Buscar alimento…"; `<input type="hidden" name="foodId">`
    con el id elegido ("" = libre).
  - Lista (`role="listbox"`, `absolute z-20 mt-1 max-h-80 overflow-auto rounded-md border bg-popover shadow-md`):
    1ª opción fija "Alimento libre / sin macros"; después hasta 20 resultados, cada uno
    (`role="option"`, `aria-selected`) con el nombre, el grupo corto en `text-xs text-muted-foreground`
    y `FoodSourceBadge` a la derecha. Consulta vacía: la opción fija y la ayuda "Escribí para
    buscar entre 1.012 alimentos."
  - Sin resultados: la opción fija y el texto "No hay alimentos que coincidan. Podés agregarlo
    como alimento libre o crearlo en " + `Link` "Alimentos" (`/alimentos/nuevo`, nueva pestaña).
  - Teclado: ↓/↑ mueven la activa (con wrap), Enter elige (con `preventDefault` si la lista está
    abierta, para no enviar el form), Esc cierra (segundo Esc no borra), Tab cierra. Mouse:
    `onMouseDown` + `preventDefault` elige sin perder el foco.
  - Al elegir: el input muestra el nombre, la lista se cierra. Si después se edita el texto, el
    id elegido se limpia.
  - Reset: escucha el evento `reset` del `form` padre (React 19 resetea el form después de la
    action) para volver a "Alimento libre".
- `MealsEditor` cambia `foods: FoodOption[]` (con `source`); las páginas de plan y plantilla
  mapean `{ id, name, group, source }`.

### 9.6 Vista "Desglose de kcal del ítem": `KcalBreakdownPopover` (D11)

- Primitivo nuevo `components/primitives/popover.tsx` (shadcn: `Popover`, `PopoverTrigger`,
  `PopoverContent` sobre `@radix-ui/react-popover`). Dependencia:
  `npm install @radix-ui/react-popover@^1.1 --workspace apps/web`. Si no hay red para instalarla:
  reportar `blocked`, no reemplazar por otra cosa.
- `components/kcal-breakdown-popover.tsx` (cliente). Props:
  `{ kcal: number; breakdown: AtwaterBreakdown; itemName: string }`.
  Trigger: `button type="button"` con `formatMacroAmount(kcal, "kcal")` subrayado punteado,
  `aria-label="Ver de dónde salen las kcal de <itemName>"`. Controlado: abre con
  `onPointerEnter` si `pointerType === "mouse"`, cierra con `onPointerLeave` (mouse); click/tap
  alterna. Contenido (`w-72 text-sm`): título "Porción de 150 g", la línea exacta de
  `formatAtwaterCompact` ("P 14,4 kcal · CHO 171,6 kcal · G 2,7 kcal"), debajo las líneas de
  `formatAtwaterPart` en `text-xs text-muted-foreground` y "Total 188,7 kcal". Si
  `Math.abs(breakdown.totalKcal - kcal) >= 0.1`: nota "Este alimento tiene kcal cargadas a mano
  que no coinciden con el cálculo por macros."
- En `MealsEditor`, la línea de macros del ítem (`showMacros && item.macros`) pasa a:
  `KcalBreakdownPopover` (si `item.kcalBreakdown`) + el resto de la línea
  (` · P 3,6 g · C 42,9 g · G 0,3 g · Fibra 0,9 g`, armado con `formatMacroAmount`, igual que
  hoy). Hoy `showMacros` solo está en planes: el popover aparece donde hoy se ven los macros.
- `lib/meal-view.ts`: `RawFood` suma `alcoholPer100: unknown`; `MealItemView` suma
  `kcalBreakdown: AtwaterBreakdown | null` = `atwaterBreakdown({ protein, carbs, fat, alcohol }, quantityGrams)`
  cuando hay alimento y cantidad. El PDF y el portal lo ignoran.

### 9.7 Componente chico: `FoodSourceBadge`

`components/food-source-badge.tsx` (sin `"use client"`, sirve en server y cliente):
`({ source }: { source: "SARA2" | "PROPIO" }) => <Badge tone={source === "SARA2" ? "neutral" : "info"}>{FOOD_SOURCE_LABELS[source]}</Badge>`.

---

## 10. Archivos

**packages/core**
- nuevo `src/food-groups.ts`, `src/food-groups.test.ts`
- nuevo `src/food-nutrients.ts`, `src/food-nutrients.test.ts`
- nuevo `src/food-search.ts`, `src/food-search.test.ts`
- nuevo `src/es-ar-number.ts`, `src/es-ar-number.test.ts`
- nuevo `src/ai-food-catalog.ts`, `src/ai-food-catalog.test.ts`
- cambia `src/nutrition.ts`, `src/nutrition.test.ts`
- cambia `src/index.ts` (exports de los 5 nuevos)
- nuevo `src/sara2/{index,bbox,columns,names,layout,validate,dataset,read,report}.ts`
- nuevo `src/sara2/{bbox,names,layout,validate,dataset,read}.test.ts`
- nuevo `src/sara2/__fixtures__/p018.xhtml … p137.xhtml` (15 páginas, 12.2)
- cambia `package.json` (export `"./sara2"`)

**packages/db**
- cambia `prisma/schema.prisma`; nueva `prisma/migrations/<ts>_food_sara2/migration.sql`
- cambia `domain/foods.ts`; nuevo `domain/foodImport.ts`; cambia `domain/index.ts`
- cambia `prisma/seed.ts` (grupos por la tabla de D2, mecánico)
- nuevo `scripts/sara2/read-pdf.ts`, `scripts/sara2/load.ts`, `scripts/test-foods-sara2.ts`
- nuevo `data/sara2/alimentos.json`, `data/sara2/reporte.md` (generados por el lector)
- cambia `package.json` (scripts), `tsconfig.json` (include)

**apps/web**
- cambia `src/lib/food-groups.ts` (re-exporta de core con los tipos de Prisma)
- cambia `src/app/(panel)/alimentos/{page.tsx,foods-list.tsx,actions.ts,[id]/page.tsx,nuevo/page.tsx}`
- nuevo `src/app/(panel)/alimentos/{own-food-form.tsx,food-energy-card.tsx,food-nutrients.tsx}`; se borra `food-form.tsx`
- nuevo `src/components/{food-picker.tsx,food-catalog.tsx,kcal-breakdown-popover.tsx,food-source-badge.tsx,primitives/popover.tsx}`
- cambia `src/components/{meals-editor.tsx,data-table.tsx}`, `src/lib/meal-view.ts`
- cambia `src/app/(panel)/pacientes/[id]/planes/[planId]/{page.tsx,ai-actions.ts}`, `src/app/(panel)/plantillas/[id]/page.tsx`
- cambia `package.json` / `package-lock.json` (`@radix-ui/react-popover`)

**raíz**: `package.json` (scripts `sara2:*`), `README.md` (comandos y despliegue).

---

## 11. Checklist atómico

### packages/core

- [ ] `food-groups.ts` con valores, etiquetas (tabla 5.1.1), `SARA2_TABLE_GROUPS`, `sara2TableGroup`, fuentes. Tests.
- [ ] `food-nutrients.ts` con las 29 definiciones (tabla 5.1.2), secciones, `readFoodNutrients`. Tests.
- [ ] `nutrition.ts`: `ATWATER`, `atwaterKcal`, `atwaterBreakdown`, `formatAtwaterPart`, `formatAtwaterCompact`, `formatKcalOneDecimal`, `kcalDiffersFromAtwater`, `validateOwnFoodMacros`, `OWN_FOOD_ISSUE_MESSAGES`. Tests.
- [ ] `es-ar-number.ts` + tests.
- [ ] `food-search.ts` + tests.
- [ ] `ai-food-catalog.ts` + tests.
- [ ] Exports en `src/index.ts`.
- [ ] `sara2/columns.ts`, `bbox.ts`, `names.ts`, `layout.ts` (DP), `validate.ts`, `dataset.ts`, `read.ts`, `report.ts`, `index.ts`; export `"./sara2"` en `package.json`.
- [ ] Generar las fixtures (12.2) con `pdftotext -bbox -f N -l N <pdf> packages/core/src/sara2/__fixtures__/pNNN.xhtml`.
- [ ] Tests de `sara2/` (12.2). `npm run test` en verde.

### packages/db

- [ ] `migrate status` limpio; respaldo `pg_dump` y foto de los 90 (4.3).
- [ ] `schema.prisma` (4.2); `--create-only`; reemplazar el SQL por el de 4.3; revisarlo.
- [ ] `npm run db:migrate`; `npm run db:generate`; chequeos SQL de 4.3 (grupos y `diff` de la foto).
- [ ] `domain/foods.ts` (5.2.1), con el chequeo de tipos de enums.
- [ ] `domain/foodImport.ts` (5.2.2); export en `domain/index.ts`.
- [ ] `prisma/seed.ts`: reemplazar grupos viejos por los nuevos según D2 (mecánico).
- [ ] `scripts/sara2/read-pdf.ts` (6.2); `npm run sara2:read`; revisar `reporte.md` y los ejemplos de 3.5; correrlo otra vez → `git diff --stat packages/db/data` sin cambios en `alimentos.json`.
- [ ] `scripts/sara2/load.ts` (6.3); scripts npm (6.4); `tsconfig.json` include.
- [ ] `scripts/test-foods-sara2.ts` (12.3) y correrlo.
- [ ] `npm run sara2:load -- --dry-run`, `npm run sara2:load`, `npm run sara2:load` otra vez (13).

### apps/web

- [ ] `npm install @radix-ui/react-popover@^1.1 --workspace apps/web`; `primitives/popover.tsx`.
- [ ] `lib/food-groups.ts`: `FOOD_GROUP_LABELS: Record<FoodGroup,string>`, `FOOD_GROUP_SHORT_LABELS`, `FOOD_GROUPS: FoodGroup[]` desde core.
- [ ] `food-source-badge.tsx`.
- [ ] `data-table.tsx`: `pageSize`, `pageResetKey`, pie de paginación.
- [ ] `/alimentos` lista (9.1).
- [ ] `actions.ts` (7.2).
- [ ] `food-energy-card.tsx`, `food-nutrients.tsx`, `own-food-form.tsx`; borrar `food-form.tsx`.
- [ ] Ficha `[id]/page.tsx` con las dos variantes (9.2, 9.3), usando `getFood`/`getFoodUsage` (no `prisma` directo).
- [ ] `nuevo/page.tsx` con `?desde=` (9.4).
- [ ] `food-catalog.tsx`, `food-picker.tsx`; `meals-editor.tsx` (provider, picker, popover); páginas de plan y plantilla mapean `source`.
- [ ] `meal-view.ts` (`alcoholPer100`, `kcalBreakdown`); `kcal-breakdown-popover.tsx`.
- [ ] `ai-actions.ts` (7.3).
- [ ] README (6.3).

### apps/bot

- [ ] Nada que cambiar; `npm run typecheck` pasa.

---

## 12. Tests (vitest, `packages/core`)

### 12.1 Lógica general

- `es-ar-number.test.ts`: `"2,4"`→2.4; `"0"`→0; `"0,0"`→0; `"-1,5"`→-1.5; `""`/`null`/`undefined`
  →null; `"0.121"`→inválido (con y sin `allowThousands`); `"38758"`→38758; `"38.758"`→inválido
  sin `allowThousands`, 38758 con; `"1.234,5"`→1234.5 con; `"3,"`, `"1,2,3"`, `"abc"`, `"1 2"`→inválido.
- `nutrition.test.ts` (sumar):
  - `atwaterKcal({protein:2.4,carbs:28.6,fat:0.2})` = 125.8; con `alcohol: 3.9` (Cerveza con
    alcohol: P 0,5 · CHO 3,6 · G 0) = 43.7; alcohol null = 0.
  - `atwaterBreakdown` de arroz hervido, 100 g: partes 9.6 / 114.4 / 1.8, total 125.8, sin parte
    alcohol. 150 g: gramos 3.6 / 42.9 / 0.3, kcal 14.4 / 171.6 / 2.7, total 188.7. 0 g → todo 0.
  - `formatAtwaterPart` → `"Proteínas 2,4 g × 4 = 9,6 kcal"`, `"Carbohidratos 28,6 g × 4 = 114,4 kcal"`,
    `"Grasas 0,2 g × 9 = 1,8 kcal"`; `formatAtwaterCompact(150 g)` →
    `"P 14,4 kcal · CHO 171,6 kcal · G 2,7 kcal"`; con alcohol termina en `" · Alc 27,3 kcal"`.
  - `formatKcalOneDecimal(1234.56)` → `"1.234,6 kcal"`.
  - `kcalDiffersFromAtwater(130, {2.7, 28, 0.3})` true (125,5); `(125.8, arroz)` false.
  - `validateOwnFoodMacros`: falta G → `["MISSING_MACROS"]`; 50+40+15 → `["MACROS_OVER_100"]`;
    10+60+15+fibra 5 → `[]`; 60+30+5+fibra 3+alcohol 3 = 101 → over.
- `food-search.test.ts`: `foodSearchText("Limón, crudo")` = `"limon crudo"`;
  `matchesFoodQuery(…, "limon")` true; `"LIMÓN"` true; `"arroz hervido"` encuentra "Arroz blanco,
  hervido"; ranking: con "arroz" primero los que empiezan con "arroz", "Leche de arroz" después;
  límite 20; consulta vacía = todos. `foodNameCompareKey("Yogur  Descremado")` =
  `foodNameCompareKey("yogur descremado")`.
- `food-groups.test.ts`: 27 valores únicos; toda clave tiene etiqueta completa y corta;
  `sara2TableGroup(3)` = `LEGUMBRES_CEREALES`, `(14)` = `GRASAS`, `(26)` = `SUPLEMENTOS`, `(27)` = null.
- `food-nutrients.test.ts`: 29 definiciones, claves únicas, 5 secciones; `readFoodNutrients`
  devuelve null con `null`/array/string y completa con null las claves faltantes.
- `ai-food-catalog.test.ts`: línea `"1|Arroz blanco, hervido|Cereales, papa, pan y pastas|126"`;
  `|` del nombre → `/`; `idsByRef[0]` = primer id; con `maxChars` chico saca los grupos
  excluibles y los informa.

### 12.2 Lector SARA 2, con fragmentos reales del PDF

Fixtures = salida real de `pdftotext -bbox -f N -l N` (una página por archivo, sin editar).
Páginas: **18, 19, 58, 59, 62, 63, 74, 75, 90, 92, 97, 98, 104, 105, 137** (las que se listan
abajo; 15 archivos, ~40 KB c/u). Un helper del test las lee con
`readFileSync(new URL("./__fixtures__/p092.xhtml", import.meta.url), "utf8")`.

- `bbox.test.ts`: `parseBboxXhtml` de p018 da 1 página, `height ≈ 841.89`, y una palabra
  "Acelga,"; `toReadingFrame`: "Kcal" tiene `vc` menor que la primera "Acelga," y las 3 primeras
  "Acelga," tienen `vc` crecientes. Entidades `&amp;` decodificadas (texto inline de prueba).
- `names.test.ts` (texto real del PDF, inline):
  - `joinNameLines(["Bebida láctea parcialmente des-", "cremada fluida, baja en lactosa,", "fortificada con vitaminas A, D, B2,", "B9 y Zinc"])`
    = `"Bebida láctea parcialmente descremada fluida, baja en lactosa, fortificada con vitaminas A, D, B2, B9 y Zinc"`.
  - `["Sal dietética o modificada, PRO-", "MEDIO"]` → `"Sal dietética o modificada, PROMEDIO"`.
  - `["Vacuno, cortes semigrasos***,", "PROMEDIO, crudo"]` → `"Vacuno, cortes semigrasos, PROMEDIO, crudo"`.
  - `["Yogur descremado con frutas y ce-", "reales"]` → `"…con frutas y cereales"`.
  - `["Flan envasado listo para consu-", "mir light"]` → `"Flan envasado listo para consumir light"`.
  - `isBrokenName`: `"ce-"` y `"reales"` son rotos; `"Uva"` y `"Sal"` no. (Un `"MEDIO"` suelto no
    lo detecta `isBrokenName` porque es mayúscula: lo detecta el emparejamiento A↔B, que falla
    si una parte quedó con el nombre partido.)
  - `sara2SourceKey(3, "Arroz blanco, hervido")` = `"sara2:t03:arroz-blanco-hervido"`;
    `sara2SourceKey(12, "Azúcar")` = `"sara2:t12:azucar"`; `"Leche 50% más"` conserva `50`.
  - `sara2PairKey("Ají verde o amarillo / morrón verde o amarillo, crudo")` =
    `sara2PairKey("Ají verde o amarillo / morrón verde o\namarillo, crudo")`.
- `layout.test.ts`:
  - `assignNameLines` con números: 5 renglones centrados en la fila 1 + 1 renglón alineado con
    la fila 2 (caso p. 92, con las `v` reales) → `[[0,1,2,3,4],[5]]`; nombre de 2 renglones con
    los números en el 2º; fila sin nombre → grupo vacío.
  - p018 (1.A): 1 sección A, título tabla 1, 20 columnas, primera fila "Acelga, cruda" con
    `cells[0]="18"`, `cells[1]="92,7"`, `cells[2]="1,8"`; la fila "Ají verde o amarillo / morrón
    verde o amarillo, crudo" con `cells[0]="17"`.
  - p019 (1.B): 19 columnas; "Ají verde … crudo" (números entre los dos renglones) con
    `cells[0]="0,43"`.
  - p062 (4.A): existe "Bebida láctea parcialmente descremada fluida, baja en lactosa,
    fortificada con vitaminas A, D, B2, B9 y Zinc" con kcal "44" y "Flan envasado listo para
    consumir" con "129".
  - p090 (7.A): "Vacuno, cortes grasos, PROMEDIO, horno/parrilla" (con "*" y "PROME-"/"DIO"); las
    notas "*ej: asado…" no son filas.
  - p092: **2 secciones** (A y B); la A tiene título con número 7 (aunque diga "7.B"); filas
    "Vacuno, cortes semigrasos, (ej: lomo, carne picada especial, roast beef, paleta, bife
    angosto, tortuguita, palomita), PROMEDIO, horno/parrilla" (kcal "225") y "Vizcacha, cruda"
    (kcal "160"); en la B, las mismas dos con cenizas "1,12" y "3,61".
  - p074/p075: las dos secciones dicen "5A" en el título, pero la de p075 es parte B (19 columnas).
- `validate.test.ts` (sobre pares armados de las fixtures):
  - p058/p059 "Salvado de avena" → `NUMERO_INVALIDO`, detalle contiene `«0.121»`.
  - Arroz blanco hervido armado a mano con celdas reales → ok, `kcalPer100` 125.8,
    `nutrients.kcalPublicada` 126, `group` `LEGUMBRES_CEREALES`.
  - Banana (celdas reales de p. 28/29) → `ATWATER`, detalle `kcal publicadas 92, calculadas 88,2, diferencia 3,8`.
  - Yogur descremado (celdas reales) → `SUMA_MACROS`, `suma de macros = 88,9 g`.
  - Fila con cenizas vacía y suma sin cenizas 98 → ok con advertencia `SIN_CENIZAS`.
  - Celda de fibra vacía → `fiberPer100: null`; celda "0" → 0.
  - Proteínas vacía → `FALTA_MACRO`.
- `read.test.ts` (con varias fixtures concatenadas como un único XHTML, respetando el orden):
  - p097+p098: "Salmón blanco, crudo" → `SIN_PAREJA_B`; "Salmón rosado, crudo" importado.
  - p104+p105: la B dice "16.B" → los alimentos quedan en tabla 12
    (`AZUCARES_MERMELADAS_Y_DULCES`) y hay advertencia `TITULO_B_DISTINTO`.
  - p137: todas sus filas en `excluded` con `"excluidas: no vienen cada 100 g"`.
  - Un XHTML con una sola página A sin su B → `status: "fallida"` y `failures` incluye L1.
- `dataset.test.ts`: `serializeSara2Dataset` es estable (dos llamadas iguales, un alimento por
  línea, ordenados por `sourceKey`, sin fecha); `validateSara2Dataset` acepta lo serializado y
  rechaza `format: 2`, `status: "fallida"`, `rejectedPct: 6`, `sourceKey` repetido, grupo
  `SUPLEMENTOS`, número `NaN`.

### 12.3 Prueba contra la base: `packages/db/scripts/test-foods-sara2.ts`

Patrón de `test-prescriptions.ts`. **Solo datos propios, borrados por id.** Sin WhatsApp.

1. **Carga en transacción revertida:** foto de los `PROPIO` (id, name, group, kcal, macros,
   fibra, unitHint, active); dentro de `prisma.$transaction(async (tx) => { … throw ROLLBACK }, { timeout: 300_000 })`:
   `loadSara2Dataset(tx, ds)` (created = 889 si todavía no se cargó, o 0 si ya); segunda
   corrida → created 0, updated 0; mismos ids por `sourceKey`; `sourceKey` sin duplicados;
   desactivar un SARA 2 en `tx` y recargar → sigue inactivo; recargar con un dataset sin un
   alimento → ese queda `active: false` y **existe**; un dataset con 20 % menos →
   `Sara2LoadAbortedError`. Afuera: la foto de `PROPIO` es idéntica y la cantidad de SARA2 es la
   de antes (la transacción se revirtió).
2. **Propios (ids guardados en un array, `delete` por id en `finally`):**
   `createOwnFood` "Prueba HU-005 barrita" (P 10, CHO 60, G 15, fibra 5) → kcal 415,
   `source PROPIO`, `sourceKey null`; mismo nombre con otras mayúsculas →
   `DuplicateOwnFoodNameError`; `findFoodNameConflicts("Acelga, cruda")` → `sara` no null (si ya
   se cargó SARA 2; si no, se saltea con un aviso); `updateOwnFood` con P 20 → kcal 455 y
   `groupAutoAssigned false`; `updateOwnFood` sobre un SARA 2 (si hay) → `FoodNotEditableError`;
   macros 50/40/15 → `InvalidOwnFoodError` con `MACROS_OVER_100`; `applyAtwaterKcal` sobre el
   propio de prueba después de forzar kcal 999 con `prisma.food.update` **por id** → vuelve a
   455; `getFoodUsage` → `{ plans: 0, templates: 0 }`.
3. Termina con "OK" y la lista de ids borrados.

---

## 13. Verificación (el implementer la corre antes de declararse `done`)

```bash
cd /Users/joelmiguelserrudo/Documents/Projects/Nutri-Bot
npm run db:generate
npm run typecheck                    # core, db, web y bot
npm run test                         # vitest de core
npm run sara2:read                   # exit 0; "889 importadas de 906 (17 rechazadas, 1,88 %), 24 excluidas"
npm run sara2:read && git diff --stat -- packages/db/data/sara2/alimentos.json   # segunda corrida: sin cambios
npm run test:foods --workspace packages/db
npm run sara2:load -- --dry-run      # 889 creados (nada queda escrito)
npm run sara2:load                   # 889 creados
npm run sara2:load                   # 0 creados · 0 actualizados · 889 sin cambios · 0 desactivados
```

SQL de control (solo lectura, `docker compose exec -T db psql -U nutri -d nutribot -c …`):

```sql
select source, count(*), sum(active::int) from "Food" group by 1;          -- PROPIO 90 · SARA2 889
select count(*) from "Food" where source='SARA2' and "sourceKey" is null;  -- 0
select "sourceKey", count(*) from "Food" group by 1 having count(*) > 1 and "sourceKey" is not null; -- 0 filas
select name,"kcalPer100","proteinPer100","carbsPer100","fatPer100",nutrients->>'kcalPublicada'
  from "Food" where "sourceKey"='sara2:t03:arroz-blanco-hervido';          -- 125.80 | 2.40 | 28.60 | 0.20 | 126
```

Y la foto de 4.3 otra vez (sin `group`) → `diff` vacío contra `foods-before-hu005.txt`.

**No** correr `next build`, **no** levantar otro `next dev`, **no** `db:seed`/`seed:demo`. El
reinicio del `next dev` lo hace el orquestador. En `progress/impl_HU-005.md`: archivos, salida de
cada comando, la ruta del `pg_dump`, y el resumen del `reporte.md`.

---

## 14. Recorrido del orquestador (en `localhost:3000`)

**Antes:** reiniciar el `next dev` del usuario (cliente de Prisma nuevo).

### 14.1 Solo lectura (datos reales: no tocar botones que guarden)

1. `/alimentos`: por defecto sin inactivos; contador "Mostrando 979 de 979 alimentos" (90
   propios + 889 SARA 2), 50 filas por página y pie "Página 1 de 20". Filtro Fuente "SARA 2" → 889;
   "Propios" → 90. Grupo "Legumbres, cereales, papa, choclo, batata, pan y pastas" con fuente
   "Propios" → 18 (los 9 de Cereales + 9 de Legumbres viejos). Grupo "Grasas" + "Propios" → vacío
   con "No hay alimentos que coincidan" y "Limpiar filtros".
2. Buscar "limon" → aparece "Limón" (SARA 2). Buscar "arroz" → "Arroz blanco cocido" (Propio) y
   "Arroz blanco, crudo" / "Arroz blanco, hervido" (SARA 2), cada uno con su badge. La columna
   Grupo muestra la etiqueta corta con la completa en el tooltip.
3. Ficha **"Arroz blanco, hervido"** (SARA 2): sin formulario; `Alert` "Dato oficial de SARA 2
   (Ministerio de Salud, 2022). No se puede editar…"; Energía **125,8 kcal**, "La tabla publica
   126 kcal"; filas "Proteínas 2,4 g × 4 = 9,6", "Carbohidratos 28,6 g × 4 = 114,4", "Grasas
   0,2 g × 9 = 1,8", Total 125,8. "Calcular porción" 150 → 188,7 kcal, 3,6 / 42,9 / 0,3 g.
   Nutrientes principales con "Sin dato" donde corresponda; "Más nutrientes" se despliega con
   las 5 secciones. Se ven "Desactivar" y "Duplicar como propio" (no tocarlos acá).
4. Ficha **"Cerveza con alcohol"**: el desglose tiene la fila "Alcohol 3,9 g × 7 = 27,3 kcal".
5. Ficha **"Arroz blanco cocido"** (Propio, `cmtynk2e800001y4zkerocwsl`): grupo "Legumbres,
   cereales, …"; aviso "Las kcal cargadas (130) no coinciden con el cálculo por macros (125,5)"
   con "Usar 125,5 kcal" (**no tocar**); aviso "Revisá el grupo…"; "Lo usan 1 plan y 0
   plantillas"; el formulario con las kcal en vivo "= 125,5 kcal" (no guardar).
6. Plan **"Plan Inicial"** de Juan Pérez (`cmtytptog0003gnmfp4qzm5sx`, paciente
   `cmtyq7tzm0017xnwskwm1ttlb`): mismos 16 ítems y totales que antes de la migración:
   **2.017 kcal · P 130,6 g · C 241,2 g · G 61,3 g** (calculado en psql antes de la HU). Pasar el
   mouse por las kcal de "Arroz blanco cocido" 200 g → popover "Porción de 200 g", "P 21,6 kcal
   · CHO 224 kcal · G 5,4 kcal", Total 251 kcal y la nota de kcal cargadas a mano (el ítem dice
   260 kcal). En "Agregar alimento" de una comida: escribir "arroz" → hasta 20 resultados con
   grupo y badge; ↓/↑, Esc cierra; **no** tocar "Agregar".
7. `/plantillas`: hoy no hay plantillas (psql). Nada que ver en solo lectura.

### 14.2 Pasos que escriben (solo datos propios de prueba, borrados por id al final)

Anotar cada id creado (se ve en la URL).

8. `/alimentos/nuevo`: "Prueba HU-005 barrita", grupo Otros, P 10, CHO 60, G 15, fibra 5 → el
   recuadro dice "= 415 kcal cada 100 g" y el desglose. Cambiar a P 50, CHO 40 → mensaje "Los
   nutrientes suman más de 100 g cada 100 g de alimento." y no guarda. Volver a P 10, CHO 60 →
   "Crear alimento" → toast "Alimento guardado" y ficha Propio. (id A)
9. `/alimentos/nuevo` con nombre "arroz blanco COCIDO" → "Ya tenés un alimento propio con ese
   nombre." (no guarda). Con nombre "Acelga, cruda" (P 1, CHO 3, G 0) → advertencia "Ya existe
   «Acelga, cruda» en SARA 2…" → "Guardar igual" → guarda. (id B)
10. Ficha "Queso Cremoso" (SARA 2) → "Duplicar como propio" → formulario con "Queso Cremoso
    (copia)", P 20,4 · CHO 2,5 · G 24,3 → "= 310,3 kcal" → guardar → ficha Propio. La ficha del
    original sigue igual. (id C)
11. Paciente de prueba por SQL y un plan desde el panel:
    ```sql
    insert into "Patient"(id,"whatsappJid",phone,name,"updatedAt")
    values ('hu005_walk','hu005-walk@test.invalid','000','Prueba HU-005',now());
    ```
    Ficha → Planes → crear un plan, comida "Almuerzo" → combobox: escribir "arroz hervido", ↓
    hasta "Arroz blanco, hervido", Enter (no se envía el form), cantidad 150 → "Agregar" → el ítem
    muestra 189 kcal; popover "P 14,4 kcal · CHO 171,6 kcal · G 2,7 kcal", Total 188,7 kcal, sin
    nota. Agregar también "Prueba HU-005 barrita" 50 g con el mouse. Probar "Alimento libre" con
    descripción libre.
12. Ficha de "Prueba HU-005 barrita": "Lo usan 1 plan y 0 plantillas". Cambiar P a 20 → Guardar
    → diálogo "¿Guardar los cambios?" con "(1 plan, 0 plantillas), incluidos los ya entregados"
    → Cancelar → nada cambió. Otra vez → "Guardar igual" → kcal 455 y el plan de prueba sube
    (50 g → 227,5 kcal).
13. "Acelga, cruda" (SARA 2) → "Desactivar" → la lista (sin "Mostrar inactivos") ya no la
    muestra y el combobox tampoco → "Activar" otra vez (tiene que quedar **activa**).
14. `/plantillas` → crear una plantilla de prueba → el combobox funciona igual (sin popover,
    como hoy sin macros). (id T)
15. `select count(*) from "OutboundMessage" where "toJid"='hu005-walk@test.invalid';` → 0.

Limpieza (por id):

```sql
delete from "Patient" where id = 'hu005_walk';            -- cascada: su plan, comidas e ítems
delete from "PlanTemplate" where id = '<id T>';           -- cascada: comidas e ítems
delete from "Food" where id in ('<id A>','<id B>','<id C>') and source = 'PROPIO';
```

El asistente de IA no se prueba en el recorrido (llama a la API paga y escribe en el plan). Si el
usuario lo pide, sobre el plan de prueba antes de la limpieza.

---

## 15. Restricciones para el implementer (obligatorias)

- **Base:** solo la migración de 4.3, la carga SARA 2 (`sara2:load`) y las pruebas con datos
  propios borrados por id (o en transacción revertida). Nunca `deleteMany`/`updateMany` sin
  filtro por `source: "SARA2"` o por ids propios. Nunca modificar ni borrar los 90 alimentos, ni
  planes, ni pacientes.
- **Migraciones:** `--create-only`, revisar el SQL, aplicar, `db:generate`. Prohibido
  `prisma migrate reset`, `prisma db push` y aceptar el reset por drift. `pg_dump` antes de
  aplicar. Si hay drift: `blocked` con la salida de `migrate status`.
- **UI:** nunca `await confirm()` dentro de `<form action>` ni de `startTransition` (patrón
  `onSubmit` de 9.4, como `DeleteMealButton`).
- **Dev server:** no `next build`, no otro `next dev`. Si cambia el schema, el reinicio del
  `next dev` lo hace el orquestador.
- **WhatsApp:** nada. Esta HU no encola mensajes.
- **Git:** rama `hu-005-base-alimentos-sara2`, **sin commitear**.
- No correr `db:seed` ni `seed:demo`.
- `alimentos.json` y `reporte.md` los genera el lector: no se editan a mano. Las filas rechazadas
  no se corrigen ni se inventan.

---

## 16. Preguntas técnicas abiertas (bloquean `arquitectura_lista`)

### Q1. La suma de macros de D6 rechaza el 9,4 % y dispara el freno

**Hechos medidos** (906 filas A de las tablas 1–25, lector de la sección 3):

- 237 filas tienen cenizas vacía en el PDF: la suma "con cenizas" de D6 no se puede calcular tal
  cual. Sin cenizas, 210 de esas 237 igual caen en 97–103.
- La tabla publicada **no cumple** el 97–103 que dice haber verificado: 77 filas quedan fuera
  (46 con cenizas, 31 sin), entre ellas Palta (104,0), Avena arrollada cruda (103,9), Soja
  porotos crudos (108,3), Galletitas de agua PROMEDIO (106,7), Queso Gruyére (103,3), Huevo yema
  (103,6), Yogur descremado (88,9) y Margarina (80,5). Los valores leídos coinciden con el PDF.

| Opción | Regla de suma | Rechazadas | Importadas | ¿Freno 5 %? |
|---|---|---|---|---|
| **a. Literal D6** | fuera de 97–103 → rechaza (sin cenizas: suma sin ellas) | 85 (9,4 %) | 821 | **Sí: no se carga nada** |
| **b. Recomendada** | fuera de **90–110** → rechaza; fuera de 97–103 → advertencia; sin cenizas → suma sin ellas + advertencia | **17 (1,9 %)** | **889** | No |
| c. Solo advertencia | la suma nunca rechaza; Atwater sí | 8 (0,9 %) | 898 | No |

**Recomendación: b.** Conserva el espíritu de D6 (no inventar, el freno detecta un lector roto)
y deja afuera solo lo groseramente inconsistente (Margarina 80,5 g, Chicles 70,6 g, Vizcacha
111,9 g). Con (a) no se importa nada: la HU no se puede cumplir. La SDD ya está escrita con (b).

### Q2. Tolerancia de Atwater y la banana

Con `máx(2 kcal, 3 %)` (D6) se rechazan 6 filas; una es **"Banana"** (publica 92, calcula 88,2:
diferencia 4,3 %). Con `máx(2 kcal, 5 %)` entraría solo la banana (las otras 5 difieren entre
6 % y 67 %).

**Recomendación: mantener D6 (3 %)**: está validado, la banana es una inconsistencia real de la
tabla, y el propio "Banana" de la base (de los 90) sigue disponible. Si el orquestador prefiere
tenerla en SARA 2, se cambia `atwaterRel` a `0.05` y los números esperados pasan a 890 / 16.

### Resolución del orquestador (modo autónomo, 2026-09-24): manda sobre Q1 y Q2

- **Q1 → opción b.** Suma de macros fuera de **90–110 g** → rechaza; fuera de 97–103 →
  advertencia en el reporte; sin cenizas → suma sin ellas y advertencia. La regla literal de D6
  no puede cumplirse, porque la tabla oficial misma no la respeta.
- **Q2 → tolerancia de Atwater `máx(2 kcal, 5 %)`** (`atwaterRel = 0.05`). Entra la banana (la
  diferencia es de 4,3 %). Como se guardan las kcal **calculadas** por Atwater (D5), la diferencia
  con las publicadas es solo un control de lectura. Números esperados: **890 importadas / 16
  rechazadas**; ajustar tests y criterio de éxito.
- Con esto, la SDD queda en `arquitectura_lista`.
