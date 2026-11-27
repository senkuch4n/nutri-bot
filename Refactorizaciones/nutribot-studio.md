# SDD · HU-032 · NutriBot Studio (032-0 PoC/ADR + 032a MVP)

HU: `docs/hu-nutribot-studio.md` (validada 2026-11-27: D1–D20 = recomendaciones; N1–N12 = lo que
muestra el diseño; N1 = interruptor "Mostrar totales de macros" dentro de "Comidas del plan").
Diseño: https://www.figma.com/design/UEmOvtAeHVs6jaAx1uNTGP (resumen y node-id en
`progress/diseno_HU-032a.md`). Issue #90 · rama `feat/HU-032-nutribot-studio` · responsable
`senkuch4n` · label `migración`.

Skills aplicados: `skills/migracion-prisma.md` (sección 4 y checklist) y `skills/ui.txt` (inventario
de pantallas → componentes, sección 9). El architect **no** tuvo acceso al MCP de Figma: las pantallas
se especifican con el resumen de frames. El implementer, si tiene el MCP, abre cada frame citado por
node-id (`get_screenshot`) antes de maquetar.

Nombre interno "NutriBot Studio"; en la UI: **"Diseños de PDF"** dentro de Plantillas (D13).

---

# Parte A · 032-0 · PoC y ADR

## A1. Objetivo y reglas (D3)

Decidir con evidencia (a) qué editor usar para **bloques en flujo** (D2) y (b) con qué se renderiza el
PDF, sin comprometer el VPS. Reglas fijas: sin servicios ni licencias pagas; sin Chromium/Playwright
en el VPS salvo evidencia de que `@react-pdf/renderer` no alcanza **y** de que el VPS lo soporta;
ningún dato clínico sale a servicios externos; dependencias nuevas solo MIT/Apache/BSD (fuentes:
OFL, D9). Línea de base: el renderer actual.

## A2. Línea de base (código del repo, `develop` @ e7c0280)

| Pieza | Estado |
|---|---|
| React / Next | `react` 19.2.8, `next` 15.5.24 (instalados; `^19.0.0` / `^15.5.0` en `apps/web/package.json`) |
| PDF | `@react-pdf/renderer` 4.9.0 (`@react-pdf/layout` 5.2.0). Única librería de PDF |
| Plan | `apps/web/src/lib/plan-pdf.tsx`: `PlanDocument` + `renderPlanPdf` → `renderToBuffer`. Cabecera **en el flujo** (solo pág. 1), pie `fixed` absoluto (`bottom: 28`, `paddingBottom: 64`), `WholeMeal wrap={false}`, días de `PerDayMeal wrap={false}`, `minPresenceAhead` en títulos de secciones. **No** dibuja la firma |
| Común | `pdf-common.tsx`: Inter 400/500/600 `.woff` desde `public/fonts`, `Font.registerHyphenationCallback` sin cortes, `PdfHeader` (imprime "NutriBot"), `PdfFooter`, `PdfSignatureBlock`. `pdf-theme.ts`: `DEFAULT_PDF_ACCENT`, `pdfColors` |
| Generación | `planes/[planId]/actions.ts` → `buildAndSavePdf` (también lo llama `sendPlanWhatsAppAction`: **enviar regenera**) → `savePlanPdf` pisa `NutritionPlan.pdfData` |
| Validación | `zod` 3.25.76 instalado, declarado **solo** en `apps/web`. `packages/core` no tiene `zod` |
| DnD | Ninguna librería de drag & drop en el repo |
| Imágenes | `sharp` 0.35 en `packages/db` (`@nutri-bot/db/media`, `serverExternalPackages`) |
| Build | `output: "standalone"`; `public/` se copia al contenedor (Dockerfile L27); `serverActions.bodySizeLimit: "6mb"` |

## A3. Pruebas exploratorias ya hechas (2026-11-27, carpeta descartable fuera del repo)

Script en el Apéndice A (reproducible). Máquina: Mac Apple Silicon 10 núcleos, Node 24.15, el
`node_modules` del repo (react-pdf 4.9.0), Inter del repo, datos 100 % sintéticos.

| # | Prueba | Resultado |
|---|---|---|
| P1 | Diseño JSON de bloques en flujo interpretado con react-pdf (título, paciente, imagen, comidas, textos) | Funciona; el intérprete es un `switch` sobre `type` |
| P2 | Plan corto (1 pág.) | 85 ms en frío, 24–29 ms en caliente; 9 KB |
| P3 | Plan largo: 7 días × 6 comidas × 6 ítems + 4 textos ≈ 20.000 caracteres, cabecera y pie fijos, imagen | **29 páginas A4** (595.28 × 841.89), 64 KB; **770–790 ms en frío, 580–700 ms en caliente**; pico de RSS 370–450 MB con ~115 MB de base de `tsx` (sin GC forzado: cota superior) |
| P4 | Bloqueo del event loop durante P3 | `monitorEventLoopDelay`: **máx. 742 ms**, p99 11 ms. El layout de react-pdf es síncrono: mientras renderiza un PDF largo, ese proceso de Next no atiende otras requests |
| P5 | Encabezado de comida que se repite al cruzar de página: `<View fixed>` **dentro** del `View` de la comida | Se repite en cada página que ocupa la comida (26 apariciones contra 6 sin `fixed`), ocupa lugar en el flujo, no se superpone (verificado rasterizando la pág. 2) |
| P6 | Filas sin partir: `wrap={false}` por día/fila | Ninguna fila partida |
| P7 | Cabecera repetida en todas las páginas: `<View fixed>` en el flujo (no absoluta) como primer hijo de `<Page>` | Se repite y empuja el contenido (sin `paddingTop` calculado a mano) |
| P8 | Cabecera con fondo de borde a borde (N3): márgenes negativos (`marginTop/-Horizontal = -margen`) | Funciona en todas las páginas |
| P9 | Pie absoluto con `maxLines={2}` | Trunca a 2 líneas; "n / total" con `render` OK |
| P10 | Texto seleccionable | `pdftotext` extrae todo el texto, tildes y eñes incluidas (196 de 196 párrafos de prueba) |
| P11 | **Imagen corrupta** (PNG con magic bytes válidos y cuerpo basura), como data URL y como `{ data, format }` | **react-pdf no tira error**: escribe "Incomplete or corrupt PNG file" en consola y omite la imagen. Consecuencia en 7.6: la falla se detecta **antes** de renderizar |
| P12 | Peso del editor (esbuild, minificado, sin React, gzip) | `@dnd-kit/core`+`sortable`+`utilities`: **15 KB**; `@craftjs/core`: **30 KB**; `@puckeditor/core` 0.24.2: **317 KB** (36 dependencias directas, incluye tiptap, `happy-dom`, `@vercel/detect-agent`) |

## A4. Matriz de editores (bloques en flujo, D2)

| Criterio (medible) | dnd-kit + editor propio | Puck (`@puckeditor/core` 0.24.2; ex `@measured/puck`) | Craft.js (`@craftjs/core` 0.2.12) | React Konva (referencia 032c) |
|---|---|---|---|---|
| Licencia | MIT | MIT | MIT | MIT |
| React 19 / Next 15 | peer `react >=16.8` (6.3.1, dic-2024, API estable) | peer `^18 \|\| ^19` | peer `… \|\| ^19`; último release feb-2025 | `react-konva` 19.3.2 exige **`react ^19.3.0`** (el repo tiene 19.2.8 → upgrade de React) |
| Peso cliente (gz) | 15 KB | 317 KB | 30 KB | n/m (canvas) |
| Modelo de datos | El nuestro (contrato v1, sección 5) | `{ root, content[], zones }` propio → mapeo de ida y vuelta | Árbol de nodos serializado con `resolver` → mapeo | Nodos con x/y en px |
| Teclado / lector de pantalla | `KeyboardSensor` + `sortableKeyboardCoordinates` + `announcements` configurables (escenario "Reordenar sin mouse") | Limitado / no documentado para reordenar | No incluido | No (canvas) |
| Undo/redo | Propio (reducer, ~80 líneas, testeable) | Incluido | Incluido | Propio |
| Encaje con `components/ui` y tokens HU-017 (3 paneles, barra superior del Figma) | Total (todo es nuestro) | Overrides de su UI; vista previa en iframe con CSS inyectado | Total, pero hay que construir el UI igual | — |
| Paginación / fidelidad con el PDF | No aplica: el lienzo es HTML aproximado y la **vista previa es el PDF real** (5.3 de la HU) | Igual (su preview es HTML) | Igual | Lienzo libre: el riesgo de fidelidad de 032c |
| Riesgo de mantenimiento | Bajo (API estable; `@dnd-kit/react` 0.5 es la próxima, opcional) | Medio (renombre de paquete, API 0.x cambiante) | Medio-alto (cadencia baja) | Medio (atado a React minor) |

**Recomendación (editor): dnd-kit (`@dnd-kit/core` 6.3.1, `@dnd-kit/sortable` 10.0.0,
`@dnd-kit/utilities` 3.2.2) + editor propio.** El flujo de bloques es una lista ordenada por zona; lo
que aportan Puck/Craft (DnD, panel de campos, historial) es lo barato, y lo caro (contrato propio,
dos renderers, accesibilidad, look del Figma) lo tendríamos que hacer igual. Konva queda para evaluar
en 032c con dos datos: exige React ≥ 19.3 y dibuja en canvas (texto no seleccionable en el editor y
segunda implementación de cada bloque). Para 032c conviene probar primero posicionamiento absoluto
en DOM (react-pdf soporta `position: "absolute"` en pt).

## A5. Matriz de renderer

| Criterio | `@react-pdf/renderer` 4.9 (actual) | HTML/CSS + Chromium (Playwright/Puppeteer) |
|---|---|---|
| Ya en el repo / costo de infraestructura | Sí / ninguno | Navegador headless en el VPS compartido: ~300–400 MB de disco, 150–300 MB de RAM por instancia, proceso aparte (D3-b lo excluye salvo evidencia) |
| Paginación, cabecera/pie repetidos, filas sin partir, encabezado de tabla repetido | Sí (P5–P9) | Sí (CSS paged media parcial) |
| Texto seleccionable, fuentes embebidas | Sí (P10) | Sí |
| A4 exacto | Sí | Sí |
| Fidelidad editor ↔ PDF | Dos renderers (HTML del lienzo y react-pdf) → se mitiga con vocabulario cerrado de bloques + vista previa = PDF real | Un solo renderer (mejor) |
| CPU / latencia | 25 ms (corto) – 0,7 s (29 pág.) en dev; **bloquea el event loop** (P4) | Similar o mayor, pero fuera del proceso de Next |
| Seguridad | Sin red, sin HTML del usuario | Superficie de navegador (SSRF/JS) a cerrar |
| Licencia | MIT | Apache-2.0 (Playwright) / BSD (Chromium) |

**Recomendación (renderer): `@react-pdf/renderer` 4.9, sin Chromium.** Cumple todos los criterios
del escenario "Plan largo" con evidencia (P3, P5–P10). Su punto débil es el bloqueo del event loop:
se mitiga con una cola de render de 1 en paralelo por proceso (7.7) y, si la medición en el VPS lo
pide, se pasa a `worker_threads` (salida de escape documentada en el ADR, fuera de 032a).

## A6. Fixtures sintéticos (nunca datos reales; el PDF de HU-020 no se usa)

En `apps/web/src/lib/document-design/sample-plan.ts` (sección 7.3):

- `SAMPLE_PLAN_INPUT` ("Paciente de ejemplo"): lo que ven el lienzo y la vista previa. 2 comidas
  "Igual todos los días" (una "Elegí una:"), 2 comidas "Cambia cada día" de lunes a viernes, una
  receta, una medida casera "1½ tazas de leche (270 g)", "Avena 40 g", un ítem sin gramos, 2 textos
  del plan, notas. Profesional y marca: los del consultorio (sección 7.2), nunca datos de pacientes.
- `SAMPLE_LONG_PLAN_INPUT` (tests): 7 días × 6 comidas × 6 ítems, textos ≈ 20.000 caracteres con
  tildes/eñes/½, recetas, ítems sin gramos, notas, matrícula faltante.

## A7. Lo que falta del PoC (lo hace el implementer dentro de 032a, no es una entrega aparte)

1. **Spike de dnd-kit** (primer ítem de 032a-2): `@dnd-kit/core` 6.3.1 en React 19.2 + Next 15.5
   (StrictMode, Turbopack y `next build`), arrastre con puntero, reordenar con teclado (Espacio →
   flechas → Espacio) y `announcements` en castellano. Criterio: funciona en Chrome y Safari, sin
   warnings de hidratación. Si falla, alternativa `@dnd-kit/react` 0.5.3 (peer `^19`); si también
   falla, reordenar solo con botones/teclado + HTML5 DnD para agregar bloques (el Gherkin se cumple).
2. **Medición en el VPS** (manual, la corre Joel; el agente no opera remoto): renderizar
   `SAMPLE_LONG_PLAN_INPUT` con el diseño de prueba en el contenedor de producción (test de muestras
   de 13.4 con `DESIGN_PDF_SAMPLES_DIR`) y anotar en `progress/impl_HU-032a-1.md` tiempo y RSS. Umbral
   para mantener render en el proceso de Next: p95 ≤ 2,5 s para el plan largo. Si lo supera → ADR
   pasa a `worker_threads` (HU aparte).

## A8. ADR-032-001 (propuesto; queda aceptado al aprobarse 032a-1)

- **Contexto:** sección A2–A5.
- **Decisión:** (1) diseño = contrato JSON versionado (`schemaVersion`), validado con Zod en
  `packages/core`, interpretado por dos renderers del mismo vocabulario cerrado: HTML (lienzo y
  miniaturas) y `@react-pdf/renderer` (vista previa y PDF). (2) Editor propio con dnd-kit. (3) Sin
  Chromium. (4) Render en el proceso de Next con cola de 1 en paralelo. (5) El renderer legacy queda
  intacto como respaldo hasta 032e.
- **Consecuencias:** lo que el lienzo muestra es aproximado; la verdad es la vista previa (PDF real).
  Toda propiedad nueva de bloque se implementa en los dos renderers y en el contrato. Un PDF largo
  bloquea ~1 s el proceso. 032c reevalúa (Konva o DOM absoluto) sin cambiar el renderer.
