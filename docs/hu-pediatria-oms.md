# HU-008: Pacientes pediátricos (5 a 17 años): referencia OMS 2007 y TMB de Schofield

**Como** profesional (nutricionista),
**quiero** que en los pacientes de 5 a 17 años el sistema clasifique el IMC para la edad y la talla
para la edad con la referencia OMS 2007 (puntaje Z, percentil y categoría), y que la calculadora
estime la TMB con las ecuaciones de Schofield,
**para que** pueda diagnosticar y prescribir en chicos con el mismo circuito que uso con adultos,
sin hacer cuentas a mano ni buscar en tablas impresas.

Origen: épica 56 de `docs/historias-usuario-nutridesk.md` (Ronda 3, "Atención a partir de los 5
años de edad"; contradicción con "solo adultos" resuelta por el usuario el 2026-09-24).
Referencias elegidas por el usuario: **OMS 2007 (5–19 años)** para IMC/E y T/E con las tablas LMS
públicas, y **Schofield (1985)** para la TMB.

---

## Contexto

### Qué existe hoy para los menores de 18

- **HU-001 (datos para cálculos):** `packages/core/src/patient-formula-data.ts` tiene
  `ADULT_AGE_YEARS = 18`, `computeAgeYears` (años cumplidos a una fecha, en la zona de la
  profesional), `isMinor` y `MINOR_WARNING_TEXT` ("Las fórmulas son para adultos."). La tarjeta
  "Datos para cálculos" (`formula-data-section.tsx`) muestra ese aviso en tono `warning` si el
  paciente es menor. No hay ningún cálculo de edad en **meses**.
- **HU-004 (diagnóstico y calculadora):** en `anthropometric-diagnosis.ts`,
  `buildAnthropometricDiagnosis` devuelve para un menor `minor: true`, el IMC `unclassified` y todo
  lo demás en `null` (sin cintura, ICC, cintura/talla, conicidad, Deurenberg, peso ideal ni peso
  ajustado). En el detalle de la consulta, el diagnóstico muestra el aviso y el IMC sin clasificar,
  y la sección "Requerimiento" **no se muestra** (`page.tsx`: `diagnosis.minor ? null : …`).
  `packages/db/domain/prescriptions.ts` no arma el `RequirementContext` si el paciente es menor,
  así que tampoco se puede guardar una prescripción.
- **HU-004, TMB:** `energy-requirement.ts` tiene 4 fórmulas de adultos (`BmrFormula`: Mifflin-St
  Jeor, Harris-Benedict, Katch-McArdle, Cunningham), los 5 factores de actividad de adultos
  (1,2 a 1,9), los ajustes por objetivo (hasta −30 %), los rangos de macros de adultos y
  `PRESCRIBED_VCT_BOUNDS` (800–6000 kcal). El modelo `NutritionPrescription` guarda como
  obligatorios `bmrMifflinStJeorKcal`, `bmrHarrisBenedictKcal` e `idealWeightDevineKg`.
- **HU-006 (ISAK, D13):** en menores se muestran las Z del Phantom, las sumatorias, los
  corregidos, la distribución adiposo-muscular, la proporcionalidad y el somatotipo; se ocultan la
  composición corporal, el IAM y el IMO (`not_for_minors` en `isak-study.ts`), con el aviso "Las
  fórmulas de composición corporal son para adultos.". En la tarjeta "Índices de salud" de la
  página ISAK el IMC sale sin clasificar y sin rango de referencia.
- **HU-007 (informe PDF, D10):** sigue a la HU-006. La fila "IMC (OMS)" de `isak-report.ts` sale
  como número solo para menores; el PDF lleva la nota de composición corporal.
- **Nada existe hoy** de: tablas OMS, puntaje Z por LMS, percentiles, clasificación pediátrica,
  edad en meses ni ecuaciones de Schofield. `git log` no muestra trabajo previo sobre esto (solo
  el commit que registró la épica 56).

### Qué es lo nuevo

1. **Tablas LMS de la OMS 2007** (IMC para la edad y talla para la edad, por sexo y por mes)
   incorporadas al repo como datos versionados, con su origen documentado.
2. **Diagnóstico pediátrico** puro en `packages/core`, con tests: edad en meses cumplidos, puntaje
   Z por LMS (con la extensión de la OMS para las Z extremas del IMC), percentil y clasificación
   OMS 5–19.
3. En la consulta, para pacientes de **5 a 17 años**: el "Diagnóstico antropométrico" muestra
   **IMC/E** y **T/E** clasificados, y vuelve a aparecer la sección **"Requerimiento"** con
   **Schofield** como TMB.
4. La página ISAK (HU-006) y el informe PDF (HU-007) muestran la clasificación pediátrica del IMC
   y la talla para la edad donde hoy dice el IMC sin clasificar.
5. El aviso de la HU-001 cambia: deja de decir solo "Las fórmulas son para adultos." y avisa qué
   referencias se usan.

Lo que **no** cambia para los menores: siguen ocultos la composición corporal, el IAM, el IMO,
cintura, ICC con riesgo, cintura/talla, conicidad, Deurenberg, peso ideal y peso ajustado.

---

## Criterios de aceptación

Datos de ejemplo:

- **Tomás**: Masculino, nacido el 15/03/2014. Consulta del 10/09/2026: tiene **12 años** y
  **149 meses cumplidos**. Peso 40 kg, talla 150 cm, actividad "Ligero", objetivo "Mantener".
- **Sofía**: Femenino, 8 años. Peso 26 kg, talla 128 cm.
- **Fila LMS de ejemplo** (ficticia, solo para fijar la cuenta; los tests reales usan las filas
  de la OMS): IMC L = −1, M = 17,0, S = 0,12; talla L = 1, M = 150, S = 0,045.

```gherkin
Feature: Edad en meses para las tablas OMS

  Scenario: Meses cumplidos a la fecha de la consulta
    Given "Tomás" nació el 15/03/2014
    When se calcula su edad a la consulta del 10/09/2026
    Then la edad es 12 años y 149 meses cumplidos
    And la fila de las tablas que se usa es la del mes 149

  Scenario: Rango de la referencia
    Then la referencia OMS 2007 se aplica a pacientes con edad de 5 años cumplidos a menos de 18
    And a los 18 años o más se usa la clasificación de adultos de la HU-004
    And a los menores de 5 no se les aplica ninguna referencia (ver "Menor de 5 años")


Feature: Puntaje Z, percentil y clasificación (OMS 2007)

  Scenario: Puntaje Z por LMS
    Given la fila LMS del IMC es L = −1, M = 17,0, S = 0,12
    When el IMC es 20,0
    Then Z = ((IMC / M)^L − 1) / (L × S) = +1,25
    And el percentil es 89 (distribución normal acumulada de Z)

  Scenario: Z extrema del IMC por encima de +3 (extensión de la OMS)
    Given la misma fila LMS
    When el IMC es 30,0
    Then la Z no se toma de la fórmula LMS directa (daría +3,61)
    And se calcula como 3 + (IMC − DE3) / (DE3 − DE2), con DE3 = 26,56 y DE2 = 22,37
    And la Z mostrada es +3,82

  Scenario: Z extrema del IMC por debajo de −3
    Given la misma fila LMS
    When el IMC es 12,0
    Then la Z se calcula como −3 + (IMC − DE3neg) / (DE2neg − DE3neg), con DE3neg = 12,50 y
        DE2neg = 13,71
    And la Z mostrada es −3,41

  Scenario: Clasificación del IMC para la edad
    Then el IMC/E se clasifica así (Z redondeada a 2 decimales, ver D4):
      | Z               | Clasificación     | Tono    |
      | < −3            | Delgadez severa   | danger  |
      | −3 a < −2       | Delgadez          | warning |
      | −2 a +1         | Normal            | success |
      | > +1 a +2       | Sobrepeso         | warning |
      | > +2            | Obesidad          | danger  |

  Scenario: Clasificación de la talla para la edad
    Then la T/E se clasifica así (ver D5):
      | Z               | Clasificación      | Tono    |
      | < −3            | Talla baja severa  | danger  |
      | −3 a < −2       | Talla baja         | warning |
      | ≥ −2            | Talla adecuada     | success |

  Scenario: Talla para la edad sin extensión
    Given la fila LMS de la talla es L = 1, M = 150, S = 0,045
    When la talla es 140 cm
    Then Z = −1,48 con la fórmula LMS directa, sin la extensión de las Z extremas
    And la clasificación es "Talla adecuada"

  Scenario: Valor biológicamente implausible (ver D6)
    When la Z del IMC/E da menos de −5 o más de +5, o la de T/E menos de −6 o más de +6
    Then la fila muestra la Z y el aviso "Valor fuera de rango: revisá la medición."
    And no muestra clasificación


Feature: Diagnóstico antropométrico de un paciente pediátrico (detalle de la consulta)

  Background:
    Given la profesional está logueada en el panel

  Scenario: Diagnóstico completo de un chico de 12 años
    When la profesional abre la consulta del 10/09/2026 de "Tomás"
    Then la sección "Diagnóstico antropométrico" muestra el aviso "Paciente pediátrico:
        referencia OMS 2007 (5 a 19 años)."
    And muestra la fila "IMC para la edad" con el IMC 17,8, su Z con signo y 2 decimales, el
        percentil y la clasificación con su Badge
    And muestra la fila "Talla para la edad" con 150 cm, su Z, el percentil y la clasificación
    And al lado de cada fila, en gris, el rango normal ("Normal: Z −2 a +1" / "Adecuada: Z ≥ −2")
    And no muestra cintura, ICC, cintura/talla, conicidad, Deurenberg, peso ideal ni peso ajustado

  Scenario: Falta el sexo
    Given "Tomás" no tiene sexo cargado
    When la profesional abre su consulta
    Then las filas de IMC/E y T/E muestran el valor medido y "Falta sexo"
    And se muestra el aviso de faltantes con el enlace "Completar datos para cálculos"

  Scenario: Falta la talla
    Given la consulta no tiene talla, ni la hay en consultas anteriores
    Then IMC/E y T/E muestran "Sin dato (falta talla)"

  Scenario: Sin fecha de nacimiento
    Given el paciente no tiene fecha de nacimiento
    Then el diagnóstico se comporta como hoy (se lo trata como adulto, HU-004)
    And el aviso de faltantes de la HU-001 pide la fecha de nacimiento

  Scenario: La medición viene de otra consulta (ver D8)
    Given la consulta del 24/09/2026 de "Tomás" no tiene mediciones
    And la última medición anterior es la del 10/09/2026
    Then IMC/E y T/E se calculan con la edad en meses a la fecha de esa medición (149 meses)
    And cada valor muestra su fecha "(10/09/2026)", como en la HU-004

  Scenario: El paciente cumple 18
    Given un paciente tenía 17 años en una consulta y 18 en la siguiente
    Then la primera consulta muestra el diagnóstico pediátrico
    And la segunda muestra el diagnóstico de adultos de la HU-004

  Scenario: Menor de 5 años
    Given el paciente tenía 4 años a la fecha de la consulta
    Then el diagnóstico muestra el aviso "Menor de 5 años: el sistema no tiene referencias para
        esta edad."
    And muestra el IMC sin clasificar, como hoy
    And no se ofrece la sección "Requerimiento"


Feature: Calculadora de requerimiento con Schofield

  Scenario: Se habilita la sección Requerimiento para 5 a 17 años
    When la profesional abre la consulta del 10/09/2026 de "Tomás"
    Then se muestra la sección "Requerimiento" con el botón "Calcular requerimiento"
    And los datos bloqueantes son los mismos de la HU-004 (sexo, fecha de nacimiento, peso, talla)

  Scenario: TMB por Schofield (ver D9)
    When la profesional abre la calculadora para "Tomás" (12 años, 40 kg, 150 cm)
    Then el paso "TMB" muestra solo las ecuaciones de Schofield:
      | Fórmula                     | TMB       |
      | Schofield (peso y talla)    | 1371 kcal |
      | Schofield (peso)            | 1366 kcal |
    And "Schofield (peso y talla)" viene preseleccionada
    And no se ofrecen Mifflin-St Jeor, Harris-Benedict, Katch-McArdle ni Cunningham
    And si hay TMB medida por bioimpedancia, se muestra como referencia, como en la HU-004

  Scenario: Ecuaciones de Schofield por sexo y rango de edad
    Then la TMB (kcal/día; P en kg, T en metros) es:
      | Sexo      | Edad        | Schofield (peso)     | Schofield (peso y talla)          |
      | Masculino | 3 a < 10    | 22,706·P + 504,3     | 19,59·P + 130,3·T + 414,9         |
      | Masculino | 10 a < 18   | 17,686·P + 658,2     | 16,25·P + 137,2·T + 515,5         |
      | Femenino  | 3 a < 10    | 20,315·P + 485,9     | 16,97·P + 161,8·T + 371,2         |
      | Femenino  | 10 a < 18   | 13,384·P + 692,6     | 8,365·P + 465·T + 200,0           |
    And para "Sofía" (8 años, 26 kg, 128 cm) da 1014 kcal (peso) y 1020 kcal (peso y talla)

  Scenario: Peso para las fórmulas en menores (ver D14)
    When la profesional abre la calculadora de un menor
    Then no se muestra el paso "Peso para las fórmulas": se usa siempre el peso actual
    And no se ofrece peso ajustado

  Scenario: Actividad y objetivo en menores (ver D10 y D11)
    When la profesional llega a los pasos "Actividad" y "Objetivo"
    Then puede elegir los mismos 5 niveles de actividad con sus factores
    And debajo del paso "Actividad" se lee en gris "Factores de actividad de adultos: usalos como
        orientación."
    And en "Bajar de peso" solo se ofrece el "Déficit moderado"; el "Déficit agresivo" no aparece

  Scenario: Macros con referencia pediátrica (ver D12)
    When la profesional llega al paso "Macros" de un menor
    Then las ayudas de referencia son proteínas 10–30 %, grasas 25–35 %, carbohidratos 45–65 %
    And los valores fuera de referencia muestran un aviso que no bloquea, como en la HU-004

  Scenario: VCT bajo en los más chicos (ver D13)
    Given el VCT calculado de un menor da 766 kcal
    Then el VCT indicado se puede guardar (el mínimo para menores es 500 kcal)

  Scenario: Guardar y ver la prescripción
    When la profesional guarda la prescripción de "Tomás"
    Then se ve el aviso "Prescripción guardada"
    And el resumen dice "Schofield (peso y talla) · TMB 1371 kcal · Ligero ×1,375 · GET … ·
        Mantenimiento 0 %"
    And la tarjeta "Requerimiento indicado" de la pestaña Resumen muestra ese VCT, como en la HU-004
    And "Editar" reabre la calculadora con Schofield y los valores guardados


Feature: Clasificación pediátrica en la página ISAK y en el informe PDF

  Scenario: Índices de salud de la página ISAK
    Given "Tomás" tiene un estudio ISAK en la consulta del 10/09/2026
    When la profesional abre la página del estudio
    Then la tarjeta "Índices de salud" muestra "IMC para la edad" con la Z, el percentil y la
        clasificación OMS 2007, en lugar del IMC sin clasificar
    And muestra una fila nueva "Talla para la edad" con la Z, el percentil y la clasificación
    And el resto de la página sigue la D13 de la HU-006 (sin composición, IAM ni IMO)

  Scenario: Informe PDF de un menor
    When la profesional genera el informe de "Tomás"
    Then la fila del IMC se llama "IMC para la edad (OMS 2007)" y dice, por ejemplo,
        "17,8 · Normal (Z +0,45, P67)"
    And hay una fila "Talla para la edad (OMS 2007)" con la clasificación, la Z y el percentil
    And la columna del estudio anterior usa la edad a la fecha de ese estudio
    And la nota "Las fórmulas de composición corporal son para adultos." se mantiene

  Scenario: Adultos sin cambios
    When la profesional abre la consulta, la página ISAK o el informe de un paciente de 18 o más
    Then todo se ve igual que antes de esta HU


Feature: Aviso de la tarjeta "Datos para cálculos" (HU-001)

  Scenario: Paciente de 5 a 17 años
    Then la tarjeta muestra, en tono info, "Paciente pediátrico: el diagnóstico usa la referencia
        OMS 2007 y la TMB, las ecuaciones de Schofield."

  Scenario: Paciente menor de 5 años
    Then la tarjeta muestra, en tono warning, "Menor de 5 años: el sistema no tiene referencias
        para esta edad."
```

---

## Datos que se registran

No hay datos nuevos del paciente ni de la consulta. El diagnóstico pediátrico **no se guarda**:
se recalcula siempre, como el de la HU-004.

| Dato | Obligatorio | Uso |
|---|---|---|
| Tablas LMS OMS 2007: IMC/E y T/E, por sexo y mes (61–228 meses; ver D2 para el mes 60) | Sí (datos versionados en el repo, no en la base) | Z, percentil y clasificación |
| Origen de las tablas: URL, fecha de descarga, hash del archivo original | Sí (junto a los datos) | Trazabilidad |
| Prescripción de un menor: fórmula Schofield elegida y TMB de las dos variantes de Schofield | Sí, al guardar | Foto de la prescripción (igual que las 4 fórmulas de adultos hoy) |
| Mifflin, Harris-Benedict y peso ideal de Devine en la prescripción de un menor | No aplica (hoy son obligatorios; ver Notas) | — |

---

## Diseño UX

Sigue el sistema de diseño de la HU-002 (tokens, `Card`, `Badge`, `Alert`, tipografía y números
es-AR). Solo panel: sin cambios en el portal ni en el bot.

### Detalle de la consulta — "Diagnóstico antropométrico" (`Card`)

- Arriba, `Alert` `info`: "Paciente pediátrico: referencia OMS 2007 (5 a 19 años)."
- Dos filas `valor + Badge`, con el mismo componente de fila de la HU-004:
  - **IMC para la edad**: "17,8" · "Z +0,45 · P67" en texto secundario · `Badge` con la
    clasificación. En gris: "Normal: Z −2 a +1".
  - **Talla para la edad**: "150 cm" · "Z −0,12 · P45" · `Badge`. En gris: "Adecuada: Z ≥ −2".
- Z con signo (U+2212 para el menos) y 2 decimales (`formatSignedFixedEs`). Percentil sin
  decimales; en los extremos "< P1" y "> P99" (D7).
- Faltantes con los textos de la HU-004 ("Sin dato (falta talla)", "Falta sexo").
- Implausible: la Z y, en lugar del `Badge`, "Valor fuera de rango: revisá la medición." en tono
  `warning`.
- Pie en gris chico: "Referencia: OMS 2007. Edad: 12 años y 5 meses (149 meses)."
- Menor de 5: `Alert` `warning` "Menor de 5 años: el sistema no tiene referencias para esta edad."
  y el IMC sin clasificar.

### Detalle de la consulta — "Requerimiento" (`Card`)

Igual que la HU-004, con estas diferencias para 5 a 17 años:

1. **Peso para las fórmulas**: no se muestra (peso actual).
2. **TMB**: tabla de 2 filas con radio, "Schofield (peso y talla)" y "Schofield (peso)";
   debajo, en gris, "Schofield (1985), 10 a 17 años, masculino" (el rango y el sexo que se
   aplicaron). TMB medida por bioimpedancia como referencia, si hay.
3. **Actividad**: el mismo `Select`, con la aclaración en gris "Factores de actividad de adultos:
   usalos como orientación." (D10).
4. **Objetivo**: los mismos 4 objetivos; en "Bajar de peso", solo "Déficit moderado" (D11).
5. **VCT indicado**: mínimo 500 kcal en menores (D13).
6. **Macros**: ayudas con la referencia pediátrica (D12).

Resumen con prescripción: "Schofield (peso y talla) · TMB 1371 kcal · …" en lugar del nombre de
la fórmula de adultos; la línea de peso dice "Peso usado: 40,0 kg (actual)".

### Pestaña Resumen — tarjeta "Datos para cálculos"

- 5 a 17: `Alert` `info` "Paciente pediátrico: el diagnóstico usa la referencia OMS 2007 y la TMB,
  las ecuaciones de Schofield."
- Menor de 5: `Alert` `warning` "Menor de 5 años: el sistema no tiene referencias para esta edad."

### Página ISAK (HU-006) — tarjeta "Índices de salud"

- La fila "IMC" pasa a "IMC para la edad", con la Z, el percentil, el `Badge` y la referencia
  "Normal: Z −2 a +1".
- Fila nueva "Talla para la edad" debajo.
- El `Alert` de composición corporal para menores no cambia.

### Informe PDF (HU-007)

- Fila "IMC para la edad (OMS 2007)": "17,8 · Normal (Z +0,45, P67)". Columna "Anterior" con la
  misma forma, calculada a la edad de ese estudio.
- Fila nueva "Talla para la edad (OMS 2007)": "150,0 cm · Talla adecuada (Z −0,12, P45)".
- La editora del informe (`report-editor.tsx`) no suma textos nuevos.

### Bot y portal

Sin cambios. Ningún mensaje de WhatsApp nuevo.

---

## Fuera de alcance

- **Menores de 5 años** (patrones OMS 2006, 0–5 años): solo el aviso.
- **Embarazo y lactancia**, también en adolescentes.
- **Peso para la edad** (la OMS 2007 lo publica solo hasta los 10 años) y cualquier otro indicador
  pediátrico (perímetro cefálico, cintura para la edad, pliegues para la edad).
- **Gráficos de las curvas de crecimiento** (percentiles en el tiempo). Candidato a otra HU.
- Otras referencias: CDC 2000, tablas argentinas de la SAP, IOTF (Cole).
- Otras ecuaciones de TMB pediátricas (FAO/OMS/UNU 1985, IOM/DRI 2005) y factores de actividad
  específicos para chicos (ver D10).
- Composición corporal pediátrica (Slaughter, Deurenberg de chicos), cintura/talla e índices de
  cintura en menores (ver D17).
- Guardar el diagnóstico pediátrico o sus Z.
- Evaluación del estadio puberal (Tanner) y edad ósea.
- Mostrar datos pediátricos en el portal o por WhatsApp.
- Tabla de Evolución de la ficha: sigue mostrando el IMC como número.

---

## Notas de implementación

Mínimas; el detalle es del `architect`.

- **Lógica pura en `packages/core`**, con tests: edad en meses cumplidos (con la misma regla de zona
  horaria que `computeAgeYears`), búsqueda de la fila LMS, Z con la extensión de la OMS para el IMC
  (no para la talla), percentil (Φ de la normal), clasificación y Schofield. Los tests pueden
  verificar las tablas contra las columnas de DE (−3, −2, −1, 0, +1, +2, +3) que la OMS publica en
  los mismos archivos: calcular el valor en Z = −2 con L, M y S tiene que dar la columna SD2neg.
- **Datos:** las tablas viven en `packages/core` (junto a la lógica que las usa), no en la base. Ver
  D1.
- **Esquema:** `NutritionPrescription` hoy exige `bmrMifflinStJeorKcal`, `bmrHarrisBenedictKcal` e
  `idealWeightDevineKg`, y `BmrFormula` no tiene Schofield. Hace falta migración (nuevos valores
  del enum, columnas de Schofield y nullables las de adultos, o la alternativa que decida el
  architect). La tabla tiene filas de adultos: la migración no puede romperlas.
- **Impacto en web y bot:** `packages/db/domain/prescriptions.ts` (hoy corta en `isMinor`) y la
  firma de `buildAnthropometricDiagnosis` / `IsakStudyResult` los usan web y, potencialmente, otros
  procesos: correr `typecheck` en todos los workspaces.
- `ADULT_AGE_YEARS = 18` sigue siendo el corte (D16).
- Tocar el reparto de "menor" en tres lugares con cuidado: `isMinor` sigue significando "< 18"; hace
  falta además distinguir "< 5" (sin referencia) de "5 a 17" (pediátrico).

---

## Dudas para validar con el usuario

Cada duda trae la recomendación del afinador para la validación en modo autónomo.

**D1. De dónde se bajan las tablas LMS y en qué formato se guardan.**
La OMS publica, por indicador y sexo, tablas "expanded" por mes en who.int
(`who.int/tools/growth-reference-data-for-5to19-years/indicators/bmi-for-age` y
`.../height-for-age`), en Excel, con columnas `Month, L, M, S` y las DE de −3 a +3. Los mismos
datos están en los paquetes de la OMS (`who2007` para R/SAS, `anthroplus`) como
`bfawho2007.txt` / `hfawho2007.txt`.
**Recomendación:** bajar los 4 Excel "z-scores expanded" de who.int (IMC niños, IMC niñas, talla
niños, talla niñas), convertirlos con un script versionado a un módulo TypeScript de `packages/core`
(`{ month, L, M, S }` por sexo e indicador), y guardar al lado un `README` con la URL, la fecha de
descarga y el SHA-256 de cada original. Los Excel originales no se commitean (quedan reproducibles
por el script). Los tests verifican cada fila contra las columnas de DE del archivo.

**D2. El mes 60 (5 años y 0 meses).** La OMS 2007 empieza en el mes 61; el mes 60 es el último del
patrón OMS 2006. Un chico que acaba de cumplir 5 quedaría un mes sin referencia.
**Recomendación:** incorporar solo la fila del mes 60 de los patrones OMS 2006 (IMC/E y talla/E,
por sexo), que es la que la OMS usó para empalmar las dos referencias, documentada en el mismo
`README`. Así "desde los 5 años" no tiene huecos.

**D3. Meses cumplidos o redondeados.** El usuario decidió meses cumplidos. Los programas de la OMS
(AnthroPlus y la macro `who2007`) redondean la edad en meses al entero más cercano, así que un
paciente puede quedar un mes corrido respecto de esos programas (la diferencia en la Z es mínima).
**Recomendación:** mantener **meses cumplidos**, como se decidió, y decirlo en el pie del
diagnóstico ("Edad: 12 años y 5 meses (149 meses)").

**D4. Bordes de la clasificación.** La OMS define sobrepeso como Z > +1 y obesidad como Z > +2;
delgadez Z < −2 y delgadez severa Z < −3.
**Recomendación:** clasificar sobre la **Z redondeada a 2 decimales** (la que se muestra), para que
el `Badge` nunca contradiga el número, igual que la HU-004 clasifica el IMC redondeado. Z = +1,00
exacta es "Normal"; Z = −2,00 exacta es "Normal".

**D5. Categorías de talla para la edad.** El orquestador pidió "talla baja". La OMS también usa
"talla baja severa" (Z < −3) y menciona Z > +3 como "muy alto" (rara vez es un problema).
**Recomendación:** tres categorías: "Talla baja severa" (< −3), "Talla baja" (−3 a < −2) y "Talla
adecuada" (≥ −2). Sin categoría de talla alta.

**D6. Z extremas y valores implausibles.** La OMS recomienda, para el IMC/E, calcular las Z por
fuera de ±3 con la distancia entre DE2 y DE3 (no con la fórmula LMS directa), y marca como
implausibles IMC/E con |Z| > 5 y T/E con |Z| > 6.
**Recomendación:** aplicar las dos reglas como en los escenarios: extensión solo para el IMC, y
aviso "Valor fuera de rango: revisá la medición." sin clasificación para las implausibles.

**D7. Formato del percentil.**
**Recomendación:** entero ("P67"); por debajo de 1 "< P1" y por encima de 99 "> P99".

**D8. Edad cuando la medición viene de otra consulta.** La HU-004 permite usar la última medición
anterior si la consulta no tiene una propia. En chicos, la Z depende de la edad al medir.
**Recomendación:** usar la edad en meses **a la fecha de la medición** (la de su consulta), no la de
la consulta que se está viendo. Si peso y talla vienen de fechas distintas, el IMC/E usa la fecha
del peso y la T/E la de la talla. En la calculadora, la edad para Schofield es la de la consulta,
como la foto `ageYears` de hoy.

**D9. ¿Schofield con peso solo, con peso y talla, o las dos?** Schofield (1985) publicó las dos
versiones. En pediatría clínica suele preferirse la de peso y talla.
**Recomendación:** ofrecer **las dos**, con "Schofield (peso y talla)" preseleccionada. La talla ya
es obligatoria para la calculadora, así que siempre se puede calcular.

**D10. Factores de actividad en chicos.** Los 5 factores de hoy (1,2 a 1,9) son de adultos. La
FAO/OMS/UNU (2004) usa niveles de actividad física por edad (alrededor de 1,4 a 2,0 en chicos, con
el crecimiento incluido).
**Recomendación:** en esta HU, **reusar los 5 niveles y factores** de la HU-001 (el paciente ya tiene
cargado su nivel y la calculadora no cambia), con la aclaración en gris "Factores de actividad de
adultos: usalos como orientación.". Factores pediátricos por edad quedan para otra HU si la
nutricionista los pide.

**D11. Ajuste por objetivo en chicos.** Los déficits de −25 a −30 % no se usan en chicos en
crecimiento.
**Recomendación:** mantener los 4 objetivos, pero **ocultar el "Déficit agresivo"** en menores; el
déficit moderado (−15 a −25 %) sigue disponible y queda a criterio de la profesional.

**D12. Referencias de macros en menores.** Las ayudas de hoy (15–25 / 20–35 / 45–60 % y 1,2–2,2 g/kg)
son de adultos. Los rangos aceptables del IOM para 4 a 18 años son proteínas 10–30 %, grasas
25–35 % y carbohidratos 45–65 %.
**Recomendación:** en menores, usar esos rangos como ayuda (siguen sin bloquear) y, en el modo g/kg,
la ayuda "0,85–0,95 g/kg (IDR)". Los valores por defecto (20/30/50 % y 1,6 g/kg) no cambian.

**D13. Mínimo del VCT indicado.** `PRESCRIBED_VCT_BOUNDS` exige 800 kcal. Una nena de 5 años con
18 kg da una TMB de unas 850 kcal; con un déficit, el VCT calculado queda por debajo de 800 y no se
puede guardar.
**Recomendación:** en menores, **mínimo 500 kcal**; en adultos sigue 800.

**D14. Peso para las fórmulas en menores.** El peso ideal y el peso ajustado son de adultos (y ya
están ocultos en el diagnóstico de menores).
**Recomendación:** en menores no mostrar el paso "Peso para las fórmulas"; se usa siempre el peso
actual. La foto de la prescripción no guarda peso ideal.

**D15. Textos de los avisos.**
**Recomendación:** "Paciente pediátrico: el diagnóstico usa la referencia OMS 2007 y la TMB, las
ecuaciones de Schofield." (tarjeta "Datos para cálculos", tono `info`), "Paciente pediátrico:
referencia OMS 2007 (5 a 19 años)." (diagnóstico) y "Menor de 5 años: el sistema no tiene
referencias para esta edad." (tono `warning`). `MINOR_WARNING_TEXT` deja de usarse en esas
pantallas.

**D16. Corte de edad adulta.** La OMS 2007 llega a los 19 años, pero el sistema usa 18 como corte de
adulto en todas partes.
**Recomendación:** mantener **18**: de 18 en adelante, clasificación de adultos y fórmulas de
adultos.

**D17. Cintura en chicos.** La cintura/talla (≥ 0,5) se usa también en chicos desde los 6 años, pero
la HU-004 la oculta en menores.
**Recomendación:** dejarla **fuera de alcance** en esta HU, para no mezclar referencias; queda como
posible mejora.

**D18. Menores de 5.** La nutricionista atiende desde los 5, pero la base puede tener un paciente
menor (o una fecha de nacimiento mal cargada).
**Recomendación:** mostrar el aviso de menor de 5 y comportarse como hoy (IMC sin clasificar, sin
"Requerimiento"). No se bloquea nada más.

---

## Resoluciones (validadas por el orquestador en modo autónomo, autorizado por el usuario, 2026-09-24)

Se aceptan **todas las recomendaciones** del afinador (D1–D18) tal como están escritas arriba. En
particular:
- tablas LMS "z-scores expanded" de who.int, versionadas en el repo, más la fila del mes 60 de la
  OMS 2006 (D1, D2);
- meses cumplidos (D3);
- clasificación sobre la Z redondeada (D4);
- tres categorías de talla (D5);
- reglas OMS para Z extremas (D6);
- percentil entero (D7);
- edad a la fecha de la medición (D8);
- Schofield con peso y talla preseleccionada, más la variante solo peso (D9);
- factores de actividad reusados (D10);
- sin déficit agresivo en menores (D11);
- VCT mínimo de 500 kcal en menores (D13);
- sin peso ideal ni ajustado en menores (D14);
- corte en 18 años (D16);
- cintura pediátrica fuera de alcance (D17);
- menores de 5 como hoy, con aviso (D18).
