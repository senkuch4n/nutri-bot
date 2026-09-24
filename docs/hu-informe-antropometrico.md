# HU-007: Informe antropométrico automático en PDF (comparado con la consulta anterior)

**Como** profesional (nutricionista, antropometrista ISAK),
**quiero** generar desde el estudio ISAK de una consulta el informe antropométrico en PDF, que
compare esa medición con la anterior, con sus gráficos y mis textos,
**para que** pueda entregárselo al paciente (descargado o por WhatsApp) sin copiar números a mano
a una plantilla de Canva.

Origen: épica 46 de `docs/historias-usuario-nutridesk.md` (ronda 3). Depende de las épicas 44 y 45,
ya hechas en la HU-006. Toca la épica 47 (título y matrícula, ver D1), la 7 (IA, ver D3) y la 55
(documentos que hoy arma en Canva).

Material fuente: `docs/EJEMPLO DE INFORME ANTROPOMETRICO.pdf`, que es el informe real de 6 páginas
que ella arma en Canva. No se versiona porque tiene datos de un paciente, y en este documento no se
copia ningún dato que lo identifique.

---

## Contexto

### Qué existe hoy

- **Estudio ISAK (HU-006):** está en `EvolutionEntry` con `study = ISAK`, y hay uno por consulta.
  - Tiene la página `/pacientes/[id]/consultas/[consultationId]/antropometria`.
  - `buildIsakStudy` (`packages/core/src/isak-study.ts`) calcula al vuelo todo lo que el informe
    necesita:
    - las medidas;
    - la composición molecular y tisular, en kg, % y Z;
    - la distribución adiposo-muscular por zonas;
    - los índices adiposo muscular y músculo/óseo (IMO), este con su categoría;
    - las sumatorias y los perímetros corregidos;
    - el somatotipo, con su categoría y sus coordenadas en la somatocarta;
    - los índices de salud de la HU-004 (IMC, ICC, cintura/talla y conicidad).
  - Además:
    - `getPreviousIsakStudy` (`packages/db/domain/isak.ts`) busca el estudio anterior del paciente;
    - `isakDifference` y `daysBetweenDayKeys` resuelven la comparación.
  - La página ya muestra las columnas "Anterior" y "Dif." y los dos puntos en la somatocarta
    (D15 de la HU-006).
  - La HU-006 dejó para esta HU:
    - las tortas de composición;
    - el gráfico de barras de la distribución;
    - la figura del cuerpo;
    - el contorno curvo de la somatocarta (en el panel hoy es un triángulo, ver el comentario de
      `SOMATOCHART_VERTICES`);
    - los textos interpretativos por componente del somatotipo (D12 de la HU-006);
    - las conclusiones;
    - el pie con la matrícula.
- **Consulta, diagnóstico y prescripción (HU-003 y HU-004):** la consulta agrupa las mediciones.
  El IMC, el ICC y los demás índices de salud tienen **una sola implementación**, con sus
  etiquetas: "Normal", "Sobrepeso", "Sin riesgo aumentado", etc.
- **PDF del plan** (`apps/web/src/lib/plan-pdf.tsx`):
  - usa `@react-pdf/renderer`, con Inter desde `public/fonts` y Helvetica si no está;
  - encabezado con logo, línea de acento y pie `fixed` con número de página;
  - toma de `/ajustes` el logo (`Professional.logoData`), el color de acento
    (`pdfAccentColor`, con el neutro `DEFAULT_PDF_ACCENT` por defecto) y el pie
    (`pdfFooterText`);
  - los colores base están en `apps/web/src/lib/pdf-theme.ts` y el formato de números es es-AR
    (HU-002d);
  - el PDF se guarda en la base (`NutritionPlan.pdfData`, `pdfFileName` y `pdfGeneratedAt`).
- **Envío del plan por WhatsApp:**
  - `sendPlanWhatsAppAction` regenera el PDF y llama a `enqueuePlanPdfMessage`, que crea un
    `OutboundMessage` con `kind = PLAN_PDF` y `planId`;
  - el consumidor de la cola del bot (`apps/bot/src/workers.ts`) lee `plan.pdfData` y lo manda con
    `sendDocument`, como documento.
  - **Observación:** el `caption` ("📄 Te comparto tu plan alimentario actualizado.") se guarda en
    `body`, pero `sendDocument` no lo manda. El paciente recibe solo el archivo (ver D7).
  - El portal también deja descargar el PDF del plan.
- **IA:** DeepSeek (`apps/web/src/lib/deepseek.ts`, `API_KEY_IA_DEEPSEEK`) se usa en el asistente
  (`/asistente`, `assistant-tools.ts`) y en la propuesta de plan (`planes/[planId]/ai-actions.ts`).
  En los dos casos devuelve un borrador que ella revisa.
- **Datos de la profesional:** `Professional` tiene `name`, pero no tiene título ni matrícula. La
  épica 47 no está hecha.
- **Nada de lo siguiente existe hoy:**
  - un informe antropométrico;
  - textos interpretativos guardados;
  - gráficos dentro de un PDF (el PDF del plan no tiene ninguno);
  - una `MessageKind` para mandar otro documento que no sea el plan.

  `git log -i --grep=informe` solo muestra el commit que agregó la ronda 3 de épicas.

### Cómo trabaja hoy la nutricionista

1. Mide el perfil ISAK y lo carga en el sistema (HU-006), o en ISAKMetry.
2. Copia los números a una plantilla verde de Canva, de 6 páginas.
3. Redacta los textos de cada sección y las conclusiones.
4. Exporta el PDF y se lo manda al paciente.