- **Alternativas descartadas:** Puck (peso y modelo ajeno), Craft.js (mantenimiento), Chromium (D3-b,
  costo en el VPS compartido), pdf.js en el cliente para la vista previa (37 MB de paquete; ver Q2).

---

# Parte B · 032a · Diseño del PDF del plan alimentario (MVP)

## 1. Resumen funcional

Cada consultorio puede crear diseños del PDF del plan alimentario (en blanco o duplicando el
diseño del sistema "Clásico", que vive en código), editarlos en un editor de bloques en flujo con
cabecera y pie, subir imágenes propias PNG/JPG, deshacer/rehacer, guardar a mano con detección de
conflictos, ver la vista previa con una paciente ficticia (PDF real), duplicar, renombrar, archivar,
restaurar y marcar uno como **predeterminado para planes**. "Generar PDF" y "Enviar por WhatsApp" del
plan usan el predeterminado (o el PDF legacy si no hay), guardan en el plan qué diseño/revisión se usó
y, si el diseño no puede renderizarse, no tocan el PDF anterior y ofrecen "Generar con Clásico"
(legacy). Logo, color, pie, título, matrícula y firma salen de `/ajustes` al generar (D8). WhatsApp,
portal y bot no cambian (D12). OWNER y STAFF hacen todo (D6). Sin interruptor (D20).

## 2. Entregas y turno de migración

| Entrega | Alcance | Migración | Depende de |
|---|---|---|---|
| **032a-1 · Contrato, modelo, dominio y render** | Contrato v1 + Clásico + helpers en core; esquema y migración `document_designs`; dominio tenant-aware; renderer react-pdf del diseño; cola de render; generación del PDF del plan con predeterminado + respaldo legacy + estado en la página del plan. Sin galería ni editor: en producción queda **dormido** (ningún consultorio tiene diseños → todo legacy, D20) | **Sí** (la única de 032a) | **Turno:** después de que las migraciones de **028c** y **029b** estén en `develop` (orden acordado 028c → 029b → 032a) y con ninguna otra HU con migración en `implementando` |
| **032a-2 · Galería, editor y vista previa** | Pestañas de Plantillas, galería, diálogos, editor (dnd-kit), imágenes (subida, ruta, borrado), vista previa, guardado con conflicto, cambios sin guardar, móvil | No | 032a-1 mergeada en `develop` |

Antes de crear la migración de 032a-1: `git fetch && git rebase origin/develop` y comprobar que
`packages/db/prisma/migrations/` ya trae las carpetas de 028c y 029b. Si no están, **no** se crea la
migración: el implementer devuelve `blocked`.

Choque de archivos con imleticio (HU-017e, D10 sujeta a confirmación de Leo en el issue): se toca lo
mínimo de `plan-pdf.tsx`, `planes/[planId]/actions.ts`, `planes/[planId]/page.tsx`,
`plan-pdf-actions.tsx` y `plantillas/page.tsx` (llamar una función / pasar un prop); todo lo nuevo
vive en archivos propios.

## 3. Workspaces afectados

| Workspace | ¿Se toca? | Qué |
|---|---|---|
| `packages/core` | **Sí** | Nuevo subpath `@nutri-bot/core/document-design` (contrato v1 Zod, migración de versiones, Clásico, catálogo de bloques, helpers puros, textos). Dependencia nueva `zod` (MIT; ya está en el lockfile vía web). Tests vitest |
| `packages/db` | **Sí** | `schema.prisma` + migración `document_designs`; `domain/documentDesigns.ts` (subpath propio, no en `domain/index.ts`); `domain/nutritionPlans.ts` (`savePlanPdf` + `getPlanPdfDesignInfo`); `media/design-image.ts` (sharp); tests con mocks; probe de dos consultorios en Postgres descartable |
| `apps/web` | **Sí** | 032a-1: `lib/document-design/*` (renderer, fuentes, muestra, marca), `lib/pdf-render-queue.ts`, `lib/plan-pdf-generation.ts`, `lib/plan-pdf-text.ts`, cambios mínimos en el plan. 032a-2: rutas `/plantillas/disenos/**`, `components/document-designer/**`, `api/disenos/imagenes/[assetId]`, fuentes OFL en `public/fonts` |
| `apps/bot` | **No** (código) | Solo `typecheck`: `NutritionPlan` suma columnas opcionales; el bot sigue leyendo `plan.pdfData` al despachar `PLAN_PDF` |

**Impacto cruzado:** cambia la firma de `savePlanPdf` (parámetro opcional nuevo, compatible) y se
agregan columnas a `NutritionPlan`, que el bot lee. `npm run typecheck` tiene que pasar en web **y**
bot. `domain/documentDesigns.ts` no se reexporta desde `domain/index.ts` para que el bot no cargue
`zod` ni el contrato.

## 4. Esquema (032a-1)

### 4.1 Prisma (cambios exactos)

```prisma
model Tenant {
  // ... sin cambios ...
  /// HU-032a: diseños de documentos e imágenes del consultorio.
  documentDesigns DocumentDesign[]
  documentAssets  DocumentAsset[]
}

/// HU-032a: tipo de documento de un diseño. Solo PLAN en el MVP (032e agrega más).
enum DocumentKind {
  PLAN
}

enum DocumentDesignStatus {
  ACTIVE
  ARCHIVED
}

/// HU-032a: BLANK = "Nuevo diseño" en blanco; SYSTEM_COPY = copia de "Clásico"; DESIGN_COPY = duplicado
/// de otro diseño (también "Guardar como copia" del conflicto).
enum DocumentDesignOrigin {
  BLANK
  SYSTEM_COPY
  DESIGN_COPY
}

/// HU-032a (NutriBot Studio): plantilla VISUAL de un documento del consultorio (cómo se ve, no qué se
/// come: eso es PlanTemplate). `content` es el contrato JSON validado por @nutri-bot/core/document-design
/// (parseDocumentDesign); nunca contiene datos de pacientes (los bloques dinámicos son referencias).
/// "Clásico" no está acá: vive en código (CLASSIC_PLAN_DESIGN, D5).
/// Un solo predeterminado por (tenantId, kind): índice único parcial DocumentDesign_default_per_tenant_kind_key
/// (solo en el SQL de la migración). Archivado ⇒ no predeterminado (CHECK).
model DocumentDesign {
  id              String               @id @default(cuid())
  tenantId        String
  tenant          Tenant               @relation(fields: [tenantId], references: [id], onDelete: Restrict)
  kind            DocumentKind         @default(PLAN)
  /// 1..80 caracteres, sin espacios al borde (CHECK + validateDesignName de core).
  name            String
  status          DocumentDesignStatus @default(ACTIVE)
  isDefault       Boolean              @default(false)
  /// schemaVersion con el que se GUARDÓ `content`. Al leer se migra en memoria (migrateDocumentDesign);
  /// al guardar se escribe la versión vigente.
  schemaVersion   Int
  content         Json
  /// Concurrencia optimista: sube en cada guardado del editor y en cada renombre. Archivar, restaurar y
  /// marcar predeterminado no la cambian.
  revision        Int                  @default(1)
  origin          DocumentDesignOrigin
  /// Diseño del que se copió (DESIGN_COPY). Sin FK: solo trazabilidad.
  sourceDesignId  String?
  /// Auditoría mínima: User.id de la sesión (sin FK, sin contenido clínico).
  createdByUserId String
  updatedByUserId String
  createdAt       DateTime             @default(now())
  updatedAt       DateTime             @updatedAt
  archivedAt      DateTime?
  assets          DocumentDesignAsset[]
  /// Planes cuyo último PDF salió con este diseño (NutritionPlan.pdfDesignId).
  plansGenerated  NutritionPlan[]      @relation("NutritionPlanPdfDesign")

  @@unique([id, tenantId])
  @@index([tenantId, kind, status, updatedAt])
}

/// HU-032a (D4): imagen propia del consultorio para los diseños. PNG o JPG normalizada con sharp (sin
/// metadatos, lado mayor ≤ 3000 px), máx. 2 MB, máx. 30 por consultorio (DOCUMENT_DESIGN_LIMITS).
/// Solo se lee con domain/documentDesigns.ts (ruta del panel y render), siempre por (id, tenantId).
model DocumentAsset {
  id              String                @id @default(cuid())
  tenantId        String
  tenant          Tenant                @relation(fields: [tenantId], references: [id], onDelete: Restrict)
  data            Bytes
  /// "image/png" | "image/jpeg", por magic bytes de los bytes normalizados.
  mimeType        String
  byteSize        Int
  width           Int
  height          Int
  /// sha256 hex de `data`: la misma imagen subida dos veces en el consultorio se reusa.
  sha256          String
  createdByUserId String
  createdAt       DateTime              @default(now())
  designs         DocumentDesignAsset[]

  @@unique([id, tenantId])
  @@unique([tenantId, sha256])
  @@index([tenantId, createdAt])
}

/// HU-032a: qué imágenes usa cada diseño. Se reescribe en cada guardado, en la misma transacción.
/// Las dos FK compuestas con el MISMO tenantId garantizan en la base que un diseño solo referencia
/// imágenes de su consultorio. Borrar una imagen en uso falla (Restrict).
model DocumentDesignAsset {
  designId String
  assetId  String
  tenantId String
  design   DocumentDesign @relation(fields: [designId, tenantId], references: [id, tenantId], onDelete: Cascade, onUpdate: NoAction)
  asset    DocumentAsset  @relation(fields: [assetId, tenantId], references: [id, tenantId], onDelete: Restrict, onUpdate: NoAction)

  @@id([designId, assetId])
  @@index([assetId, tenantId])
}

model NutritionPlan {
  // ... campos actuales sin cambios ...
  /// HU-032a (D7): diseño y revisión con que se generó el último PDF. null = PDF legacy (o anterior a 032a).
  /// Se escriben junto con pdfData en savePlanPdf. FK compuesta: el diseño es del mismo consultorio que el plan.
  pdfDesignId       String?
  pdfDesignRevision Int?
  pdfDesign         DocumentDesign? @relation("NutritionPlanPdfDesign", fields: [pdfDesignId, tenantId], references: [id, tenantId], onDelete: Restrict, onUpdate: NoAction)
  // ... relaciones e índices actuales sin cambios ...
}
```

Notas: `NutritionPlan.tenantId` ya existe (nullable) y ya participa en `tenantPatient`; la relación
nueva comparte esa columna con `onUpdate: NoAction` (mismo patrón que `OutboundMessage.tenantPlan`).
Los diseños no se borran en 032a (solo se archivan), por eso `Restrict` es seguro.

### 4.2 Migración `document_designs`

Desde `packages/db`, con backup previo (`docker compose exec -T db pg_dump -U <user> -d <db> -Fc >
~/backups/nutribot-pre-032a-$(date +%Y%m%d%H%M).dump`, fuera del repo):
`npx dotenv -e ../../.env -- prisma migrate dev --create-only --name document_designs`.

Revisar el SQL generado: tiene que ser **solo aditivo** (3 `CREATE TYPE`, 3 `CREATE TABLE`, índices, FK,
2 `ALTER TABLE "NutritionPlan" ADD COLUMN` nullable, 1 FK nueva). Si aparece cualquier `DROP` o
`ALTER COLUMN` → parar (`blocked`). Agregar **a mano al final** del `migration.sql`:

```sql
-- HU-032a: un solo predeterminado por consultorio y tipo (Prisma no expresa índices parciales).
CREATE UNIQUE INDEX "DocumentDesign_default_per_tenant_kind_key"
  ON "DocumentDesign"("tenantId", "kind") WHERE "isDefault";

ALTER TABLE "DocumentDesign"
  ADD CONSTRAINT "DocumentDesign_name_check" CHECK (char_length("name") BETWEEN 1 AND 80 AND "name" = btrim("name")),
  ADD CONSTRAINT "DocumentDesign_archived_not_default_check" CHECK (NOT ("isDefault" AND "status" = 'ARCHIVED')),
  ADD CONSTRAINT "DocumentDesign_archived_at_check" CHECK (("status" = 'ARCHIVED') = ("archivedAt" IS NOT NULL)),
  ADD CONSTRAINT "DocumentDesign_revision_check" CHECK ("revision" >= 1),
  ADD CONSTRAINT "DocumentDesign_content_size_check" CHECK (octet_length("content"::text) <= 262144);

ALTER TABLE "DocumentAsset"
  ADD CONSTRAINT "DocumentAsset_mime_check" CHECK ("mimeType" IN ('image/png', 'image/jpeg')),
  ADD CONSTRAINT "DocumentAsset_size_check" CHECK ("byteSize" > 0 AND "byteSize" <= 2097152 AND "byteSize" = octet_length("data")),
  ADD CONSTRAINT "DocumentAsset_dims_check" CHECK ("width" BETWEEN 1 AND 3000 AND "height" BETWEEN 1 AND 3000),
  ADD CONSTRAINT "DocumentAsset_sha256_check" CHECK ("sha256" ~ '^[0-9a-f]{64}$');

-- La FK compuesta con tenantId NULL no se verifica (MATCH SIMPLE): un plan sin consultorio no puede tener diseño.
ALTER TABLE "NutritionPlan"
  ADD CONSTRAINT "NutritionPlan_pdf_design_check" CHECK (
    ("pdfDesignId" IS NULL) = ("pdfDesignRevision" IS NULL)
    AND ("pdfDesignId" IS NULL OR "tenantId" IS NOT NULL)
  );
```

(El tope de 262.144 bytes de la base es una red; el de la app es 131.072, sección 5.2.)

**Filas existentes:** no hay columnas `NOT NULL` nuevas en tablas con filas. Los planes existentes
quedan con `pdfDesignId = NULL` (= legacy), que es la verdad. No hay backfill. Las tablas nuevas
arrancan vacías. Producción aplica con `prisma migrate deploy` sin pasos manuales.

Después: `npm run db:migrate` (aplica), `npm run db:generate`, `npm run typecheck`. Prohibido `migrate
reset`, `db push`, usar la base de desarrollo como shadow o `migrate diff --from-migrations` contra
ella. Si hay drift: `blocked` con `npx prisma migrate status`.

