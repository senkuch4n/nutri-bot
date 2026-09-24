# HU-004: Calculadora de requerimiento y diagnóstico antropométrico

**Como** profesional (nutricionista),
**quiero** ver en cada consulta el diagnóstico antropométrico calculado (IMC con su clasificación,
riesgo por cintura, ICC, % de grasa estimado, peso ideal y peso ajustado) y calcular el
requerimiento energético (TMB con 4 fórmulas, GET, VCT y macros),
**para que** pueda diagnosticar y prescribir sin hacer cuentas a mano, y guardar la prescripción
con la fecha de la consulta para ver cómo cambió a lo largo del tratamiento.

Origen: épicas 18 (calculadora) y 19 (diagnóstico) de `docs/historias-usuario-nutridesk.md`
(Ronda 2). Fórmulas: `docs/FORMULAS CALORICAS.docx`. Rangos saludables: el informe de ISAKMetry
que usa la nutricionista (`docs/ISAKMetry_*.pdf`, página "Índices de salud").

---

## Contexto

### Qué existe hoy

- **Datos para cálculos (HU-001):** `Patient` tiene `sex`, `activityLevel`, `nutritionGoal` y
  `bodyFrame` (enums, nullables), que son el **valor actual** del paciente. En
  `packages/core/src/patient-formula-data.ts` ya están:
  - los factores de actividad (1.2 / 1.375 / 1.55 / 1.725 / 1.9) con su descripción;
  - los rangos de ajuste por objetivo: bajar (déficit moderado −15/−25 %, agresivo −25/−30 %),
    mantener (0 %), subir de peso y ganar masa muscular (los dos con +10/+20 %);
  - el ajuste de Hamwi por contextura (−10 / 0 / +10 %) y `effectiveBodyFrame` (Mediana si falta);
  - `computeAgeYears` (edad a una fecha, en la zona de la profesional), `isMinor`,
    `MINOR_WARNING_TEXT` ("Las fórmulas son para adultos.");
  - `getMissingFormulaData` / `missingFormulaDataMessage` (sexo, actividad, objetivo, fecha de
    nacimiento, peso y talla; contextura y % de grasa no bloquean).
- **Mediciones:** `EvolutionEntry` (peso, talla, cintura, cadera, 3 perímetros más, 3 pliegues y
  bioimpedancia: % de grasa, masa muscular, agua, grasa visceral, masa ósea y **metabolismo basal
  en kcal medido por el InBody**). Desde la HU-003 cada medición pertenece a una consulta.
  `getLatestFormulaMeasurements` (`packages/db/domain/clinical.ts`) da el último peso, talla y %
  de grasa del paciente por separado.
- **IMC e ICC:** `computeBmi` y `computeWaistHipRatio` en `packages/core/src/anthropometry.ts`.
  Se muestran en la tabla de Evolución y en las mediciones de la consulta, **sin clasificación**.
- **Consulta (HU-003):** entidad `Consultation` (paciente, fecha `consultedAt`, turno opcional,
  notas, plan indicado). El detalle vive en `/pacientes/[id]/consultas/[consultationId]`: encabezado
  con la edad a la fecha de la consulta, "Mediciones" en la columna principal, "Plan indicado" y
  "Notas" en la lateral. La HU-003 (D6) dejó reservado el lugar de la sección "Requerimiento",
  entre "Mediciones" y "Plan indicado", sin mostrarla todavía. La lista de consultas muestra chips
  de contenido (`consultationChips`: Antropometría, Bioimpedancia, Plan, Notas).
- **Pestaña Resumen** de la ficha: tarjeta "Datos para cálculos", "Evolución" (últimos valores),
  turnos. No muestra nada de requerimiento.
- **Planes:** `packages/core/src/nutrition.ts` suma kcal y macros de los alimentos del plan. No hay
  ningún objetivo de kcal ni de macros guardado en ningún lado.
- **Nada de esto existe hoy:** TMB por fórmula, GET, VCT, macros objetivo, peso ideal, peso
  ajustado, clasificación OMS del IMC, riesgo por cintura, Deurenberg, cintura/talla ni índice de
  conicidad. `git log` no muestra trabajo previo sobre calculadora o requerimiento.

### Qué es lo nuevo

1. Una sección **"Diagnóstico antropométrico"** en el detalle de la consulta, calculada al vuelo
   con las mediciones de la consulta: IMC con clasificación OMS, riesgo por cintura, ICC con
   riesgo por sexo, % de grasa estimado (Deurenberg), peso ideal por 5 fórmulas, % del peso ideal
   y la sugerencia de peso ajustado.
2. Una sección **"Requerimiento"** en el mismo detalle: calculadora TMB → GET → VCT → macros, y
   la **prescripción guardada en la consulta** (con fecha = la de la consulta), con una foto de los
   datos de entrada que se usaron.