El informe de Canva tiene errores que el sistema elimina porque toma los números del cálculo:

- la masa residual anterior copiada de la masa ósea (lo detectó la HU-006);
- los números mezclan punto y coma decimal ("22.7" y "2,76");
- la referencia dice "ArgoRef, Holway (2005)", pero los números son de Kerr, Lee y Rocha;
- la distribución adiposa por zonas de la figura (37,74 / 37,74 / 24,53 %) no coincide con lo que
  calcula la HU-006.

### Estructura del informe real (épica 46), sección por sección

| # | Sección | Contenido | Gráfico |
|---|---|---|---|
| 1 | Datos personales | Nombre y apellido, edad y fecha de evaluación | — |
| 2 | Mediciones antropométricas | Peso, talla, IMC (según OMS) y su clasificación, en dos columnas ("Segunda medición (fecha)" y "Tercera medición"), con la diferencia en texto ("2 kg menos") | — |
| 3 | Pliegues cutáneos | Texto fijo ("indicadores de grasa corporal subcutánea (externa)"): los 6 pliegues del Σ6 y la sumatoria; "Otros pliegues": bíceps y cresta ilíaca. Dos columnas | — |
| 4 | Perímetros y perímetros corregidos | Musculares (brazo relajado, brazo flexionado, muslo medio y pierna), de "grasa visceral" (cintura y cadera) y corregidos (brazo, muslo y pierna), con textos fijos y un párrafo interpretativo | — |
| 5 | Distribución adiposo-muscular | Párrafo interpretativo | Barras horizontales, anterior contra actual, de los 3 perímetros y los 3 corregidos, y una figura del cuerpo con el % adiposo (superior, central e inferior) y el muscular (brazo, muslo y pierna) |
| 6 | Indicadores de salud | Índice adiposo muscular, IMO e ICC, cada uno con su valor, su categoría y una línea de variación comentada ("Disminuyó de 0,57 a 0,48 (0,09), reflejando…") | — |
| 7 | Composición corporal | Texto fijo con la definición y la referencia; los 4 componentes en % y kg, "anterior a actual" | Dos tortas: actual y anterior |
| 8 | Somatotipo | Texto fijo con la definición, los 3 componentes "anterior a actual" y un párrafo interpretativo | Somatocarta con el contorno curvo y los dos puntos |
| 9 | Conclusiones | Texto libre, de unos 3 párrafos | — |
| — | Pie de cada página | "LIC. DAIANA PONCE M.P 852" | — |

### Qué es lo nuevo

1. **Informe antropométrico** de la consulta, que sale del estudio ISAK:
   - usa las 9 secciones de la tabla anterior, con los números de `buildIsakStudy` del estudio
     actual y del anterior;
   - no hay ningún número tipeado a mano.
2. **Textos interpretativos** por sección:
   - se guardan con el informe;
   - arrancan como borrador automático y ella los edita (D3);
   - nada sale sin que ella lo haya visto.
3. **Gráficos en el PDF**, dibujados con SVG de `@react-pdf/renderer` (D4 y D5):
   - barras horizontales de perímetros, anterior contra actual;
   - distribución por zonas sobre una silueta esquemática;
   - composición corporal;
   - somatocarta con el contorno curvo.
4. **Descarga y envío por WhatsApp** del informe, como el PDF del plan. Sin cambios en el flujo
   conversacional del bot (D6).
5. **Título y matrícula de la profesional** en el pie (D1).

---

## Criterios de aceptación

Datos de ejemplo: los casos A y B de la HU-006, solo con sus números. Los dos son del mismo
paciente, masculino. Los resultados son los que ya calcula `buildIsakStudy`.

- **Estudio anterior (caso B):** consulta del 05/11/2025, a los 21 años.
- **Estudio actual (caso A):** consulta del 08/05/2026, a los 22 años.

| Dato | Anterior (B) | Actual (A) |
|---|---|---|
| Peso / talla | 67,6 kg / 164,0 cm | 61,0 kg / 164,0 cm |
| IMC | 25,1 (Sobrepeso) | 22,7 (Normal) |
| Pliegues del Σ6 (tríceps, subescapular, supraespinal, abdominal, muslo, pierna) | 12 / 14 / 21,5 / 18 / 8 / 7 | 11 / 11 / 16 / 16 / 11 / 6 |
| Σ 6 pliegues | 80,5 mm | 71,0 mm |
| Bíceps / cresta ilíaca | 4 / 30 mm | 4 / 19 mm |
| Brazo relajado / flexionado / muslo medio / pierna | 32,3 / 33,1 / 54,0 / 34,0 cm | 30,2 / 32,0 / 52,0 / 34,5 cm |
| Cintura / cadera | 82,1 / 94,0 cm | 73,0 / 88,0 cm |
| Brazo / muslo / pierna corregidos | 28,53 / 51,49 / 31,80 cm | 26,74 / 48,54 / 32,62 cm |
| Distribución adiposa (superior / central / inferior) | 32,30 / 49,07 / 18,63 % | 30,99 / 45,07 / 23,94 % |
| Distribución muscular (brazo / muslo / pierna) | 25,51 / 46,05 / 28,44 % | 24,79 / 44,99 / 30,23 % |
| Índice adiposo muscular | 0,59 | 0,57 |
| IMO | 2,99 (Medio) | 2,80 (Medio) |
| ICC | 0,87 (Sin riesgo aumentado) | 0,83 (Sin riesgo aumentado) |
| Adiposo / muscular / óseo / residual (%) | 26,57 / 44,76 / 14,99 / 13,68 | 27,02 / 47,49 / 16,95 / 8,54 |
| Adiposo / muscular / óseo / residual (kg) | 17,96 / 30,26 / 10,13 / 9,25 | 16,48 / 28,97 / 10,34 / 5,21 |
| Somatotipo (endo / meso / ecto) | 4,95 / 5,72 / 1,01 (Endo-mesomorfo) | 4,03 / 5,69 / 1,92 (Endo-mesomorfo) |
| Somatocarta (X, Y) | (-3,94; 5,48) | (-2,12; 5,43) |