## 5. Contrato compartido · `packages/core` (032a-1)

Subpath nuevo en `packages/core/package.json` → `"exports"`: `"./document-design":
"./src/document-design/index.ts"`. **No** se reexporta desde `src/index.ts` (el bot no lo carga).
Dependencia: `npm i zod@^3.24.1 --workspace packages/core`.

Archivos: `src/document-design/{contract.ts, migrate.ts, classic.ts, catalog.ts, helpers.ts,
text.ts, image.ts, index.ts}` + `*.test.ts` al lado.

### 5.1 Tipos (`contract.ts`, exportados; inferidos de los esquemas Zod)

```ts
export const DOCUMENT_DESIGN_SCHEMA_VERSION = 1 as const;
export type DocumentKindValue = "PLAN";

export const DESIGN_FONT_IDS = ["inter", "lora", "nunito", "merriweather"] as const;
export type DesignFontId = (typeof DESIGN_FONT_IDS)[number];
export const DESIGN_COLOR_TOKENS = ["text", "muted", "accent", "subtle", "white"] as const;
/** Token del tema o hex "#RRGGBB". "accent" = color de /ajustes o theme.accent. */
export type DesignColor = (typeof DESIGN_COLOR_TOKENS)[number] | `#${string}`;
export type DesignAlign = "left" | "center" | "right";
export type DesignWeight = "regular" | "medium" | "bold";   // Inter 400/500/600 (mapa por fuente en 7.4)
export type IfMissing = "hide" | "showUnavailable";           // D16; default "hide"

// Bloques. Todos: { id: BlockId; type: ... } + props planas. Objetos .strict(): una prop desconocida invalida.
export type LogoBlock         = { id; type: "logo"; heightPt: number /*16..96*/; align: DesignAlign };
export type ProfessionalBlock = { id; type: "professional"; showTitle: boolean; showLicense: boolean;
                                  layout: "inline" | "stacked"; sizePt: number /*7..24*/; weight: DesignWeight;
                                  color: DesignColor; align: DesignAlign; ifMissing: IfMissing };
export type FooterTextBlock   = { id; type: "footerText"; sizePt: number /*6..12*/; color: DesignColor; align: DesignAlign };
export type PageNumberBlock   = { id; type: "pageNumber"; format: "short" | "long"; sizePt: number /*6..12*/;
                                  color: DesignColor; align: DesignAlign };
export type TextBlock         = { id; type: "text"; text: string /*1..2000, texto plano, \n permitido*/;
                                  sizePt: number /*6..36*/; weight: DesignWeight; color: DesignColor; align: DesignAlign;
                                  background: DesignColor | null; borderWidthPt: number /*0..4*/; borderColor: DesignColor;
                                  paddingPt: number /*0..24*/; marginTopPt: number /*0..48*/ };
export type PlanTitleBlock    = { id; type: "planTitle"; sizePt: number /*10..36*/; weight: DesignWeight;
                                  color: DesignColor; align: DesignAlign; marginTopPt: number };
export type PatientNameBlock  = { id; type: "patientName"; label: string /*0..40*/; sizePt: number /*7..24*/;
                                  color: DesignColor; align: DesignAlign; marginTopPt: number };
export type IssueDateBlock    = { id; type: "issueDate"; label: string /*0..40*/; format: "short" | "long";
                                  sizePt: number /*7..24*/; color: DesignColor; align: DesignAlign; marginTopPt: number };
export type MealsBlock        = { id; type: "meals"; showNotes: boolean; showQuantities: boolean; showTotals: boolean;
                                  mealTitleStyle: "bar" | "underline" | "plain"; dayTitleStyle: "plain" | "accent";
                                  marginTopPt: number };
export type PlanSectionsBlock = { id; type: "planSections"; mode: "all" | "selected"; titles: string[] /*≤20, c/u 1..80*/;
                                  titleStyle: "bar" | "plain" | "accent"; ifMissing: IfMissing; marginTopPt: number };
export type PlanNotesBlock    = { id; type: "planNotes"; title: string /*1..40*/; ifMissing: IfMissing; marginTopPt: number };
export type SignatureBlock    = { id; type: "signature"; align: DesignAlign; showLicense: boolean; ifMissing: IfMissing };
export type ImageBlock        = { id; type: "image"; assetId: string; widthPct: number /*10..100 entero*/;
                                  align: DesignAlign; marginTopPt: number };
export type DividerBlock      = { id; type: "divider"; thicknessPt: number /*0.5..4*/; color: DesignColor; marginVerticalPt: number /*0..48*/ };
export type SpacerBlock       = { id; type: "spacer"; heightPt: number /*4..120*/ };

export type ZoneBlock = LogoBlock | ProfessionalBlock | FooterTextBlock | PageNumberBlock | TextBlock;
export type BodyBlock = LogoBlock | ProfessionalBlock | TextBlock | PlanTitleBlock | PatientNameBlock
  | IssueDateBlock | MealsBlock | PlanSectionsBlock | PlanNotesBlock | SignatureBlock | ImageBlock
  | DividerBlock | SpacerBlock;
export type DesignBlock = ZoneBlock | BodyBlock;
export type DesignBlockType = DesignBlock["type"];
export type DesignZone = "header" | "body" | "footer";

export type DocumentDesignV1 = {
  schemaVersion: 1;
  kind: "PLAN";
  page: { size: "A4"; orientation: "portrait";
          marginsPt: { top: number; right: number; bottom: number; left: number } /* enteros 18..96 */ };
  theme: { accent: "settings" | `#${string}`;                 // D8: por defecto el de /ajustes
           fonts: { body: DesignFontId; heading: DesignFontId };  // Q5
           baseSizePt: number /* 8..12 */ };
  header: { repeat: "everyPage" | "firstPage"; background: "none" | DesignColor; accentRule: boolean;
            blocks: ZoneBlock[] /* ≤3 */ };
  body: { blocks: BodyBlock[] /* ≤60 */ };
  footer: { topRule: boolean; blocks: ZoneBlock[] /* ≤3 */ };
};
/** Alias de la versión vigente: lo que usan el editor, el dominio y los renderers. */
export type DocumentDesignContent = DocumentDesignV1;
```

Reglas del esquema (`documentDesignV1Schema`, Zod, todo `.strict()`):

- `id` de bloque: `/^[A-Za-z0-9_-]{8,40}$/`, **único** en todo el documento (`superRefine`).
- `assetId`: `/^[a-z0-9]{20,40}$/` (cuid). No existe ninguna propiedad que acepte URL, HTML ni
  `data:`; una `src`/`url`/`href` es una propiedad desconocida → inválido. El texto de un bloque
  `text` es texto plano (se dibuja con `<Text>`, nunca se interpreta): puede contener una dirección
  como "instagram.com/…" y no se pide nada a la red.
- Strings: sin caracteres de control salvo `\n` y `\t`; `trim` en labels y títulos.
- Hex: `/^#[0-9A-Fa-f]{6}$/`. Números con `.finite()` y rangos de arriba; enteros donde dice entero.
- Zonas: `header.blocks` y `footer.blocks` solo `ZoneBlock`; `body.blocks` solo `BodyBlock`.
- Tamaño: `JSON.stringify(content)` ≤ `DOCUMENT_DESIGN_LIMITS.maxContentBytes` (UTF-8, `TextEncoder`).

### 5.2 Límites y textos (`contract.ts`, `text.ts`)

```ts
export const DOCUMENT_DESIGN_LIMITS = {
  nameMin: 1, nameMax: 80,
  maxContentBytes: 128 * 1024,
  maxBodyBlocks: 60, maxZoneBlocks: 3,
  textMax: 2000, labelMax: 40, sectionTitleMax: 80, maxSelectedSections: 20,
  maxDesignsPerTenant: 100,            // incluye archivados (Q6)
  maxAssetsPerTenant: 30,              // D4
  assetMaxBytes: LOGO_IMAGE_MAX_BYTES, // 2 MB, reusa professional-identity.ts
  assetMaxSidePx: 3000,
} as const;
```

`DESIGN_TEXT` (`text.ts`) — textos exactos de la UI (voseo):

| Clave | Texto |
|---|---|
| `classicName` | `Clásico` |
| `systemBadge` | `Del sistema · solo lectura` |
| `defaultBadge` | `Predeterminado` |
| `emptyGallery` | `Todavía no creaste diseños. Empezá desde cero o duplicá Clásico.` |
| `newDesign` / `duplicateClassic` | `Nuevo diseño` / `Duplicar Clásico` |
| `nameInvalid` | `El nombre tiene que tener entre 1 y 80 caracteres.` |
| `imageInvalid` | `La imagen tiene que ser PNG o JPG de hasta 2 MB.` |
| `assetQuota` | `Llegaste al máximo de 30 imágenes. Eliminá alguna que no uses.` |
| `assetInUse` | `Esta imagen se usa en un diseño. Quitala del diseño antes de eliminarla.` |
| `designLimit` | `Llegaste al máximo de 100 diseños.` |
| `invalidContent` | `El diseño tiene contenido no válido.` |
| `saved` / `saveFailed` | `Diseño guardado` / `No pudimos guardar el diseño. Probá de nuevo.` |
| `statusSaved` / `statusDirty` / `statusSaving` | `Guardado` / `Cambios sin guardar` / `Guardando…` |
| `unsavedTitle` / `leave` / `stay` | `Tenés cambios sin guardar. ¿Salir igual?` / `Salir sin guardar` / `Seguir editando` |
| `conflict` / `reload` / `saveAsCopy` | `Este diseño cambió en otra sesión. Podés recargarlo (perdés tus cambios) o guardarlo como copia.` / `Recargar` / `Guardar como copia` |
| `archiveDefault` | `Este es tu diseño predeterminado. Si lo archivás, los PDF nuevos salen con el diseño Clásico.` |
| `previewLoading` | `Generando vista previa…` |
| `smallScreen` | `Para editar diseños usá una pantalla más grande` |
| `notAvailable` | `No disponible` |
| `renderFailed(name)` | `No pudimos generar el PDF con el diseño ${name}. Revisá el diseño o generalo con el diseño Clásico.` |
| `generateWithClassic` | `Generar con Clásico` |
| `planDesignLine(name)` | `Diseño: ${name}` (+ link `Cambiar` → `/plantillas/disenos`) |
| `lastPdfLine(date, name)` | `Último PDF: ${date} · Diseño: ${name}` (sin diseño: `Último PDF: ${date}`, igual que hoy) |
| `designChanged` / `regenerate` | `El diseño cambió desde el último PDF` / `Volver a generar` |
| `renderBusy` | `Hay otros PDF generándose. Probá de nuevo en unos segundos.` |
| `copyName(name)` | ver `copyDesignName` |

### 5.3 Parseo y migración de versiones (`migrate.ts`)

```ts
export type DesignMigrationStep = (doc: Record<string, unknown>) => Record<string, unknown>;
/** Registro de pasos: steps[n] lleva de la versión n a n+1. Hoy vacío (solo v1). */
export const DESIGN_MIGRATIONS: Readonly<Record<number, DesignMigrationStep>> = {};

export type ParseDesignResult =
  | { ok: true; content: DocumentDesignContent; migratedFrom: number | null }
  | { ok: false; reason: "invalid" | "unsupported_version" | "too_large"; issueCount: number };

/** Para usar desde la base y desde el cliente: lee schemaVersion, aplica pasos hasta la vigente y valida. */
export function parseDocumentDesign(raw: unknown): ParseDesignResult;
/** Inyectable para tests (simular "el sistema ya usa v2"). */
export function migrateDocumentDesign(
  raw: unknown,
  opts: { current: number; steps: Readonly<Record<number, DesignMigrationStep>>; schemas: Readonly<Record<number, z.ZodTypeAny>> },
): ParseDesignResult;
/** Igual que parseDocumentDesign, pero exige schemaVersion === vigente (lo que manda el editor al guardar). */
export function parseDocumentDesignForSave(raw: unknown): ParseDesignResult;
export function validateDesignName(raw: unknown): { ok: true; name: string } | { ok: false; error: string };
```

- `schemaVersion` mayor que la vigente, no entero o < 1 → `unsupported_version`. Falta un paso →
  `unsupported_version`. Tamaño → `too_large`. Todo lo demás → `invalid`. La UI muestra siempre
  `DESIGN_TEXT.invalidContent`; los logs, solo `reason` e `issueCount` (nunca el contenido).
- La migración es **perezosa**: al leer de la base se migra en memoria; al guardar se escribe la
  vigente. No hay migración por lotes.

### 5.4 Clásico (`classic.ts`, D5)

```ts
export const CLASSIC_DESIGN_ID = "system-classic-plan";   // nunca es un id de la base (no es cuid)
export const CLASSIC_PLAN_DESIGN: DocumentDesignV1;        // Object.freeze profundo
```

Contenido (aproxima el legacy, pág. 1; frame `4:48`/`4:138`): márgenes `{ top: 44, right: 44,
bottom: 28, left: 44 }`; `theme { accent: "settings", fonts: { body: "inter", heading: "inter" },
baseSizePt: 10 }`; `header { repeat: "firstPage", background: "none", accentRule: true, blocks: [logo
(40 pt, left), professional (showTitle, sin matrícula, inline, 10 pt, medium, right)] }`; `body: [
planTitle (18 pt, bold), patientName (label "Paciente:", 10 pt, muted), issueDate (label "Generado
el", short, 8.5 pt, muted), meals (todo en true, "bar", "plain"), planSections (all, "plain"),
planNotes ("Notas") ]`; `footer { topRule: true, blocks: [footerText (8 pt, muted, left), pageNumber
(short, 8 pt, muted, right)] }`. Sin "NutriBot" (N2). Ids fijos `classic-xxxxxxxx`. Diferencia
aceptada con el legacy: título y paciente van debajo de la cabecera, no al lado del logo (Q1).

### 5.5 Catálogo de bloques (`catalog.ts`)

