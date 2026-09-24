# HU-006: Antropometría ISAK completa, composición corporal, somatotipo e índices

**Como** profesional (nutricionista, antropometrista ISAK nivel 1),
**quiero** cargar en la consulta el perfil antropométrico ISAK completo (medidas básicas, 8
pliegues, 6 perímetros y 3 diámetros) y ver calculados la composición corporal, la puntuación Z de
cada medida, el somatotipo con su somatocarta y los índices que hoy saco de ISAKMetry,
**para que** pueda dejar de pasar las medidas a ISAKMetry y de copiar sus números a mano al informe
de Canva, y tenga todo el estudio guardado en la consulta de ese día.

Origen: épicas 44 (antropometría completa) y 45 (composición corporal, somatotipo e índices) de
`docs/historias-usuario-nutridesk.md` (Ronda 3). Toca la épica 31 (bilaterales) y la 9 (estudios
por tipo), que quedan como dudas o fuera de alcance.

Material fuente, que **no se versiona** porque tiene datos de salud (está en `.gitignore`):

- `docs/ISAKMetry_*_08-05-2026 (1).pdf`: exportación en PDF de ISAKMetry, la versión actual, de 7
  páginas. En esta HU es el **caso A**.
- `docs/ISAKMetry_*_05-11-2025.xlsx`: exportación en Excel de una versión anterior de ISAKMetry,
  con solo valores. En esta HU es el **caso B**.
- `docs/EJEMPLO DE INFORME ANTROPOMETRICO.pdf`: el informe que ella arma en Canva con esos números.

En este documento los dos casos aparecen solo con sus números, sin nombre. Los dos son de la
misma persona adulta, de sexo masculino, en dos fechas.

**Decisión del usuario (2026-09-24):** se replican los métodos de **ISAKMetry**:

- masa grasa: Durnin-Womersley (1974);
- tejido adiposo: Kerr (1991);
- tejido muscular: Lee (2000);
- tejido óseo: Rocha (1974);
- tejido residual: por diferencia;
- puntuación Z: contra el Phantom de Ross y Wilson;
- somatotipo: Heath-Carter.

ArgoRef (Holway, 2005), que es lo que cita el informe de Canva, queda para el futuro.

---

## Contexto

### Qué existe hoy

- **Consulta (HU-003):** `Consultation` agrupa las mediciones (`EvolutionEntry.consultationId`),
  el plan indicado, las notas y la prescripción (HU-004). El detalle está en
  `/pacientes/[id]/consultas/[consultationId]`. En la columna principal van "Mediciones",
  "Diagnóstico antropométrico" y "Requerimiento". En la lateral, "Plan indicado" y "Notas".
  - La tarjeta "Mediciones" permite **agregar** y **borrar** mediciones, pero no editarlas.
  - Separa las mediciones en Antropometría y Bioimpedancia con `measurementKinds`
    (`packages/core/src/consultations.ts`).
  - El comentario del modelo en `schema.prisma` ya anticipa que de la consulta van a colgar los
    "estudios ISAK / bioimpedancia (HU-006)".
- **`EvolutionEntry`** solo guarda una antropometría parcial:
  - peso, talla, cintura y cadera;
  - brazo (`armCm`, sin aclarar si es relajado o contraído), muslo (`thighCm`) y pantorrilla
    (`calfCm`);
  - 3 pliegues: tricipital, subescapular y abdominal;
  - la bioimpedancia del InBody: % de grasa, masa muscular, agua, grasa visceral, masa ósea y
    metabolismo basal.

  Faltan talla sentado, envergadura, el brazo flexionado y contraído, 5 pliegues (bíceps, cresta
  ilíaca, supraespinal, muslo y pierna) y los 3 diámetros óseos.
- **Diagnóstico antropométrico (HU-004)**, en `packages/core/src/anthropometry.ts` y
  `anthropometric-diagnosis.ts`:
  - `bmiExact` y `classifyBmi`: IMC con su clasificación OMS;
  - `classifyWaistHipRatio`: ICC con el umbral OMS según el sexo (> 0,90 en hombres y > 0,85 en
    mujeres; D3 de la HU-004);
  - `waistToHeightRatio`: cintura/talla, saludable si es < 0,50;
  - `conicityIndex`: conicidad, saludable si es < 1,4;
  - `classifyHealthyBelow` y `roundTo`, y la convención de **clasificar con el valor ya
    redondeado a lo que se muestra**;
  - `pickFormulaMeasurements`, que toma las mediciones de la consulta y, si falta un dato, usa la
    última anterior;
  - para los menores de 18: `computeAgeYears`, `isMinor` y `MINOR_WARNING_TEXT`.
- **Datos del paciente (HU-001):** `Patient.sex` y la fecha de nacimiento. Lee (2000) y
  Durnin-Womersley los necesitan.
- **Pestaña Evolución y portal:** leen `EvolutionEntry`, así que el peso, la talla, la cintura,
  etc. que se carguen en un estudio ISAK aparecen solos en los gráficos existentes.
- **Nada de lo siguiente existe hoy** en el repo:
  - puntuación Z ni Phantom;
  - Durnin-Womersley, Kerr, Lee ni Rocha;
  - somatotipo;
  - índices músculo/óseo, adiposo muscular, córmico ni Manouvrier;
  - perímetros corregidos.

  Buscar `ISAK`, `phantom` o `somatotipo` en `apps/` y `packages/` no da resultados, y `git log`
  solo muestra el commit que puso las exportaciones en `.gitignore` y anotó las referencias en la
  épica 45.

### Cómo trabaja hoy la nutricionista

1. Mide el perfil restringido ISAK.
2. Carga las medidas en ISAKMetry y exporta el PDF.
3. Copia a mano los números en una plantilla de Canva y escribe los textos del informe.

El informe de Canva tiene un **error de transcripción**: en la medición anterior, la masa residual
dice "16,95 % (10,34 kg)", que es el valor de la masa ósea. Con ese estudio, la residual real da
5,21 kg (8,54 %). Si el sistema calcula, ese tipo de error desaparece.

### Qué verificó el afinador con el material

Todas las fórmulas de la tabla "Fórmulas" (más abajo) se recalcularon a mano con los dos casos. En
los dos coinciden con ISAKMetry al decimal que se muestra. Las excepciones están en D5, D6 y D7.
Se verificaron:

- Durnin-Womersley con la conversión de Siri;
- Kerr para el tejido adiposo y Lee y Rocha;
- el Phantom para las 20 medidas y los 4 tejidos;
- Heath-Carter;
- los perímetros corregidos, la distribución adiposo-muscular, el índice de distribución grasa,
  el índice adiposo muscular, el índice músculo/óseo, el córmico, Manouvrier, la envergadura
  relativa, el ICC, la cintura/talla, la conicidad y el IMC.

La **distribución adiposo-muscular**, que no tenía documentación, se dedujo y cuadra exacta en los
6 porcentajes del caso A.

### Qué es lo nuevo

1. **Estudio antropométrico ISAK** en la consulta: un formulario con las 24 medidas del perfil
   restringido. Se guarda como una medición más de la consulta, de forma **solo aditiva** (ver D1).
2. **Cálculo al vuelo**, en `packages/core` y con tests:
   - la puntuación Z de cada medida;
   - la composición corporal: fraccionamiento molecular y tisular en 4 componentes, en kg, % y Z;
   - la distribución adiposo-muscular por zonas;
   - el somatotipo con su categoría y la somatocarta;
   - los índices de composición, adiposidad, muscularidad y proporcionalidad, y el de distribución
     grasa.
3. **Vista del estudio:** una tarjeta de resumen en la consulta y una página con el estudio
   completo.