```gherkin
Feature: Armar el informe antropométrico desde el estudio ISAK

  Background:
    Given la profesional está logueada en el panel
    And el paciente es masculino, con fecha de nacimiento cargada
    And tiene el estudio ISAK del caso B en la consulta del 05/11/2025
    And tiene el estudio ISAK del caso A en la consulta del 08/05/2026

  Scenario: Abrir el informe por primera vez
    Given la consulta del 08/05/2026 todavía no tiene informe
    When la profesional abre la página del estudio ISAK de esa consulta y toca "Informe PDF"
    Then ve la página "Informe antropométrico", con el subtítulo "Consulta del 08/05/2026 ·
        comparado con el estudio del 05/11/2025"
    And ve las secciones del informe en el orden del PDF, cada una con sus números de solo lectura
    And cada sección con texto interpretativo (perímetros, distribución adiposo-muscular,
        indicadores de salud, somatotipo y conclusiones) muestra un área de texto con el borrador
        automático (ver D3)
    And arriba ve el aviso "Revisá y editá los textos antes de generar el PDF."

  Scenario: Guardar los textos
    When la profesional edita el párrafo de "Somatotipo" y toca "Guardar textos"
    Then ve la notificación "Textos del informe guardados"
    And al volver a abrir el informe ve su texto editado, no el borrador

  Scenario: Volver al borrador automático de una sección
    Given la profesional editó el párrafo de "Perímetros"
    When toca "Volver al borrador" en esa sección y confirma "¿Reemplazar tu texto por el
        borrador automático?"
    Then el área de texto de esa sección vuelve a tener el borrador automático
    And las demás secciones no cambian

  Scenario: No se puede generar con un texto obligatorio vacío
    When la profesional deja vacías las "Conclusiones" y toca "Generar PDF"
    Then ve el error en línea "Escribí las conclusiones antes de generar el informe"
    And no se genera el PDF
    # Los párrafos interpretativos de las otras secciones pueden quedar vacíos: en ese caso la
    # sección sale en el PDF sin párrafo (ver D3).
```

