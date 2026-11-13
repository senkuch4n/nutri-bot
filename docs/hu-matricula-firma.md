# HU-016: Datos profesionales: matrícula y firma en informes, planes y portal

**Como** nutricionista (Lic. Daiana Ponce),
**quiero** cargar una sola vez mi título, mi matrícula ("Lic. Daiana Ponce · M.P. 852") y la imagen
de mi firma,
**para que** aparezcan igual en todo lo que le entrego al paciente: el informe antropométrico, el
PDF del plan alimentario y el portal.

Origen: `docs/historias-usuario-nutridesk.md`, Épica 47 ("Datos profesionales: matrícula y
firma"). Texto de la épica: "Yo como profesional necesito cargar mi título y matrícula ("Lic.
Daiana Ponce, M.P. 852") para poder mostrarlos en informes, planes y el portal." El título de la
épica dice "y firma", pero el texto no la define: ver D1.

---

## Contexto

### Qué existe hoy

**Una parte de la épica ya está hecha en la HU-007** (informe antropométrico, D1 de
`docs/hu-informe-antropometrico.md`). Esa HU dejó explícitamente fuera "la firma escaneada y el
resto de la épica 47 (matrícula en el plan y en el portal)".

| Pieza | Dónde está | Estado |
|---|---|---|
| `Professional.title` (`String?`, p. ej. "Lic.") | `packages/db/prisma/schema.prisma` | Existe (HU-007) |
| `Professional.licenseNumber` (`String?`, p. ej. "M.P. 852") | idem | Existe (HU-007) |
| `Professional.logoData` / `logoMimeType` (`Bytes?` / `String?`) | idem | Existe (anterior a la HU-007) |
| Carga de título y matrícula | `/ajustes`, pestaña **PDF**, tarjeta "Firma de los informes" (`SettingsSignatureFields` en `ajustes/settings-form.tsx`). Validación en `ajustes/actions.ts`: título máx. 20, matrícula máx. 40, vacíos → `null`. Se guardan con el formulario general (`SETTINGS_FORM_ID`). Muestra una vista previa: "Pie del informe: Lic. Daiana Ponce · M.P. 852" | Existe |
| Formato del texto | `professionalSignature()` en `packages/core/src/isak-report.ts` (con tests en `isak-report.test.ts`): "Lic. Ana Pérez · M.P. 123"; sin título, "Ana Pérez · M.P. 123"; sin matrícula, "Lic. Ana Pérez" | Existe, pero vive en el módulo del informe ISAK |
| Carga del logo | `/ajustes` → PDF → tarjeta "Logo" (`ajustes/logo-form.tsx`). `uploadLogoAction` / `removeLogoAction` en `ajustes/actions.ts`: PNG, JPG o WEBP, máx. 2 MB, se guarda en la base como bytes. Sin recorte ni redimensionado. Botón "Quitar" | Existe |
| Vista previa del logo en el panel | `GET /api/professional/logo` (`apps/web/src/app/api/professional/logo/route.ts`): exige sesión del panel (`auth()`), 401 si no hay; `Cache-Control: private` | Existe |
| Dominio del logo | `packages/db/domain/professionalAssets.ts` (`updateProfessionalLogo`, `removeProfessionalLogo`). **Ojo:** las actions de `/ajustes` no lo usan; escriben con `prisma` directo | Existe, duplicado |
| **Imagen de firma** | — | **No existe.** No hay ningún campo, ruta ni componente de firma manuscrita, firma escaneada ni firma digital (la única "firma" del código es la de los webhooks de Mercado Pago, que no tiene nada que ver) |

**Dónde se muestran hoy:**

| Lugar | Qué muestra | Archivo |
|---|---|---|
| **Informe antropométrico (PDF)** | Encabezado: logo + título del informe + nombre **sin título** a la derecha (`brandName = pro.name`). Pie fijo en cada página: `professionalSignature(...)` + "Página n de N". Sin imagen de firma | `apps/web/src/lib/anthropometric-report-pdf.tsx`, armado en `pacientes/[id]/report-actions.ts` |
| **Aviso de matrícula faltante** | En la página del informe, `Alert` "Tu matrícula no está cargada…" con botón a `/ajustes?tab=pdf`. El PDF sale igual | `antropometria/informe/page.tsx` (`licenseMissing`) y `report-editor.tsx` |
| **PDF del plan** | Encabezado: logo + nombre del plan + "Paciente: …" + **nombre sin título ni matrícula** a la derecha. Pie: `Professional.pdfFooterText` o, si está vacío, "Generado el … · NutriBot", más "n / total". **No aparece ni título ni matrícula ni firma** | `apps/web/src/lib/plan-pdf.tsx`, armado en `buildAndSavePdf` de `pacientes/[id]/planes/[planId]/actions.ts` |
| Partes comunes de los PDF | Tipografía, estilos, `PdfHeader`, `PdfFooter`, `pdfLogoSrc` | `apps/web/src/lib/pdf-common.tsx` |
| **Portal del paciente** | Encabezado (`Wordmark subtitle`) con `getProfessionalDisplayName()` → **solo el nombre**. Inicio: "Este es tu espacio con {nombre}." **No aparece título ni matrícula.** El plan se descarga como el PDF guardado (`/portal/plan/pdf`); el informe antropométrico no está en el portal (D11 de la HU-007) | `(portal)/layout.tsx`, `lib/shell.ts`, `(portal)/portal/page.tsx` |
| **Bot** | Solo el asistente con IA (HU-012) usa el título: `professionalName: title ? \`${title} ${pro.name}\` : pro.name` en `apps/bot/src/conversation.ts`. Los textos fijos del bot (`packages/core/src/messages.ts`) dicen "la nutricionista", sin nombre | Existe |
| Metadatos del PDF (`author`) | `pro.name`, sin título | ambos PDF |

**Los PDF quedan guardados.** El plan (`NutritionPlan.pdfData`) y el informe guardan el PDF ya
generado; el portal y WhatsApp entregan ese archivo. Si la profesional cambia matrícula o firma,
los PDF viejos no cambian hasta que se regeneren (ver D9).

### Qué falta (lo nuevo de esta HU)

1. **Firma**: cargar, ver, reemplazar y quitar una imagen de la firma manuscrita en `/ajustes`, y
   dibujarla al pie del contenido de los PDF con la aclaración debajo (D1–D4).
2. **PDF del plan**: mostrar título + nombre + matrícula (hoy solo el nombre) y la firma (D5).
3. **Portal**: mostrar el título y la matrícula de la profesional (D6).
4. **Unificar el bloque "datos profesionales"** de los PDF: un solo componente y una sola función
   de texto para que plan e informe muestren lo mismo (D7).
5. Avisos cuando falte la matrícula o la firma, también en el plan (D8).

### Por qué

El plan y el informe son documentos clínicos que el paciente se lleva; la matrícula y la firma son
lo que los respalda (como en el informe real de Canva, que tiene "LIC. DAIANA PONCE M.P 852" en
cada página). Hoy solo el informe tiene la matrícula, y el plan sale con el nombre suelto.

---

## Criterios de aceptación

```gherkin
Feature: Firma de la profesional (ver D1–D4)

  Background:
    Given la profesional inició sesión en el panel

  Scenario: Subir la firma
    Given en /ajustes, pestaña PDF, la tarjeta "Firma y matrícula" no tiene imagen de firma
    When elige un archivo PNG de 300 KB y toca "Subir firma"
    Then se guarda la imagen
    And ve el aviso "Firma actualizada"
    And la tarjeta muestra la vista previa de la firma con la aclaración debajo
      ("Lic. Daiana Ponce" / "M.P. 852")

  Scenario: Formato o tamaño inválido
    When elige un archivo PDF o una imagen de más de 1 MB (ver D2)
    Then no se guarda nada
    And ve el error "Formato inválido (usá PNG o JPG)" o "La imagen pesa más de 1 MB"

  Scenario: Reemplazar la firma
    Given ya hay una firma cargada
    When sube otra imagen válida
    Then la nueva reemplaza a la anterior (no se guarda historial)

  Scenario: Quitar la firma (ver D4)
    Given ya hay una firma cargada
    When toca "Quitar" y confirma "¿Quitar tu firma? Los próximos PDF salen sin firma."
    Then la firma se borra
    And los PDF que se generen desde ahora salen sin imagen de firma, solo con la aclaración

  Scenario: La firma no es pública (ver D10)
    Given hay una firma cargada
    When alguien sin sesión del panel pide la URL de la vista previa de la firma
    Then recibe 401 y no ve la imagen
    And un paciente con sesión del portal tampoco puede pedirla

Feature: Bloque de firma en los PDF (ver D5, D7)

  Scenario: Plan con todos los datos cargados
    Given título "Lic.", matrícula "M.P. 852" y firma cargados
    When la profesional genera el PDF de un plan
    Then al final del contenido, a la derecha, aparece la imagen de la firma
    And debajo una línea y la aclaración en dos líneas: "Lic. Daiana Ponce" y "M.P. 852"
    And el encabezado muestra "Lic. Daiana Ponce" en lugar de "Daiana Ponce"
    And el pie personalizado de /ajustes (si hay) se sigue mostrando como hasta ahora

  Scenario: Informe antropométrico con todos los datos cargados
    Given título, matrícula y firma cargados
    When la profesional genera el informe antropométrico
    Then después de "Conclusiones" aparece el mismo bloque de firma que en el plan
    And el pie de cada página sigue diciendo "Lic. Daiana Ponce · M.P. 852" y "Página n de N"

  Scenario: El bloque de firma no se corta entre páginas
    Given el contenido termina al final de una página
    When se genera el PDF
    Then el bloque de firma (imagen + aclaración) pasa entero a la página siguiente

  Scenario: Sin firma cargada (ver D8)
    Given título y matrícula cargados, sin imagen de firma
    When se genera el plan o el informe
    Then el PDF sale igual, con la aclaración "Lic. Daiana Ponce" / "M.P. 852" sin imagen

  Scenario: Sin matrícula cargada (ver D8)
    Given no hay matrícula cargada
    When la profesional abre la página de un plan o de un informe
    Then ve el aviso "Tu matrícula no está cargada. Completala en Ajustes para que aparezca en
      tus PDF." con el botón "Ir a Ajustes"
    And si genera el PDF, sale igual: la aclaración tiene solo "Lic. Daiana Ponce"

  Scenario: PDF generado antes de cambiar los datos (ver D9)
    Given un plan con PDF generado
    When la profesional cambia la matrícula o la firma
    Then el PDF ya generado no cambia
    And el nuevo dato aparece la próxima vez que genere o envíe el PDF

Feature: Datos profesionales en el portal (ver D6)

  Scenario: Encabezado del portal
    Given título "Lic." y matrícula "M.P. 852" cargados
    When un paciente entra al portal
    Then el encabezado muestra "Lic. Daiana Ponce"
    And el inicio dice "Este es tu espacio con Lic. Daiana Ponce · M.P. 852."

  Scenario: Portal sin título ni matrícula
    Given no hay título ni matrícula cargados
    Then el portal se ve como hoy (solo el nombre)

  Scenario: La firma no aparece en el portal
    When un paciente navega el portal
    Then no ve la imagen de la firma en ninguna página (solo dentro del PDF del plan que descarga)
```

---

## Datos que se registran

| Dato | Obligatorio | Uso |
|---|---|---|
| `Professional.title` | No (ya existe) | Antes del nombre en PDF, portal y asistente IA |
| `Professional.licenseNumber` | No (ya existe) | Aclaración de la firma y pie de los PDF; portal |
| Imagen de firma (bytes) — **nuevo** | No | Bloque de firma al final del plan y del informe |
| Tipo MIME de la firma — **nuevo** | Sí, si hay imagen | Armar el `data:` URL del PDF y la vista previa |

Igual que el logo: dos columnas nullable en `Professional` (nombres a definir por el `architect`).
Sin historial de firmas ni de matrículas.

---

## Diseño UX

### Panel: `/ajustes`, pestaña PDF

La tarjeta que hoy se llama **"Firma de los informes"** pasa a llamarse **"Firma y matrícula"**,
descripción: "Tu título, matrícula y firma aparecen en los PDF de planes e informes, y tu título y
matrícula en el portal del paciente."

Contenido, de arriba hacia abajo:

1. Campos **Título** y **Matrícula** (los de hoy, sin cambios; se siguen guardando con "Guardar"
   de los ajustes generales).
2. **Imagen de la firma**, con el mismo patrón que el logo:
   - Vista previa en un recuadro ancho (aprox. 240 × 80 px, fondo blanco, `object-contain`), o el
     recuadro punteado "Sin firma".
   - Input de archivo (`image/png,image/jpeg`), botón **"Subir firma"** ("Subiendo…" mientras
     tanto) y, si hay firma, botón **"Quitar"** con confirmación.
   - Ayuda: "Firmá en una hoja blanca, sacale una foto o escaneala y recortala dejando solo la
     firma. Mejor en PNG con fondo transparente."
   - Errores debajo (`FormError`): "Elegí una imagen", "Formato inválido (usá PNG o JPG)", "La
     imagen pesa más de 1 MB". Éxito: toast "Firma actualizada" / "Firma quitada".
3. **Vista previa del bloque**, armada con los valores guardados: la firma (si hay), una línea, y
   la aclaración en dos líneas. Reemplaza al texto actual "Pie del informe: …".

Las tarjetas "Logo" y "Estilo del PDF" no cambian. El texto de "Logo" ("aparece en los PDFs de los
planes…") se corrige a "planes e informes" (ya aparece en los dos).

### Panel: aviso de datos faltantes

- **Informe** (`antropometria/informe`): el aviso de matrícula que ya existe se mantiene; si
  además falta la firma, el texto pasa a "Tu matrícula y tu firma no están cargadas…" (D8).
- **Plan** (`pacientes/[id]/planes/[planId]`): el mismo `Alert` `warning`, cerca de los botones
  de PDF, con "Ir a Ajustes" → `/ajustes?tab=pdf`. Nunca bloquea generar ni enviar.

### PDF (plan e informe)

Bloque de firma al **final del contenido** (después de "Notas" en el plan; después de
"Conclusiones" en el informe), alineado a la derecha, sin cortarse entre páginas:

```
                                   [imagen de la firma, alto máx. ~45 pt]
                                   ──────────────────────────
                                        Lic. Daiana Ponce
                                            M.P. 852
```

- Sin firma: solo la línea y la aclaración (D8).
- Sin título: "Daiana Ponce". Sin matrícula: solo la línea del nombre.
- Encabezado de ambos PDF: `brandName` con título ("Lic. Daiana Ponce").
- Pie del informe: sin cambios. Pie del plan: ver D5.

### Portal

- Encabezado (`Wordmark`): "Lic. Daiana Ponce" (título + nombre).
- Inicio: "Este es tu espacio con Lic. Daiana Ponce · M.P. 852."
- Pantalla de "sin sesión": título + nombre, sin matrícula.
- Ninguna imagen de firma en el portal (D6).

### Bot

Sin cambios de textos (D11). El asistente con IA ya usa "Lic. Daiana Ponce".

---

## Fuera de alcance

- **Firma digital con validez legal** (certificado, token, firma electrónica avanzada, PDF
  firmado criptográficamente). La "firma" de esta HU es una imagen (D1).
- **Dibujar la firma en pantalla** (canvas con el mouse o el dedo). Solo se sube una imagen (D3).
- **Recortar, rotar, quitar el fondo o redimensionar** la imagen en el panel (D2).
- **Sello** profesional como imagen aparte.
- **Regenerar automáticamente** los PDF ya generados al cambiar los datos (D9).
- **Mostrar o descargar el informe antropométrico desde el portal** (sigue fuera, D11 de la
  HU-007).
- **Nombre de la profesional en los textos fijos del bot** (D11).
- **Plantilla propia de informes/planes** (épica 15, HU-015 de imleticio) y cualquier cambio en el
  diseño del plan que no sea el bloque de firma y el encabezado.
- Varias profesionales: `Professional` sigue siendo fila única.
- Más de una matrícula (M.P. y M.N.): el campo de texto libre ya permite "M.P. 852 · M.N. 1234".

---

## Notas de implementación

Mínimas; el detalle es del `architect`.

- **Migración solo aditiva**: dos columnas nullable en `Professional` (bytes + MIME), igual que el
  logo. Cambia `schema.prisma` → `db:generate` y `typecheck` en `apps/web` **y** `apps/bot`.
- **Texto en `packages/core`**: `professionalSignature()` hoy vive en `isak-report.ts`. Conviene
  moverlo (o reexportarlo) a un módulo neutro de datos profesionales, sumando las variantes que
  pide esta HU (nombre con título; aclaración en dos líneas), con tests. No romper el import
  actual de `report-actions.ts` ni los tests existentes.
- **Bloque común de PDF**: un componente en `apps/web/src/lib/pdf-common.tsx` (p. ej.
  `PdfSignatureBlock`, `wrap={false}`) y reusar `pdfLogoSrc` (o generalizarlo) para el `data:` URL
  de la firma. Lo usan los dos PDF.
- **Subida**: copiar el patrón de `uploadLogoAction` (validación de tipo y tamaño en la action).
  Aprovechar para usar `packages/db/domain/professionalAssets.ts` (hoy sin uso) en vez de
  `prisma` directo, sumando las funciones de la firma.
- **Vista previa**: ruta tipo `/api/professional/signature` con la misma protección que la del
  logo (`auth()` del panel, `Cache-Control: private`). Confirmar que el middleware no la deja
  pasar para sesiones del portal (D10).
- **Leer la firma solo donde hace falta**: `getProfessional()` no debería traer los bytes de la
  firma (lo usan el portal, el bot y muchas páginas). Seleccionarla explícitamente al generar el
  PDF, como se hace hoy con el logo en `buildAndSavePdf`.
- **Portal**: `getProfessionalDisplayName()` (`lib/shell.ts`) también la usa el panel (sidebar);
  el cambio a "título + nombre" en el portal no debería cambiar la sidebar sin decidirlo.
- **Pruebas**: no escribir en la base de desarrollo fuera de transacciones/ids propios. Verificar
  los PDF renderizándolos en el scratchpad con datos inventados (con y sin firma, con y sin
  matrícula, contenido que termina al pie de una página). Nada de WhatsApp real: no hace falta
  enviar nada para probar esta HU.

### Convivencia con la HU-015 (imleticio) y el PR #7

La HU-015 (plan de alimentación con la plantilla de la nutricionista, textos editables antes de
generar PDF/Word) va a tocar `apps/web/src/lib/plan-pdf.tsx` y la zona `pacientes/[id]/planes/**`
y `plantillas/**`. El PR #7 (`feat/hu-010-fix-ai-sara2`, abierto) ya modifica
`pacientes/[id]/planes/[planId]/actions.ts` (+7 líneas), `.../planes/[planId]/page.tsx` y
`plantillas/**`.

Partes de esta HU que caen en esos archivos (cambios mínimos y aditivos):

| Archivo | Cambio de esta HU | Choque probable |
|---|---|---|
| `apps/web/src/lib/plan-pdf.tsx` | Un campo opcional más en `PlanPdfInput` (p. ej. `signature?: {...} \| null`), `brandName` con título, y el `<PdfSignatureBlock>` después de "Notas". Nada de reestructurar el documento | **Alto** con la HU-015 (va a rehacer el PDF del plan) |
| `pacientes/[id]/planes/[planId]/actions.ts` (`buildAndSavePdf`) | Seleccionar los bytes de la firma junto al logo y pasar el campo nuevo | **Medio** con el PR #7 y la HU-015 |
| `pacientes/[id]/planes/[planId]/page.tsx` | El `Alert` de datos faltantes (o mejor dentro de `plan-pdf-actions.tsx`, que el PR #7 no toca) | Bajo / medio |
| `plantillas/**` | Nada | — |

Recomendación para el `architect`: poner toda la lógica nueva en `pdf-common.tsx`, `packages/core`
y `/ajustes` (fuera de la zona de imleticio), y que en `plan-pdf.tsx` y `actions.ts` quede solo
"pasar un prop y dibujar un componente". Así, si la HU-015 rehace el PDF del plan, alcanza con
volver a insertar `<PdfSignatureBlock>`. Coordinar con imleticio el orden de merge (D12).

---

## Dudas para validar con el usuario

Cada duda trae la recomendación del afinador.

**D1. ¿Qué es "firma" en esta épica?** El texto de la épica solo habla de título y matrícula; el
título dice "y firma". **Recomendación:** una **imagen de su firma manuscrita** (escaneada o
fotografiada) que va al final de planes e informes, sobre una línea y la aclaración "Lic. Daiana
Ponce / M.P. 852". No es firma digital con validez legal (fuera de alcance). Confirmar con Daiana
que eso es lo que espera; si en realidad solo quería título + matrícula en todos lados, la HU se
achica a los puntos 2–5 de "Qué falta".

**D2. Formato y tamaño de la imagen.** **Recomendación:** PNG o JPG, máx. **1 MB**, sin recorte
ni procesamiento en el panel (ella sube la imagen ya recortada). Se sugiere PNG con fondo
transparente; un JPG con fondo blanco también queda bien sobre el PDF blanco. En el PDF se escala
a un alto máximo (~45 pt) manteniendo la proporción. WEBP no (el logo lo acepta, pero react-pdf
no siempre lo dibuja; el `architect` puede confirmarlo).

**D3. ¿Subir imagen o dibujar la firma en pantalla?** **Recomendación:** solo subir imagen en esta
HU. Dibujar con el dedo da firmas de peor calidad y suma un componente nuevo.

**D4. ¿Se puede reemplazar y borrar?** **Recomendación:** sí, las dos cosas, como el logo. Borrar
pide confirmación. Sin historial: los PDF ya generados conservan la firma con la que se generaron.

**D5. ¿Dónde va la firma y qué pasa con el pie del plan?** **Recomendación:**
- Bloque de firma **al final del contenido** del plan y del informe (no en cada página).
- Encabezado de los dos PDF con título + nombre.
- **Pie del plan:** se mantiene como hoy (texto personalizado de `/ajustes` o "Generado el … ·
  NutriBot"). Alternativa: que el default sin texto personalizado pase a ser "Lic. Daiana Ponce ·
  M.P. 852", igual que el informe. Recomiendo la alternativa solo si a Daiana le importa la
  matrícula en cada página del plan; si no, dejarlo como está para tocar menos `plan-pdf.tsx`
  (zona de la HU-015).

**D6. ¿Qué se muestra en el portal?** **Recomendación:** título + nombre en el encabezado, y
"Este es tu espacio con Lic. Daiana Ponce · M.P. 852." en el inicio. **La imagen de la firma no
se muestra en el portal** (no aporta y aumenta la exposición; el paciente la ve dentro del PDF que
descarga).

**D7. Formato del bloque de texto.** **Recomendación:** en el bloque de firma, **dos líneas**
("Lic. Daiana Ponce" / "M.P. 852"), como una aclaración en papel; en el pie del informe y en el
portal, **una línea** con "·" (como hoy). Sin mayúsculas forzadas (el Canva usa "LIC. DAIANA
PONCE M.P 852"; D1 de la HU-007 ya decidió no forzarlas).

**D8. ¿Qué pasa si falta la matrícula o la firma?** **Recomendación:** el PDF **sale igual**,
nunca se bloquea. Sin firma: línea + aclaración. Sin matrícula: aclaración solo con el nombre. En
el panel, aviso `warning` en la página del plan y del informe con botón a Ajustes. ¿El aviso por
firma faltante también, o solo por matrícula? Recomiendo **ambos en el mismo aviso**, porque si
Daiana decide no usar firma podría molestar: en ese caso, aviso solo por matrícula.

**D9. PDF ya generados.** **Recomendación:** no se regeneran solos. El nuevo dato aparece la
próxima vez que genere o envíe el PDF (el envío por WhatsApp del plan ya regenera). No se marca
"desactualizado" por esto.

**D10. Privacidad y seguridad de la imagen de firma.** La firma es un dato sensible (se puede
copiar para falsificar documentos). **Recomendación:**
- Se guarda en la base como el logo, **nunca en `public/`** ni en una URL pública ni con nombre
  adivinable sin sesión.
- La vista previa del panel solo con sesión del panel (`auth()`), `Cache-Control: private`.
  Sesión del portal → 401.
- No se manda por WhatsApp suelta, no se muestra en el portal, no va al asistente con IA ni a
  logs.
- Se acepta que va **incrustada en los PDF** que se entregan al paciente (como una firma en
  papel). Si eso preocupa, opción: firma solo en el informe y no en el plan.

**D11. ¿El bot usa título o matrícula?** **Recomendación:** no cambiar nada. Los textos fijos dicen
"la nutricionista" y el asistente con IA ya usa "Lic. Daiana Ponce". Sumar el nombre a los
mensajes del bot sería otra HU.

**D12. Convivencia con la HU-015 de imleticio.** **Recomendación:** implementar esta HU con
cambios mínimos en `plan-pdf.tsx` y `planes/[planId]/actions.ts` (un prop + un componente) y
avisarle a imleticio antes de mergear. Si la HU-015 se va a mergear pronto y rehace el PDF del
plan, alternativa: hacer primero informe + ajustes + portal y sumar el plan después de la HU-015.
Decidir el orden con ella.

## Resoluciones (2026-10-03)

- **D1–D4, D6–D9, D11:** se aceptan las recomendaciones tal como están escritas arriba.
- **D12: sin el PDF del plan en esta HU.** Esta HU cubre `/ajustes` (subir, ver, reemplazar y borrar
  la firma), el **informe antropométrico** (bloque de firma al final con la aclaración en dos
  líneas), el **portal** (título + nombre + matrícula, sin la imagen de la firma) y el aviso por
  matrícula/firma faltante en la página del informe. **No se toca `plan-pdf.tsx` ni
  `pacientes/[id]/planes/**`** (zona de la HU-015 de imleticio).
- **Pendiente para el PDF del plan (después de la HU-015), ya decidido por el usuario:**
  - D10: la firma va **en los dos PDF** (plan e informe), al final del contenido.
  - D5: en el plan, el **pie por defecto** (sin texto personalizado de `/ajustes`) pasa a ser
    "Lic. Daiana Ponce · M.P. 852", igual que el informe; y el encabezado muestra título + nombre.
  - El componente compartido del bloque de firma (D7) se diseña en esta HU para que el plan lo
    reuse sin cambios.