4. **Reuso de la HU-004:** el IMC, el ICC, la cintura/talla y la conicidad salen de las funciones
   que ya existen, no de fórmulas nuevas. El único índice de salud nuevo es el de distribución
   grasa.
5. La bioimpedancia (InBody) sigue igual, en `EvolutionEntry`.

---

## Criterios de aceptación

Datos de ejemplo. Son números reales sin identidad, y los resultados son los que muestra
ISAKMetry.

- **Caso A:** masculino, 22 años a la fecha de la consulta.
  - Básicas: masa 61,0 kg; talla 164,0 cm; talla sentado 83,0 cm; envergadura 166,7 cm.
  - Pliegues (mm): tríceps 11; subescapular 11; bíceps 4; cresta ilíaca 19; supraespinal 16;
    abdominal 16; muslo 11; pierna 6.
  - Perímetros (cm): brazo relajado 30,2; brazo flexionado y contraído 32,0; cintura 73,0;
    caderas 88,0; muslo medio 52,0; pierna 34,5.
  - Diámetros (cm): húmero 6,5; biestiloideo 5,4; fémur 9,7.
- **Caso B:** masculino, 21 años.
  - Básicas: masa 67,6 kg; talla 164,0 cm; talla sentado 83,0 cm; envergadura 166,7 cm.
  - Pliegues (mm): tríceps 12; subescapular 14; bíceps 4; cresta ilíaca 30; supraespinal 21,5;
    abdominal 18; muslo 8; pierna 7.
  - Perímetros (cm): brazo relajado 32,3; brazo flexionado y contraído 33,1; cintura 82,1;
    caderas 94,0; muslo medio 54,0; pierna 34,0.
  - Diámetros (cm): húmero 6,5; biestiloideo 5,3; fémur 9,6.

```gherkin
Feature: Carga del estudio antropométrico ISAK en la consulta

  Background:
    Given la profesional está logueada en el panel
    And el paciente del caso A tiene sexo "Masculino" y 22 años a la fecha de la consulta

  Scenario: Cargar un estudio ISAK completo
    Given una consulta del paciente sin estudio ISAK
    When la profesional abre la consulta y toca "Cargar antropometría ISAK"
    And completa las 24 medidas del caso A, en el orden del formulario (básicas, pliegues,
        perímetros y diámetros)
    And toca "Guardar estudio"
    Then ve la notificación "Estudio ISAK guardado"
    And la consulta muestra la tarjeta "Antropometría ISAK" con el resumen del estudio
    And la lista de consultas muestra el chip "Antropometría" en esa consulta
    And la pestaña Evolución muestra el peso 61 kg, la cintura 73 cm y la cadera 88 cm con la
        fecha de la consulta

  Scenario: Sumatorias en vivo mientras carga
    Given el formulario ISAK está abierto
    When la profesional termina de cargar los 8 pliegues del caso A
    Then debajo de los pliegues ve "Σ 6 pliegues: 71,0 mm · Σ 8 pliegues: 94,0 mm"

  Scenario: Guardar un estudio incompleto
    When la profesional carga solo masa, talla y los 8 pliegues, y guarda
    Then el estudio se guarda
    And en el estudio, cada cálculo que necesita un dato faltante muestra "Sin dato (falta fémur)",
        "Sin dato (falta biestiloideo)", etc.
    And los cálculos que tienen todos sus datos se muestran normalmente

  Scenario: Masa y talla son obligatorias
    When la profesional intenta guardar el formulario sin talla
    Then ve el error en línea "La talla es obligatoria para el estudio ISAK"
    And el estudio no se guarda

  Scenario: Valor fuera de rango
    When la profesional carga un pliegue tríceps de 110 mm
    Then ve el error en línea "Revisá el valor: los pliegues van de 1 a 80 mm"
    And el estudio no se guarda

  Scenario: Talla sentado mayor que la talla
    When carga talla 164 cm y talla sentado 170 cm
    Then ve el error en línea "La talla sentado no puede ser mayor que la talla"

  Scenario: Editar un estudio (ver D17)
    Given la consulta tiene un estudio ISAK guardado
    When la profesional toca "Editar" en la tarjeta "Antropometría ISAK", cambia el pliegue
        tríceps a 12 mm y guarda
    Then todos los cálculos del estudio se actualizan con el valor nuevo

  Scenario: Un solo estudio ISAK por consulta (ver D1)
    Given la consulta ya tiene un estudio ISAK
    Then el botón "Cargar antropometría ISAK" no aparece y en su lugar está "Editar"

  Scenario: Borrar el estudio
    When la profesional toca "Borrar estudio" y confirma "¿Borrar el estudio ISAK de esta
        consulta? No se puede deshacer."
    Then el estudio desaparece de la consulta
    And no se borra ninguna otra medición de la consulta (por ejemplo, la de bioimpedancia)
```

```gherkin
Feature: Puntuación Z contra el Phantom

  Scenario: Z de cada medida del caso A
    When la profesional abre el estudio ISAK del caso A
    Then la sección "Medidas" muestra:
      | Medida                          | Valor    | Z     |
      | Masa corporal                   | 61,0 kg  | 0,40  |
      | Talla                           | 164,0 cm | —     |
      | Talla sentado                   | 83,0 cm  | -0,84 |
      | Envergadura de brazos           | 166,7 cm | 0,09  |
      | Tríceps                         | 11,0 mm  | -0,89 |
      | Subescapular                    | 11,0 mm  | -1,14 |
      | Bíceps                          | 4,0 mm   | -1,92 |
      | Cresta ilíaca                   | 19,0 mm  | -0,39 |
      | Supraespinal                    | 16,0 mm  | 0,27  |
      | Abdominal                       | 16,0 mm  | -1,13 |
      | Muslo                           | 11,0 mm  | -1,87 |
      | Pierna                          | 6,0 mm   | -2,09 |
      | Brazo relajado                  | 30,2 cm  | 1,91  |
      | Brazo flexionado y contraído    | 32,0 cm  | 1,67  |
      | Cintura                         | 73,0 cm  | 0,86  |
      | Caderas                         | 88,0 cm  | -0,60 |
      | Muslo medio                     | 52,0 cm  | 0,17  |
      | Pierna                          | 34,5 cm  | 0,24  |
      | Húmero                          | 6,5 cm   | 0,76  |
      | Biestiloideo                    | 5,4 cm   | 1,41  |
      | Fémur                           | 9,7 cm   | 1,14  |
    # La talla no tiene Z: es la variable con la que se escala todo al Phantom (170,18 cm).
    # Masa y brazo flexionado: ver D7.

  Scenario: Z del caso B
    Then con el caso B se obtiene, entre otros:
      | Medida        | Z     |
      | Masa corporal | 1,26  |
      | Cresta ilíaca | 1,28  |
      | Supraespinal  | 1,55  |
      | Muslo (pliegue) | -2,24 |
      | Brazo relajado | 2,84 |
      | Brazo flexionado y contraído | 2,18 |
      | Cintura       | 2,99  |
      | Pierna (perímetro) | 0,01 |
      | Biestiloideo  | 1,03  |
      | Fémur         | 0,92  |
```