```gherkin
Feature: Contenido del PDF

  Background:
    Given el informe de la consulta del 08/05/2026 tiene sus textos guardados
    When la profesional toca "Generar PDF"
    Then ve la notificación "Informe generado"
    And la página muestra "Último PDF: <fecha y hora>" con el botón "Descargar"

  Scenario: Encabezado y datos personales
    Then la primera página del PDF tiene el logo de /ajustes (si hay), el título "Informe
        antropométrico" y la línea de acento con el color de /ajustes
    And "Datos personales" dice "Nombre y apellido: <nombre del paciente>", "Edad: 22 años" y
        "Fecha de evaluación: 08/05/2026"
    # La edad se calcula a la fecha de la consulta, no a la de hoy.

  Scenario: Mediciones antropométricas, anterior contra actual
    Then la sección tiene las columnas "Medición anterior (05/11/2025)" y "Medición actual
        (08/05/2026)" (ver D8)
    And muestra "Peso: 67,6 kg" y "Peso: 61,0 kg (6,6 kg menos)"
    And "Talla: 164,0 cm" en las dos, sin diferencia
    And "IMC (OMS): 25,1 · Sobrepeso" y "IMC (OMS): 22,7 · Normal"
    # Las etiquetas del IMC son las de la HU-004 (ver D9).

  Scenario: Pliegues cutáneos
    Then la sección tiene el texto fijo "Los siguientes pliegues son indicadores de grasa corporal
        subcutánea (externa)."
    And lista, en dos columnas, tríceps, subescapular, supraespinal, abdominal, muslo y pierna,
        y la "Sumatoria de 6 pliegues: 80,5 mm" y "71,0 mm (9,5 mm menos)"
    And en "Otros pliegues" lista bíceps (4,0 y 4,0 mm) y cresta ilíaca (30,0 y 19,0 mm)

  Scenario: Perímetros y perímetros corregidos
    Then la sección lista los perímetros musculares (brazo relajado, brazo flexionado y contraído,
        muslo medio y pierna), los de cintura y cadera, y los corregidos (brazo 28,53 y 26,74 cm,
        muslo 51,49 y 48,54 cm, pierna 31,80 y 32,62 cm)
    And debajo va el párrafo interpretativo guardado de la sección

  Scenario: Distribución adiposo-muscular
    Then la sección tiene un gráfico de barras horizontales con 6 categorías (brazo relajado,
        brazo corregido, muslo medio, muslo corregido, pierna y pierna corregida), con dos barras
        por categoría: "Anterior (05/11/2025)" en gris y "Actual (08/05/2026)" en el color de
        acento, cada una con su valor
    And al lado, la figura esquemática del cuerpo (ver D5) con "Tejido adiposo: superior 30,99 %,
        central 45,07 %, inferior 23,94 %" y "Tejido muscular: brazo 24,79 %, muslo 44,99 %,
        pierna 30,23 %" del estudio actual
    And debajo va el párrafo interpretativo de la sección

  Scenario: Indicadores de salud
    Then la sección muestra:
      | Indicador               | Valor actual | Categoría             | Variación automática        |
      | Índice adiposo muscular | 0,57         | (sin categoría, D8 HU-006) | "Bajó de 0,59 a 0,57 (−0,02)" |
      | Índice músculo/óseo     | 2,80         | Medio                 | "Bajó de 2,99 a 2,80 (−0,19)" |
      | Índice cintura/cadera   | 0,83         | Sin riesgo aumentado  | "Bajó de 0,87 a 0,83 (−0,04)" |
    And debajo de cada indicador va su comentario, que es parte del texto de la sección

  Scenario: Composición corporal
    Then la sección tiene el texto fijo de la definición de composición corporal
    And la referencia "Métodos: Kerr (1991), Lee (2000), Rocha (1974), residual por diferencia"
    And el gráfico de composición del estudio actual y del anterior (ver D4)
    And la lista:
      | Componente | Anterior          | Actual            |
      | Adiposo    | 26,57 % (17,96 kg) | 27,02 % (16,48 kg) |
      | Muscular   | 44,76 % (30,26 kg) | 47,49 % (28,97 kg) |
      | Óseo       | 14,99 % (10,13 kg) | 16,95 % (10,34 kg) |
      | Residual   | 13,68 % (9,25 kg)  | 8,54 % (5,21 kg)   |

  Scenario: Somatotipo
    Then la sección tiene el texto fijo de la definición del somatotipo
    And "Endomorfia 4,95 → 4,03 · Mesomorfia 5,72 → 5,69 · Ectomorfia 1,01 → 1,92" y la
        categoría "Endo-mesomorfo"
    And la somatocarta con el contorno curvo de Heath-Carter, los 3 ejes con sus rótulos
        (Mesomorfia arriba, Endomorfia a la izquierda y Ectomorfia a la derecha), el punto
        "Actual" en (-2,12; 5,43) con el color de acento y el punto "Anterior" en (-3,94; 5,48)
        en gris, con leyenda
    And debajo va el párrafo interpretativo de la sección

  Scenario: Conclusiones y pie
    Then la última sección, "Conclusiones", tiene el texto que escribió la profesional
    And cada página tiene al pie "<título> <nombre> · <matrícula>" (ver D1) y "Página n de N"
    And ningún gráfico ni tabla queda cortado entre dos páginas

  Scenario: Formato de números
    Then todos los números del PDF usan coma decimal y la cantidad de decimales de la página del
        estudio ISAK (1 para medidas y sumatorias, 2 para %, kg, corregidos e índices)
```

```gherkin
Feature: Casos borde

  Scenario: Primer estudio ISAK del paciente (sin anterior)
    Given el paciente solo tiene el estudio ISAK del caso A
    When la profesional abre el informe
    Then el subtítulo dice "Consulta del 08/05/2026 · primer estudio, sin comparación"
    And el PDF tiene una sola columna, la actual, sin diferencias ni líneas de variación
    And el gráfico de barras de perímetros muestra solo la barra "Actual"
    And la somatocarta muestra un solo punto y el gráfico de composición, solo el actual
    And los borradores automáticos no mencionan comparaciones

  Scenario: Medidas faltantes
    Given el estudio actual no tiene el diámetro de fémur
    Then en el PDF, lo que no se puede calcular sale como "Sin dato" (el tejido óseo, el
        residual, el IMO y la mesomorfia)
    And la somatocarta no dibuja el punto actual y lo aclara: "Somatotipo sin dato (falta fémur)"
    And la pantalla del informe muestra antes de generar el aviso "Faltan datos en el estudio: el
        PDF va a mostrar «Sin dato» en algunos valores." con el enlace "Editar estudio"

  Scenario: Menor de 18 años (ver D10)
    Given el paciente tiene 12 años a la fecha de la consulta
    Then el informe no incluye la composición corporal, el índice adiposo muscular ni el IMO
    And el IMC sale sin clasificación, como en la HU-004
    And el PDF muestra, al principio de las mediciones, la nota "Las fórmulas de composición
        corporal son para adultos."
    And sí incluye los pliegues, los perímetros, la distribución adiposo-muscular, el ICC y el
        somatotipo

  Scenario: La consulta no tiene estudio ISAK
    Given la consulta no tiene estudio ISAK
    Then no aparece el botón "Informe PDF"
    And si se entra por URL a la página del informe, se redirige a la consulta con el aviso
        "Primero cargá el estudio ISAK de esta consulta."

  Scenario: El estudio cambió después de generar el PDF
    Given el informe tiene un PDF generado
    When la profesional edita el estudio ISAK de esa consulta (o el anterior)
    Then la página del informe muestra el aviso "El estudio cambió después de generar este PDF.
        Generalo de nuevo antes de enviarlo."
    And los textos guardados se conservan (no se reemplazan por los borradores nuevos)
    And "Enviar por WhatsApp" regenera el PDF antes de encolarlo, igual que el plan

  Scenario: Borrar el estudio ISAK
    Given la consulta tiene informe
    When la profesional borra el estudio ISAK
    Then el confirm de borrado dice "¿Borrar el estudio ISAK de esta consulta? También se borra su
        informe. No se puede deshacer."
    And se borran el estudio y el informe, con sus textos y su PDF
```