```ts
export type BlockCatalogEntry = {
  type: DesignBlockType;
  label: string;                              // "Título del plan", "Datos de la paciente", …
  group: "plan" | "content" | "headerFooter"; // panel izquierdo: "Del plan" / "Contenido" / "Cabecera y pie"
  zones: readonly DesignZone[];
  icon: string;                               // nombre lucide (lo mapea web)
};
export const DESIGN_BLOCK_CATALOG: readonly BlockCatalogEntry[];
export function canPlaceBlock(type: DesignBlockType, zone: DesignZone): boolean;
/** Bloque con props por defecto (el id lo pone quien llama: crypto.randomUUID en el cliente). */
export function createBlock(type: DesignBlockType, id: string): DesignBlock;
/** "Nuevo diseño" en blanco: A4 vertical, cabecera y pie vacíos, sin bloques (escenario "Crear en blanco"). */
export function blankPlanDesign(): DocumentDesignV1;
```

Labels: `logo` "Logo del consultorio", `professional` "Datos de la profesional" (unifica cabecera y
cuerpo, N10), `footerText` "Texto del pie", `pageNumber` "Número de página", `planTitle` "Título del
plan", `patientName` "Datos de la paciente", `issueDate` "Fecha de emisión", `meals` "Comidas del plan",
`planSections` "Textos del plan", `planNotes` "Notas del plan", `signature` "Firma", `text` "Texto",
`image` "Imagen", `divider` "Separador", `spacer` "Espacio". Zonas: header/footer = `logo,
professional, footerText, pageNumber, text`; body = todos salvo `footerText` y `pageNumber`.
`image` necesita `assetId`: el cliente lo crea desde "Imágenes" (no desde `createBlock` sin asset).

### 5.6 Helpers puros (`helpers.ts`, `image.ts`)

```ts
export function resolveMissingText(value: string | null | undefined, ifMissing: IfMissing): string | null; // "" o null → null | "No disponible"; nunca "0"
export function professionalBlockLines(p: { title: string | null; name: string; licenseNumber: string | null },
  b: Pick<ProfessionalBlock, "showTitle" | "showLicense" | "layout" | "ifMissing">): string[];
export function pageNumberText(n: number, total: number, format: "short" | "long"): string; // "1 / 3" | "Página 1 de 3"
export function formatIssueDate(date: Date, format: "short" | "long", timeZone: string): string; // es-AR: "27/11/2026" | "27 de noviembre de 2026"
export function selectPlanSections<T extends { title: string }>(sections: readonly T[],
  b: Pick<PlanSectionsBlock, "mode" | "titles">): T[]; // "selected": igualdad trim + sin distinguir mayúsculas; orden del plan
export function collectDesignAssetIds(doc: DocumentDesignV1): string[]; // únicos, orden de aparición
export function copyDesignName(name: string, existing: readonly string[]): string; // "X (copia)", "X (copia 2)"…; recorta X para no pasar 80
export function planPdfDesignStatus(
  last: { hasPdf: boolean; designId: string | null; revision: number | null },
  current: { id: string; revision: number } | null,
): "none" | "upToDate" | "designChanged";
export function resolveDesignColor(c: DesignColor, accentHex: string, palette: { text: string; muted: string; subtle: string }): string;

// image.ts — misma regla que el logo, con un único mensaje (escenario "Imagen propia")
export function designImageSizeError(size: number): string | null;   // > 2 MB o 0 → DESIGN_TEXT.imageInvalid
export function validateDesignImage(bytes: Uint8Array):
  { ok: true; mimeType: "image/png" | "image/jpeg"; width: number; height: number } | { ok: false; error: string };
export function readImageDimensions(bytes: Uint8Array, mime: "image/png" | "image/jpeg"): { width: number; height: number } | null; // IHDR / SOFn
```

`planPdfDesignStatus`: `!hasPdf` → `none`; `last.designId === null && current === null` → `upToDate`;
mismo id y misma revisión → `upToDate`; cualquier otro caso → `designChanged` (incluye: se marcó un
predeterminado después de un PDF legacy, se archivó el predeterminado, se editó o renombró — Q3).

## 6. Dominio · `packages/db` (032a-1)

### 6.1 `packages/db/domain/documentDesigns.ts` (nuevo)

Subpath en `packages/db/package.json`: `"./domain/documentDesigns": "./domain/documentDesigns.ts"`.
**No** va en `domain/index.ts`. Consumidor: solo `apps/web`.

```ts
import type { TenantRef } from "./tenantScope";
export type DesignActor = TenantRef & { userId: string };   // TenantContext lo cumple

export type DocumentDesignErrorCode = "not_found" | "conflict" | "invalid" | "design_limit" | "asset_quota" | "asset_in_use";
export class DocumentDesignError extends Error { readonly code: DocumentDesignErrorCode; } // message = `document_design:${code}`, sin datos

export type DocumentDesignSummary = {
  id: string; name: string; status: "ACTIVE" | "ARCHIVED"; isDefault: boolean; revision: number;
  origin: "BLANK" | "SYSTEM_COPY" | "DESIGN_COPY"; updatedAt: Date;
  content: DocumentDesignContent | null;   // migrado; null si no parsea (la galería muestra miniatura vacía)
};
export type DocumentDesignRecord = DocumentDesignSummary & { contentError: ParseDesignResult & { ok: false } | null };

export function listDocumentDesigns(t: TenantRef, q: { kind: "PLAN"; status: "ACTIVE" | "ARCHIVED" }): Promise<DocumentDesignSummary[]>; // orden: isDefault desc, updatedAt desc
export function getDocumentDesign(t: TenantRef, id: string): Promise<DocumentDesignRecord | null>;      // null = inexistente u otro consultorio
export function getDefaultDocumentDesign(t: TenantRef, kind: "PLAN"): Promise<{ id: string; name: string; revision: number; content: unknown } | null>; // content CRUDO: lo parsea el render (si falla → fallo de render, no excepción acá)

export function createDocumentDesign(a: DesignActor, input: {
  name: string; kind: "PLAN"; origin: "BLANK" | "SYSTEM_COPY" | "DESIGN_COPY"; sourceDesignId?: string | null; content: unknown;
}): Promise<{ id: string }>;
export function duplicateDocumentDesign(a: DesignActor, id: string): Promise<{ id: string; name: string }>;
export function saveDocumentDesign(a: DesignActor, input: {
  id: string; expectedRevision: number; name: string; content: unknown;
}): Promise<{ revision: number }>;
export function renameDocumentDesign(a: DesignActor, input: { id: string; name: string }): Promise<{ revision: number }>;
export function archiveDocumentDesign(a: DesignActor, id: string): Promise<{ wasDefault: boolean }>;
export function restoreDocumentDesign(a: DesignActor, id: string): Promise<void>;         // no vuelve a ser predeterminado (N8)
export function setDefaultDocumentDesign(a: DesignActor, id: string): Promise<void>;

export function createDocumentAsset(a: DesignActor, input: {
  data: Buffer; mimeType: "image/png" | "image/jpeg"; width: number; height: number;
}): Promise<{ id: string; width: number; height: number; reused: boolean }>;
export function listDocumentAssets(t: TenantRef): Promise<{ id: string; width: number; height: number; byteSize: number; createdAt: Date }[]>;
export function getDocumentAssetBytes(t: TenantRef, id: string): Promise<{ data: Buffer; mimeType: string } | null>;
export function getDocumentAssetsForRender(t: TenantRef, ids: readonly string[]):
  Promise<Map<string, { data: Buffer; mimeType: string; width: number; height: number }>>; // solo los del tenant
export function deleteDocumentAsset(t: TenantRef, id: string): Promise<void>;
```

Reglas de implementación (todas con `tenantId` en el `where`; un id de otro consultorio se comporta
igual que uno inexistente: `null` en lecturas, `DocumentDesignError("not_found")` en escrituras):

- **create / duplicate / saveAsCopy:** dentro de `prisma.$transaction`: (1)
  `parseDocumentDesignForSave(content)` (si no `ok` → `invalid`); `validateDesignName`; (2) contar
  diseños del tenant (`>= maxDesignsPerTenant` → `design_limit`); (3) `collectDesignAssetIds` →
  `documentAsset.findMany({ where: { id: { in }, tenantId } })`; si falta alguno → `invalid` (escenario
  "Ids combinados"); (4) `documentDesign.create` con `schemaVersion: DOCUMENT_DESIGN_SCHEMA_VERSION`,
  `createdByUserId = updatedByUserId = a.userId`; (5) `documentDesignAsset.createMany`. La FK compuesta
  es la segunda barrera. `duplicate` lee el original por `(id, tenantId)` con cualquier estado ACTIVE,
  nombre `copyDesignName(original.name, nombresDelTenant)`, `origin: DESIGN_COPY`,
  `sourceDesignId`, `isDefault: false`.
- **save:** en transacción: validar como arriba; `documentDesign.updateMany({ where: { id, tenantId,
  revision: expectedRevision, status: "ACTIVE" }, data: { name, content, schemaVersion, revision: {
  increment: 1 }, updatedByUserId } })`. `count === 0` → releer `findFirst({ where: { id, tenantId },
  select: { id: true } })`: no existe → `not_found`; existe → `conflict` (incluye "se archivó en otra
  sesión"). Reescribir `DocumentDesignAsset` (`deleteMany({ where: { designId: id, tenantId } })` +
  `createMany`). Devuelve la revisión nueva.
- **rename:** `updateMany({ where: { id, tenantId, status: "ACTIVE" }, data: { name, revision: {
  increment: 1 }, updatedByUserId } })`; `count 0` → `not_found`.
- **archive:** `updateMany({ where: { id, tenantId, status: "ACTIVE" }, data: { status: "ARCHIVED",
  isDefault: false, archivedAt: now, updatedByUserId } })` precedido de una lectura de `isDefault` en la
  misma transacción (para `wasDefault`). **restore:** `status: ACTIVE, archivedAt: null` (no toca
  `isDefault`).
- **setDefault:** transacción: `updateMany({ where: { tenantId, kind, isDefault: true, NOT: { id } },
  data: { isDefault: false } })` y `updateMany({ where: { id, tenantId, status: "ACTIVE" }, data: {
  isDefault: true } })`; `count 0` → `not_found` (rollback). Si dos sesiones chocan contra el índice
  parcial (`P2002`), reintentar una vez; si vuelve a fallar, propagar.
- **createDocumentAsset:** `sha256` de `data`; en transacción con `pg_advisory_xact_lock(hashtext('document-asset:' || tenantId))`
  (`$executeRaw` con parámetro): si existe `(tenantId, sha256)` → devolver ese con `reused: true`;
  contar (`>= 30` → `asset_quota`); crear. `byteSize = data.length`.
- **deleteDocumentAsset:** `deleteMany({ where: { id, tenantId } })`; `P2003` (FK Restrict) →
  `asset_in_use`; `count 0` → `not_found`.
- Ninguna función loguea contenido ni nombres; los errores llevan solo el código.

### 6.2 `packages/db/domain/nutritionPlans.ts` (cambia)

```ts
// Antes: savePlanPdf(t, planId, data: { data: Buffer; fileName: string })
export function savePlanPdf(
  t: TenantRef,
  planId: string,
  data: { data: Buffer; fileName: string; design?: { id: string; revision: number } | null },
): Promise<NutritionPlan>;
// Escribe pdfDesignId/pdfDesignRevision = design?.id ?? null / design?.revision ?? null en el MISMO update.
// La FK compuesta (pdfDesignId, tenantId) rechaza un diseño de otro consultorio (P2003 → error, nada se escribe).

export function getPlanPdfDesignInfo(t: TenantRef, planId: string): Promise<{
  last: { id: string; name: string; revision: number } | null;     // plan.pdfDesign (por FK, mismo tenant)
  lastRevision: number | null;                                     // plan.pdfDesignRevision
  current: { id: string; name: string; revision: number } | null;  // getDefaultDocumentDesign(t, "PLAN") sin content
} | null>;  // null si el plan no es del consultorio
```

`savePlanPdf` sin `design` sigue funcionando igual (escribe `null`, = legacy). Consumidores: web
(`plan-pdf-generation.ts`). El bot no lo usa.

### 6.3 `packages/db/media/design-image.ts` (nuevo, sharp)

Subpath `"./media/design-image": "./media/design-image.ts"`. Sin `server-only` (como `recipe-photo.ts`).

```ts
export class InvalidDesignImageError extends Error {}
/** PNG→PNG (compressionLevel 9), JPEG→JPEG (quality 88, mozjpeg), .rotate() por EXIF, sin metadatos,
 *  lado mayor ≤ 3000 px (resize "inside", sin agrandar), limitInputPixels 50_000_000, failOn "error".
 *  Si la salida pasa de 2 MB o sharp no puede leerla → InvalidDesignImageError. */
export function normalizeDesignImage(input: Buffer, mimeType: "image/png" | "image/jpeg"):
  Promise<{ data: Buffer; mimeType: "image/png" | "image/jpeg"; width: number; height: number }>;
```

Normalizar en la subida es lo que hace que una imagen guardada no pueda estar corrupta al renderizar
(P11) y que no se guarden metadatos (EXIF/GPS).

## 7. Render del PDF con diseño · `apps/web` (032a-1)

### 7.1 Archivos

```
apps/web/src/lib/document-design/
  render-plan-design.tsx    server-only: DesignedPlanDocument + renderDesignedPlanPdf
  pdf-blocks.tsx            un componente react-pdf por tipo de bloque (sin server-only: lo usan tests)
  pdf-fonts.ts              registro de familias (Inter de pdf-common + OFL)
  design-branding.ts        server-only: loadDesignBranding(t)
  sample-plan.ts            SAMPLE_PLAN_INPUT / SAMPLE_LONG_PLAN_INPUT (sin server-only: lo usa el lienzo)
  design-render-error.ts    DesignRenderError
apps/web/src/lib/pdf-render-queue.ts
apps/web/src/lib/plan-pdf-text.ts       textos de ítems compartidos con el legacy
apps/web/src/lib/plan-pdf-generation.ts server-only: generatePlanPdf (sale de actions.ts)
```

### 7.2 Entradas