```gherkin
Feature: Composición corporal

  Scenario: Fraccionamiento molecular (Durnin-Womersley 1974 + Siri) del caso A
    Then la sección "Composición corporal" muestra:
      | Componente                                  | kg    | %     | Z     |
      | Masa grasa (Durnin-Womersley, 1974)         | 10,73 | 17,59 | -0,04 |
      | Masa libre de grasa                         | 50,27 | 82,41 | —     |

  Scenario: Fraccionamiento tisular en 4 componentes del caso A
    Then muestra:
      | Componente                      | kg    | %     | Z     |
      | Tejido adiposo (Kerr, 1991)     | 16,48 | 27,02 | -1,23 |
      | Tejido muscular (Lee, 2000)     | 28,97 | 47,49 | 2,28  |
      | Tejido óseo (Rocha, 1974)       | 10,34 | 16,95 | 0,68  |
      | Tejido residual (por diferencia)| 5,21  | 8,54  | -5,57 |
    And los 4 componentes suman 61,00 kg y 100 %
    # Los kg se redondean a 2 decimales y el % y el residual se calculan con esos kg redondeados:
    # así reproduce ISAKMetry (caso B: residual 67,6 − 17,96 − 10,13 − 30,26 = 9,25).

  Scenario: Fraccionamiento tisular del caso B
    Then muestra adiposo 17,96 kg, muscular 30,26 kg (Z 2,76), óseo 10,13 kg (Z 0,53) y residual
        9,25 kg (Z -3,20)

  Scenario: Falta el sexo o la fecha de nacimiento
    Given el paciente no tiene cargado el sexo
    Then "Masa grasa (Durnin-Womersley)" y "Tejido muscular (Lee)" muestran "Falta sexo"
    And el tejido residual, el índice adiposo muscular y el índice músculo/óseo muestran
        "Sin dato (falta tejido muscular)"
    And el tejido adiposo (Kerr) y el tejido óseo (Rocha) se muestran igual, porque no dependen
        del sexo
    And aparece el aviso de faltantes de la HU-001 con el enlace "Completar datos para cálculos"

  Scenario: Residual negativo
    Given medidas que dan adiposo + muscular + óseo mayor que la masa corporal
    Then el residual se muestra con su valor negativo y el aviso "El residual dio negativo: revisá
        las medidas cargadas"
```

```gherkin
Feature: Distribución adiposo-muscular por zonas

  Scenario: Distribución del caso A
    Then la sección "Distribución adiposo-muscular" muestra:
      | Adiposa  | %     |
      | Superior | 30,99 |
      | Central  | 45,07 |
      | Inferior | 23,94 |
    And:
      | Muscular | %     |
      | Brazo    | 24,79 |
      | Muslo    | 44,99 |
      | Pierna   | 30,23 |
    # Adiposa: pliegues del Σ6 por zona sobre el Σ6. Muscular: perímetro corregido sobre la suma de
    # los 3 corregidos. Ver "Fórmulas".
```

```gherkin
Feature: Índices

  Scenario: Índices de composición corporal del caso A
    Then muestra:
      | Índice                  | Valor | Clasificación |
      | Índice adiposo muscular | 0,57  | (ver D8)      |
      | Índice músculo/óseo     | 2,80  | Medio         |

  Scenario: Categorías del índice músculo/óseo (tabla de ISAKMetry)
    Then el IMO, redondeado a 2 decimales, se clasifica así:
      | IMO              | Categoría |
      | < 2,34           | Muy bajo  |
      | 2,34 a < 2,44    | Bajo      |
      | 2,44 a < 3,11    | Medio     |
      | 3,11 a 3,29      | Alto      |
      | > 3,29           | Muy alto  |

  Scenario: Adiposidad y muscularidad del caso A
    Then muestra:
      | Indicador                                        | Valor    | Z    |
      | Sumatoria de 6 pliegues                          | 71,0 mm  | —    |
      | Sumatoria de 8 pliegues                          | 94,0 mm  | —    |
      | Brazo corregido                                  | 26,74 cm | 2,99 |
      | Muslo corregido                                  | 48,54 cm | (D5) |
      | Pierna corregida                                 | 32,62 cm | 1,84 |
      | Diferencia brazo flexionado − brazo relajado     | 1,8 cm   | —    |

  Scenario: Proporcionalidad del caso A
    Then muestra:
      | Índice                | Valor | Clasificación                  |
      | Índice córmico        | 0,51  | Metricórmico (tronco medio)    |
      | Índice de Manouvrier  | 98    | Miembros inferiores largos     |
      | Envergadura relativa  | 1,02  | Envergadura mayor a la talla   |

  Scenario: Índices de salud del caso A (reusan la HU-004)
    Then muestra:
      | Índice                         | Valor | Clasificación (HU-004)          |
      | IMC                            | 22,7  | Normal                          |
      | Índice cintura/cadera          | 0,83  | Sin riesgo aumentado            |
      | Índice cintura/talla           | 0,45  | En rango saludable              |
      | Índice de conicidad            | 1,10  | En rango saludable              |
      | Índice de distribución grasa   | 0,65  | (sin rango, ver D11)            |
    And las etiquetas y los umbrales de IMC, ICC, cintura/talla y conicidad son exactamente los del
        diagnóstico antropométrico de la HU-004 (no hay una segunda implementación)

  Scenario: El índice de distribución grasa baja si la grasa se acumula en el tronco
    Then el caso B da 0,51
```

```gherkin
Feature: Somatotipo de Heath-Carter

  Scenario: Somatotipo del caso A
    Then la sección "Somatotipo" muestra:
      | Componente | Valor |
      | Endomorfia | 4,03  |
      | Mesomorfia | 5,69  |
      | Ectomorfia | 1,92  |
    And muestra la categoría "Endo-mesomorfo" (ver D12)
    And la somatocarta ubica el punto en X = -2,12 e Y = 5,43

  Scenario: Somatotipo del caso B (ectomorfia en el tramo intermedio del HWR)
    Then muestra endomorfia 4,95, mesomorfia 5,72 y ectomorfia 1,01
    # HWR = 40,26: cae en el tramo 38,25 < HWR < 40,75.

  Scenario: Comparación con el estudio anterior (ver D15)
    Given el paciente tiene un estudio ISAK en una consulta anterior
    Then cada tabla del estudio muestra las columnas "Anterior" y "Dif."
    And la somatocarta muestra los dos puntos, "Actual" y "Anterior", con leyenda
```

```gherkin
Feature: Menores de 18 años (ver D13)

  Scenario: Estudio de un paciente de 12 años
    Given el paciente tiene 12 años a la fecha de la consulta
    When la profesional abre su estudio ISAK
    Then ve el aviso "Las fórmulas de composición corporal son para adultos."
    And ve las medidas con su Z, el somatotipo, las sumatorias, los perímetros corregidos, la
        distribución adiposo-muscular y los índices de proporcionalidad
    And no ve la composición corporal ni los índices adiposo muscular y músculo/óseo
    And los índices de salud se comportan como en la HU-004 para menores (IMC sin clasificar)
```

```gherkin
Feature: Validación contra ISAKMetry

  Scenario: Tests versionados
    Then packages/core tiene tests con los casos A y B (solo números, sin identidad) que verifican
        cada valor de esta HU, al decimal que se muestra
    And las diferencias conocidas con ISAKMetry (D5, D6, D7) están documentadas en el test

  Scenario: Validación local con las exportaciones
    Given las exportaciones de ISAKMetry están en docs/ (no se versionan)
    When se corre la validación local
    Then compara lo que calcula el sistema con cada número de las exportaciones y lista las
        diferencias
    And si los archivos no están, avisa que falta el material y no falla
```

---

## Fórmulas (referencias que el architect tiene que usar)

Notación: *talla* en cm salvo que se indique; los pliegues en mm; *k* = 170,18 / talla.

### Puntuación Z (Phantom, Ross y Wilson 1974)

`Z = (v · k^d − p) / s`

- *d* = 1 para longitudes, pliegues, perímetros y diámetros; *d* = 3 para masas.
- Referencia: Ross W.D., Wilson N.C. (1974), "A stratagem for proportional growth assessment",
  *Acta Paediatrica Belgica* 28, y la tabla del Phantom en Ross W.D. y Marfell-Jones M.J.,
  "Kinanthropometry", en MacDougall, Wenger y Green (eds.), *Physiological Testing of the
  High-Performance Athlete* (1991).