3. En la pestaña **Resumen**, el último requerimiento indicado. En la lista de consultas, el chip
   "Requerimiento".
4. La lógica, pura y con tests, en `packages/core`.

Todo esto es **solo para adultos (18 años o más a la fecha de la consulta)**. La nutricionista
atiende desde los 5 años; la pediatría es la HU-008.

---

## Criterios de aceptación

Datos de ejemplo usados abajo (los números son los que tienen que salir):

- **Ana**: Femenino, nacida el 20/03/1992 (34 años al 12/09/2026), actividad "Ligero", objetivo
  "Bajar de peso", contextura sin cargar. Consulta del 12/09/2026 con una medición: peso 66,5 kg,
  talla 162 cm, cintura 82 cm, cadera 100 cm, grasa 29,4 % (bioimpedancia).
- **Luis**: Masculino, 45 años, actividad "Sedentario", objetivo "Bajar de peso". Consulta con
  peso 118 kg, talla 180 cm, cintura 110 cm, sin % de grasa.

```gherkin
Feature: Diagnóstico antropométrico automático

  Background:
    Given la profesional está logueada en el panel

  Scenario: Diagnóstico completo de una paciente adulta
    When la profesional abre la consulta del 12/09/2026 de "Ana"
    Then la sección "Diagnóstico antropométrico" muestra:
      | Indicador            | Valor   | Clasificación                 |
      | IMC                  | 25,3    | Sobrepeso                     |
      | Cintura              | 82 cm   | Riesgo elevado                |
      | Índice cintura/cadera| 0,82    | Sin riesgo aumentado          |
      | % de grasa estimado  | 32,8 %  | Deurenberg (medido: 29,4 %)   |
    And muestra el peso ideal:
      | Fórmula                  | Peso ideal |
      | Devine                   | 54,2 kg    |
      | Hamwi (contextura Mediana, asumida) | 53,8 kg |
      | Broca                    | 62,0 kg    |
      | Broca-Brugsch            | 52,7 kg    |
      | Lorentz                  | 57,2 kg    |
    And muestra "Peso actual: 122,7 % del peso ideal (Devine)"

  Scenario: Clasificación OMS del IMC en todos los rangos
    Then el IMC se clasifica así:
      | IMC         | Clasificación          |
      | < 18,5      | Bajo peso              |
      | 18,5 – 24,9 | Normal                 |
      | 25,0 – 29,9 | Sobrepeso              |
      | 30,0 – 34,9 | Obesidad grado I       |
      | 35,0 – 39,9 | Obesidad grado II      |
      | ≥ 40,0      | Obesidad grado III     |

  Scenario: Riesgo por cintura según sexo
    Then la cintura se clasifica así:
      | Sexo      | Riesgo elevado | Riesgo muy elevado |
      | Masculino | ≥ 94 cm        | ≥ 102 cm           |
      | Femenino  | ≥ 80 cm        | ≥ 88 cm            |
    And por debajo del primer umbral se muestra "Sin riesgo aumentado"

  Scenario: Sugerencia de peso ajustado en obesidad
    When la profesional abre la consulta de "Luis"
    Then el diagnóstico muestra IMC 36,4 "Obesidad grado II" y cintura 110 cm "Riesgo muy elevado"
    And muestra el peso ideal de Devine 75,0 kg y "Peso actual: 157,4 % del peso ideal (Devine)"
    And muestra el aviso "El peso actual supera el 130 % del peso ideal. Se sugiere calcular
        con peso ajustado: 85,7 kg."

  Scenario: Sin sugerencia de peso ajustado por debajo del umbral
    When la profesional abre la consulta del 12/09/2026 de "Ana"
    Then no se muestra el aviso de peso ajustado

  Scenario: Faltan medidas para algunos indicadores
    Given la consulta de "Luis" no tiene cadera
    Then el índice cintura/cadera se muestra como "Sin dato (falta cadera)"
    And el resto del diagnóstico se muestra igual

  Scenario: Sin sexo cargado
    Given "Ana" no tiene sexo cargado
    When la profesional abre su consulta
    Then se muestran el IMC con su clasificación y el peso ideal de Broca
    And cintura, ICC, Deurenberg y las demás fórmulas de peso ideal dicen "Falta sexo"
    And se muestra el aviso de faltantes con el enlace "Completar datos para cálculos"

  Scenario: La consulta no tiene medición propia
    Given la consulta del 26/09 de "Ana" no tiene mediciones
    And la última medición anterior de "Ana" es la del 12/09
    When la profesional abre la consulta del 26/09
    Then el diagnóstico usa los valores del 12/09
    And cada valor tomado de otra consulta muestra su fecha "(12/09/2026)"

  Scenario: Paciente menor de 18 a la fecha de la consulta
    Given "Tomás" tenía 12 años a la fecha de su consulta
    When la profesional abre esa consulta
    Then la sección "Diagnóstico antropométrico" muestra "Las fórmulas son para adultos."
    And muestra el IMC sin clasificación
    And no muestra peso ideal, riesgo por cintura, ICC con riesgo ni Deurenberg
    And no se ofrece la sección "Requerimiento"


Feature: Calculadora de requerimiento energético

  Background:
    Given la profesional está logueada en el panel
    And abrió la consulta del 12/09/2026 de "Ana", que no tiene prescripción

  Scenario: TMB por las 4 fórmulas, lado a lado
    When toca "Calcular requerimiento"
    Then ve la TMB de las 4 fórmulas con el peso actual (66,5 kg):
      | Fórmula          | TMB       |
      | Mifflin-St Jeor  | 1347 kcal |
      | Harris-Benedict  | 1417 kcal |
      | Katch-McArdle    | 1384 kcal |
      | Cunningham       | 1533 kcal |
    And Mifflin-St Jeor está preseleccionada
    And Katch-McArdle y Cunningham indican "con 29,4 % de grasa (bioimpedancia 12/09/2026)"

  Scenario: GET y VCT con los datos del paciente precargados
    When toca "Calcular requerimiento"
    Then la actividad viene precargada en "Ligero (×1,375)" y el objetivo en "Bajar de peso"
    And el ajuste ofrece "Déficit moderado (−15 a −25 %)" y "Déficit agresivo (−25 a −30 %)"
    When elige "Déficit moderado" y −20 %
    Then ve GET 1851 kcal y VCT calculado 1481 kcal
    And el campo "VCT indicado" queda en 1481 kcal

  Scenario: El ajuste está limitado al rango del objetivo
    When elige "Déficit moderado" e ingresa −35 %
    Then ve "El ajuste para déficit moderado va de −15 % a −25 %"
    And no puede guardar

  Scenario: Macros por porcentaje del VCT
    Given el VCT indicado es 1481 kcal
    When elige "Porcentajes del VCT" con proteínas 20 %, grasas 30 % y carbohidratos 50 %
    Then ve:
      | Macro          | %    | kcal | g/día | g/kg |
      | Proteínas      | 20 % | 296  | 74    | 1,1  |
      | Grasas         | 30 % | 444  | 49    | 0,7  |
      | Carbohidratos  | 50 % | 741  | 185   | 2,8  |

  Scenario: Los porcentajes tienen que sumar 100
    When ingresa proteínas 20 %, grasas 30 % y carbohidratos 45 %
    Then ve "Los porcentajes suman 95 %; tienen que sumar 100 %"
    And no puede guardar

  Scenario: Proteína en g/kg
    Given el VCT indicado es 1481 kcal
    When elige "Proteína en g/kg" con 1,6 g/kg y grasas 30 %
    Then ve proteínas 106 g (426 kcal, 28,7 %), grasas 49 g (444 kcal, 30 %)
         y carbohidratos 153 g (611 kcal, 41,3 %) como resto
    And ve el aviso "Carbohidratos 41,3 %: fuera del rango de referencia (45–60 %)"
    And puede guardar igual

  Scenario: Guardar la prescripción en la consulta
    Given completó la calculadora con Mifflin-St Jeor, Ligero, −20 % y macros 20/30/50
    When toca "Guardar prescripción"
    Then ve el aviso "Prescripción guardada"
    And la sección "Requerimiento" muestra el resumen: "VCT 1481 kcal · P 74 g · G 49 g · C 185 g"
        con la fórmula, el factor, el ajuste y el peso usado
    And la consulta muestra el chip "Requerimiento" en la lista de consultas

  Scenario: La prescripción guarda los datos con los que se calculó
    Given la consulta del 12/09 de "Ana" tiene la prescripción guardada con actividad "Ligero"
    When la profesional cambia la actividad de "Ana" a "Moderado" en "Datos para cálculos"
    And vuelve a abrir la consulta del 12/09
    Then la prescripción sigue mostrando "Ligero (×1,375)" y VCT 1481 kcal

  Scenario: Editar la prescripción de una consulta
    Given la consulta del 12/09 de "Ana" tiene prescripción
    When toca "Editar", cambia el ajuste a −15 % y guarda
    Then la consulta sigue teniendo una sola prescripción, con VCT 1574 kcal

  Scenario: Calcular con peso ajustado
    Given abrió la consulta de "Luis"
    When toca "Calcular requerimiento"
    Then ve la opción "Peso para las fórmulas": "Actual (118 kg)" o "Ajustado (85,7 kg)"
    And "Ajustado" está preseleccionado, con la nota "Sugerido: supera el 130 % del peso ideal"
    And Mifflin-St Jeor y Harris-Benedict se calculan con 85,7 kg
    And Katch-McArdle y Cunningham no usan el peso ajustado: se calculan con la masa magra del peso actual

  Scenario: Katch-McArdle y Cunningham sin % de grasa medido
    Given "Luis" no tiene ningún % de grasa medido
    When abre la calculadora
    Then Katch-McArdle y Cunningham se muestran deshabilitadas con "Sin % de grasa medido"
    And el botón "Usar el estimado de Deurenberg" las habilita con el % estimado, marcado "estimado"

  Scenario: TMB medida por bioimpedancia como referencia
    Given la medición de la consulta tiene metabolismo basal 1450 kcal (InBody)
    When abre la calculadora
    Then ve "Medido por bioimpedancia: 1450 kcal" como referencia debajo de las 4 fórmulas

  Scenario: Faltan datos que bloquean el cálculo
    Given "Ana" no tiene fecha de nacimiento
    When abre la consulta
    Then la sección "Requerimiento" muestra "Faltan datos para los cálculos: fecha de nacimiento.
         La fecha de nacimiento se carga en "Datos"."
    And el botón "Calcular requerimiento" está deshabilitado

  Scenario: Actividad u objetivo sin cargar en el paciente
    Given "Ana" no tiene actividad ni objetivo cargados
    When abre la calculadora
    Then los selects de actividad y objetivo arrancan vacíos y hay que elegirlos para guardar
    And lo elegido queda en la prescripción, sin cambiar los datos del paciente

  Scenario: El último requerimiento en el Resumen
    Given "Ana" tiene prescripciones en las consultas del 12/08 (VCT 1600) y del 12/09 (VCT 1481)
    When la profesional abre la pestaña "Resumen"
    Then ve la tarjeta "Requerimiento indicado" con "1481 kcal · 12/09/2026",
         los gramos de proteínas, grasas y carbohidratos, "−119 kcal respecto del 12/08/2026"
         y el enlace "Ver consulta"

  Scenario: Paciente sin prescripciones
    Given "Luis" no tiene ninguna prescripción
    When abre la pestaña "Resumen"
    Then la tarjeta "Requerimiento indicado" dice "Todavía no hay un requerimiento indicado.
         Se calcula en una consulta." con el enlace a "Consultas"

  Scenario: Valores inválidos enviados al servidor
    When llega al guardado un factor de actividad o un ajuste fuera de rango, o macros que no suman 100 %
    Then no se guarda nada
    And la profesional ve "Datos inválidos"

  Scenario: Borrar la prescripción
    Given la consulta del 12/09 tiene prescripción
    When toca "Borrar prescripción" y confirma
    Then la consulta queda sin prescripción y sin el chip "Requerimiento"

  Scenario: La prescripción impide eliminar la consulta
    Given la consulta del 15/09, sin turno, tiene prescripción y nada más
    When la profesional intenta eliminarla
    Then no se elimina
    And ve "Para eliminar la consulta primero borrá sus mediciones, la prescripción y quitá el plan indicado"

  Scenario: El bot y el portal no cambian
    When se guarda una prescripción
    Then no se encola ningún mensaje de WhatsApp
    And el portal del paciente no muestra kcal ni macros
```