```gherkin
Feature: Enviar el informe por WhatsApp (ver D6)

  Scenario: Encolar el envío
    Given el informe tiene sus conclusiones escritas
    When la profesional toca "Enviar por WhatsApp" y confirma "¿Enviar el informe a <teléfono>?"
    Then se regenera el PDF con los textos guardados
    And se crea un OutboundMessage PENDING del tipo del informe, que apunta a ese informe
    And ve la notificación "Encolado para enviar por WhatsApp a <teléfono>."

  Scenario: El bot manda el documento
    Given hay un OutboundMessage PENDING del informe
    When el consumidor de la cola lo procesa
    Then manda el PDF como documento con el nombre "informe-antropometrico-2026-05-08.pdf"
    And lo marca SENT, con los mismos reintentos que el PDF del plan

  Scenario: Prueba sin WhatsApp real
    Then la verificación del envío se hace sin Baileys: se crea el OutboundMessage, se comprueba
        que el consumidor elige el documento correcto y se borran por id las filas creadas
```

```gherkin
Feature: Título y matrícula de la profesional (ver D1)

  Scenario: Cargar título y matrícula
    When la profesional completa en /ajustes "Título" con "Lic." y "Matrícula" con "M.P. 852" y
        guarda
    Then el pie de cada página del informe dice "Lic. Daiana Ponce · M.P. 852"

  Scenario: Sin matrícula cargada
    Given los campos "Título" y "Matrícula" están vacíos
    Then el pie dice solo el nombre de la profesional
    And la página del informe muestra el aviso "Tu matrícula no está cargada. Completala en
        Ajustes para que aparezca en el informe." con el enlace a /ajustes
```

---

## Datos que se registran

| Dato | Obligatorio | Uso |
|---|---|---|
| Informe de la consulta (1 por estudio ISAK / consulta) | Se crea al guardar textos o generar por primera vez | Agrupa textos y PDF. El architect decide si es un modelo nuevo 1:1 con `Consultation` o con el `EvolutionEntry` ISAK |
| Texto de "Perímetros" | No | Párrafo interpretativo de la sección 4 |
| Texto de "Distribución adiposo-muscular" | No | Párrafo de la sección 5 |
| Comentario por indicador de salud (IAM, IMO, ICC) | No | Una línea por indicador en la sección 6 (D3: 3 textos o uno solo) |
| Texto de "Somatotipo" | No | Párrafo de la sección 8 |
| Conclusiones | **Sí, para generar** | Sección 9 |
| PDF generado (bytes, nombre de archivo, fecha de generación) | No | Descarga y envío por WhatsApp, igual que `NutritionPlan.pdfData` |
| Referencia al estudio anterior usado | No (se calcula) | El anterior se resuelve siempre con `getPreviousIsakStudy`; no se guarda salvo que el architect lo necesite para detectar el "PDF desactualizado" |
| `Professional`: título (texto corto, p. ej. "Lic.") | No | Pie del informe (D1) |
| `Professional`: matrícula (texto corto, p. ej. "M.P. 852") | No | Pie del informe (D1) |
| `OutboundMessage`: tipo nuevo para el informe y referencia al informe | Solo en el envío | Cola de WhatsApp (D6) |

No se guardan los números calculados: el PDF se arma siempre con `buildIsakStudy` al generar
(misma regla que D18 de la HU-006). Los textos fijos (definiciones de pliegues, composición y
somatotipo) viven en el código, no en la base.

---

## Diseño UX

Sistema de diseño actual del panel (`Card`, `Badge`, `Alert`, `Button`, `useConfirm`, `notify`,
`FormError`), sin colores nuevos en el panel, números con `formatDecimalEs`/`formatFixedEs`.

### Puntos de entrada

- **Página del estudio ISAK** (`.../consultas/[consultationId]/antropometria`): en el
  `PageHeader`, acción nueva **"Informe PDF"** (icono de documento), al lado de "Editar" y
  "Borrar estudio".
- **Tarjeta "Antropometría ISAK"** de la consulta: acción secundaria "Informe PDF" junto a "Ver
  estudio completo". Si ya hay PDF generado, debajo: "Informe generado el 08/05/2026 18:40".

### Página del informe (`.../consultas/[consultationId]/antropometria/informe`)

- `PageHeader`: "Informe antropométrico", subtítulo "Consulta del 08/05/2026 · comparado con el
  estudio del 05/11/2025" (o "primer estudio, sin comparación"), enlace para volver al estudio.
- **Avisos arriba** (`Alert`), según corresponda:
  - `info`: "Revisá y editá los textos antes de generar el PDF." (siempre).
  - `warning`: faltantes del estudio, matrícula no cargada, PDF desactualizado (textos de los
    escenarios).
  - `info`: menor de 18.
- **Cuerpo:** una `Card` por sección, en el orden del PDF. Cada una muestra en solo lectura los
  números que van a salir (la misma tabla compacta "Anterior / Actual / Dif."). Las secciones con
  texto tienen:
  - un `Textarea` con el texto guardado o el borrador automático;
  - un enlace chico "Volver al borrador" (con `useConfirm`);
  - una marca gris "Borrador automático" mientras no se editó, o "Editado" si se editó.
  No hay vista previa de los gráficos en la página: se ven en el PDF (ver Fuera de alcance).
