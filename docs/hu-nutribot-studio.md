# HU-032 — NutriBot Studio: editor visual de documentos clínico-nutricionales

**Como** nutricionista de un consultorio,
**quiero** diseñar, personalizar y reutilizar los documentos que entrego (empezando por el plan
alimentario) con un editor visual dentro del sistema,
**para que** mis pacientes reciban PDF con mi identidad visual sin tener que rearmarlos en Canva ni
volver a cargar sus datos.

Origen: issue #90 (`HU-032 · NutriBot Studio…`), borrador en `progress/hu_borrador_HU-032.md`.
Antecedente directo: Épica 15 "Plantilla propia de informes" (`docs/historias-usuario-nutridesk.md`)
y la HU-020 (#48), que confirmó que la nutricionista arma hoy sus planes en Canva. Rama
`feat/HU-032-nutribot-studio`. Responsable: senkuch4n. Lleva label `migración`.

> **Estado:** afinada, **pendiente de validación**. Es una **HU paraguas**: la sección 2 propone
> la división en HU hijas y solo la primera (**032a, el MVP**) está afinada en Gherkin. Las demás
> quedan como esbozo con alcance y dependencias. Las decisiones de fondo están en D1–D20, cada
> una con una recomendación. Los criterios de 032a están escritos con esas recomendaciones; si una
> duda se resuelve distinto, se ajustan.

---

## 1. Contexto

### 1.1 Qué existe hoy (arqueología)

**PDF del plan alimentario (renderer "legacy" a efectos de esta HU).**

- `apps/web/src/lib/plan-pdf.tsx`: un único documento `@react-pdf/renderer` (`^4.9.0`, la única
  librería de PDF del repo), A4, armado **en código**: encabezado con logo, título, paciente,
  comidas (por día si la comida es "Cambia cada día", HU-018b), ítems (alimento con gramos o
  medida casera HU-018d, receta HU-018c, texto libre), totales de macros
  (`computeWeeklyTotals` de core), textos del plan (`PlanSection`, HU-020) y "Notas"; pie con
  texto configurable y "n / total". `renderPlanPdf(input)` → `renderToBuffer`.
- Lo común (fuente Inter registrada con 3 pesos en `.woff` locales, encabezado, pie, logo, bloque
  de firma) está en `apps/web/src/lib/pdf-common.tsx`; colores en `pdf-theme.ts`
  (`DEFAULT_PDF_ACCENT`, `pdfColors`). El informe antropométrico (HU-007,
  `anthropometric-report-pdf.tsx` + `report-pdf-charts.tsx`) usa la misma base.
- Generación: server actions de `apps/web/src/app/(panel)/pacientes/[id]/planes/[planId]/actions.ts`
  (`buildAndSavePdf`, `generatePlanPdfAction`, `sendPlanWhatsAppAction`), con
  `requireTenantContext("write")`. El PDF se guarda **en la base** con `savePlanPdf`
  (`packages/db/domain/nutritionPlans.ts`) en `NutritionPlan.pdfData/pdfFileName/pdfGeneratedAt`.
  **Se pisa en cada generación**: no hay historial ni documento emitido inmutable.
- UI: `plan-pdf-actions.tsx` (botones "Generar PDF" y "Enviar por WhatsApp", "Último PDF: …").
- Entrega:
  - **WhatsApp**: `enqueuePlanPdfMessage` encola un `OutboundMessage` `PLAN_PDF`; el bot
    (`apps/bot/src/outbound-payload.ts`) lee **`plan.pdfData` al despachar**, o sea, manda lo que
    haya en el plan en ese momento, no una copia congelada.
  - **Portal**: `apps/web/src/app/(portal)/portal/plan/pdf/route.ts` busca el plan `ACTIVE` más
    reciente **por `patientId` solamente** (sin `tenantId`) y devuelve `pdfData`. El portal también
    muestra el plan estructurado (`portal/plan/plan-view.tsx`, `portal-day-view.tsx`).
- Tests: `plan-pdf.test.tsx`, `pdf-common.test.tsx`, `anthropometric-report-pdf.test.tsx`
  (renderizan a buffer, sin base).

**"Brand Kit" que ya existe (por profesional del consultorio).** `Professional` (con `tenantId`,
HU-025b-1: el logo es "el de la profesional del consultorio"): `logoData/logoMimeType` (PNG/JPG,
máx. 2 MB, magic bytes, `LOGO_IMAGE_MAX_BYTES`), `pdfAccentColor` (hex), `pdfFooterText`
(máx. 300), `title` + matrícula (HU-007/HU-016) y `signatureData/signatureMimeType` (HU-016, máx.
1 MB, dato sensible: nunca en `getProfessional()`). Se editan en `/ajustes`
(`logo-form.tsx`, `pdf-style-form.tsx`, `signature-form.tsx`, `signature-identity-form.tsx`) con
`requireTenantContext("write")`. Validación de imágenes en
`packages/core/src/professional-identity.ts`.

**Plantillas de plan (no son plantillas visuales).** `PlanTemplate → TemplateMeal →
TemplateMealItem` + `PlanTemplateSection` (HU-020), con `status DRAFT/PUBLISHED`,
`origin MANUAL/IMPORT`, `tenantId`. `applyTemplateToPatient` copia contenido a un
`NutritionPlan` `DRAFT`. Pantallas en `apps/web/src/app/(panel)/plantillas/**`, entrada
"Plantillas" en `components/shell/nav-config.ts`. La HU-020 importa PDF de Canva **hacia
contenido** (comidas y textos) con `plans:import` (poppler, por script): **no** guarda el PDF ni
su diseño. Una "plantilla de plan" dice **qué** se come; un "diseño" (lo nuevo) dice **cómo se
ve** el documento. No se mezclan.

**Multi-tenant y permisos (HU-024/HU-025).**

- `apps/web/src/lib/tenant-context.ts`: `requireTenantContext("read" | "write")` (miembro del
  consultorio; "write" rechazará soporte `READ_ONLY` cuando exista), `requireOwnerContext()`
  (solo `OWNER`), `requirePageContext()`. Roles `TenantRole`: `OWNER`, `STAFF`.
  `ENABLED_TENANT_IDS` hoy contiene solo el tenant legacy.
- El dominio recibe `TenantRef` explícito (HU-025b-1/b-2) y hay tests de aislamiento por dominio
  (p. ej. `packages/db/domain/plans-tenant.test.ts`).
- **Lo que no está hecho:** el issue #68 (HU-025) está cerrado, pero las entregas **025c**
  (token/cookie del portal con tenant, descargas del portal, IA del bot con scope) y **025d**
  (acceso de plataforma/soporte) **no se hicieron**: quedaron en el issue **#91 (HU-033)**, abierto
  en `estado: backlog`. La ruta de descarga del PDF del portal de arriba es justamente un caso de
  025c. **El borrador afirma que HU-025 está cerrada sin matices: es cierto para el issue, no para
  el portal.** Cualquier cambio en la entrega por portal de Studio depende de HU-033.

**Design system del panel.** HU-017 (rediseño estilo Apple: Inter, tokens en
`lib/design-tokens.ts`, `components/ui`, `notify` con sonner, Motion) aprobada en 017a–d; **017e
"planes, alimentos y plantillas (+ PDF del plan)" es de imleticio y está `no_afinada`**; 017f
bloqueada por 017e. Hay una página interna `/dev-diseno` con las piezas del sistema.

**Almacenamiento de binarios.** Todo vive en Postgres como `Bytes` (logo, firma, PDF del plan,
PDF del informe, fotos de recetas y del diario). No hay object storage ni SDK de S3 en el repo.

**Despliegue.** Producción en un VPS compartido (`numa.arzium.com.ar`), deploy por SSH desde
`.github/workflows/deploy.yml`; Next en `output: "standalone"`. No hay Chromium/Playwright en el
runtime. La marca visible del producto en la UI es **"Numa"**, no "NutriBot".

**HU relacionadas que nunca se crearon.** La **HU-015** (imleticio: "PDF/Word del plan con la
plantilla de la nutricionista y textos editables") se menciona en las HU-016 y HU-020 pero no tiene
`backlog/` ni issue. Es, en los hechos, el mismo pedido que esta HU (ver D10).

**Dependencias del lote SaaS (issues abiertos):** HU-026 (#69, imleticio, onboarding, migración,
en curso), HU-027 (#70, imleticio, WhatsApp multi-sesión, en curso), HU-028 (#71, lista;
entrega 028c con migración en espera), HU-029 (#72, en curso, migración), HU-030 (#73, licencia),
HU-031 (#74, QA SaaS), HU-033 (#91, resto de 025c/025d).

### 1.2 Qué es lo nuevo

1. Un **diseño de documento** por consultorio, guardado como **contrato JSON versionado y
   validado** (no como PDF), que el editor y el exportador interpretan igual.
2. Un **editor visual** en el panel para armar ese diseño con bloques estáticos y dinámicos, con
   vista previa con datos ficticios.
3. Que **"Generar PDF" del plan use el diseño predeterminado** del consultorio, con el PDF actual
   como respaldo cuando no hay diseño (o si el diseño falla).
4. Más adelante (hijas posteriores): documentos emitidos inmutables con revisiones, edición libre
   tipo lienzo, Brand Kit ampliado y catálogo, otros tipos de documento.

### 1.3 Por qué hace falta

La nutricionista diseña hoy sus planes en Canva y los reutiliza a mano (HU-020). El PDF del
sistema solo deja elegir color de acento, pie, logo y firma: no puede reflejar su identidad visual
y la empuja a seguir rearmando PDF fuera del sistema, con los datos de sus pacientes copiados a
mano. Para el SaaS, cada consultorio necesita entregar documentos con su propia marca.

---

## 2. División propuesta en HU hijas (decisión a validar, D1)

| Hija | Alcance | Migración | Depende de | ¿MVP? |
|---|---|---|---|---|
| **032-0 · PoC y ADR** (tarea del `architect`, no HU de producto) | Comparar editores (Puck / Craft.js / React Konva / dnd propio; GrapesJS y Polotno solo como referencia) y renderers (`@react-pdf/renderer` actual vs HTML/CSS + Chromium) con fixtures sintéticos corto/largo: paginación, texto seleccionable, fuentes, fidelidad preview/export, React 19/Next 15, licencias, bundle, CPU/RAM/latencia en el VPS. Entrega matriz, PDFs de muestra y ADR. Código en rama descartable, sin dependencias nuevas en `develop`. | No | — | Habilita 032a |
| **032a · Diseño del plan alimentario (MVP)** | Diseños por consultorio para **un tipo de documento: plan alimentario**. Contrato JSON v1 + validación en core; galería (crear en blanco o desde el diseño base del sistema, duplicar, renombrar, archivar, marcar predeterminado); editor de **bloques en flujo** reordenables con cabecera y pie; propiedades de bloque; imágenes propias (PNG/JPG); undo/redo; guardado manual con detección de conflictos; vista previa con datos ficticios; "Generar PDF" del plan con el diseño predeterminado y respaldo legacy. Reusa logo, color, pie, matrícula y firma de `/ajustes`. Entrega por WhatsApp y portal **sin cambios** (siguen usando `plan.pdfData`). | **Sí** (diseños + imágenes) | 032-0; turno de migración | **Sí** |
| **032b · Documentos emitidos y revisiones** | Instancia por paciente/plan con overrides sin tocar el diseño; snapshot autorizado + versión de diseño/assets/renderer + bytes inmutables; historial; "corregir" crea revisión; WhatsApp envía el emitido (no `plan.pdfData` vivo); auditoría por ids y actor; retención. | **Sí** | 032a; **HU-033** (025c) para descarga por portal por tenant; **HU-027** para envío multi-sesión | No |
| **032c · Lienzo libre / layout híbrido** | Elementos de posición libre en regiones controladas (arrastrar, redimensionar, alinear, capas), figuras, fondo, páginas de diseño (portada, contraportada) distintas de las generadas, zoom y guías, autoguardado. | Probable no (cambia el contrato, no el esquema) | 032a; resultado del PoC | No |
| **032d · Brand Kit y catálogo** | Brand Kit del consultorio (paleta, tipografías autorizadas, datos de contacto) separado de `Professional`; catálogo global de diseños de solo lectura, clonables. | **Sí** | 032a | No |
| **032e · Más tipos de documento y bloques** | Informe antropométrico (HU-007), recomendaciones sueltas, etc.; bloques de antropometría, micronutrientes, objetivo/prescripción. Retirar el renderer legacy cuando haya paridad. | Según el tipo | 032a (032b recomendable) | No |
| **032f · Evolución** | Rotación, grupos, snap, más tipografías, importar un PDF como fondo (sin reconstrucción), galería premium. | — | Validar prioridad antes de abrir | No |

Reglas de equipo que aplican:

- **Solo una HU con migración en `implementando` a la vez.** Hoy esperan turno HU-026 (Leo) y
  028c; HU-029 también lleva migración. 032-0 no necesita migración y puede avanzar mientras
  tanto. 032a, 032b y 032d sí la necesitan (ver D11).
- 032a es grande: el `architect` puede partirla en dos entregas (como HU-025): **032a-1**
  contrato + modelo + dominio + render (con la migración) y **032a-2** galería + editor.
- Studio **no bloquea el lanzamiento SaaS** (HU-031): sin diseño predeterminado, todo sigue
  como hoy.

---

## 3. Criterios de aceptación — 032a (MVP)

> Escritos con las recomendaciones de las dudas. "Diseño" = plantilla visual de documento. "Plan"
> = `NutritionPlan`. "Legacy" = el PDF actual de `plan-pdf.tsx`.

```gherkin
Feature: Diseños del PDF del plan alimentario por consultorio

  Background:
    Given el consultorio "A" con la miembro "Daiana" (OWNER) y la miembro "Sofía" (STAFF)
    And el consultorio "B" con su propia miembro OWNER
    And "A" tiene logo, color de acento "#477863", pie, matrícula y firma cargados en /ajustes
    And la paciente "Ana" de "A" tiene un plan con 5 comidas, una de ellas "Cambia cada día"

  # ── Galería ────────────────────────────────────────────────────────────────

  Scenario: Galería vacía
    Given "A" no tiene diseños
    When Daiana entra a Plantillas > "Diseños de PDF"
    Then ve el diseño del sistema "Clásico" marcado "Del sistema · solo lectura"
    And ve el mensaje "Todavía no creaste diseños. Empezá desde cero o duplicá Clásico."
    And ve los botones "Nuevo diseño" y "Duplicar Clásico"

  Scenario: Crear un diseño desde el diseño del sistema
    When Daiana elige "Duplicar Clásico"
    Then se crea el diseño "Clásico (copia)" de "A" y se abre el editor
    And el diseño del sistema "Clásico" no cambia y no se puede editar ni archivar

  Scenario: Crear un diseño en blanco
    When Daiana elige "Nuevo diseño" y escribe el nombre "Plan verde"
    Then se abre el editor con una página A4 vertical, cabecera y pie vacíos y sin bloques
    And el panel izquierdo ofrece los bloques disponibles

  Scenario: Nombre inválido
    When Daiana intenta guardar un diseño con nombre vacío o de más de 80 caracteres
    Then ve "El nombre tiene que tener entre 1 y 80 caracteres." y el diseño no se guarda

  Scenario: Duplicar, renombrar y archivar
    Given "A" tiene el diseño "Plan verde"
    When Daiana lo duplica
    Then existe "Plan verde (copia)" con el mismo contenido y sin ser predeterminado
    When lo renombra a "Plan verde v2"
    Then la galería lo muestra con el nombre nuevo
    When archiva "Plan verde v2"
    Then deja de aparecer en la galería y aparece en "Archivados", desde donde se puede restaurar

  # ── Editor ─────────────────────────────────────────────────────────────────

  Scenario: Agregar, configurar y reordenar bloques
    Given Daiana edita "Plan verde"
    When agrega los bloques "Título del plan", "Datos de la paciente", "Comidas del plan" y "Textos del plan"
    And arrastra "Datos de la paciente" arriba de "Título del plan"
    And en "Comidas del plan" desactiva "Mostrar totales de macros"
    Then el lienzo muestra los bloques en ese orden con datos ficticios
    And el panel derecho muestra las propiedades del bloque seleccionado

  Scenario: Reordenar sin mouse
    Given el foco está en un bloque del lienzo
    When Daiana usa "Mover arriba" / "Mover abajo" desde el teclado o el menú del bloque
    Then el bloque cambia de lugar y un lector de pantalla anuncia la nueva posición

  Scenario: Cabecera y pie
    When Daiana pone en la cabecera "Logo del consultorio" y "Nombre de la profesional"
    And en el pie "Texto del pie" y "Número de página"
    Then la vista previa los repite en todas las páginas del documento

  Scenario: Editar un bloque de texto propio
    When Daiana agrega un bloque "Texto" con "¡Vamos con todo!" en tamaño 14, negrita y color de acento
    Then la vista previa lo muestra así
    And el texto se guarda en el diseño y no modifica ningún plan

  Scenario: Imagen propia
    When Daiana sube una imagen PNG de 800 KB en un bloque "Imagen"
    Then la imagen queda guardada como recurso de "A" y se ve en el lienzo
    When intenta subir un archivo SVG, un PDF renombrado a .png o una imagen de más de 2 MB
    Then ve "La imagen tiene que ser PNG o JPG de hasta 2 MB." y no se guarda nada

  Scenario: Deshacer y rehacer
    Given Daiana hizo tres cambios sin guardar
    When pulsa "Deshacer" dos veces y "Rehacer" una vez
    Then el lienzo queda con el primer y el segundo cambio aplicados
    And Cmd/Ctrl+Z y Cmd/Ctrl+Shift+Z hacen lo mismo

  Scenario: Guardar y reabrir conserva todo
    When Daiana guarda "Plan verde" y recarga la página
    Then ve exactamente los mismos bloques, orden, estilos, configuración e imágenes

  Scenario: Cambios sin guardar
    Given Daiana tiene cambios sin guardar
    When intenta salir del editor o cerrar la pestaña
    Then el sistema le pregunta "Tenés cambios sin guardar. ¿Salir igual?" con "Salir sin guardar" y "Seguir editando"

  Scenario: Conflicto entre dos sesiones
    Given Daiana y Sofía abrieron "Plan verde" en la misma versión
    And Sofía guardó un cambio
    When Daiana intenta guardar
    Then no se pisa el cambio de Sofía
    And Daiana ve "Este diseño cambió en otra sesión. Podés recargarlo (perdés tus cambios) o guardarlo como copia."
    And "Guardar como copia" crea "Plan verde (copia)" con los cambios de Daiana

  # ── Datos clínicos ─────────────────────────────────────────────────────────

  Scenario: La vista previa del editor nunca usa pacientes reales
    When Daiana abre la vista previa en el editor
    Then ve el documento con la paciente ficticia "Paciente de ejemplo" y un plan ficticio de varios días
    And no se lee ningún dato de pacientes del consultorio

  Scenario: Dato faltante
    Given el bloque "Datos de la profesional" muestra la matrícula
    And la profesional no cargó matrícula
    When se genera el PDF
    Then por defecto la línea de matrícula no aparece
    And si el bloque está configurado "Mostrar 'No disponible'" aparece "No disponible"
    And nunca aparece un cero ni un valor inventado

  Scenario: El diseño no altera los datos del plan
    Given el plan de Ana tiene "Avena 40 g" y "1½ tazas de leche (270 g)"
    When se genera el PDF con "Plan verde"
    Then el PDF muestra esas cantidades, unidades y medidas exactamente como el PDF legacy
    And los totales de macros son los de computeWeeklyTotals, sin recalcular
    And el plan de Ana no cambia

  # ── Uso en el plan ─────────────────────────────────────────────────────────

  Scenario: Marcar un diseño como predeterminado
    When Daiana marca "Plan verde" como "Predeterminado para planes"
    Then "Plan verde" queda como el único predeterminado de "A"
    And el anterior predeterminado, si había, deja de serlo

  Scenario: Generar el PDF del plan con el diseño predeterminado
    Given "Plan verde" es el predeterminado de "A"
    When Daiana pulsa "Generar PDF" en el plan de Ana
    Then el PDF usa "Plan verde" con los datos de Ana
    And debajo de los botones se ve "Último PDF: <fecha> · Diseño: Plan verde"

  Scenario: Sin diseño predeterminado se usa el PDF de siempre
    Given "A" no tiene diseño predeterminado
    When Daiana genera el PDF del plan de Ana
    Then el PDF es el mismo que genera hoy el sistema (legacy)

  Scenario: Si el diseño falla, no se pierde el PDF anterior
    Given el diseño predeterminado no puede renderizarse (por ejemplo, una imagen corrupta)
    When Daiana genera el PDF
    Then ve "No pudimos generar el PDF con el diseño Plan verde. Revisá el diseño o generalo con el diseño Clásico."
    And el PDF anterior del plan sigue intacto
    And el botón "Generar con Clásico" genera el PDF legacy

  Scenario: Cambiar el diseño no toca PDF ya generados
    Given el plan de Ana tiene un PDF generado con "Plan verde"
    When Daiana cambia o archiva "Plan verde"
    Then el PDF guardado del plan de Ana no cambia hasta que se vuelva a generar

  Scenario: Archivar el predeterminado
    Given "Plan verde" es el predeterminado
    When Daiana lo archiva
    Then ve "Este es tu diseño predeterminado. Si lo archivás, los PDF nuevos salen con el diseño Clásico." y confirma
    And los PDF nuevos se generan con legacy

  Scenario: Plan largo
    Given un plan ficticio de 7 días con 6 comidas, textos de 20.000 caracteres, tildes, eñes, recetas e ítems sin gramos
    When se genera el PDF con un diseño que tiene logo, cabecera, pie e imagen
    Then el PDF es A4, tiene todas las comidas e ítems y todo el texto
    And ningún bloque se superpone ni queda recortado
    And las tablas que cruzan de página repiten su encabezado y no parten una fila
    And el texto del PDF se puede seleccionar y copiar

  Scenario: WhatsApp y portal siguen igual
    Given el plan de Ana tiene un PDF generado con "Plan verde"
    When Daiana pulsa "Enviar por WhatsApp" o Ana lo descarga desde el portal
    Then se entrega ese PDF por los mismos caminos que hoy

  # ── Aislamiento y seguridad ────────────────────────────────────────────────

  Scenario: Un consultorio no ve los diseños ni las imágenes de otro
    Given "A" tiene el diseño "Plan verde" con una imagen
    When una miembro de "B" pide listar, abrir, duplicar, previsualizar, guardar, archivar o marcar predeterminado "Plan verde" por su id, o pide la imagen de "A" por su id
    Then recibe la misma respuesta que para un id inexistente
    And no se revela que el recurso existe

  Scenario: Ids combinados de otro consultorio
    When una miembro de "B" guarda un diseño propio que referencia la imagen de "A"
    Then la operación se rechaza y no se escribe nada
    When se intenta generar el PDF de un plan de "A" con un diseño de "B"
    Then la operación se rechaza y no se escribe nada

  Scenario: El cliente no elige el consultorio
    When una petición de guardado manda un tenantId distinto en el cuerpo
    Then se ignora y el consultorio sale de la sesión del servidor

  Scenario: Contenido del diseño inválido
    When llega a guardar un diseño con un tipo de bloque desconocido, una propiedad no permitida, una URL externa, un schemaVersion no soportado o un JSON de más del límite
    Then se rechaza con "El diseño tiene contenido no válido." sin ejecutar nada ni hacer pedidos de red

  Scenario: Diseños guardados con una versión anterior del contrato
    Given un diseño guardado con schemaVersion 1
    When el sistema ya usa schemaVersion 2
    Then el diseño se abre y se renderiza migrado, sin perder bloques

  Scenario: Permisos
    Given Sofía es STAFF
    When Sofía entra a "Diseños de PDF"
    Then puede crear, editar, duplicar, archivar diseños y marcar el predeterminado
    When alguien sin sesión del panel llama a cualquier operación de diseños
    Then se rechaza
```

---

## 4. Datos que se registran (032a)

Nombres ilustrativos: el modelo exacto lo define el `architect`.

| Dato | Obligatorio | Uso |
|---|---|---|
| **Diseño** (`DocumentTemplate`): id, `tenantId` | Sí | Pertenencia; toda consulta filtra por tenant (constraint compuesto `id + tenantId`, como el resto del dominio) |
| Tipo de documento (`PLAN` en el MVP) | Sí | Deja lugar para 032e sin migrar de nuevo |
| Nombre (1–80) | Sí | Galería |
| Estado (`ACTIVE` / `ARCHIVED`) | Sí | Archivo y restauración |
| Predeterminado | Sí (default false) | Un solo predeterminado por tenant y tipo (índice único parcial) |
| Contenido (JSON) + `schemaVersion` | Sí | Contrato validado con Zod en `packages/core`; con tope de tamaño |
| Revisión (entero) | Sí | Detección de conflictos al guardar (concurrencia optimista) |
| Origen (en blanco / copia de "Clásico" / copia de otro diseño) | No | Trazabilidad; sin datos de pacientes |
| Creado/actualizado por (userId) y fechas | Sí | Auditoría mínima; sin contenido clínico |
| **Imagen del diseño** (`DocumentAsset`): id, `tenantId`, bytes, MIME detectado por magic bytes, tamaño, ancho/alto, hash | Sí | Imágenes propias. Mismas reglas que el logo (PNG/JPG, máx. 2 MB). Ver D4 sobre dónde viven los bytes |
| En el plan: diseño usado en el último PDF (id + revisión, o null = legacy) | Recomendado | Mostrar "Diseño: …" y avisar si el diseño cambió desde el último PDF. Ver D7 |
| Diseño del sistema "Clásico" | — | **No se guarda en la base**: vive en código como un diseño JSON más (D5) |

**No se registra:** datos de pacientes dentro del diseño (los bloques dinámicos son referencias,
no copias), snapshots ni PDF emitidos inmutables (032b), Brand Kit propio (032d: se leen los
campos actuales de `Professional`).

---

## 5. Diseño UX (032a)

### 5.1 Dónde vive

- **Galería:** en la sección **Plantillas**, con dos pestañas: "Planes" (lo de hoy) y "Diseños de
  PDF" (nuevo). Ruta propuesta `/plantillas/disenos`. Cada tarjeta: miniatura (primera página con
  datos ficticios), nombre, chip "Predeterminado", menú (Abrir, Duplicar, Renombrar, Marcar como
  predeterminado, Archivar). "Clásico" aparece primero con el chip "Del sistema". Ver D13 sobre
  el nombre.
- **Editor:** `/plantillas/disenos/[id]`, pantalla completa dentro del panel, usando
  `components/ui` y los tokens de HU-017 (no copiar Canva ni rediseñar el panel):
  - **Barra superior:** volver, nombre editable, estado ("Guardado" / "Cambios sin guardar" /
    "Guardando…"), Deshacer, Rehacer, zoom (50–200 %, "Ajustar"), "Vista previa", "Guardar".
  - **Panel izquierdo:** bloques agrupados en "Del plan" (dinámicos), "Contenido" (estáticos) e
    "Imágenes" (las subidas del consultorio).
  - **Centro:** hoja A4 vertical con márgenes visibles, zona de cabecera, cuerpo y pie. Los
    bloques se agregan arrastrando o con clic, se reordenan arrastrando o con teclado.
  - **Panel derecho:** propiedades del bloque seleccionado; sin selección, propiedades del
    documento (márgenes, color de acento, tipografía de la lista cerrada).
- **En el plan de la paciente:** junto a "Generar PDF", el texto "Diseño: Plan verde · Cambiar"
  (lleva a la galería). Si el último PDF se generó con otra revisión del diseño: "El diseño cambió
  desde el último PDF" con acción "Volver a generar".
- **Pantallas angostas (< 1024 px):** la galería funciona; el editor muestra "Para editar diseños
  usá una pantalla más grande" y deja ver la vista previa (D14).

### 5.2 Bloques del MVP

| Grupo | Bloque | Propiedades principales |
|---|---|---|
| Cabecera/pie | Logo del consultorio, Nombre de la profesional (con título y matrícula), Texto del pie, Número de página | Alineación, tamaño, mostrar/ocultar |
| Del plan | Título del plan | Tamaño, color, alineación |
| Del plan | Datos de la paciente (nombre) | Etiqueta, qué mostrar si falta |
| Del plan | Fecha de emisión | Formato corto/largo |
| Del plan | Comidas del plan | Mostrar notas, mostrar cantidades, mostrar totales de macros, estilo de título de comida, separación por día |
| Del plan | Textos del plan (`PlanSection`) | Todos o elegidos por título, estilo de títulos |
| Del plan | Notas del plan | Título, mostrar si hay |
| Del plan | Firma | Usa la firma de `/ajustes`; si no hay, se oculta |
| Contenido | Texto | Contenido, tamaño, peso, color, alineación, fondo, borde, espaciado |
| Contenido | Imagen | Recurso, ancho (% de la hoja), alineación |
| Contenido | Separador, Espacio | Grosor/color, alto |

Fuera del MVP (D15): edad, peso, antropometría, objetivo/prescripción, micronutrientes.

### 5.3 Estados y feedback

- **Carga:** esqueleto del lienzo y de los paneles (patrón `loading.tsx` del panel).
- **Error al abrir** (id inexistente o de otro consultorio): `notFound()`, mismo resultado en ambos.
- **Guardado:** `notify.saved("Diseño guardado")`; error: "No pudimos guardar el diseño. Probá de
  nuevo." sin perder lo editado en pantalla.
- **Conflicto, cambios sin guardar, imagen inválida, contenido inválido, fallo de render:** textos
  de los escenarios de la sección 3.
- **Vista previa:** muestra el PDF real del renderer con datos ficticios (no una imitación HTML),
  para que lo que ve sea lo que sale; mientras se genera, "Generando vista previa…".
- **Accesibilidad:** todo bloque se puede seleccionar, mover y borrar con teclado; los botones
  de ícono tienen nombre accesible; los cambios de orden se anuncian con `aria-live`.

### 5.4 Bot de WhatsApp

Sin cambios en 032a: el mensaje `PLAN_PDF` y su texto ("📄 Te comparto tu plan alimentario
actualizado.") siguen igual; el bot manda lo que haya en `plan.pdfData`.

### 5.5 Portal

Sin cambios en 032a: "Descargar PDF" del portal devuelve el mismo `pdfData`. El scope por tenant
de esa ruta es trabajo de HU-033 (025c), no de esta HU.

---

## 6. Esbozo de las demás hijas

**032b · Documentos emitidos y revisiones.** Al generar, se crea un documento emitido con
snapshot de los datos autorizados, versión del diseño, de los assets y del renderer, y los bytes
del PDF inmutables. "Personalizar para esta paciente" edita una copia del diseño ligada al
documento, sin tocar el diseño. Editar un emitido crea una revisión; el historial queda en la ficha.
WhatsApp manda el emitido elegido (no el `pdfData` vivo). Portal: lista de documentos de la
paciente, con descarga autorizada por tenant (requiere HU-033). Auditoría de emisión y entrega por
ids y actor. Política de retención y borrado a definir (D18). Migración: sí.

**032c · Lienzo libre / híbrido.** Elementos libres (texto, imagen, figuras) en regiones de
página, con posición y tamaño en mm, capas, alineación, guías; páginas de diseño fijas (portada)
distintas de las páginas generadas por el flujo; autoguardado. Depende de lo que diga el PoC sobre
la fidelidad editor/PDF. Migración: probablemente no (nueva `schemaVersion`).

**032d · Brand Kit y catálogo.** Brand Kit del consultorio: logo(s), paleta, tipografías de una
lista autorizada, contacto, firma visual (no certificada). Hoy esos datos están en `Professional`;
hay que decidir si migrar o referenciar. Catálogo global de diseños públicos con datos ficticios,
de solo lectura y clonables. Migración: sí.

**032e · Más tipos de documento.** Informe antropométrico (HU-007), hoja de recomendaciones,
etc. Bloques de antropometría, micronutrientes y prescripción leyendo los servicios existentes,
sin recalcular. Retiro del renderer legacy cuando haya paridad. Migración: según el tipo.

**032f · Evolución.** Rotación, grupos, snap, más tipografías, importar un PDF como fondo sin
reconstruirlo (preservando la extracción de HU-020), galería premium (requiere decisión comercial).

---

## 7. Fuera de alcance

**De toda la HU-032:** editar PDF externos como documentos nativos, colaboración en tiempo real,
marketplace o diseños de pago, IA de diseño, firma digital con validez legal, fuentes subidas por
el usuario, reemplazar el módulo de planes o las plantillas de plan (`PlanTemplate`), cambios en
cobros/suscripción, clonar Canva.

**De 032a (van a hijas posteriores):** documentos emitidos inmutables, historial y revisiones,
personalización por paciente (032b); posición libre, figuras, capas, páginas de diseño, autoguardado
(032c); Brand Kit propio, catálogo global, tipografías múltiples por diseño (032d); informe
antropométrico y otros tipos, bloques de antropometría y micronutrientes (032e); cambios en el bot,
en el portal o en el envío por WhatsApp; orientación horizontal y otros tamaños de hoja; elegir
diseño distinto por plan (D7).

---

## 8. Notas de implementación (mínimas; el detalle es del `architect`)

- **Capas:** contrato, validación (Zod), migración de versiones del contrato y resolución pura de
  bloques → `packages/core` con tests. Persistencia y ownership → `packages/db/domain` con
  `TenantRef` explícito y tests de aislamiento entre dos tenants. Editor, vista previa y export →
  `apps/web`. El bot no se toca en 032a.
- **Guardas:** todas las server actions/rutas con `requireTenantContext` (o `requireOwnerContext`
  si D6 cambia); nunca `tenantId` del cliente. Validar que diseño, imagen y plan sean del mismo
  tenant en la misma transacción.
- **Renderer:** el PoC (032-0) decide. Restricciones propuestas en D3. El renderer interpreta
  solo un allowlist de bloques y propiedades; nada de HTML ni código del usuario, nada de URLs
  externas (las imágenes son ids de recursos del tenant).
- **Legacy:** `renderPlanPdf` queda como respaldo; el diseño "Clásico" puede ser una
  reimplementación con el contrato nuevo, pero el respaldo ante error es el legacy tal cual.
  Test de regresión: sin diseño predeterminado, el buffer legacy no cambia.
- **Fixtures sintéticos** (corto y largo, con tildes, recetas, medidas caseras, faltantes): nunca
  datos de pacientes reales; el PDF de ejemplo de HU-020 es de una paciente real y no se usa.
- **Logs:** sin PII ni contenido clínico; errores de render por ids.
- **Migración:** aditiva (tablas nuevas + columna opcional en `NutritionPlan` si D7), con
  `migrate dev --create-only`, backup previo, sin reset. Respetar el turno de migraciones (D11).
- **Choque de archivos con imleticio:** `plan-pdf.tsx`, `planes/[planId]/**` y `plantillas/**`
  son también zona de HU-017e. Mantener lo nuevo en archivos propios y dejar en los existentes
  "pasar un prop / llamar una función" (mismo criterio que HU-016).
- **Rendimiento:** el render corre en el proceso de Next; medir en el PoC con el plan largo
  (tiempo y memoria) y fijar un timeout y un límite de renders concurrentes para no afectar a
  otros consultorios.

---

## 9. Dudas para validar con el usuario

**D1. División en hijas.** ¿Aceptás la división de la sección 2 (032-0 PoC, 032a MVP, 032b
emitidos, 032c lienzo libre, 032d Brand Kit/catálogo, 032e tipos, 032f evolución), numerada con
sufijos sobre el issue #90?
Recomendación: **sí**, y abrir issues hijos solo cuando se tome cada una (como HU-025). Que 032a
pueda partirse en 032a-1/032a-2 lo decida el architect.

**D2. ¿El MVP es de bloques en flujo o ya híbrido con posición libre?** El borrador pide en el
MVP arrastrar, redimensionar y posición libre.
Recomendación: **solo flujo** (bloques apilados, reordenables, con cabecera y pie) en 032a.
Resuelve "mi marca en el PDF" con paginación confiable; la posición libre es lo que más riesgo
tiene de que vista previa y PDF no coincidan, y depende del PoC. Va en 032c.

**D3. Restricciones de stack para el PoC.** ¿Fijamos estas reglas?: (a) nada de servicios ni
licencias pagas (Polotno queda solo como referencia); (b) nada de Chromium/Playwright en el VPS
salvo que el PoC muestre que `@react-pdf/renderer` no alcanza y que el VPS lo soporta (CPU/RAM
medidos); (c) ningún dato clínico sale a servicios externos para renderizar; (d) dependencias
nuevas solo con licencia MIT/Apache/BSD o similar.
Recomendación: **sí a las cuatro**, con `@react-pdf/renderer` como línea de base a superar.

**D4. ¿Dónde viven las imágenes de los diseños?** Hoy todo binario está en Postgres (`Bytes`).
Recomendación: **Postgres en el MVP**, detrás de una función de dominio (para poder pasar a object
storage después sin tocar el editor), con cuota por consultorio (p. ej. 30 imágenes de hasta 2 MB).
Object storage implicaría un servicio nuevo, credenciales y backups que hoy no existen.

**D5. Diseño del sistema "Clásico": ¿en código o en la base?**
Recomendación: **en código**, uno solo en el MVP, de solo lectura y duplicable, que se parezca
al PDF actual. El catálogo con varios diseños globales va en 032d.

**D6. ¿Quién puede editar diseños y elegir el predeterminado?** Hoy el estilo del PDF en
`/ajustes` lo puede cambiar cualquier miembro con escritura (OWNER y STAFF).
Recomendación: **igual que hoy**: OWNER y STAFF. Alternativa: solo OWNER marca el predeterminado.

**D7. ¿Se elige el diseño en cada plan o siempre el predeterminado?**
Recomendación: **solo el predeterminado** en 032a, guardando en el plan qué diseño/revisión se
usó (para el aviso "el diseño cambió"). Elegir diseño por plan/paciente va con 032b.

**D8. Brand Kit en el MVP.** ¿Alcanza con usar logo, color, pie, matrícula y firma que ya están
en `/ajustes`, leídos en el momento de generar?
Recomendación: **sí**. Consecuencia a aceptar: si cambia el logo en `/ajustes`, el próximo PDF
sale con el logo nuevo (los ya generados no cambian). Brand Kit propio en 032d.

**D9. Tipografías.** El PDF hoy usa solo Inter (3 pesos).
Recomendación: en 032a, **Inter más 2 o 3 tipografías libres (OFL) alojadas en el repo**, una por
documento. ¿La nutricionista tiene alguna que use en Canva y le importe? Si la tiene y su licencia
lo permite, se suma a la lista.

**D10. Relación con HU-015 y HU-017e (imleticio).** La HU-015 ("PDF del plan con la plantilla
de la nutricionista y textos editables") nunca tuvo issue ni `backlog/`, y la Épica 15 es este
mismo pedido. La HU-017e (Leo, `no_afinada`) incluye "+ PDF del plan" y las pantallas de
plantillas.
Recomendación: **HU-032 absorbe HU-015 y la Épica 15**, y **HU-017e saca el PDF del plan de su
alcance** (rediseña las pantallas, no el PDF). Hay que acordarlo con Leo antes de validar.

**D11. Turno de migración.** 032a lleva migración; esperan turno HU-026 (Leo) y 028c, y HU-029
también tiene migración.
Recomendación: hacer **032-0 (PoC/ADR) y la SDD ahora**, sin migración, y poner 032a en la cola
**después de HU-026 y 028c**. ¿Ese orden te sirve, o 032a tiene prioridad sobre alguna?

**D12. Portal y WhatsApp en el MVP.** ¿Aceptás que 032a no toque la entrega (siguen usando
`plan.pdfData`)?
Recomendación: **sí**. La descarga por portal con tenant es HU-033 (025c, issue #91, en backlog:
la ruta actual busca el plan solo por `patientId`), y el envío multi-sesión es HU-027. 032b, que
cambia la entrega, depende de las dos.

**D13. Nombre en la UI.** La marca visible es "Numa", no "NutriBot". ¿"NutriBot Studio" se usa
solo como nombre interno?
Recomendación: **interno**. En el panel, "Diseños de PDF" dentro de Plantillas. Alternativa: una
entrada propia "Documentos" en el menú (tiene más sentido cuando existan 032b/032e).

**D14. Editor en móvil.** Recomendación: **solo pantallas ≥ 1024 px** (escritorio y tablet
horizontal); en móvil, galería y vista previa sí, edición no.

**D15. Bloques dinámicos del MVP.** ¿Alcanza con nombre de la paciente, fecha, título del plan,
comidas, totales de macros, textos del plan, notas, datos de la profesional y firma?
Recomendación: **sí**. Edad, peso, objetivo/prescripción y antropometría van en 032e; el
"objetivo" hoy se escribe como título del plan (así lo dejó HU-020).

**D16. Datos faltantes.** Recomendación: por bloque, "Si no hay dato: ocultar" (default) o
"Mostrar 'No disponible'". Nunca cero ni valores inventados.

**D17. Guardado.** El borrador pide autoguardado en el MVP.
Recomendación: **guardado manual + aviso de cambios sin guardar + detección de conflicto** en
032a; autoguardado en 032c. El autoguardado con conflictos entre sesiones es bastante más trabajo
y no hace falta para entregar valor.

**D18. Retención de documentos emitidos (para 032b).** ¿Cuánto tiempo se guardan los PDF
emitidos y qué pasa al archivar o borrar una paciente? No bloquea 032a.
Recomendación: definirlo al afinar 032b, con la política clínica que use la nutricionista.

**D19. Formatos de imagen.** Recomendación: **solo PNG y JPG** (lo que dibuja `react-pdf` y lo
que ya valida el logo); **SVG rechazado** (superficie de XSS/SSRF), y WebP solo si el PoC lo
justifica convirtiéndolo en el servidor.

**D20. ¿Studio se habilita para todos los consultorios o con un interruptor?**
Recomendación: **sin interruptor**: mientras un consultorio no marque un diseño predeterminado,
sus PDF salen igual que hoy, así que no cambia nada para nadie hasta que lo use.

## 10. Resoluciones (2026-11-27)

Validada por el usuario después de revisar con Leo el diseño en Figma
(https://www.figma.com/design/UEmOvtAeHVs6jaAx1uNTGP, resumen en `progress/diseno_HU-032a.md`):
"leo me dijo que le encanto lo del diseno, asi que vamos con eso".

- **D1–D20:** se aceptan las recomendaciones de la sección 9 (son los supuestos con los que se diseñó).
  D10 (HU-017e saca el PDF del plan de su alcance) queda sujeta a que Leo lo confirme por escrito en el issue.
- **N1–N12** (dudas del diseño): se toma lo que muestra el diseño. N1: el diseño muestra las dos variantes de
  "Totales de macros"; vale la de la HU (interruptor dentro de "Comidas del plan").
- Orden de migraciones acordado: 028c → 029b → 032a.