---

## Fórmulas (referencia del documento de la nutricionista)

Todas en `packages/core`, con tests que reproduzcan los números de arriba. Peso en kg, talla en
cm, edad en años a la fecha de la consulta.

| Cálculo | Fórmula |
|---|---|
| Mifflin-St Jeor | H: 10·peso + 6,25·talla − 5·edad + 5 · M: … − 161 |
| Harris-Benedict (revisada) | H: 88,362 + 13,397·peso + 4,799·talla − 5,677·edad · M: 447,593 + 9,247·peso + 3,098·talla − 4,330·edad |
| Katch-McArdle | 370 + 21,6·masa magra; masa magra = peso · (1 − %grasa/100) |
| Cunningham | 500 + 22·masa magra |
| GET | TMB × factor de actividad |
| VCT | GET × (1 + ajuste %/100) |
| Macros | proteínas y carbohidratos 4 kcal/g, grasas 9 kcal/g |
| Devine | H: 50 + 2,3·(talla − 152,4)/2,54 · M: 45,5 + … |
| Hamwi | H: 48 + 2,7·(talla/2,54 − 60) · M: 45,5 + 2,2·(…) · ± 10 % por contextura |
| Broca | talla − 100 |
| Broca-Brugsch | H: (talla − 100) − 10 % · M: − 15 % |
| Lorentz | H: (talla − 100) − (talla − 150)/4 · M: … /2,5 |
| Peso ajustado | ideal + 0,25·(real − ideal), sugerido si real > umbral % del ideal (D2) |
| IMC | peso / talla(m)² (ya existe) |
| ICC | cintura / cadera (ya existe) |
| Deurenberg | 1,20·IMC + 0,23·edad − 10,8·sexo − 5,4 (sexo = 1 hombre, 0 mujer) |
| Cintura/talla (D6) | cintura / talla |
| Índice de conicidad (D6) | cintura(m) / (0,109 · √(peso / talla(m))) |