```ts
// plan-pdf-text.ts (pura; plan-pdf.tsx pasa a usarla SIN cambiar su salida)
export function planItemLabel(item: MealItemView): string;              // foodName ?? customLabel ?? "—"
export function planItemQuantityText(item: MealItemView): string;       // measureWithGramsText(...) | "<g> g" | ""
export function planRecipeDetailText(recipe: RecipeItemView): string;   // "porción · Fuente: X"

// render-plan-design.tsx
export type DesignBranding = {
  professional: { title: string | null; name: string; licenseNumber: string | null };
  logo: PdfImage | null;               // solo PNG/JPG (isPdfDrawableImageMime)
  signature: PdfImage | null;          // dato sensible: solo hacia el PDF
  accentColor: string | null;          // /ajustes
  footerText: string | null;           // /ajustes
  timeZone: string;                    // Professional.timezone
};
export type DesignedPlanPdfInput = Omit<PlanPdfInput, "professionalName" | "logo" | "accentColor" | "footerText"> & {
  issuedAt: Date;
};
export type DesignAssets = Map<string, { data: Buffer; mimeType: string; width: number; height: number }>;

export function DesignedPlanDocument(props: { design: DocumentDesignV1; input: DesignedPlanPdfInput;
  branding: DesignBranding; assets: DesignAssets }): JSX.Element;
/** Lanza DesignRenderError si el diseño no se puede renderizar (sección 7.6). */
export function renderDesignedPlanPdf(design: unknown, input: DesignedPlanPdfInput,
  branding: DesignBranding, assets: DesignAssets): Promise<Buffer>;

// design-branding.ts — usa getProfessionalPdfAssets(t) + getTenantProfessional(t.tenantId).timezone
export function loadDesignBranding(t: TenantRef): Promise<DesignBranding>;
```

### 7.3 Reglas de dibujo (las mismas que tiene que aproximar el lienzo HTML)

- **Página:** `size="A4"`, `padding` = `marginsPt`, `paddingBottom = margins.bottom +
  (footer.blocks.length ? 36 : 0)`, `fontFamily` = fuente de cuerpo, `fontSize = baseSizePt`, color
  `pdfColors.text`. `lineHeight: 1.45` va en un `View` de contenido, **nunca** en `<Page>` (nota de
  `pdf-common.tsx`: rompe el pie `fixed`). Metadatos: `title` = título del plan, `author` =
  `professionalDisplayName`.
- **Acento:** `theme.accent === "settings"` → `branding.accentColor || DEFAULT_PDF_ACCENT`; si no, el
  hex del tema. `resolveDesignColor` para cada color.
- **Cabecera:** si no hay bloques ni `accentRule`, no se dibuja. `View` en el flujo, `fixed` solo si
  `repeat === "everyPage"` (P7). Fila `justifyContent: "space-between"`, `alignItems: "center"`; con un
  solo bloque, se alinea por su `align`. `background !== "none"` → borde a borde con márgenes
  negativos y `padding` igual al margen (P8). `accentRule` → línea de 2 pt del acento, `marginTop: 14`.
- **Pie:** `View fixed` absoluto, `left/right = margins`, `bottom = margins.bottom`, fila
  space-between, `topRule` → borde superior 0,5 pt `pdfColors.border`; textos con `maxLines={2}` (P9).
  `footerText`: `branding.footerText` o, si falta, `Generado el ${formatIssueDate(short)}` (sin
  "NutriBot", N2). `pageNumber`: `render={({ pageNumber, totalPages }) => pageNumberText(...)}`.
- **Bloques de cuerpo:** en orden; `marginTopPt` donde exista.
  - `planTitle`: título del plan, fuente de títulos. `patientName`: `${label} ${patientName}` (label
    vacío → solo nombre). `issueDate`: `${label} ${formatIssueDate(input.issuedAt, format, timeZone)}`.
  - `meals`: misma lógica que el legacy (plan semanal: primero `EVERY_DAY` con " · Todos los días",
    después `PER_DAY` por día, días sin ítems omitidos; "Elegí una:" en opciones). Textos de ítems con
    `plan-pdf-text.ts` (paridad exacta, escenario "El diseño no altera los datos"). Cada fila
    `wrap={false}`. El título de la comida es un `View fixed` dentro del `View` de la comida → se repite
    si la comida cruza de página (P5), sin " · continúa" (Q9). Comida `EVERY_DAY` con ≤ 15 ítems:
    `wrap={false}` como el legacy; con más, se parte entre filas. Días `PER_DAY`: `wrap={false}`.
    `showQuantities: false` → sin columna de cantidad; `showNotes: false` → sin notas de ítem;
    `showTotals` → caja de totales del legacy con `computeWeeklyTotals` + `formatMacrosLine`
    ("Promedio diario" / "Total del plan"), nunca recalculados. `mealTitleStyle`: `bar` (marca 3 × 12
    pt del acento, como el legacy), `underline` (borde inferior 1 pt del acento), `plain`.
  - `planSections`: `selectPlanSections`; vacío → `ifMissing` (`hide` = nada; `showUnavailable` =
    "No disponible"). Título con `minPresenceAhead={40}`; cuerpo partible.
  - `planNotes`: si no hay notas → `ifMissing`.
  - `professional`: `professionalBlockLines`; sin matrícula y `showLicense` → `ifMissing`.
  - `signature`: con imagen → imagen (máx. 180 × 45 pt, `contain`), línea, nombre y matrícula
    (`showLicense`), `wrap={false}`, alineado por `align` (mismas medidas que `PdfSignatureBlock`); sin
    imagen → `hide`: nada; `showUnavailable`: línea + aclaración sin imagen.
  - `logo`: sin logo → nada. `image`: `src={{ data, format: "png" | "jpg" }}` (no data URL), ancho =
    `widthPct`% del ancho útil, alto = ancho × alto/ancho guardados, `wrap={false}`.
  - `text`: `<Text>` con estilos del bloque; `background`/`border`/`padding` en un `View`.
  - `divider`: `View` de alto `thicknessPt`. `spacer`: `View` de alto `heightPt`.
- Ningún bloque lee datos que no estén en `input`/`branding`/`assets`. Nada de red.

### 7.4 Fuentes (`pdf-fonts.ts`, D9 / Q5)

Archivos `.woff` latin (react-pdf no lee woff2) en `apps/web/public/fonts/`, de `@fontsource/*` v5
(OFL-1.1) bajados con `npm pack` **en una carpeta temporal** (no se agrega la dependencia):
`lora-latin-{400,500,600}-normal.woff`, `nunito-latin-{400,500,600}-normal.woff`,
`merriweather-latin-{400,700}-normal.woff`, más `public/fonts/OFL-lora.txt`, `OFL-nunito.txt`,
`OFL-merriweather.txt`. Pesos: `regular/medium/bold` → Inter/Lora/Nunito 400/500/600; Merriweather
400/400/700. Registro una sola vez, perezoso, con las familias `NumaLora`, `NumaNunito`,
`NumaMerriweather`; si falta un archivo → `Helvetica` (como `pdf-common`). Inter: `FONT_FAMILY` de
`pdf-common.tsx` (no se registra dos veces).

### 7.5 Cola de render (`lib/pdf-render-queue.ts`, server-only)

```ts
export class PdfRenderBusyError extends Error {}
export const PDF_RENDER_LIMITS = { concurrent: 1, waiting: 4, waitTimeoutMs: 20_000 } as const;
export function runPdfRender<T>(job: () => Promise<T>): Promise<T>;
```

Semáforo por proceso. Cola llena o espera > 20 s → `PdfRenderBusyError` (UI: `DESIGN_TEXT.renderBusy`).
El render en sí no se puede cortar (layout síncrono, P4): el límite es de espera, no de ejecución.
Lo usan la generación del plan (diseño **y** legacy) y la vista previa. El informe antropométrico no
cambia.

### 7.6 Fallo de render (`DesignRenderError`)

`renderDesignedPlanPdf` lanza `DesignRenderError(reason)` con `reason` ∈ `"content_invalid"`
(`parseDocumentDesign` no ok), `"asset_missing"` (un `assetId` sin fila del tenant en `assets`),
`"asset_unreadable"` (mime no PNG/JPEG, magic bytes o `readImageDimensions` no coinciden con lo
guardado), `"render_exception"` (excepción de react-pdf). Las tres primeras se chequean **antes** de
renderizar (react-pdf no avisa de imágenes rotas, P11). Log: `console.error("[design] render_failed
reason=<r> designId=<id> planId=<id>")`, sin PII.

### 7.7 Generación del plan (`lib/plan-pdf-generation.ts`, server-only)

```ts
export type PlanPdfGenerationResult =
  | { ok: true; designName: string | null }
  | { ok: false; code: "design_render_failed"; designName: string; error: string }  // DESIGN_TEXT.renderFailed(name)
  | { ok: false; code: "busy"; error: string }
  | { ok: false; code: "error"; error: string };

export function generatePlanPdf(t: TenantRef, planId: string, opts?: { useLegacy?: boolean }):
  Promise<PlanPdfGenerationResult & { patient?: { phone: string } }>;
```

Flujo: `getPlan(t, planId)` (null → `error` "Plan no encontrado") → si `!useLegacy`,
`getDefaultDocumentDesign(t, "PLAN")` → **con diseño:** `loadDesignBranding(t)`,
`getDocumentAssetsForRender(t, collectDesignAssetIds(parsed))`, `runPdfRender(() =>
renderDesignedPlanPdf(...))`; `DesignRenderError` → `design_render_failed` **sin llamar a
`savePlanPdf`** (el PDF anterior queda intacto); ok → `savePlanPdf(t, planId, { data, fileName, design:
{ id, revision } })`. **Sin diseño o `useLegacy`:** exactamente el `buildAndSavePdf` de hoy (mismas
entradas a `renderPlanPdf`: `professionalName: pro.name`, logo de `logoRow` sin filtrar, `Intl`
`dateStyle: "medium"`), envuelto en `runPdfRender`, y `savePlanPdf(..., design: null)`. El diseño a
usar **siempre** sale del servidor (predeterminado del tenant de la sesión); ninguna acción recibe un
`designId` para generar.

`planes/[planId]/actions.ts`: `buildAndSavePdf` se reemplaza por `generatePlanPdf`;
`generatePlanPdfAction(planId: string, opts?: { useLegacy?: boolean })` y
`sendPlanWhatsAppAction(planId: string, opts?: { useLegacy?: boolean })` devuelven
`PlanPdfGenerationResult` (la segunda solo encola si `ok`). `requireTenantContext("write")` igual que hoy.

### 7.8 Página del plan (032a-1; frames `11:3757`, `11:3943`, `11:4138`, `11:4350`)

`planes/[planId]/page.tsx` llama `getPlanPdfDesignInfo(ctx, planId)` y pasa a `PlanPdfActions` un
prop nuevo:

```ts
design: {
  current: { name: string } | null;               // predeterminado actual
  lastName: string | null;                         // diseño del último PDF
  status: "none" | "upToDate" | "designChanged";   // planPdfDesignStatus
}
```

`plan-pdf-actions.tsx`: con `current` → línea `Diseño: <name> · Cambiar` (link a `/plantillas/disenos`);
línea de último PDF `lastPdfLine` (con `· Diseño: <lastName>` solo si `lastName`); `designChanged` →
aviso `El diseño cambió desde el último PDF` + botón `Volver a generar` (= generar); resultado
`design_render_failed` → mensaje `renderFailed(name)` (en `FormError`) + botón `Generar con Clásico`
que repite **la misma acción que falló** con `{ useLegacy: true }` (si falló "Enviar", genera con
Clásico y envía, Q7); `busy` → `renderBusy`. Sin predeterminado y sin PDF con diseño: la tarjeta se
ve igual que hoy (frame `11:3757`).

## 8. Galería, editor y vista previa · `apps/web` (032a-2)

### 8.1 Rutas y pantallas (skill ui: vista → estructura → componentes)

| Vista (frame) | Ruta / archivo | Estructura | Componentes clave |
|---|---|---|---|
| Pestañas Plantillas | `plantillas/plantillas-tabs.tsx` (nuevo) + 1 línea en `plantillas/page.tsx` | Links "Planes" (`/plantillas`) y "Diseños de PDF" (`/plantillas/disenos`) con `aria-current` | `SegmentedControl` o `Tabs` de `primitives` como links |
| 1a Galería vacía (`7:49`) / 1b con diseños (`7:333`) | `plantillas/disenos/page.tsx` (RSC, `requirePageContext`) + `gallery.tsx` (client) | `PageHeader` "Plantillas" + pestañas; grilla de tarjetas; "Clásico" primero | `Card`, `Badge` (`Del sistema · solo lectura`, `Predeterminado`), `MoreActionsMenu` (Abrir, Duplicar, Renombrar, Marcar como predeterminado, Archivar), `EmptyState` con `emptyGallery` + `Nuevo diseño` / `Duplicar Clásico`, `DesignThumbnail` |
| Tarjeta Clásico | idem | Acciones: `Vista previa`, `Duplicar` (sin editar ni archivar) | `PreviewDialog` con `{ system: "classic" }` |
| 1c Nuevo diseño (`7:924`) | `new-design-dialog.tsx` | Nombre + "En blanco" / "Copia de Clásico" | `Modal`/`Dialog`, `Field`, `Input`, `RadioGroup`, `FormError(nameInvalid)` |
| 1d Archivar predeterminado (`7:1210`) | `useConfirm` con `archiveDefault` | Botón no rojo (se puede restaurar) | `ConfirmProvider` existente |
| 1e Archivados (`7:1696`) | `?vista=archivados` en la misma página | Lista con `Restaurar` | `Card`, `Button` |
| 1f Renombrar (`7:1864`) | `rename-design-dialog.tsx` | Nombre + error | `Dialog`, `FormError(nameInvalid)` |
| 2a–2c Editor (`9:2092`, `9:2619`, `9:3141`) | `plantillas/disenos/[id]/page.tsx` (RSC) → `components/document-designer/designer-shell.tsx` (client) | Pantalla completa sobre el panel (`fixed inset-0 z-40 bg-background`, N6): barra superior; panel izquierdo; lienzo A4; panel derecho | ver 8.3 |
| 3a Cambios sin guardar (`10:2092`) | `unsaved-guard.ts` + `useConfirm` | `unsavedTitle` / `leave` / `stay` | `beforeunload` + botón Volver + `popstate` (centinela en el historial al quedar sucio) |
| 3b Conflicto (`10:2399`) | `conflict-dialog.tsx` | `conflict` / `reload` / `saveAsCopy` | `AlertDialog` |
| 3c Imagen inválida (`10:2728`) | `image-library.tsx` | Zona de soltar rechazada + toast `imageInvalid` | `notify.error` |
| 3d Error al guardar (`10:3036`) | `designer-topbar.tsx` | `saveFailed` sin perder lo editado | `notify.error` |
| 3e Cargando (`10:3339`) | `plantillas/disenos/[id]/loading.tsx`, `plantillas/disenos/loading.tsx` | Esqueleto de 3 paneles / grilla | `skeletons.tsx` |
| 4a/4b Vista previa (`11:2927`, `11:3442`) | `preview-dialog.tsx` | Modal con `<iframe>` de un blob URL del PDF; mientras, `previewLoading` | `Modal`, `URL.createObjectURL`, revocar al cerrar |
| 6a–6c Móvil 390 (`13:3998`, `13:4446`, `13:4573`) | mismas rutas | < 1024 px: galería en una columna sin "Nuevo diseño" (N7: duplicar, renombrar, predeterminado y archivar sí); editor → `smallScreen` + botón "Vista previa" que abre el PDF en pestaña nueva (Q2) | `useMediaQuery` / clases `lg:` |