Valores del Phantom (*p* / *s*) que reproducen ISAKMetry en los dos casos, verificados por el
afinador:

| Medida | p | s | Verificado |
|---|---|---|---|
| Talla sentado | 89,92 | 4,50 | A y B |
| Envergadura | 172,35 | 7,41 | A y B |
| Pliegues tríceps / subescapular | 15,4 / 17,2 | 4,47 / 5,07 | A y B |
| Pliegues bíceps / cresta ilíaca | 8,0 / 22,4 | 2,00 / 6,80 | A y B |
| Pliegues supraespinal / abdominal | 15,4 / 25,4 | 4,47 / 7,78 | A y B |
| Pliegues muslo / pierna | 27,0 / 16,0 | 8,33 / 4,67 | A y B |
| Brazo relajado / cintura / caderas | 26,89 / 71,91 / 94,67 | 2,33 / 4,45 / 5,58 | A y B |
| Muslo medio / pierna | 53,20 / 35,25 | 4,56 / 2,30 | A y B |
| Húmero / biestiloideo / fémur | 6,48 / 5,21 / 9,52 | 0,35 / 0,28 / 0,48 | A y B |
| Brazo corregido / pierna corregida | 22,05 / 30,22 | 1,91 / 1,97 | A y B |
| Masa grasa (DW), d = 3 | 12,13 | 3,25 | A |
| Tejido adiposo / muscular / óseo / residual (Kerr), d = 3 | 25,60 / 25,55 / 10,49 / 16,41 | 5,85 / 2,99 / 1,57 / 1,90 | A y B (adiposo solo A, ver D6) |
| Masa corporal, d = 3 | 64,58 | 8,60 | **no reproduce exacto** (0,42 / 1,27 frente a 0,40 / 1,26), ver D7 |
| Brazo flexionado y contraído | 29,41 | 2,37 (literatura) | **no reproduce**: da 1,60 / 2,08; con *s* = 2,27 da 1,67 / 2,18, como ISAKMetry. Ver D7 |
| Muslo corregido | 47,34 (literatura) | 3,59 | ISAKMetry muestra el Z del muslo **sin corregir**. Ver D5 |

### Fraccionamiento molecular: Durnin y Womersley (1974) + Siri (1961)

- Densidad: `D = c − m · log10(bíceps + tríceps + subescapular + cresta ilíaca)`.
- % de grasa (Siri): `%MG = 495 / D − 450`. MG kg = masa · %MG / 100. MLG = masa − MG.
- Coeficientes (*c* / *m*) por sexo y edad. Referencia: Durnin J.V.G.A., Womersley J. (1974),
  *British Journal of Nutrition* 32:77-97, tabla de ecuaciones con log de la suma de 4 pliegues.
  El afinador solo verificó el tramo **hombres de 20 a 29 años** (1,1631 / 0,0632), con los dos
  casos. El architect tiene que confirmar el resto contra la publicación (D21):

| Edad | Hombres c / m | Mujeres c / m |
|---|---|---|
| 16–19 (mujeres) / 17–19 (hombres) | 1,1620 / 0,0630 | 1,1549 / 0,0678 |
| 20–29 | 1,1631 / 0,0632 | 1,1599 / 0,0717 |
| 30–39 | 1,1422 / 0,0544 | 1,1423 / 0,0632 |
| 40–49 | 1,1620 / 0,0700 | 1,1333 / 0,0612 |
| 50 o más | 1,1715 / 0,0779 | 1,1339 / 0,0645 |

### Tejido adiposo: Kerr (1988), en Ross y Kerr (1991)

- `Σ6 = tríceps + subescapular + supraespinal + abdominal + muslo + pierna`.
- `Z_adiposo = (Σ6 · k − 116,41) / 34,79`.
- `Tejido adiposo (kg) = (Z_adiposo · 5,85 + 25,6) / k³`.
- Referencia: Kerr D.A. (1988), *An anthropometric method for the fractionation of skin, adipose,
  bone, muscle and residual tissue masses in males and females age 6 to 77 years*, tesis de
  maestría, Simon Fraser University. También Ross W.D. y Kerr D.A. (1991), "Fraccionamiento de la
  masa corporal: un nuevo método para utilizar en nutrición clínica y medicina deportiva",
  *Apunts* 28. Solo se usa el componente adiposo. **No** se usa el modelo completo de cinco
  componentes: el muscular sale de Lee, el óseo de Rocha y el residual por diferencia, como en
  ISAKMetry.

### Tejido muscular: Lee et al. (2000)

- `MM (kg) = talla(m) · (0,00744 · PBC² + 0,00088 · PMC² + 0,00441 · PPC²) + 2,4 · sexo − 0,048 · edad + etnia + 7,8`.
- Los perímetros corregidos van en cm:
  - PBC = brazo relajado − π · tríceps / 10;
  - PMC = muslo medio − π · muslo / 10;
  - PPC = pierna − π · pierna / 10.
- sexo = 1 en hombres y 0 en mujeres. La edad es en años a la fecha de la consulta. etnia = 0
  (D14).
- Referencia: Lee R.C., Wang Z., Heo M., Ross R., Janssen I., Heymsfield S.B. (2000), "Total-body
  skeletal muscle mass: development and cross-validation of anthropometric prediction models",
  *American Journal of Clinical Nutrition* 72:796-803.

### Tejido óseo: Rocha (1975), la ecuación de Von Döbeln modificada

- `MO (kg) = 3,02 · (talla(m)² · biestiloideo(m) · fémur(m) · 400)^0,712`.
- Referencia: Rocha M.S.L. (1975), "Peso ósseo do brasileiro de ambos os sexos de 17 a 25 anos",
  *Arquivos de Anatomia e Antropologia* 1:445-451. ISAKMetry la cita como "Rocha, 1974".

### Residual, porcentajes e índices de composición

- Los 3 tejidos se redondean a 2 decimales en kg.
- Residual = masa − (adiposo + muscular + óseo), con esos kg redondeados.
- % de cada tejido = kg redondeado / masa · 100.
- Índice adiposo muscular = tejido adiposo / tejido muscular.
- Índice músculo/óseo = tejido muscular / tejido óseo.

### Somatotipo: Heath y Carter (1967), fórmulas de Carter (2002)

- **Endomorfia:** `X = (tríceps + subescapular + supraespinal) · k`, y
  `endo = −0,7182 + 0,1451·X − 0,00068·X² + 0,0000014·X³`.
- **Mesomorfia:**
  `meso = 0,858·húmero + 0,601·fémur + 0,188·(brazo flexionado − tríceps/10) + 0,161·(pierna − pliegue pierna/10) − 0,131·talla + 4,5`.
- **Ectomorfia:** `HWR = talla / masa^(1/3)`.
  - Si HWR ≥ 40,75: `0,732·HWR − 28,58`.
  - Si 38,25 < HWR < 40,75: `0,463·HWR − 17,63`.
  - Si HWR ≤ 38,25: `0,1`.
- **Somatocarta:** `X = ecto − endo`, `Y = 2·meso − (endo + ecto)`.
- **Categorías** (13, Carter y Heath 1990). Dos componentes se consideran iguales si difieren en
  0,5 o menos. Ver D12.
- Referencia: Carter J.E.L. (2002), *The Heath-Carter Anthropometric Somatotype - Instruction
  Manual*.

### Adiposidad, muscularidad y distribución