Los cálculos intermedios no se redondean; se redondea solo lo que se muestra (kcal a entero, kg y
% a 1 decimal, índices a 2 decimales).

---

## Datos que se registran

El **diagnóstico no se guarda**: se recalcula siempre con las mediciones y los datos del
paciente. Lo que se guarda es la **prescripción**, una por consulta (D5).

| Dato | Obligatorio | Uso |
|---|---|---|
| Consulta | Sí (única) | La fecha de la prescripción es la de la consulta |
| Fórmula de TMB elegida | Sí | Mifflin / Harris-Benedict / Katch-McArdle / Cunningham |
| TMB (kcal) | Sí | Resultado de la fórmula elegida |
| TMB de las otras fórmulas | No | Para ver después con qué se comparó (D5) |
| Peso usado y tipo (actual / ajustado) | Sí | Foto del dato de entrada |
| Peso actual, peso ideal (fórmula y valor) | Sí si se usó ajustado | Explica de dónde salió el ajustado |
| Talla, edad, sexo | Sí | Foto de los datos de entrada (los del paciente cambian) |
| % de grasa y su origen (bioimpedancia con fecha / Deurenberg) | Si se usó Katch-McArdle o Cunningham | Foto del dato de entrada |
| Nivel de actividad y factor | Sí | GET |
| GET (kcal) | Sí | |
| Objetivo, rango (moderado / agresivo / superávit) y ajuste % | Sí | VCT |
| VCT calculado (kcal) | Sí | |
| VCT indicado (kcal) | Sí | El que se prescribe (D7) |
| Modo de macros (% del VCT / proteína en g/kg) | Sí | |
| % de proteínas, grasas y carbohidratos | Sí | |
| Proteína en g/kg | Si el modo es g/kg | |
| Gramos objetivo por día de proteínas, grasas y carbohidratos | Sí | **Los usa la épica 23** (plan contra objetivo) |
| Creada / actualizada | Automático | Auditoría |