- **Barra de acciones fija abajo** (o al final):
  - "Guardar textos" (secundario): `notify` "Textos del informe guardados".
  - "Generar PDF" (dice "Generando…"): guarda los textos, genera y `notify` "Informe generado".
  - "Descargar" (si hay PDF): abre el PDF en otra pestaña.
  - "Enviar por WhatsApp": `useConfirm` "¿Enviar el informe a <teléfono>?"; al encolar,
    `notify.info` "Encolado para enviar por WhatsApp a <teléfono>.".
  - Debajo, en gris: "Último PDF: <fecha y hora>" o "Todavía no generaste el PDF.".
  - Si sale de la página con textos sin guardar: `useConfirm` "¿Descartar los cambios de los
    textos?".
  - Errores de servidor: `FormError` "No se pudo generar el informe. Probá de nuevo." / "No se
    pudo encolar el envío. Probá de nuevo.".

### El PDF

- **Estilo (D2):** el mismo lenguaje que el PDF del plan: fondo blanco, Inter, texto
  `pdfColors.text`, logo y línea de acento de `/ajustes`. Títulos de sección con la marca de
  acento que ya usa el plan (`mealMark`). Tamaño A4, vertical.
- **Encabezado** solo en la primera página (logo + "Informe antropométrico" + nombre de la
  profesional), como el plan.
- **Pie fijo** en todas: identidad de la profesional (D1) a la izquierda, "Página n de N" a la
  derecha.
- **Paginación:** cada sección es un bloque que no se corta (`wrap={false}`); no se fuerzan 6
  páginas.
- **Colores de gráficos:** "Actual" = acento; "Anterior" = gris (`pdfColors.muted` con
  transparencia o un gris claro). Los 4 tejidos de composición usan una paleta fija y sobria de 4
  tonos distinguibles también impresos en blanco y negro (el architect la define en
  `pdf-theme.ts`).
- **Gráficos (SVG de `@react-pdf/renderer`: `Svg`, `Rect`, `Line`, `Path`, `Circle`, `Text`):**
  - *Barras de perímetros:* barras horizontales agrupadas, eje con marcas cada 10 cm desde 0, valor
    al final de cada barra. Viable: solo `Rect` y `Text`.
  - *Distribución por zonas (D5):* silueta esquemática frontal dibujada con primitivas (círculo
    para la cabeza, rectángulos redondeados para tronco y miembros), con tres franjas
    sombreadas para superior, central e inferior y rótulos con los % a los costados. Sin imágenes
    de terceros.
  - *Composición (D4):* dos barras apiladas horizontales al 100 % (Anterior / Actual) con los 4
    tejidos y sus % dentro o al lado, y leyenda. Alternativa, si ella prefiere: dos tortas con
    `Path` y arcos (también viable).
  - *Somatocarta:* contorno de Heath-Carter (triángulo de Reuleaux: tres arcos con `Path`), los 3
    ejes desde el origen, grilla liviana, rótulos de los vértices, y los puntos con leyenda. La
    geometría (vértices, arcos, escala) sale de `packages/core` (`SOMATOCHART_DOMAIN`,
    `SOMATOCHART_VERTICES`, `somatochartPoint`), para que panel y PDF coincidan.
- **Textos fijos** (del informe real, genéricos, sin datos de nadie):
  - Pliegues: "Los siguientes pliegues son indicadores de grasa corporal subcutánea (externa)."
  - Perímetros: "Los siguientes perímetros son indicadores de masa muscular." / "Los siguientes
    perímetros son indicadores de grasa visceral (abdominal)." / Corregidos: "Los perímetros
    corregidos descuentan el pliegue y estiman la masa muscular: cuando aumentan, aumenta la masa
    muscular."
  - Composición: "La composición corporal es la forma en que se distribuye el peso total del
    cuerpo en sus distintos componentes. Permite conocer qué parte del peso corresponde a tejido
    adiposo, muscular, óseo y residual."
  - Somatotipo: "El somatotipo clasifica el cuerpo de una persona según sus características
    físicas predominantes: la forma, la distribución de la masa muscular y de la grasa, y la
    contextura general."
- **Nombre de archivo:** `informe-antropometrico-<yyyy-mm-dd de la consulta>.pdf` (sin el nombre
  del paciente).

### Bot (WhatsApp)

- No cambia el flujo conversacional ni ningún menú.
- El envío usa la cola `OutboundMessage` como el plan: el consumidor manda el documento con el
  nombre de archivo de arriba.
- Texto propuesto para el `body` (queda registrado como en el plan; ver D7 para si se manda como
  pie del documento):

  > 📄 Te comparto tu informe antropométrico del 08/05/2026. Cualquier duda lo charlamos en la
  > próxima consulta.

### Portal

No cambia en esta HU (D11).

---

## Fuera de alcance

- **Pediatría (HU-008):** en menores el informe muestra exactamente lo que muestra la HU-006
  (sin composición, sin IAM/IMO, IMC sin clasificar). Percentiles OMS y referencias pediátricas
  van en la HU-008.
- **ArgoRef (Holway, 2005)** y cualquier otro método: el informe usa los de la HU-006.
- **Z del Phantom, proporcionalidad (córmico, Manouvrier, envergadura), Σ8, cintura/talla,
  conicidad e índice de distribución grasa** en el PDF: el informe real no los tiene y están en
  la página del estudio. Se puede sumar un anexo técnico en otra HU.
- **Firma escaneada** de la profesional y el resto de la épica 47 (matrícula en el plan y en el
  portal).