- Σ6 = la de Kerr. Σ8 = Σ6 + bíceps + cresta ilíaca.
- Perímetros corregidos: los de Lee (PBC, PMC y PPC), con su Z (Phantom).
- Diferencia brazo = brazo flexionado y contraído − brazo relajado.
- **Distribución adiposa** (deducida del caso A, exacta en los 3 valores):
  - superior = (tríceps + subescapular) / Σ6;
  - central = (supraespinal + abdominal) / Σ6;
  - inferior = (muslo + pierna) / Σ6.
- **Distribución muscular** (deducida del caso A, exacta en los 3 valores): brazo = PBC / (PBC +
  PMC + PPC), y lo mismo para el muslo (PMC) y la pierna (PPC).
- **Índice de distribución grasa** (deducido del caso A, un solo dato, ver D11):
  `(tríceps + muslo + pierna) / (subescapular + supraespinal + abdominal)`, es decir, las
  extremidades sobre el tronco dentro del Σ6.

### Proporcionalidad

- Índice córmico = talla sentado / talla (D10).
- Índice de Manouvrier (esquélico) = (talla − talla sentado) / talla sentado · 100.
  - ≤ 84,9: braquiesquélico (miembros inferiores cortos).
  - 85,0 a 89,9: mesatiesquélico (miembros inferiores medios).
  - ≥ 90,0: macroesquélico (miembros inferiores largos).
- Envergadura relativa = envergadura / talla.
  - > 1,00: "Envergadura mayor a la talla".
  - = 1,00: "Envergadura igual a la talla".
  - < 1,00: "Envergadura menor a la talla".
  - Se clasifica con el valor redondeado a 2 decimales.

### Índices de salud

IMC, ICC, cintura/talla y conicidad salen de las funciones de la HU-004 en
`packages/core/src/anthropometry.ts`, con sus umbrales y etiquetas. El ICC usa los umbrales OMS
según el sexo que resolvió la D3 de la HU-004: en el caso A da "Sin riesgo aumentado" (ISAKMetry
dice "< 1,00", pero el valor es el mismo).

### Redondeo al mostrar (igual que ISAKMetry)

| Qué | Cómo se muestra |
|---|---|
| kg de composición, Z, índices, perímetros corregidos, somatotipo y % de distribución | 2 decimales |
| Sumatorias de pliegues y diferencia de brazo | 1 decimal |
| IMC | 1 decimal (HU-004) |
| Manouvrier | entero |

Las clasificaciones usan el valor redondeado, como en la HU-004.

---

## Datos que se registran

Una fila por estudio: una medición de la consulta (ver D1). Los valores son el **valor final** de
cada medida (D4). El lado es el derecho, según el protocolo ISAK (D3).

| Dato | Unidad | Obligatorio | Hoy existe | Uso |
|---|---|---|---|---|
| Masa corporal | kg | Sí | `weightKg` | Z, DW, residual, HWR, IMC, conicidad |
| Talla | cm | Sí | `heightCm` | escala del Phantom, todo |
| Talla sentado | cm | No | **nuevo** | Z, índice córmico, Manouvrier |
| Envergadura de brazos | cm | No | **nuevo** | Z, envergadura relativa |
| Pliegue tríceps | mm | No | `tricepsSkinfoldMm` | Z, DW, Kerr, Lee, endomorfia, mesomorfia |
| Pliegue subescapular | mm | No | `subscapularSkinfoldMm` | Z, DW, Kerr, endomorfia |
| Pliegue bíceps | mm | No | **nuevo** | Z, DW, Σ8 |
| Pliegue cresta ilíaca | mm | No | **nuevo** | Z, DW, Σ8 |
| Pliegue supraespinal | mm | No | **nuevo** | Z, Kerr, endomorfia |
| Pliegue abdominal | mm | No | `abdominalSkinfoldMm` | Z, Kerr |
| Pliegue muslo (anterior) | mm | No | **nuevo** | Z, Kerr, Lee |
| Pliegue pierna (medial) | mm | No | **nuevo** | Z, Kerr, Lee, mesomorfia |
| Perímetro brazo relajado | cm | No | `armCm` (D2) | Z, Lee, corregido |
| Perímetro brazo flexionado y contraído | cm | No | **nuevo** | Z, mesomorfia, diferencia de brazo |
| Perímetro cintura | cm | No | `waistCm` | Z, ICC, cintura/talla, conicidad |
| Perímetro caderas | cm | No | `hipCm` | Z, ICC |
| Perímetro muslo medio | cm | No | `thighCm` (D2) | Z, Lee, corregido |
| Perímetro pierna | cm | No | `calfCm` (D2) | Z, Lee, corregido, mesomorfia |
| Diámetro húmero (biepicondilar) | cm | No | **nuevo** | Z, mesomorfia |
| Diámetro biestiloideo (muñeca) | cm | No | **nuevo** | Z, Rocha |
| Diámetro fémur (bicondilar) | cm | No | **nuevo** | Z, Rocha, mesomorfia |

Se agregan 11 columnas nuevas y ninguna se modifica. También se necesita la marca de que la
medición es un estudio ISAK (D1). **No se guarda ningún resultado calculado** (D18). El sexo y la
edad salen del paciente y de la fecha de la consulta, igual que en la HU-004.

Rangos de validación sugeridos (D20):

| Medida | Rango |
|---|---|
| Masa | 10–300 kg |
| Talla | 50–230 cm |
| Talla sentado | 30–130 cm, y ≤ talla |
| Envergadura | 50–250 cm |
| Pliegues | 1–80 mm |
| Perímetros | 10–200 cm |
| Diámetros | 2–20 cm |

Todos aceptan hasta 1 decimal, con coma o con punto.

---

## Diseño UX

Sigue el sistema de diseño nuevo, al estilo Notion (`Refactorizaciones/rediseno-ui-*.md`):

- componentes `Card`, `Badge` (tonos `success`, `warning`, `danger`, `neutral` e `info`), `Alert`,
  `Input`, `Button`, `useConfirm` y `notify`;
- sin colores nuevos;
- números en formato es-AR (`formatDecimalEs`);
- no se toca el bot ni el portal.

### Detalle de la consulta (`/pacientes/[id]/consultas/[consultationId]`)

Nueva tarjeta **"Antropometría ISAK"** en la columna principal, entre "Mediciones" y "Diagnóstico
antropométrico". Tiene tres estados:

1. **Sin estudio:**
   - texto: "Todavía no hay un estudio antropométrico ISAK en esta consulta.";
   - botón **"Cargar antropometría ISAK"**.
2. **Cargando o editando:** el formulario se abre dentro de la tarjeta.
   - Tiene 4 grupos con títulos, en el orden de ISAKMetry, que es el orden en que ella mide:
     - **Medidas básicas:** masa, talla, talla sentado y envergadura.
     - **Pliegues (mm):** tríceps, subescapular, bíceps, cresta ilíaca, supraespinal, abdominal,
       muslo y pierna.
     - **Perímetros (cm):** brazo relajado, brazo flexionado y contraído, cintura, caderas, muslo
       medio y pierna.
     - **Diámetros (cm):** húmero, biestiloideo y fémur.
   - Cada campo es un `Input` numérico con la unidad al costado. El orden de tabulación sigue el
     del formulario, para cargar rápido con el teclado.
   - Si en la misma consulta ya hay una medición con peso o talla (por ejemplo, la del InBody),
     esos dos campos se precargan y se pueden editar.
   - Debajo de los pliegues se muestran en vivo "Σ 6 pliegues: 71,0 mm · Σ 8 pliegues: 94,0 mm".
   - Los errores aparecen en línea, debajo de cada campo:
     - "La talla es obligatoria para el estudio ISAK";
     - "La masa corporal es obligatoria para el estudio ISAK";
     - "Revisá el valor: los pliegues van de 1 a 80 mm";
     - "La talla sentado no puede ser mayor que la talla".
     Si hay errores, no se guarda.
   - Pie del formulario: "Guardar estudio" (dice "Guardando…" mientras procesa) y "Cancelar".
     - Si se cancela con cambios: `useConfirm` "¿Descartar los cambios del estudio?".
     - Al guardar: `notify` "Estudio ISAK guardado".
     - Si falla en el servidor: `FormError` "No se pudo guardar el estudio. Probá de nuevo.".