---

## Diseño UX

Sistema de diseño nuevo, al estilo Notion (`Refactorizaciones/rediseno-ui-*.md`): `Card`, `Badge`
(tonos existentes: `success`, `warning`, `danger`, `neutral`, `info`), `Alert`, `Quantity`,
`Select`, `Input`, `useConfirm`, `notify`. Sin colores nuevos. Números en formato es-AR
(`formatDecimalEs`). No se toca el bot ni el portal.

### Detalle de la consulta (`/pacientes/[id]/consultas/[consultationId]`)

En la columna principal, debajo de "Mediciones" y en este orden: **"Diagnóstico antropométrico"**
y **"Requerimiento"**. La columna lateral (Plan indicado, Notas) no cambia.

#### Diagnóstico antropométrico (`Card`)

- Descripción: "Con la medición del 12/09/2026" (o las fechas de cada dato si vienen de otra
  consulta, ver D4).
- **Indicadores**, en una lista de filas `valor + Badge`:
  - IMC — "Normal" `success`, "Bajo peso" y "Sobrepeso" `warning`, "Obesidad grado I/II/III"
    `danger`. Al lado, en gris, el rango saludable "18,5–24,9".
  - Cintura — "Sin riesgo aumentado" `success`, "Riesgo elevado" `warning`, "Riesgo muy elevado"
    `danger`.
  - Índice cintura/cadera — "Sin riesgo aumentado" / "Riesgo aumentado" (D3).
  - Cintura/talla y conicidad, si entran (D6), con su rango saludable (<0,50 y <1,4).
  - % de grasa estimado (Deurenberg), con "estimación poblacional" en gris; si hay % medido, al lado
    "medido: 29,4 % (bioimpedancia 12/09/2026)".
  - Cada indicador que no se puede calcular dice por qué: "Sin dato (falta cadera)", "Falta sexo".
- **Peso ideal**: tabla chica de 5 filas (fórmula / kg). Hamwi aclara la contextura usada
  ("Mediana, asumida" si no está cargada). Debajo: "Peso actual: 122,7 % del peso ideal (Devine)".
- **Aviso de peso ajustado** (`Alert` `warning`) si supera el umbral: "El peso actual supera el
  130 % del peso ideal. Se sugiere calcular con peso ajustado: 85,7 kg."
- **Menor de 18** a la fecha de la consulta: `Alert` `info` "Las fórmulas son para adultos." y
  solo el IMC sin clasificación. La sección "Requerimiento" no se muestra.
- **Sin ninguna medición** (ni en la consulta ni antes): "Cargá peso y talla en Mediciones para
  ver el diagnóstico."

#### Requerimiento (`Card`)

Tres estados:

1. **Sin prescripción**: texto "Todavía no hay un requerimiento indicado en esta consulta." y
   botón **"Calcular requerimiento"**. Si faltan datos bloqueantes (sexo, fecha de nacimiento,
   peso o talla), el aviso de faltantes de la HU-001 (`missingFormulaDataMessage`) con el enlace
   "Completar datos para cálculos" (abre el `Sheet` de la HU-001 o lleva a la pestaña), y el botón
   deshabilitado.
2. **Calculando** (la calculadora se abre dentro de la misma tarjeta, en pasos numerados que se
   recalculan al instante, sin botón "calcular"):
   1. **Peso para las fórmulas**: control segmentado "Actual (66,5 kg)" / "Ajustado (57,3 kg)".
      Preselecciona "Ajustado" solo si hay sugerencia de peso ajustado.
   2. **TMB**: tabla de 4 filas con radio (fórmula, kcal, dato que usa). Mifflin preseleccionada
      (D1). Las que no se pueden calcular, deshabilitadas con el motivo. Debajo, si hay, "Medido por
      bioimpedancia: 1450 kcal" como referencia (D8).
   3. **Actividad**: `Select` con las 5 opciones de la HU-001 (etiqueta, factor y descripción),
      precargado con la del paciente. Resultado: "GET 1851 kcal".
   4. **Objetivo**: `Select` con los 4 objetivos, precargado con el del paciente; si tiene más de
      un rango (bajar), elegir el rango; luego el % dentro del rango (`Input` numérico con el
      rango como ayuda; ver D9 sobre el valor inicial). Resultado: "VCT calculado 1481 kcal".
   5. **VCT indicado**: `Input` precargado con el calculado; si se cambia, aparece "Difiere del
      calculado en +19 kcal" y "Volver al calculado" (D7).
   6. **Macros**: control segmentado "Porcentajes del VCT" / "Proteína en g/kg".
      - % del VCT: tres `Input` (proteínas, grasas, carbohidratos) con el rango de referencia como
        ayuda (15–25 / 20–35 / 45–60) y la suma en vivo.
      - g/kg: proteína en g/kg (ayuda "1,2–2,2 g/kg"), grasas en %, carbohidratos = resto.
      - Tabla resultado: macro / % / kcal / g por día / g/kg.
      - Fuera del rango de referencia: aviso `warning` por macro, **no bloquea**. Suma distinta de
        100 % o carbohidratos negativos: error en línea, **bloquea**.
   - Pie: "Guardar prescripción" (`Guardando…` mientras procesa) y "Cancelar". Si el servidor
     rechaza: "Datos inválidos" en rojo. Al guardar: `notify` "Prescripción guardada".
   - Lo que se elige en la calculadora **no cambia los datos del paciente** (D10). Si la
     actividad o el objetivo elegidos difieren de los del paciente, se muestra en gris "Distinto
     del dato del paciente (Moderado)".