- **Plantilla visual propia del informe** (verde, tipo Canva) y editor de plantillas (épica 15).
- **Vista previa de los gráficos en la pantalla del informe** (se ven en el PDF generado).
- **Redacción con IA**, si se acepta la recomendación de D3.
- **Informe desde bioimpedancia (InBody)** o desde mediciones sueltas sin estudio ISAK.
- **Comparar contra un estudio elegido a mano** (no el inmediato anterior) o contra más de uno.
- **Historial de versiones** del informe: se guarda solo el último PDF.
- **Mostrar o descargar el informe desde el portal** (D11).
- **Mandar el `caption` junto al documento** en WhatsApp, para el plan y el informe (D7).

---

## Notas de implementación

Mínimas; el detalle es del `architect`.

- **Lógica pura en `packages/core`** (con tests, usando los casos A y B):
  - armado del "modelo del informe" a partir de dos `IsakStudyResult` (actual y anterior o null):
    filas de cada sección, diferencias y su texto ("6,6 kg menos", "Bajó de 0,59 a 0,57
    (−0,02)");
  - borradores automáticos de los textos (D3), deterministas;
  - geometría de los gráficos: escala de barras, arcos del contorno de la somatocarta, posiciones.
  El componente de React-PDF solo dibuja.
- **Reusar** `buildIsakStudy`, `isakDifference`, `getPreviousIsakStudy`, `toIsakMeasures`,
  `ISAK_METHOD_LABELS`, las etiquetas de la HU-004 y `formatFixedEs`. No recalcular nada.
- **PDF:** nuevo `apps/web/src/lib/anthropometric-report-pdf.tsx`, compartiendo con
  `plan-pdf.tsx` la tipografía, el encabezado, el pie y el tema (extraer lo común a un módulo, sin
  cambiar cómo se ve el plan).
- **Migración solo aditiva:** tabla del informe, 2 columnas nullable en `Professional`, un valor
  nuevo en `MessageKind` y una FK nullable en `OutboundMessage`. Ojo con `@@unique([appointmentId,
  kind])` de `OutboundMessage`: el informe no tiene `appointmentId` (NULL no choca).
- **Bot:** una rama más en `tick()` de `workers.ts` para el tipo nuevo, sin tocar el flujo
  conversacional. Cambia `schema.prisma` → `typecheck` en `apps/web` y `apps/bot`.
- **Pruebas:** WhatsApp nunca real (patrón `test-confirm-attendance.ts`); cualquier dato de prueba
  se borra por id. Verificar el PDF renderizándolo en el scratchpad (como se hizo con el plan) y
  mirando las páginas.

---

## Dudas para validar con el usuario

Cada duda trae la recomendación del afinador, para que el orquestador la resuelva en modo
autónomo.

**D1. Título y matrícula: ¿se suman a `Professional` en esta HU o el pie lleva solo el nombre?**
El informe real tiene "LIC. DAIANA PONCE M.P 852" en cada página; la épica 47 no está hecha.
**Recomendación:** sumarlos **en esta HU**, acotado:
- dos campos opcionales en `Professional` (`title`, p. ej. "Lic."; `licenseNumber`, p. ej. "M.P.
  852"), editables en `/ajustes` junto al nombre;
- se usan solo en el pie del informe: "Lic. Daiana Ponce · M.P. 852"; si están vacíos, solo el
  nombre y el aviso en la página del informe;
- la firma escaneada y el uso en el plan y el portal quedan para la épica 47.
Motivo: es un informe clínico que se entrega al paciente, y la matrícula es lo que lo respalda; el
costo es chico (2 columnas nullable y 2 inputs). Escribir el pie en mayúsculas como en Canva no
hace falta.

**D2. Estilo: ¿el sobrio del sistema con el acento de `/ajustes`, o una plantilla propia tipo Canva
(verde, con formas decorativas)?**
**Recomendación:** el **estilo del PDF del plan** (neutro, Inter, logo y acento de `/ajustes`),
compartiendo encabezado, pie y tema. Si ella elige un acento verde en `/ajustes`, el informe (y
el plan) salen verdes sin trabajo extra. Las formas decorativas de Canva y los íconos no se
replican. Una plantilla propia es la épica 15.

**D3. Textos interpretativos: ¿texto libre, plantillas automáticas o borrador de IA?**
Opciones:
(a) texto libre que ella escribe desde cero;
(b) **plantillas automáticas** en `packages/core` que arman un borrador según los resultados
("Se observa una disminución de la sumatoria de 6 pliegues de 80,5 a 71,0 mm…",
"El somatotipo se mantiene en la categoría endo-mesomorfo…"), editable;
(c) borrador con IA (DeepSeek, como el asistente y la propuesta de plan), editable.
**Recomendación:** **(b) + edición obligatoria de las conclusiones**:
- Todas las secciones con texto arrancan con el borrador de plantilla; ella lo edita o lo deja.
- Las conclusiones arrancan con un borrador corto de plantilla (resumen de las variaciones
  principales) y **no se puede generar el PDF con conclusiones vacías**.
- Nada se manda sin pasar por la pantalla del informe.
Motivos: las plantillas son deterministas, se testean, **nunca inventan números** (el riesgo
real de la IA en un informe clínico), no dependen de la API key y no mandan datos de salud a un
proveedor externo. La IA (c) queda como mejora posterior, que puede reusar el mismo modelo del
informe como entrada.
Sub-duda: los comentarios de indicadores de salud, ¿3 textos (uno por indicador, como en Canva) o
un párrafo? **Recomendación:** 3 textos cortos, como en Canva, más la línea de variación
automática fija ("Bajó de 0,59 a 0,57 (−0,02)"), que no se edita.
Sub-duda: umbral de "estable". Para decir "se mantiene" o "aumentó/disminuyó" las plantillas
necesitan un umbral por medida. **Recomendación:** umbrales simples y documentados como
constantes (p. ej. peso ±0,5 kg, perímetros ±0,5 cm, Σ6 ±2 mm, índices ±0,02, somatotipo ±0,5),
ajustables sin tocar lógica; el architect los fija. Si ella tiene criterios propios, se cambian.

**D4. Gráfico de composición corporal: ¿dos tortas, como en Canva, o barras?**
La preferencia indicada es por gráficos de barras. Las dos cosas son viables en React-PDF (tortas
con `Path` y arcos).
**Recomendación:** **dos barras apiladas horizontales al 100 %** (Anterior y Actual, una arriba
de la otra), con los % de cada tejido y leyenda: se comparan mejor que dos tortas, siguen la
preferencia por barras y coinciden con la barra apilada que ya tiene la página del estudio
(HU-006). Si ella quiere mantener las tortas, se cambia el componente sin tocar datos.

**D5. Figura del cuerpo con los % por zona.** Canva usa una ilustración anatómica. Una imagen de
terceros tiene problemas de licencia, y dibujar una anatómica con SVG no es razonable.
**Recomendación:** **silueta esquemática propia** con primitivas SVG (cabeza, tronco, brazos,
piernas), con franjas para superior/central/inferior del tejido adiposo y rótulos de brazo/muslo/
pierna para el muscular, con los % a los costados. Si queda pobre, alternativa: dos listas/barras
cortas (adiposa y muscular), sin figura.

**D6. Envío por WhatsApp.**
**Recomendación:** **sí**, igual que el plan, con el mínimo cambio en el bot:
- un valor nuevo de `MessageKind` para el informe y una referencia al informe en
  `OutboundMessage`;
- una rama en el consumidor de la cola que lee los bytes del PDF del informe y llama a
  `sendDocument`;
- sin cambios en el flujo conversacional, menús ni textos del bot.
La alternativa sin tocar el bot (solo descarga, y ella lo manda a mano) se descarta porque el
objetivo de la épica es no tener que armarlo ni pasarlo a mano.

**D7. El `caption` del documento no llega.** Hoy `sendDocument` ignora el texto que se guarda en
`body` (en el plan tampoco se manda).
**Recomendación:** dejarlo **igual que el plan** en esta HU (se manda solo el documento; el texto
queda en `body`) y resolver el `caption` para plan e informe juntos en un cambio directo aparte,
porque cambia lo que recibe el paciente con el plan también.

**D8. Rótulo de las columnas: "Segunda / Tercera medición" o "Anterior / Actual".**
El número de medición depende de contar los estudios del paciente, incluidos los hechos en
ISAKMetry antes del sistema, que el sistema no conoce.
**Recomendación:** "Medición anterior (05/11/2025)" y "Medición actual (08/05/2026)".

**D9. Etiquetas de categorías distintas a las de Canva.** Canva dice "Normopeso" (el sistema,
"Normal"), "saludable" para el ICC (el sistema, "Sin riesgo aumentado") y "muy alto" para el
índice adiposo muscular (el sistema no lo clasifica, D8 de la HU-006).
**Recomendación:** usar las **etiquetas del sistema** (HU-004/HU-006), una sola fuente; el IAM
sale sin categoría. Si ella quiere otras palabras, se cambian en `packages/core` y valen para el
panel y el PDF.

**D10. Menores de 18.** **Recomendación:** mostrar lo mismo que la HU-006 (sin composición, IAM
ni IMO; IMC sin clasificar), con la nota "Las fórmulas de composición corporal son para adultos."
en el PDF. La HU-008 define qué se agrega.

**D11. ¿El paciente ve el informe en el portal?** El plan se puede descargar desde el portal.
**Recomendación:** **no en esta HU**. La HU-006 dejó los resultados ISAK fuera del portal; el
informe se entrega por WhatsApp o descargado. Publicarlo en el portal es una HU chica posterior.

**D12. ¿Qué estudio es "el anterior"?** **Recomendación:** el mismo que usa la página del estudio
(`getPreviousIsakStudy`: el último estudio ISAK del paciente en una consulta con fecha anterior),
para que el panel y el PDF comparen siempre lo mismo. No se elige a mano.

**D13. ¿El informe se regenera solo si cambia el estudio?** **Recomendación:** no. Se muestra el
aviso "El estudio cambió después de generar este PDF" y "Enviar por WhatsApp" siempre regenera
antes de encolar (como el plan). Los textos guardados no se pisan con borradores nuevos: si el
cambio del estudio los deja desactualizados, ella usa "Volver al borrador" en la sección.

---

## Resoluciones (validadas por el orquestador en modo autónomo, autorizado por el usuario, 2026-09-24)

Se aceptan **todas las recomendaciones** del afinador (D1–D13) tal como están escritas arriba:
- título y matrícula en `Professional`, acotado (D1);
- estilo del PDF del plan (D2);
- plantillas automáticas y conclusiones editables obligatorias (D3);
- barras apiladas al 100 % en lugar de tortas (D4);
- silueta SVG propia (D5);
- envío por WhatsApp igual que el plan (D6), **sin enviar nada en las pruebas**;
- el caption, igual que hoy (D7);
- "Medición anterior/actual" con fechas (D8);
- etiquetas del sistema (D9);
- menores, como la HU-006 (D10);
- sin portal por ahora (D11).