3. **Con estudio**, un resumen de solo lectura:
   - Línea 1: "Adiposo 27,02 % · Muscular 47,49 % · Óseo 16,95 % · Residual 8,54 %".
   - Línea 2: "Somatotipo 4,03 – 5,69 – 1,92 (Endo-mesomorfo) · IMO 2,80" y el `Badge` "Medio".
   - Línea 3: "Σ 6 pliegues 71,0 mm", y "(−9,5 respecto del 05/11/2025)" si hay un estudio
     anterior.
   - Acciones:
     - **"Ver estudio completo"** (principal): lleva a la página del estudio.
     - "Editar".
     - "Borrar estudio": botón `danger` chico, con `useConfirm` "¿Borrar el estudio ISAK de esta
       consulta? No se puede deshacer.".

La tarjeta "Mediciones" sigue igual, con una excepción: la fila del estudio ISAK se muestra como
"Antropometría ISAK · ver estudio" y no como la lista larga de valores. Así la consulta no repite
las 24 medidas. El architect decide cómo (D16).

### Página del estudio (`/pacientes/[id]/consultas/[consultationId]/antropometria`)

- `PageHeader`: "Antropometría ISAK", con subtítulo "Consulta del 08/05/2026 · 22 años ·
  Masculino" y un enlace para volver a la consulta. Las acciones son "Editar" y "Borrar estudio".
- Si hay un estudio anterior del paciente, se indica arriba: "Comparado con el estudio del
  05/11/2025 (184 días antes)" y las tablas suman las columnas **"Anterior"** y **"Dif."** (D15).
- Tiene secciones en `Card`, en este orden, el mismo que el PDF de ISAKMetry:
  1. **Medidas:** tabla Medida / Valor / Z (/ Anterior / Dif.), agrupada en básicas, pliegues,
     perímetros y diámetros.
     - Al lado del Z hay una barra horizontal simple de −3 a +3 con el 0 marcado, en tono
       `neutral`, sin colores nuevos. El valor fuera de ±3 se recorta.
     - Nota al pie: "Z: puntuación contra el Phantom (Ross y Wilson). 0 = proporcional al
       Phantom".
  2. **Composición corporal:**
     - dos tablas, "Fraccionamiento molecular" (MG y MLG) y "Fraccionamiento tisular" (4
       componentes), con las columnas componente / kg / % / Z y la referencia de cada fórmula
       entre paréntesis;
     - debajo, una barra apilada horizontal con los 4 tejidos en %, con leyenda.
     - Las tortas del informe son de la HU-007.
  3. **Distribución adiposo-muscular:** dos listas cortas:
     - adiposa: superior, central e inferior;
     - muscular: brazo, muslo y pierna.
     - La figura del cuerpo es de la HU-007.
  4. **Índices de composición corporal:**
     - índice adiposo muscular, con su interpretación en gris: "Cuántos kg de tejido adiposo
       transporta cada kg de tejido muscular. Cuanto menor, más eficiente el desplazamiento.";
     - IMO con su `Badge`: "Muy bajo" y "Bajo" en `warning`; "Medio", "Alto" y "Muy alto" en
       `neutral`;
     - la tabla de categorías del IMO, desplegable.
  5. **Adiposidad y muscularidad:** Σ6, Σ8, perímetros corregidos con su Z y la diferencia entre
     el brazo flexionado y el relajado.
  6. **Proporcionalidad:** índice córmico, Manouvrier y envergadura relativa, con su
     clasificación en texto, sin `Badge` de riesgo.
  7. **Somatotipo:**
     - los 3 componentes, la categoría y la somatocarta;
     - la somatocarta es un SVG con los 3 ejes (mesomorfia arriba, endomorfia a la izquierda y
       ectomorfia a la derecha), la grilla y los puntos "Actual" y "Anterior" con leyenda;
     - al pasar el mouse sobre un punto se ven sus coordenadas.
  8. **Índices de salud:** IMC, ICC, cintura/talla y conicidad, con las mismas filas, `Badge` y
     rangos del "Diagnóstico antropométrico" de la HU-004, más el índice de distribución grasa
     con su interpretación en gris: "Un menor valor implica mayor acumulación de grasa en el
     tronco.".
- **Faltantes:**
  - cada valor que no se puede calcular dice por qué: "Sin dato (falta fémur)" o "Falta sexo";
  - si falta el sexo o la fecha de nacimiento, arriba aparece el aviso de la HU-001
    (`missingFormulaDataMessage`) con el enlace "Completar datos para cálculos".
- **Menor de 18** a la fecha de la consulta:
  - `Alert` `info`: "Las fórmulas de composición corporal son para adultos.";
  - se ocultan las secciones 2 y 4 (D13);
  - en la sección 8, el IMC aparece sin clasificar, como en la HU-004.
- **Pie de página**, en gris: "Métodos: Durnin-Womersley (1974), Kerr (1991), Lee (2000), Rocha
  (1974), Phantom (Ross y Wilson, 1974), Heath-Carter.".

### Lista de consultas y pestaña Evolución

- El chip sigue siendo **"Antropometría"**: no se agrega un chip nuevo.
- Las reglas de "consulta vacía" y "se puede eliminar" ya cuentan las mediciones, y el estudio es
  una medición.
- La pestaña Evolución no cambia. El peso, la talla, la cintura, la cadera, los perímetros y los
  3 pliegues del estudio aparecen en sus gráficos y en su tabla como hoy. Las medidas nuevas no
  se grafican (épica 9, fuera de alcance).

### Bot y portal

No cambian y no hay ningún texto nuevo de WhatsApp. El portal sigue mostrando la evolución de
siempre, y los resultados ISAK no se muestran al paciente en esta HU.

---

## Fuera de alcance

- **El informe en PDF** (HU-007): las tortas, el gráfico de barras de la distribución, la figura
  del cuerpo, los textos interpretativos, las conclusiones y el pie con la matrícula.
- **Pediatría** (HU-008). Qué pasa con los menores de 18:
  - **El Phantom no depende de la edad**: sus Z, las sumatorias, los perímetros corregidos, la
    distribución adiposo-muscular, la proporcionalidad y el somatotipo de Heath-Carter, que se usa
    desde la niñez, se pueden mostrar.
  - **Sí dependen de la edad:**
    - Durnin-Womersley no tiene ecuaciones para menores de 16 o 17 años.
    - Lee (2000) se desarrolló en adultos y tiene un término de edad.
    - Rocha (1975) se desarrolló con jóvenes de 17 a 25 años.
    - Las categorías del IMO y del índice adiposo muscular, y los umbrales del IMC, el ICC y la
      cintura/talla, son de adultos.
    - La HU-008 va a definir las referencias pediátricas (IMC para la edad de la OMS, etc.).
- **ArgoRef (Holway, 2005)** y cualquier otro modelo de fraccionamiento, como el modelo completo
  de cinco componentes de Kerr (1988).
- **Mediciones bilaterales** (épica 31): ver D3.
- **Repeticiones de cada medida y error técnico de medición (ETM):** ver D4.
- **Importar el historial desde los Excel de ISAKMetry** (camino b de la épica 45): ver D19.
- **Gráficos de evolución de las medidas nuevas** y **estudios por tipo** en la pestaña Evolución
  (épica 9).