`notFound()` para id inexistente **o** de otro consultorio (mismo resultado). Diseño archivado →
`redirect("/plantillas/disenos?vista=archivados")`.

### 8.2 Server actions · `apps/web/src/app/(panel)/plantillas/disenos/actions.ts` (`"use server"`)

Todas empiezan con `requireTenantContext("write")` (D6: OWNER y STAFF), salvo
`previewDocumentDesignAction` (`"read"`). Entradas validadas con Zod **sin** `.strict()` en el
envoltorio (un `tenantId` en el cuerpo se descarta, escenario "El cliente no elige el consultorio");
el `content` se valida con el contrato estricto de core. Errores de dominio → textos de `DESIGN_TEXT`;
`not_found` → `{ ok: false, code: "not_found" }` idéntico para inexistente y ajeno. `revalidatePath("/plantillas/disenos")`
donde cambie la galería.

```ts
type R<T = {}> = ({ ok: true } & T) | { ok: false; code: "invalid" | "not_found" | "conflict" | "limit" | "busy" | "error"; error: string };

createDocumentDesignAction(input: { name: string; start: "blank" | "classic" }): Promise<R<{ id: string }>>;   // classic: content = CLASSIC_PLAN_DESIGN, origin SYSTEM_COPY
duplicateClassicAction(): Promise<R<{ id: string }>>;                                                    // nombre copyDesignName("Clásico", existentes) = "Clásico (copia)"
duplicateDocumentDesignAction(id: string): Promise<R<{ id: string }>>;
renameDocumentDesignAction(input: { id: string; name: string }): Promise<R<{ revision: number }>>;
archiveDocumentDesignAction(id: string): Promise<R<{ wasDefault: boolean }>>;
restoreDocumentDesignAction(id: string): Promise<R>;
setDefaultDocumentDesignAction(id: string): Promise<R>;
saveDocumentDesignAction(input: { id: string; expectedRevision: number; name: string; content: unknown }): Promise<R<{ revision: number }>>;
saveDocumentDesignAsCopyAction(input: { sourceId: string; name: string; content: unknown }): Promise<R<{ id: string }>>; // nombre copyDesignName(name, …), origin DESIGN_COPY
previewDocumentDesignAction(input: { content: unknown } | { system: "classic" }): Promise<R<{ pdfBase64: string }>>;
uploadDocumentAssetAction(formData: FormData /* "file" */): Promise<R<{ asset: { id: string; width: number; height: number } }>>;
deleteDocumentAssetAction(id: string): Promise<R>;
```

- `previewDocumentDesignAction`: `parseDocumentDesign` → (no ok → `invalid`); assets del tenant por
  `collectDesignAssetIds` (falta alguno → `invalid`); `loadDesignBranding(ctx)`;
  `runPdfRender(() => renderDesignedPlanPdf(design, { ...SAMPLE_PLAN_INPUT, issuedAt: new Date() }, branding, assets))`.
  **Nunca** lee pacientes ni planes. Devuelve base64 (el request lleva solo el JSON ≤ 128 KB).
- `uploadDocumentAssetAction`: `designImageSizeError(file.size)` antes de leer; `validateDesignImage`
  (magic bytes: SVG, PDF renombrado, WebP → `imageInvalid`); `normalizeDesignImage`
  (`InvalidDesignImageError` → `imageInvalid`); `createDocumentAsset`. Cuota → `assetQuota`. Nunca se
  guarda nada si falla un paso.
- `deleteDocumentAssetAction`: `asset_in_use` → `assetInUse`.

### 8.3 Editor (`apps/web/src/components/document-designer/`)

```
designer-shell.tsx       client; useReducer(editorReducer); DndContext; atajos; guardas
designer-topbar.tsx      Volver · nombre editable (Input, valida 1..80) · estado · Deshacer · Rehacer · zoom (50–200 %, "Ajustar" = inicial, N12) · Vista previa · Guardar
block-library.tsx        panel izquierdo: "Del plan" / "Contenido" / "Cabecera y pie" / "Imágenes" (DESIGN_BLOCK_CATALOG); agregar con clic (al final de la zona válida) o arrastrando
image-library.tsx        subir (input file + soltar), miniaturas /api/disenos/imagenes/<id>, "Eliminar"
design-canvas.tsx        hoja A4 (595 × 842 px × zoom, crece si el contenido es más largo), márgenes visibles, zonas cabecera/cuerpo/pie; SortableContext por zona
canvas-blocks.tsx        render HTML de cada bloque con SAMPLE_PLAN_INPUT y la marca del consultorio; SIN hooks (lo usa la miniatura en RSC)
block-chrome.tsx         selección, manija, acciones: Mover arriba, Mover abajo, Duplicar, Eliminar (botones con aria-label)
block-properties.tsx     panel derecho: props del bloque seleccionado (controles por tipo; "Si no hay dato": Ocultar / Mostrar "No disponible")
document-properties.tsx  sin selección: márgenes, acento (de /ajustes o propio), tipografía de títulos y de texto, tamaño base, cabecera (repetir, fondo, línea de acento), pie (línea)
preview-dialog.tsx       vista previa (8.1)
conflict-dialog.tsx      3b
design-thumbnail.tsx     canvas-blocks escalado (≈ 0,3), solo la primera hoja, pointer-events none (N11: en vivo, en HTML, sin CPU de PDF)
designer-fonts.css       @font-face de las mismas .woff de public/fonts (lienzo = mismas fuentes que el PDF)
```

Estado puro en `apps/web/src/lib/document-design/editor-state.ts` (sin React, con tests):

```ts
export type EditorState = {
  doc: DocumentDesignV1; name: string;
  selected: { zone: DesignZone; id: string } | null;
  past: { doc: DocumentDesignV1; name: string }[]; future: { doc: DocumentDesignV1; name: string }[];  // tope 100
  savedRevision: number; savedSnapshot: string;   // JSON de lo guardado → dirty = snapshot !== JSON actual
  coalesceKey: string | null; coalesceAt: number;
};
export type EditorAction =
  | { type: "addBlock"; zone: DesignZone; block: DesignBlock; index?: number }
  | { type: "moveBlock"; zone: DesignZone; from: number; to: number }
  | { type: "moveBlockBy"; id: string; delta: -1 | 1 }
  | { type: "duplicateBlock"; id: string; newId: string }
  | { type: "removeBlock"; id: string }
  | { type: "updateBlock"; id: string; patch: Partial<DesignBlock>; coalesceKey?: string; now: number }
  | { type: "updateDocument"; patch: DeepPartial<Omit<DocumentDesignV1, "header" | "body" | "footer">> & { header?: ...; footer?: ... }; coalesceKey?: string; now: number }
  | { type: "rename"; name: string; now: number }
  | { type: "select"; target: { zone: DesignZone; id: string } | null }
  | { type: "undo" } | { type: "redo" }
  | { type: "markSaved"; revision: number }
  | { type: "reset"; doc: DocumentDesignV1; name: string; revision: number };
export function editorReducer(s: EditorState, a: EditorAction): EditorState;
export function isDirty(s: EditorState): boolean;
export function moveAnnouncement(label: string, position: number, total: number): string; // "Título del plan: posición 2 de 5."
```

Reglas: `addBlock` rechaza (no-op) si `!canPlaceBlock` o se supera el tope de la zona; cambios de
texto con el mismo `coalesceKey` dentro de 500 ms son **una** entrada de historial; `select` no entra al
historial. Atajos: Cmd/Ctrl+Z = deshacer, Cmd/Ctrl+Shift+Z (y Ctrl+Y) = rehacer, salvo con el foco en
`input`/`textarea` (ahí rige el deshacer nativo del campo); Supr/Retroceso con un bloque seleccionado y
foco en el lienzo = eliminar. Accesibilidad: cada bloque es un elemento enfocable (`role="button"`,
`aria-roledescription="bloque"`, `aria-label` = label del catálogo); `KeyboardSensor` +
`sortableKeyboardCoordinates`; `announcements` de dnd-kit en castellano; "Mover arriba/abajo" anuncia
con una región `aria-live="polite"` (`moveAnnouncement`).

Guardado: `saveDocumentDesignAction({ id, expectedRevision: savedRevision, name, content: doc })` →
ok → `markSaved` + `notify.saved(DESIGN_TEXT.saved)`; `conflict` → `ConflictDialog` (Recargar =
`router.refresh()` + `reset` con lo del servidor; Guardar como copia =
`saveDocumentDesignAsCopyAction` → `router.push` al nuevo id); `invalid` → `invalidContent`; otro →
`saveFailed` (el estado local no se toca). Estado de la barra: `Guardando…` mientras corre.

Página `[id]/page.tsx` (RSC, `requirePageContext`): `getDocumentDesign(ctx, id)` (null → `notFound()`;
`contentError` → no abre el editor ni lo reemplaza por uno en blanco: muestra `invalidContent` con "Volver"),
`listDocumentAssets(ctx)`, y para el lienzo `{ name, title, licenseNumber, accentColor, footerText,
hasLogo, hasSignature }` de la profesional (sin bytes de firma; el lienzo dibuja un marcador "Firma").

### 8.4 Imágenes: ruta `apps/web/src/app/api/disenos/imagenes/[assetId]/route.ts`

`GET`, `dynamic = "force-dynamic"`, `getTenantContext()` (null → 401), `getDocumentAssetBytes(ctx,
assetId)` (null → 404 idéntico para inexistente y ajeno), headers `Content-Type` = mime guardado,
`Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src
'none'`. Mismo patrón que `api/recetas/fotos/[photoId]/route.ts`. Cubierto por `guard-coverage.test.ts`
(no hace falta tocarlo: lee `getTenantContext(`).

## 9. Mensajes del bot

Ninguno nuevo ni cambiado. `PLAN_PDF` ("📄 Te comparto tu plan alimentario actualizado.") sigue
igual y el bot sigue mandando `plan.pdfData` al despachar (D12). El portal no cambia (HU-033).

## 10. Seguridad y aislamiento (trazado a escenarios)

| Escenario | Barrera |
|---|---|
| B pide listar/abrir/duplicar/guardar/archivar/predeterminar un diseño de A, o una imagen de A | Todo `where` con `tenantId` de la sesión; `not_found` / `null` / 404 / `notFound()` iguales a inexistente |
| B guarda un diseño propio con la imagen de A | `findMany({ id in, tenantId })` incompleto → `invalid` antes de escribir; FK compuesta `DocumentDesignAsset(assetId, tenantId)` como segunda barrera |
| Plan de A con diseño de B | El diseño sale de `getDefaultDocumentDesign(ctx)`; ninguna acción recibe `designId` para generar; FK compuesta `NutritionPlan(pdfDesignId, tenantId)` |
| `tenantId` en el cuerpo | Envoltorios Zod sin `.strict()` lo descartan; el dominio recibe `ctx` |
| Contenido inválido / URL / versión / tamaño | `parseDocumentDesignForSave` (estricto, sin URLs, tope 128 KB) en la acción **y** en el dominio; CHECK de 256 KB en la base |
| Sin sesión | `requireTenantContext` / `getTenantContext` + middleware; `guard-coverage.test.ts` |
| Vista previa sin pacientes | `previewDocumentDesignAction` usa solo `SAMPLE_PLAN_INPUT` (test con mocks: ningún `getPlan`/`patient.*`) |
| SVG / PDF renombrado / > 2 MB | magic bytes + tamaño en core; sharp re-codifica y quita metadatos |
| Logs | Solo ids y códigos (`[design] …`); nunca contenido, nombres ni bytes |

## 11. Archivos y flujo (radio de impacto)

**032a-1**

| Archivo | Cambio |
|---|---|
| `packages/core/package.json` | `exports["./document-design"]`, dependencia `zod` |
| `packages/core/src/document-design/*.ts` (+ tests) | nuevos (5.1–5.6) |
| `packages/db/prisma/schema.prisma` | 3 enums, 3 modelos, relaciones en `Tenant`, 3 campos en `NutritionPlan` |
| `packages/db/prisma/migrations/<ts>_document_designs/migration.sql` | nueva (4.2) |
| `packages/db/package.json` | `exports["./domain/documentDesigns"]`, `exports["./media/design-image"]`, script `test:design-tenants` |
| `packages/db/domain/documentDesigns.ts` (+ `.test.ts`) | nuevo |
| `packages/db/domain/nutritionPlans.ts` / `plans-tenant.test.ts` | `savePlanPdf(design?)`, `getPlanPdfDesignInfo` + tests |
| `packages/db/media/design-image.ts` | nuevo |
| `packages/db/scripts/document-designs-per-tenant.integration.ts`, `test-document-designs-per-tenant.sh` | probe Postgres descartable |
| `apps/web/src/lib/plan-pdf-text.ts` (+ test) | nuevo; `plan-pdf.tsx` lo usa (salida idéntica) |
| `apps/web/src/lib/document-design/{render-plan-design.tsx, pdf-blocks.tsx, pdf-fonts.ts, design-branding.ts, sample-plan.ts, design-render-error.ts}` (+ tests) | nuevos |
| `apps/web/src/lib/pdf-render-queue.ts` (+ test) | nuevo |
| `apps/web/src/lib/plan-pdf-generation.ts` (+ test) | nuevo (`buildAndSavePdf` se muda acá) |
| `apps/web/public/fonts/{lora,nunito,merriweather}-latin-*.woff`, `OFL-*.txt` | nuevos |
| `apps/web/src/app/(panel)/pacientes/[id]/planes/[planId]/actions.ts` | usa `generatePlanPdf`; firmas con `opts?` |
| `…/[planId]/page.tsx`, `…/[planId]/plan-pdf-actions.tsx` | prop `design`, líneas y botones de 7.8 |
| `apps/bot/**` | sin cambios (solo typecheck) |