3. **Con prescripción**: resumen de solo lectura:
   - Línea principal grande: "VCT 1481 kcal".
   - "Mifflin-St Jeor · TMB 1347 kcal · Ligero ×1,375 · GET 1851 kcal · Déficit moderado −20 %".
   - "Peso usado: 66,5 kg (actual)" o "85,7 kg (ajustado; ideal Devine 75,0 kg)".
   - Tabla de macros (% / g / g/kg).
   - Acciones: "Editar" (abre la calculadora con los valores guardados, no con los actuales del
     paciente) y "Borrar prescripción" (`danger` chico, con `useConfirm`: "¿Borrar la prescripción
     de esta consulta? No se puede deshacer.").

### Lista de consultas (pestaña Consultas)

Nuevo chip **"Requerimiento"** cuando la consulta tiene prescripción. La regla de "consulta vacía"
y "se puede eliminar" pasa a contar también la prescripción (ver escenario).

### Pestaña Resumen

Nueva tarjeta **"Requerimiento indicado"** (junto a "Datos para cálculos"): el VCT de la
prescripción de la consulta más reciente que tenga una, su fecha, gramos de P/G/C, la diferencia
con la prescripción anterior ("−119 kcal respecto del 12/08/2026") y "Ver consulta". Estado vacío:
"Todavía no hay un requerimiento indicado. Se calcula en una consulta." Sin gráfico de historial
(D11).

### Bot y portal

Sin cambios. Ningún texto de WhatsApp nuevo. El portal no muestra kcal ni macros.

---

## Fuera de alcance

- Pediatría (HU-008): percentiles OMS, ecuaciones para chicos. Acá, a los menores solo se les
  muestra el aviso.
- Embarazo y lactancia.
- Informe antropométrico ISAK completo, composición corporal, somatotipo e índices de ISAKMetry
  (HU-006/007), salvo lo que se decida en D6.
- Plan contra objetivo, % de adecuación, reparto por comida y VCT en el PDF del plan (épica 23).
  Esta HU solo deja guardados los gramos objetivo.
- Base SARA 2 (HU-005, épica 20).
- Fibra, micronutrientes (épica 26) y agua como objetivos.
- Mostrar el requerimiento en el portal o mandarlo por WhatsApp.
- Pasarle el requerimiento a la IA (propuesta de plan y asistente).
- Gráfico de la evolución del VCT.
- Guardar el diagnóstico (se recalcula siempre).
- Sugerir la contextura por la muñeca (épica 43).
- Configurar las fórmulas, los umbrales o los rangos desde el panel.
- Varias prescripciones alternativas en una misma consulta (ver D5).

---

## Notas de implementación

- Toda la matemática en `packages/core` (un módulo nuevo, p. ej. `energy-requirement.ts` y
  ampliar `anthropometry.ts`), con tests que reproduzcan **los números de los escenarios**, más los
  bordes de cada clasificación (24,9 / 25,0; 93,9 / 94; etc.). Reusar las constantes de
  `patient-formula-data.ts` (factores, rangos, Hamwi); no duplicarlas.
- La prescripción es un modelo nuevo que cuelga de `Consultation` (una por consulta, `onDelete`
  coherente con el resto). Cambia `schema.prisma` y `packages/db/domain`: **typecheck en
  `apps/web` y `apps/bot`**. Migración solo aditiva; ninguna consulta existente recibe una
  prescripción.
- `canDeleteConsultation`, `isConsultationEmpty` y `consultationChips` (`packages/core/src/consultations.ts`)
  tienen que contar la prescripción; revisar sus usos (volver un turno a confirmado elimina la
  consulta vacía: no puede llevarse una prescripción).
- "Última medición anterior a la consulta" (D4) es una variante de `getLatestFormulaMeasurements`
  con fecha tope: conviene una sola función en `packages/db/domain`.
- La edad se calcula a la fecha de la consulta con `computeAgeYears`.
- El servidor revalida todo (zod) y recalcula TMB/GET/VCT/gramos con `packages/core`: no confía
  en los números que manda el cliente, salvo el VCT indicado.
- `useConfirm`: nunca `await confirm()` dentro de `<form action>` ni de `startTransition`.
- Pruebas en la base de desarrollo: solo con datos propios, borrados por id.

---

## Dudas para validar con el usuario

Cada duda tiene la recomendación del afinador, para que el orquestador la resuelva en modo
autónomo.

**D1. Fórmula de TMB por defecto.** ¿Una fija, o las 4 lado a lado para elegir?
**Recomendación:** las 4 lado a lado, **Mifflin-St Jeor preseleccionada** (la más validada en
adultos con y sin sobrepeso). Katch-McArdle y Cunningham solo habilitadas si hay % de grasa. La
fórmula elegida queda guardada en la prescripción, y al "Editar" o al abrir la calculadora en la
consulta siguiente del mismo paciente se preselecciona **la última que ella eligió para ese
paciente**, no siempre Mifflin.

**D2. Umbral para sugerir peso ajustado: 120 % o 130 % del peso ideal.** El Word dice "120–130 %".
Con 120 % y Devine, una mujer de 162 cm y 66,5 kg (IMC 25,3, apenas sobrepeso) ya recibe la
sugerencia (122,7 %), porque Devine da pesos ideales bajos en mujeres de talla baja.
**Recomendación: 130 %**, con Devine como peso ideal de referencia (es el que usa el Word en la
fórmula de peso ajustado). Es solo una sugerencia: ella puede elegir "Ajustado" o "Actual" en
cualquier caso. Constante en `packages/core`, fácil de cambiar si ella dice 120.

**D3. ICC: umbral por sexo del Word o el de ISAKMetry.** El Word marca riesgo aumentado con ICC
> 0,90 (hombres) y > 0,85 (mujeres); el informe de ISAKMetry muestra como saludable < 1,00, sin
distinguir sexo. Un hombre con 0,93 sale "riesgo aumentado" acá y en verde en ISAKMetry.
**Recomendación:** usar los umbrales por sexo del Word (OMS), que es la fuente de esta épica, y
mostrar al lado el umbral aplicado ("riesgo aumentado > 0,90 en hombres"). Confirmar con la
nutricionista; si prefiere < 1,00, es un cambio de constante. IMC (18,5–24,9) coincide en las dos
fuentes.

**D4. ¿Con qué mediciones se calcula en una consulta?** La consulta puede no tener medición, o
tener peso sin talla.
**Recomendación:** para cada dato (peso, talla, cintura, cadera, % de grasa), el de la consulta; si
no tiene, el último **anterior o del mismo día** de ese paciente (nunca uno posterior), mostrando
su fecha, como hace la HU-001. Así una consulta vieja no se recalcula con datos de después.

**D5. ¿Una o varias prescripciones por consulta? ¿Se guardan las 4 TMB?**
**Recomendación:** **una** por consulta (editar la reemplaza). La fecha es la de la consulta, que
es lo que pedía la épica 18 ("con fecha"). Se guardan también las 4 TMB calculadas en ese momento
(solo lectura), para ver después con qué se comparó.

**D6. ¿Entran cintura/talla e índice de conicidad?** No están en la épica 19 ni en el Word, pero
ISAKMetry los muestra en "Índices de salud" con rango saludable (< 0,50 y < 1,4), y salen de datos
que ya se miden (cintura, peso, talla).
**Recomendación: sí**, con esos rangos, para que el diagnóstico sea coherente con lo que ella ve
en ISAKMetry. El índice de distribución grasa y el resto de ISAKMetry quedan para la HU-006.

**D7. ¿El VCT indicado se puede redondear a mano?** Muchas veces se prescribe un número redondo
(1500 en vez de 1481).
**Recomendación: sí.** Campo "VCT indicado" precargado con el calculado y editable; se guardan los
dos; los macros se calculan sobre el indicado. Límite de validación razonable (p. ej. 800–6000 kcal).

**D8. ¿La TMB medida por el InBody entra como una quinta opción?** `EvolutionEntry` ya guarda
`basalMetabolicRateKcal`.
**Recomendación:** mostrarla **como referencia** (no seleccionable) cuando hay una medida en la
consulta o antes. Si ella quiere poder elegirla, se agrega después.

**D9. % exacto dentro del rango del objetivo, y "subir de peso" contra "ganar masa muscular".** El
Word da un solo rango de superávit (+10/+20 %) para los dos, y rangos para el déficit.
**Recomendación:** ella elige el % a mano dentro del rango (validado); el valor inicial es el medio
del rango (−20 % moderado, −27,5 → −28 % agresivo, +15 % superávit) o el que usó en la prescripción
anterior del paciente si el rango coincide. "Subir de peso" y "Ganar masa muscular" usan el mismo
rango +10/+20 %; lo único que cambia en "Ganar masa muscular" es que la calculadora arranca en
modo "Proteína en g/kg" (1,6 g/kg). Mantener: 0 %, sin campo.

**D10. ¿Lo que se elige en la calculadora actualiza el paciente?** (actividad y objetivo son el
valor actual del paciente, HU-001 D2).
**Recomendación: no.** La calculadora arranca con los del paciente y lo elegido queda solo en la
prescripción. Si difiere, se muestra "Distinto del dato del paciente". Cambiar el valor actual
sigue siendo en "Datos para cálculos". Evita que editar una consulta vieja pise el dato actual.

**D11. ¿Cómo ve "cómo cambió el requerimiento"?** La épica 18 lo pide.
**Recomendación:** en esta HU, la tarjeta del Resumen con el último VCT y la diferencia con el
anterior, más el chip "Requerimiento" en la lista de consultas (que ya está ordenada por fecha). Un
gráfico del VCT en el tiempo queda fuera.

**D12. Macros: valores iniciales y sobre qué peso se calcula g/kg.**
**Recomendación:** arranca en "Porcentajes del VCT" con 20 / 30 / 50 (dentro de los rangos del
Word), o con lo de la prescripción anterior del paciente si existe. Los g/kg (de entrada y los que
se muestran) usan **el mismo peso que se eligió para las fórmulas** (el ajustado si se eligió
ajustado); la tabla lo aclara ("g/kg de peso ajustado").

**D13. Menores de 18: ¿qué se muestra del diagnóstico?**
**Recomendación:** el aviso "Las fórmulas son para adultos.", el IMC como número sin clasificación
(como hoy en Evolución) y nada más; sin calculadora. La edad se toma a la fecha de la consulta. Lo
pediátrico es la HU-008.

**D14. % de grasa para Katch-McArdle y Cunningham cuando no hay bioimpedancia.** El Word dice que
Deurenberg sirve "cuando no se dispone de bioimpedancia", pero es una estimación poblacional que
falla en obesidad.
**Recomendación:** por defecto, solo el % medido (bioimpedancia, de la consulta o anterior). Si no
hay, las dos fórmulas quedan deshabilitadas con un botón "Usar el estimado de Deurenberg" que las
habilita marcadas "estimado"; el origen queda guardado en la prescripción.

---

## Resoluciones (validadas por el orquestador en modo autónomo, autorizado por el usuario, 2026-09-24)

Se aceptan **todas las recomendaciones** del afinador (D1–D14) tal como están escritas arriba. En
particular: las 4 TMB lado a lado con Mifflin preseleccionada (D1); peso ajustado sugerido al
130% del ideal de Devine (D2); umbrales de ICC por sexo según el Word/OMS (D3); una prescripción
por consulta (D5); cintura/talla y conicidad incluidos (D6); VCT indicado editable (D7); TMB del
InBody solo como referencia (D8); lo elegido en la calculadora no pisa los datos del paciente
(D10); en menores de 18, solo el aviso y el IMC sin clasificar (D13). Cualquier cosa que la
nutricionista quiera distinto se ajusta después.