- **Lo que tiene la versión vieja de ISAKMetry (el Excel) y la nueva ya no:**
  - el Harris-Benedict y el gasto energético, que ya calcula la HU-004;
  - el área de superficie corporal;
  - el índice de pérdida de calor;
  - los "rangos saludables" del pliegue abdominal y del tríceps.
- **Deporte y nivel de actividad del evaluado**, y "Evaluado por / Certificación ISAK", que van a
  la épica 47 y a la HU-007.
- **Separar `EvolutionEntry` en tablas por tipo de estudio:** esta HU agrega columnas y no
  reestructura (D1).

---

## Notas de implementación

Son mínimas. El detalle lo escribe el `architect`.

- **Lógica pura en `packages/core`**, con un archivo nuevo tipo `isak.ts` y su `isak.test.ts`:
  - Phantom y Z, DW + Siri, Kerr adiposo, Lee, Rocha, residual, distribución, índices,
    proporcionalidad, Heath-Carter, categoría del somatotipo y coordenadas de la somatocarta;
  - devuelve una estructura con `status: ok / missing / not_for_minors` por valor, al estilo de
    `DiagnosisRow` de la HU-004;
  - las constantes del Phantom y la tabla de DW van en ese archivo, con su referencia en un
    comentario.
- **Reusar** `bmiExact`, `classifyBmi`, `classifyWaistHipRatio`, `waistToHeightRatio`,
  `conicityIndex`, `classifyHealthyBelow`, `roundTo`, `computeAgeYears`, `isMinor` y
  `formatDecimalEs`. **No reimplementar** el IMC, el ICC, la cintura/talla ni la conicidad.
- **Migración solo aditiva:** 11 columnas nullable en `EvolutionEntry` más la marca de estudio
  ISAK (D1).
  - Sin `NOT NULL` sin default y sin cambios de tipo ni de nombre en las columnas existentes.
  - El renombre de `armCm`, `thighCm` y `calfCm` (D2) es **solo de etiquetas en la UI**, no de
    columnas.
- `ANTHROPOMETRY_MEASURE_KEYS` y `measurementKinds` tienen que contar las columnas nuevas, para
  que una medición que solo tiene diámetros no pase por bioimpedancia.
- Toca `packages/db` (schema) y `apps/web`. El bot no usa estas columnas, pero hay que correr
  `typecheck` en los dos por el cliente de Prisma.
- **Validación contra ISAKMetry:**
  - Los tests versionados usan los casos A y B de esta HU (solo números) y documentan en un
    comentario cada diferencia conocida (D5, D6, D7).
  - Hay un script local opcional que lee `docs/ISAKMetry_*.xlsx`: `xl/worksheets/sheet1.xml` y
    `xl/sharedStrings.xml` del zip. Para el PDF, usa el texto de `pdftotext -layout`.
  - El script compara los números con lo que calcula el sistema y no falla si los archivos no
    están.
  - El script no imprime ni guarda el nombre del paciente.
- **Datos de desarrollo:** cualquier prueba que escriba estudios en la base limpia solo por los
  ids que insertó (regla de `AGENTS.md`).

---

## Dudas para validar con el usuario

Cada duda trae la recomendación del afinador, para que el orquestador la resuelva en modo
autónomo.

**D1. Modelo de datos: ¿columnas nuevas en `EvolutionEntry` o una entidad "estudio ISAK" aparte?**
Hay 10 de las 21 medidas que ya existen en `EvolutionEntry`: peso, talla, cintura, cadera, brazo,
muslo, pantorrilla, tríceps, subescapular y abdominal. Una entidad aparte duplicaría el peso, la
talla, la cintura y la cadera, y el diagnóstico de la HU-004, la pestaña Evolución y el portal no
las verían sin tocar código.
**Recomendación:**
- Agregar las 11 columnas nullable a `EvolutionEntry` (migración aditiva) y una marca que
  identifique la medición como estudio ISAK. El architect elige entre un enum nullable o un
  booleano con default `false`.
- Un solo estudio ISAK por consulta.
- La separación en tablas por tipo de estudio (épica 9) queda para después.

**D2. Qué significan `armCm`, `thighCm` y `calfCm` en ISAK.** La etiqueta actual dice "Brazo",
"Muslo" y "Pantorrilla".
**Recomendación:** tomarlos como brazo relajado, muslo medio y pierna, que es como ella los
reporta en el informe de Canva. Cambiar solo las etiquetas de la UI a "Brazo relajado", "Muslo
medio" y "Pierna (pantorrilla)", y agregar el brazo flexionado y contraído como columna nueva.
Hay que confirmar con la nutricionista que en las mediciones viejas "Brazo" era el relajado. Si
no, esas filas viejas solo quedan con una etiqueta imprecisa y no se tocan.

**D3. Medidas bilaterales (épica 31).** El protocolo ISAK mide el lado derecho, y ISAKMetry
registra un solo valor por medida.
**Recomendación:** que queden **fuera** de esta HU, con un solo valor por medida (el lado derecho).
Si ella quiere detectar asimetrías, se hace otra HU que agregue columnas del lado izquierdo para
brazo, muslo y pierna, que también sería aditiva.

**D4. Repeticiones y error técnico de medición.** ISAK toma 2 o 3 veces cada medida y usa la
media o la mediana.
**Recomendación:** guardar **solo el valor final**, que es lo que exporta ISAKMetry. Las
repeticiones y el ETM quedan fuera.

**D5. Z del muslo corregido.** En los dos casos, ISAKMetry muestra como "Z muslo corregido" el
mismo número que el Z del perímetro del muslo medio **sin corregir** (0,17 y 0,62). Con el Phantom
del muslo corregido (47,34 / 3,59) da 0,84 y 1,70. Parece un error de ISAKMetry.
**Recomendación:** calcularlo bien, con el Phantom del muslo corregido. Ese valor se excluye de la
validación exacta y se documenta en el test. El architect confirma *p* y *s* del muslo corregido
en la tabla de Ross y Marfell-Jones. Si la nutricionista prefiere ver lo mismo que en ISAKMetry,
se cambia.

**D6. Z del tejido adiposo: el PDF y el Excel no coinciden.**
- El PDF (caso A, versión nueva) muestra −1,23, que es exactamente el Z de Kerr del Σ6.
- El Excel (caso B, versión vieja) muestra 2,44, que no sale de ninguna fórmula que el afinador
  pudo reconstruir. Con el mismo método, el caso B da −0,94.

**Recomendación:** usar el método del PDF (Z de Kerr del Σ6), que es la versión actual y coincide
con la publicación. Excluir el 2,44 del Excel de la validación.

**D7. Dos constantes del Phantom no reproducen exacto a ISAKMetry.**
- **Masa corporal:** con 64,58 / 8,60 y *d* = 3 da 0,42 y 1,27, contra 0,40 y 1,26 de ISAKMetry.
  Reproducen los dos casos con *p* entre 64,68 y 64,74 y *s* = 8,60.
- **Brazo flexionado y contraído:** con 29,41 / 2,37 da 1,60 y 2,08, contra 1,67 y 2,18. Con *s* =
  2,27 reproduce los dos casos.

**Recomendación:**
- Brazo flexionado: usar 29,41 / 2,27, que es lo que usa ISAKMetry según los dos casos. La
  diferencia con 2,37 puede ser un error de transcripción en alguna de las fuentes.
- Masa: usar el Phantom publicado (64,58 / 8,60) y aceptar una tolerancia de ±0,02 en el test,
  documentada.
- El architect revisa la tabla original antes de fijarlas.