**032a-2**

| Archivo | Cambio |
|---|---|
| `apps/web/package.json` | `@dnd-kit/core@6.3.1`, `@dnd-kit/sortable@10.0.0`, `@dnd-kit/utilities@3.2.2` |
| `apps/web/src/app/(panel)/plantillas/page.tsx` | + `<PlantillasTabs active="planes" />` (1 línea) |
| `apps/web/src/app/(panel)/plantillas/plantillas-tabs.tsx` | nuevo |
| `apps/web/src/app/(panel)/plantillas/disenos/{page,loading,gallery,new-design-dialog,rename-design-dialog,actions}.tsx/ts` (+ `actions.test.ts`) | nuevos |
| `apps/web/src/app/(panel)/plantillas/disenos/[id]/{page,loading}.tsx` | nuevos |
| `apps/web/src/components/document-designer/*` | nuevos (8.3) |
| `apps/web/src/lib/document-design/editor-state.ts` (+ test) | nuevo |
| `apps/web/src/app/api/disenos/imagenes/[assetId]/route.ts` (+ test) | nuevo |

## 12. Checklist atómico

### 032a-1 · packages/core
- [ ] `npm i zod@^3.24.1 --workspace packages/core`; `exports["./document-design"]`.
- [ ] `contract.ts`: esquemas Zod v1 estrictos, tipos inferidos, `DOCUMENT_DESIGN_LIMITS`, ids únicos, tope de bytes.
- [ ] `text.ts`: `DESIGN_TEXT` (tabla 5.2, textos exactos).
- [ ] `migrate.ts`: `parseDocumentDesign`, `parseDocumentDesignForSave`, `migrateDocumentDesign`, `validateDesignName`.
- [ ] `catalog.ts`: catálogo, `canPlaceBlock`, `createBlock`, `blankPlanDesign`.
- [ ] `classic.ts`: `CLASSIC_PLAN_DESIGN` congelado; test: parsea con el esquema.
- [ ] `helpers.ts` e `image.ts` (5.6) con tests.
- [ ] `npx vitest run packages/core/src/document-design` verde.

### 032a-1 · packages/db (esquema y migración) — solo con el turno (sección 2)
- [ ] `git fetch && git rebase origin/develop`; confirmar migraciones de 028c y 029b presentes; si no → `blocked`.
- [ ] Backup `pg_dump` fuera del repo.
- [ ] Editar `schema.prisma` (4.1).
- [ ] `migrate dev --create-only --name document_designs`; revisar SQL (solo aditivo); agregar el bloque SQL de 4.2.
- [ ] `npm run db:migrate`; `npm run db:generate`; `npx prisma migrate status` sin drift.

### 032a-1 · packages/db (dominio)
- [ ] `media/design-image.ts` + export.
- [ ] `domain/documentDesigns.ts` (6.1) + export de subpath (no en `index.ts`).
- [ ] `nutritionPlans.ts`: `savePlanPdf(design?)`, `getPlanPdfDesignInfo`.
- [ ] Tests con mocks (13.2).
- [ ] Probe de dos consultorios en Postgres descartable (13.3) + script `test:design-tenants`.

### 032a-1 · apps/web
- [ ] `plan-pdf-text.ts`; `plan-pdf.tsx` lo usa; `plan-pdf.test.tsx` sigue verde sin cambios de expectativas.
- [ ] Fuentes OFL en `public/fonts` (7.4) + `pdf-fonts.ts`.
- [ ] `sample-plan.ts` (A6).
- [ ] `pdf-blocks.tsx`, `render-plan-design.tsx`, `design-render-error.ts`, `design-branding.ts`.
- [ ] `pdf-render-queue.ts`.
- [ ] `plan-pdf-generation.ts`; `actions.ts` del plan lo usa.
- [ ] `page.tsx` + `plan-pdf-actions.tsx` del plan (7.8).
- [ ] Tests web (13.4).

### 032a-1 · apps/bot
- [ ] Sin cambios; `npm run typecheck` incluye `apps/bot`.

### 032a-1 · cierre
- [ ] Verificación 14 completa; `progress/impl_HU-032a-1.md` con números de la medición local (y del VPS si Joel la corrió).

### 032a-2 · apps/web
- [ ] Spike dnd-kit (A7.1) en una rama/carpeta descartable; resultado en `progress/impl_HU-032a-2.md`.
- [ ] `npm i @dnd-kit/core@6.3.1 @dnd-kit/sortable@10.0.0 @dnd-kit/utilities@3.2.2 --workspace apps/web`.
- [ ] `editor-state.ts` + tests (antes de la UI).
- [ ] `disenos/actions.ts` + `actions.test.ts`.
- [ ] Ruta `api/disenos/imagenes/[assetId]` + test.
- [ ] `plantillas-tabs.tsx` + línea en `plantillas/page.tsx`.
- [ ] Galería: `page.tsx`, `loading.tsx`, `gallery.tsx`, diálogos (frames 1a–1f).
- [ ] `canvas-blocks.tsx` + `design-thumbnail.tsx` (+ `designer-fonts.css`).
- [ ] Editor: shell, topbar, library, image-library, canvas, chrome, properties, document-properties (frames 2a–2c).
- [ ] Estados: sin guardar, conflicto, imagen inválida, error al guardar, cargando (frames 3a–3e).
- [ ] Vista previa (frames 4a–4b) y móvil (6a–6c).
- [ ] Verificación 14 + recorrido manual (14.3).

## 13. Tests (además de los existentes, que no cambian)

### 13.1 `packages/core` (vitest)
- `contract.test.ts`: válidos (Clásico, `blankPlanDesign()`, un diseño con cada tipo de bloque);
  inválidos con `reason` correcto: tipo de bloque desconocido; prop no permitida (`onClick`, `src`,
  `tenantId`); `image` con `assetId: "https://evil.test/x.png"`; hex inválido; `schemaVersion: 2` →
  `unsupported_version`; JSON > 128 KB → `too_large`; ids repetidos; `footerText` en el cuerpo; 4
  bloques en la cabecera; 61 en el cuerpo; caracteres de control; números fuera de rango. Un texto con
  "instagram.com/x" es válido.
- `migrate.test.ts`: con un registro falso (v1→v2 que renombra una prop y `current: 2`), un doc v1 se
  abre migrado **con los mismos bloques** y `migratedFrom: 1`; falta de paso → `unsupported_version`.
- `helpers.test.ts`: `resolveMissingText` (null/""/" " → null o "No disponible"; nunca "0");
  `professionalBlockLines` con y sin matrícula/título; `pageNumberText`; `formatIssueDate` con
  `America/Argentina/Buenos_Aires` cerca de medianoche UTC; `selectPlanSections`; `copyDesignName`
  ("Plan verde" → "Plan verde (copia)"; con copia existente → "(copia 2)"; nombre de 80 → recortado a
  80); `planPdfDesignStatus` (todas las ramas); `collectDesignAssetIds`; `resolveDesignColor`.
- `image.test.ts`: PNG/JPEG válidos con dimensiones; SVG, `%PDF` con extensión .png, WebP, vacío,
  2 MB + 1 → `imageInvalid`.
- `catalog.test.ts`: `createBlock` de cada tipo parsea; `canPlaceBlock` según 5.5.

### 13.2 `packages/db` (vitest, Prisma mockeado) — `documentDesigns.test.ts`, `plans-tenant.test.ts`
- Cada lectura/escritura lleva `tenantId` en el `where` (como `plans-tenant.test.ts`).
- `save` con `count 0` + fila existente → `conflict`; sin fila → `not_found`; contenido inválido →
  `invalid` sin llamar a `updateMany`; asset ajeno → `invalid` sin escribir.
- `setDefault` desmarca los otros en la misma transacción; reintento ante `P2002`.
- `archive` devuelve `wasDefault` y escribe `isDefault: false`; `restore` no toca `isDefault`.
- `createDocumentAsset`: dedupe por sha256 (`reused: true`), cuota 30 → `asset_quota`, toma el lock.
- `deleteDocumentAsset`: `P2003` → `asset_in_use`.
- `savePlanPdf` sin `design` escribe `pdfDesignId: null, pdfDesignRevision: null`; con `design`, los dos.

### 13.3 Probe en Postgres descartable — `test-document-designs-per-tenant.sh` + `document-designs-per-tenant.integration.ts`
Mismo patrón que `test-google-calendar-per-tenant.sh` (contenedor propio, tmpfs, puerto aleatorio,
`--pull never`, copia del schema fuera del repo, nunca el `.env`). Pasos: aplicar todas las migraciones
en una base vacía; crear tenants A y B con agenda/profesional/paciente/plan mínimos; luego:
1. A crea "Plan verde" con una imagen; B: `getDocumentDesign`/`getDocumentAssetBytes`/`duplicate`/
   `save`/`rename`/`archive`/`setDefault` por el id de A → `null`/`not_found`, y las filas de A no
   cambian (comparar `updatedAt`, `revision`).
2. B guarda un diseño propio con el `assetId` de A → `invalid`; conteo de `DocumentDesign` y
   `DocumentDesignAsset` de B sin cambios. INSERT directo en `DocumentDesignAsset` cruzado → violación
   de FK.
3. `savePlanPdf` del plan de A con `design` de B → error de FK; `pdfData` de A intacto.
4. Dos predeterminados del mismo tenant por SQL directo → violación de `DocumentDesign_default_per_tenant_kind_key`;
   archivado + predeterminado → violación del CHECK.
5. Conflicto: dos `save` con la misma `expectedRevision` → el segundo `conflict`, contenido del primero intacto.
6. Cuota: la imagen 31 → `asset_quota`; misma imagen dos veces → `reused`.
7. Borrar una imagen en uso → `asset_in_use`.
8. `prisma migrate diff --from-migrations <dir> --to-schema-datamodel <schema> --shadow-database-url <url descartable>`
   vacío salvo el índice parcial y los CHECK (esperados), igual que en 028b.

### 13.4 `apps/web` (vitest)
- `plan-pdf-text.test.ts`: mismas cadenas que hoy para alimento con gramos, medida casera
  ("1½ tazas (270 g)"), sin gramos, receta.
- `render-plan-design.test.tsx` (árbol de textos, como `plan-pdf.test.tsx`, y buffer):
  orden de bloques = orden del diseño; "Comidas del plan" con `showTotals: false` sin totales;
  paridad de cantidades con el legacy para el mismo `meals` (escenario "El diseño no altera");
  matrícula faltante → sin línea / "No disponible" según `ifMissing`, nunca "0"; firma sin imagen
  oculta; cabecera y pie presentes; `SAMPLE_LONG_PLAN_INPUT` → `%PDF-`, `MediaBox [0 0 595.28 841.89]`,
  ≥ 10 páginas (`/Type /Page` sin `s`), todos los nombres de comida e ítems presentes en el árbol;
  asset faltante / mime inválido / bytes que no coinciden → `DesignRenderError` con su `reason`
  **antes** de llamar a `renderToBuffer` (espía).
- `render-samples.test.tsx`: `it.runIf(process.env.DESIGN_PDF_SAMPLES_DIR)` escribe
  `clasico-corto.pdf`, `diseno-largo.pdf` (cabecera everyPage con fondo, imagen sintética, pie) y
  `legacy-largo.pdf` en esa carpeta (para 14.2). Sin la variable, se saltea.
- `pdf-render-queue.test.ts`: 1 en paralelo; el 6º pedido con 1 corriendo y 4 esperando →
  `PdfRenderBusyError`; timeout de espera (timers falsos); un job que falla libera el lugar.
- `plan-pdf-generation.test.ts` (mocks de dominio y renderers): sin predeterminado → `renderPlanPdf`
  con **exactamente** las entradas de hoy (`toHaveBeenCalledWith` del objeto legacy) y `savePlanPdf`
  con `design: null` (escenario "Sin diseño predeterminado"); con predeterminado →
  `renderDesignedPlanPdf` y `savePlanPdf` con `{ id, revision }`; `DesignRenderError` →
  `design_render_failed` con el texto exacto y `savePlanPdf` **no** llamado; `useLegacy` → legacy aunque
  haya predeterminado; `PdfRenderBusyError` → `busy`.
- `planes/[planId]/actions` (test existente o nuevo): `sendPlanWhatsAppAction` no encola si falla el
  diseño; con `{ useLegacy: true }` genera legacy y encola.
- `editor-state.test.ts`: escenario "Deshacer y rehacer" (3 cambios, 2 deshacer, 1 rehacer → quedan
  1º y 2º); coalescencia de tipeo; `moveBlockBy` en los bordes; `addBlock` en zona inválida = no-op;
  `isDirty` vuelve a false después de `markSaved` y tras deshacer hasta lo guardado; tope de 100.
- `disenos/actions.test.ts`: cada acción llama `requireTenantContext("write")` (preview: `"read"`) y
  pasa `ctx` al dominio; `{ ..., tenantId: "tenant-b" }` en el cuerpo → el dominio recibe el de la
  sesión; nombre "" y de 81 → `nameInvalid` sin llamar al dominio; contenido inválido → `invalidContent`;
  `not_found` idéntico para inexistente y ajeno; preview no llama `getPlan` ni nada de pacientes;
  upload SVG / PDF renombrado / 2 MB + 1 → `imageInvalid` sin llamar a `createDocumentAsset`.