**D8. Clasificación del índice adiposo muscular.** No hay tabla en el material. ISAKMetry dice
"Bueno" para 0,57 y 0,59, y el informe de Canva dice "muy alto" para 0,48, que parece otra
escala o un error.
**Recomendación:** mostrar **el valor y la interpretación, sin categoría**, hasta que la
nutricionista pase la tabla que usa. Cuando la pase, es una constante en `packages/core`.

**D9. Detalles de la tabla del IMO.**
- ISAKMetry muestra la categoría "Promedio", pero su propia tabla dice "Medio".
- Los límites se solapan: 2,34–2,44 y 2,44–3,11.
- La tabla no distingue sexo.

**Recomendación:**
- Usar "Medio".
- Que el límite inferior de cada tramo sea inclusivo, con "Alto" hasta 3,29 inclusive, sobre el
  valor redondeado a 2 decimales.
- Usar la misma tabla para los dos sexos, como hace ISAKMetry.
- Confirmar con la nutricionista si para mujeres usa otra.

**D10. Categorías del índice córmico.** Con los umbrales clásicos en % para hombres (≤ 51,0
braquicórmico, 51,1–53,0 metricórmico, ≥ 53,1 macrocórmico), el 50,6 del caso A daría
braquicórmico. Sin embargo, ISAKMetry dice "Metricórmico". Eso cuadra si clasifica el valor ya
redondeado a 0,51.
**Recomendación:**
- Clasificar con el valor redondeado a 2 decimales:
  - ≤ 0,50: "Braquicórmico (tronco corto)";
  - 0,51 a 0,52: "Metricórmico (tronco medio)";
  - ≥ 0,53: "Macrocórmico (tronco largo)".
- Usar la misma tabla para los dos sexos.
- Es la opción que reproduce ISAKMetry con los datos disponibles. Hay que confirmar con la
  nutricionista si usa umbrales distintos para mujeres, que en la literatura van 1 punto más
  arriba.

**D11. Índice de distribución grasa: la fórmula es deducida.** Con un solo dato (0,65),
(tríceps + muslo + pierna) / (subescapular + supraespinal + abdominal) da 0,651. Otras
combinaciones razonables no lo reproducen: con los 8 pliegues da 0,52 y subescapular/tríceps da
1,00. ISAKMetry no muestra ningún rango saludable para este índice.
**Recomendación:** usar esa fórmula, **sin rango ni categoría**, solo con el texto de
interpretación. Validarla con el próximo PDF de ISAKMetry que ella exporte, y dejar la fórmula
aislada en una función para cambiarla fácil.

**D12. Somatotipo: categoría y textos por componente.** ISAKMetry muestra un texto por componente,
por ejemplo "Moderada adiposidad relativa…", pero sus cortes no coinciden con los de Carter: a
una endomorfia de 4,95 la llama "Alta". El informe de Canva usa la categoría "endo-mesomórfico".
**Recomendación:**
- Mostrar la **categoría** de las 13 de Carter y Heath (1990), que en los dos casos da
  "Endo-mesomorfo", igual que el informe.
- Los textos interpretativos por componente pasan a la HU-007, que es donde se redactan los
  textos del informe.

**D13. Menores de 18 años.**
**Recomendación:**
- **Mostrar:**
  - las medidas con su Z;
  - las sumatorias, los perímetros corregidos y la distribución adiposo-muscular;
  - la proporcionalidad y el somatotipo.
- **Ocultar**, con el aviso "Las fórmulas de composición corporal son para adultos.":
  - la composición corporal (DW, Kerr, Lee, Rocha y residual);
  - el índice adiposo muscular y el IMO.
- Los índices de salud siguen la regla de la HU-004: el IMC aparece sin clasificar.
- La HU-008 define qué se muestra en su lugar.

**D14. Término de etnia de Lee (2000).** Vale 0 para blancos e hispanos, −2,0 para asiáticos y
+1,1 para afroamericanos. `Patient` no tiene ese dato, e ISAKMetry usó 0: con 0 reproduce los dos
casos.
**Recomendación:** usar **0 fijo**, sin un campo nuevo en el paciente.

**D15. ¿La vista compara con el estudio anterior?** ISAKMetry marca "Actual / Previo" y el informe
de Canva compara las dos mediciones.
**Recomendación:**
- **Sí, mínimo:** columnas "Anterior" y "Dif." en las tablas, y el punto anterior en la
  somatocarta.
- El estudio anterior es el último estudio ISAK del paciente en una consulta con fecha anterior.
- Los gráficos comparativos (tortas y barras) quedan para la HU-007, que va a reusar esta misma
  consulta.

**D16. Dónde vive la vista.**
**Recomendación:**
- En la consulta, una tarjeta con el resumen y "Ver estudio completo".
- El estudio completo, en su propia página (`.../consultas/[consultationId]/antropometria`),
  porque son 8 secciones y el detalle de la consulta ya es largo.
- En la tarjeta "Mediciones", la fila del estudio se muestra resumida.

**D17. ¿Se puede editar el estudio?** Hoy las mediciones de la consulta solo se agregan o se
borran.
**Recomendación:** **sí**, el estudio ISAK se puede editar. Son 24 valores y rehacerlo entero por
un error de tipeo no es razonable. Las otras mediciones siguen como hoy.

**D18. ¿Se guardan los resultados calculados?**
**Recomendación:** **no**: se calculan al vuelo, como el diagnóstico de la HU-004. Las fórmulas son
deterministas, y si se corrige una constante (D7), los estudios viejos se recalculan solos. El
sexo y la edad salen del paciente, igual que en el diagnóstico.

**D19. Importar el historial de ISAKMetry (camino b de la épica 45).**
**Recomendación:** **fuera de esta HU**. Si hace falta, se hace otra HU que importe el Excel
exportado (el formato está en la hoja `sheet1.xml`) creando consultas "Sin turno". Por ahora, la
carga es manual.

**D20. Rangos de validación de la carga.**
**Recomendación:** usar los rangos de la tabla de "Datos que se registran", la talla sentado ≤
talla y hasta 1 decimal. Un valor fuera de rango **bloquea** el guardado con un error en línea.
Son rangos amplios, pensados para atajar errores de tipeo (110 en lugar de 11), no para juzgar
la medida.

**D21. Tabla completa de Durnin-Womersley.** El afinador solo pudo verificar el tramo hombres de
20 a 29 años. Los demás coeficientes de la tabla de "Fórmulas" son los publicados, según el
afinador, pero no se contrastaron con ISAKMetry.
**Recomendación:** que el architect los confirme contra Durnin y Womersley (1974) antes de fijarlos,
y que haya un test por tramo. Para 17 años en hombres o 16 en mujeres no hay caso real: los
menores de 18 no ven la composición corporal (D13), así que en la práctica el primer tramo casi no
se usa.

---

## Resoluciones (validadas por el orquestador en modo autónomo, autorizado por el usuario, 2026-09-24)

Se aceptan **todas las recomendaciones** del afinador (D1–D21) tal como están escritas arriba. En
particular:
- columnas nullable nuevas en `EvolutionEntry`, con una marca de estudio ISAK, y un estudio por
  consulta (D1);
- un solo lado, el derecho, y solo el valor final (D3, D4);
- Z del muslo corregido calculada bien (D5) y Z adiposa por el método del PDF (D6);
- constantes del Phantom según D7, con tolerancia documentada; el architect las confirma contra la
  tabla original;
- sin categoría donde no hay fuente (D8, D11);
- menores de 18: sin composición ni IMO (D13);
- comparación mínima con el estudio anterior (D15);
- página propia `.../consultas/[consultationId]/antropometria` (D16);
- estudio editable (D17);
- resultados calculados al vuelo, sin guardarse (D18);
- sin importar el historial de ISAKMetry (D19);
- Durnin-Womersley confirmada contra la publicación por el architect (D21).