- `api/disenos/imagenes/[assetId]/route.test.ts`: sin contexto 401; ajeno e inexistente → 404 igual;
  headers `nosniff` y `no-store`.
- `guard-coverage.test.ts`: sin cambios; tiene que seguir verde con los archivos nuevos.

### Trazabilidad Gherkin → prueba

| Escenario | Prueba |
|---|---|
| Galería vacía, crear desde Clásico/en blanco, duplicar/renombrar/archivar | actions.test + probe 1 + recorrido 14.3 |
| Nombre inválido | `validateDesignName` (core) + actions.test |
| Agregar/configurar/reordenar, sin mouse, cabecera y pie, texto propio | editor-state.test + render-plan-design.test + recorrido |
| Imagen propia | image.test + actions.test + probe 6 |
| Deshacer/rehacer | editor-state.test |
| Guardar y reabrir | probe (round-trip del JSON) + recorrido |
| Cambios sin guardar, conflicto | editor-state (`isDirty`) + probe 5 + actions.test + recorrido |
| Vista previa sin pacientes | actions.test (preview) |
| Dato faltante | helpers.test + render-plan-design.test |
| El diseño no altera los datos | plan-pdf-text.test + render-plan-design.test |
| Predeterminado único | probe 4 + documentDesigns.test |
| Generar con predeterminado / sin predeterminado / falla / cambiar no toca PDF | plan-pdf-generation.test + recorrido |
| Archivar el predeterminado | documentDesigns.test + recorrido |
| Plan largo | render-plan-design.test + render-samples + 14.2 (pdftotext) |
| WhatsApp y portal igual | sin cambios en bot/portal + test de `sendPlanWhatsAppAction` |
| Aislamiento, ids combinados, tenantId del cliente | probe 1–3 + actions.test + route.test |
| Contenido inválido | contract.test + documentDesigns.test |
| Versión anterior del contrato | migrate.test |
| Permisos | actions.test + guard-coverage.test |

## 14. Verificación (comandos exactos, desde la raíz del worktree)

### 14.1 Automática (032a-1 y 032a-2)
```bash
npm run db:generate
npm run typecheck                                    # core, db, web Y bot
npx vitest run packages/core/src/document-design
npx vitest run packages/db/domain/documentDesigns.test.ts packages/db/domain/plans-tenant.test.ts
npx vitest run apps/web/src/lib apps/web/src/app/\(panel\)/plantillas apps/web/src/app/\(panel\)/pacientes apps/web/src/app/api apps/web/src/guard-coverage.test.ts
npm run test                                         # suite completa
npm run test:design-tenants --workspace packages/db  # probe Postgres descartable (Docker; nunca la base de dev)
(cd packages/db && npx dotenv -e ../../.env -- prisma migrate status)   # sin drift (032a-1)
npm run build --workspace packages/core && npm run build --workspace apps/web   # standalone con rutas y fuentes nuevas
./ops/harness/verify.sh
```

### 14.2 Muestras de PDF (local, poppler)
```bash
out=$(mktemp -d); DESIGN_PDF_SAMPLES_DIR="$out" npx vitest run apps/web/src/lib/document-design/render-samples.test.tsx
for f in "$out"/*.pdf; do pdfinfo "$f" | grep -E 'Pages|Page size'; done        # A4 595.28 x 841.89
pdftotext "$out/diseno-largo.pdf" - | grep -c 'Paciente de ejemplo'               # texto seleccionable
pdftotext "$out/diseno-largo.pdf" - | grep -E '^(Desayuno|Almuerzo|Cena)' | head   # títulos repetidos al cruzar página
pdftoppm -r 50 -png "$out/diseno-largo.pdf" "$out/p"                              # revisar a ojo: nada superpuesto ni recortado
```
Anotar en `progress/impl_HU-032a-1.md` tiempos de render (corto/largo) y borrar `$out`.

### 14.3 Recorrido manual (032a-2, con `npm run dev`, datos propios de la prueba)
Crear "Plan verde (TEST)" desde Clásico y en blanco; agregar/reordenar (mouse y teclado con
VoiceOver), cabecera/pie, texto 14 negrita acento, imagen PNG; SVG y >2 MB rechazados; deshacer/
rehacer; guardar y recargar; dos pestañas → conflicto → "Guardar como copia"; vista previa; marcar
predeterminado; en un plan **de prueba** "Generar PDF" → "Último PDF: … · Diseño: Plan verde (TEST)";
editar el diseño → "El diseño cambió desde el último PDF"; archivar el predeterminado (confirmación) →
legacy; ventana de 390 px. No usar "Enviar por WhatsApp" con números reales (AGENTS.md). Al terminar,
borrar **por id** solo lo que creó la prueba (diseños, imágenes, plan de prueba), nunca con filtros amplios.

## 15. Nota de deploy

- 032a-1: migración aditiva (`prisma migrate deploy` en el deploy automático). Nada visible para
  ningún consultorio hasta 032a-2 (no hay forma de crear diseños). El bot no se redeploya por código,
  pero comparte el cliente Prisma: se despliega junto, como siempre.
- Fuentes nuevas en `public/fonts` → las copia el Dockerfile; verificar en el contenedor que
  `pdf-fonts.ts` no cae a Helvetica (log único al registrar si falta un archivo).
- Medición en el VPS (A7.2) antes de anunciar la función a otros consultorios.

## 16. Notas para 032b–032f

- **032b:** el documento emitido referencia `DocumentDesign` + `revision`; para reproducir hace falta
  guardar el `content` usado (snapshot) porque `DocumentDesign.content` se pisa. `generatePlanPdf` es
  el punto de inserción. Depende de HU-033 (portal) y HU-027.
- **032c:** nueva `schemaVersion` (2) con un paso en `DESIGN_MIGRATIONS`; Konva exige React ≥ 19.3.
- **032d:** `theme.accent: "settings"` y los bloques `logo`/`professional`/`footerText` leen
  `/ajustes`; un Brand Kit propio cambia `loadDesignBranding`, no el contrato.
- **032e:** `DocumentKind` admite nuevos valores (agregar a un enum es aditivo); el contrato gana
  `kind` y bloques; retirar `renderPlanPdf` cuando Clásico tenga paridad.

## 17. Dudas técnicas nuevas (no bloquean; la SDD aplica la recomendación salvo que el usuario diga otra cosa)

> **Resueltas (2026-11-27):** el usuario aceptó todas las recomendaciones (Q1–Q9): "acepto todas las recomendadas".

- **Q1. Cabecera de Clásico.** El legacy pone título y paciente al lado del logo; el contrato de
  bloques en fila no lo expresa sin un bloque compuesto. **Rec.:** aceptar la aproximación de 5.4
  (logo + profesional en la cabecera; título y paciente debajo). El respaldo ante fallas sigue siendo
  el legacy exacto. Comparar con el frame `4:48`.
- **Q2. Vista previa en móvil.** El frame `6b` muestra páginas apiladas con "1 / 3". Un `<iframe>`
  con PDF no funciona en Android y en iOS muestra mal. **Rec.:** en < 1024 px abrir el PDF en una
  pestaña nueva (visor del sistema, que ya pagina y numera). Alternativa: `pdfjs-dist` (Apache-2.0,
  37 MB de paquete) para dibujar páginas en el cliente.
- **Q3. Renombrar sube la revisión.** Después de renombrar el predeterminado, el plan muestra "El
  diseño cambió desde el último PDF" aunque el PDF sería igual. **Rec.:** aceptarlo (un solo contador
  hace robusta la detección de conflictos).
- **Q4. Borrar imágenes.** No está en el Gherkin, pero con cuota de 30 sin borrado el consultorio se
  traba. **Rec.:** incluir "Eliminar" para imágenes que no usa ningún diseño (activo o archivado).
- **Q5. Tipografías (N9).** El frame `9:3141` habla de "tipografías". **Rec.:** dos selectores (títulos
  y texto) de la lista cerrada; el contrato ya lo admite y "una para todo" es elegir la misma.
- **Q6. Tope de diseños.** **Rec.:** 100 por consultorio (incluye archivados) para acotar la galería y
  el peso de las miniaturas.
- **Q7. "Generar con Clásico" tras fallar "Enviar por WhatsApp".** **Rec.:** el botón repite la acción
  que falló con el legacy (genera con Clásico y envía).
- **Q8. Bloqueo del proceso (P4).** **Rec.:** render en el proceso con cola de 1 en 032a; pasar a
  `worker_threads` solo si la medición del VPS supera el umbral de A7.2.
- **Q9. "· continúa" (N5).** **Rec.:** repetir el título de la comida tal cual, sin sufijo (react-pdf
  no distingue la primera aparición de un `fixed` sin lógica extra). Comparar con el frame `11:2927`.

---

## Apéndice A · Script del PoC (reproducible, fuera del repo)

```bash
S=$(mktemp -d); cd "$S"
ln -s <repo>/node_modules node_modules
echo '{"type":"module"}' > package.json
echo '{"compilerOptions":{"jsx":"react-jsx","module":"esnext","target":"es2022","moduleResolution":"bundler"}}' > tsconfig.json
# poc.tsx: ver abajo. Uso: tsx poc.tsx short x 3 | tsx poc.tsx long norepeat 3 | tsx poc.tsx long repeat 3
./node_modules/.bin/tsx poc.tsx long repeat 3
pdfinfo out-long-repeat.pdf; pdftotext out-long-repeat.pdf - | grep -c 'HDR'
```

```tsx
import fs from "node:fs"; import path from "node:path";
import { Document, Font, Page, Text, View, renderToBuffer, Image } from "@react-pdf/renderer";
const FONT_DIR = "<repo>/apps/web/public/fonts";
Font.register({ family: "Inter", fonts: [400, 500, 600].map((w) => ({ src: path.join(FONT_DIR, `inter-latin-${w}-normal.woff`), fontWeight: w })) });
Font.registerHyphenationCallback((w) => [w]);
const DAYS = ["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado","Domingo"];
const MEALS = ["Desayuno","Colación","Almuerzo","Merienda","Colación tarde","Cena"];
const lorem = "Ñandú comió paté con azúcar y jamón; la cigüeña tocó el saxofón detrás del palenque de paja. ";
const fixture = { title: "Plan de alimentación — semana tipo", patient: "Paciente de ejemplo",
  meals: MEALS.map((m) => ({ name: m, days: DAYS.map((d) => ({ day: d, items: Array.from({ length: 6 }, (_, i) =>
    i === 3 ? { name: `Receta de ${m.toLowerCase()} con ñoquis`, qty: "" } : { name: `Alimento ${i + 1} con tilde (ácido fólico)`, qty: i % 2 ? "1½ tazas (270 g)" : "40 g" }) })) })),
  sections: Array.from({ length: 4 }, (_, i) => ({ title: `Recomendación ${i + 1}`, body: lorem.repeat(55) })) };
const img = `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==`;
function Meals({ repeat }: { repeat: boolean }) {
  return <>{fixture.meals.map((meal) => (
    <View key={meal.name} style={{ marginTop: 16 }}>
      <View fixed={repeat} style={{ flexDirection: "row", gap: 6, marginBottom: 4 }}>
        <View style={{ width: 3, height: 12, backgroundColor: "#477863" }} /><Text style={{ fontSize: 11, fontWeight: 600 }}>HDR {meal.name}</Text>
      </View>
      {meal.days.map((d) => (<View key={d.day} wrap={false} style={{ marginTop: 6 }}>
        <Text style={{ fontSize: 9.5, fontWeight: 600 }}>{d.day}</Text>
        {d.items.map((it, i) => (<View key={i} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 4, borderBottomWidth: 0.5, borderBottomColor: "#E9E9E7" }}>
          <Text style={{ flex: 1 }}>{it.name}</Text><Text style={{ width: 132, textAlign: "right" }}>{it.qty}</Text></View>))}
      </View>))}
    </View>))}</>;
}
function Doc({ long, repeat }: { long: boolean; repeat: boolean }) {
  return <Document><Page size="A4" style={{ padding: 44, paddingTop: 90, paddingBottom: 64, fontFamily: "Inter", fontSize: 10 }}>
    <View fixed style={{ position: "absolute", top: 28, left: 44, right: 44, flexDirection: "row", justifyContent: "space-between" }}>
      <Image src={img} style={{ width: 30, height: 30 }} /><Text>CABECERA Lic. Ejemplo</Text></View>
    <View style={{ lineHeight: 1.45 }}>
      <Text>Paciente: {fixture.patient}</Text><Text style={{ fontSize: 18, fontWeight: 600 }}>{fixture.title}</Text>
      {long ? <><Image src={img} style={{ width: "50%", height: 40, objectFit: "contain" }} /><Meals repeat={repeat} />
        {fixture.sections.map((s) => (<View key={s.title}><Text minPresenceAhead={40} style={{ fontWeight: 600, marginTop: 16 }}>{s.title}</Text><Text>{s.body}</Text></View>))}</> : <Text style={{ fontSize: 14 }}>¡Vamos con todo!</Text>}
    </View>
    <View fixed style={{ position: "absolute", bottom: 28, left: 44, right: 44, flexDirection: "row", justifyContent: "space-between" }}>
      <Text>PIE texto</Text><Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} /></View>
  </Page></Document>;
}
const [mode = "long", rep = "", runs = "3"] = process.argv.slice(2);
const times: number[] = []; let buf = Buffer.alloc(0); let peak = process.memoryUsage().rss;
const t = setInterval(() => (peak = Math.max(peak, process.memoryUsage().rss)), 20);
for (let r = 0; r < Number(runs); r++) { const s = performance.now(); buf = await renderToBuffer(<Doc long={mode === "long"} repeat={rep === "repeat"} />); times.push(Math.round(performance.now() - s)); }
clearInterval(t); fs.writeFileSync(`out-${mode}${rep === "repeat" ? "-repeat" : ""}.pdf`, buf);
console.log(JSON.stringify({ mode, times, bytes: buf.length, peakRssMB: Math.round(peak / 1e6) }));
```

Bloqueo del event loop: envolver con `monitorEventLoopDelay({ resolution: 10 })` y leer `h.max`.
Imagen corrupta: `Buffer.concat([PNG_MAGIC, Buffer.from("garbage".repeat(50))])` como `src` → no
lanza (P11).
