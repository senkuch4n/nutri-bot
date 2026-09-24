# impl HU-007 `informe-antropometrico` (épica 46): **DONE**

> **Cambió el schema: hay que reiniciar el `next dev` del usuario** (cliente de Prisma nuevo:
> `AnthropometricReport`, `Professional.title/licenseNumber`, `MessageKind.ANTHROPOMETRIC_REPORT_PDF`).

Rama `hu-007-informe-antropometrico`, sin commit y sin tocar `backlog.json`.

## Restricciones de la SDD (sección 13), copiadas

1. **Datos de desarrollo:** ningún dato de negocio preexistente se borra ni cambia. Solo se
   escribe con la migración (aditiva), `test-anthropometric-report.ts` (limpia por id) y
   `test-report-outbox.ts` (transacción revertida). No se guarda `/ajustes`.
2. **Prisma:** `pg_dump` antes, `--create-only` y revisar el SQL. Nada de `migrate reset` ni
   `db push`, y no aceptar el reset por drift. Si hay drift, `blocked` con la salida de
   `migrate status`. *(Regla nueva de AGENTS.md: nunca usar `DATABASE_URL` como
   `--shadow-database-url` ni `migrate diff --from-migrations` contra la base de desarrollo.)*
3. **WhatsApp:** ninguna prueba confirma un `OutboundMessage`. El único enqueue de prueba va
   dentro de la transacción que se revierte. Los scripts no importan `whatsapp.ts` ni Baileys. Los
   jids de prueba terminan en `@test.invalid`.
4. **Lógica:** el modelo, los textos, los borradores, los umbrales, la huella y la geometría van
   en `packages/core`, con tests. Las lecturas y escrituras, en
   `packages/db/domain/anthropometricReports.ts`. El PDF solo dibuja. No se recalcula nada fuera
   de `buildIsakStudy`/`buildAnthropometricDiagnosis`, salvo el ICC del menor, con
   `computeWaistHipRatio` y en core.
5. **`useConfirm`:** nunca `await confirm()` dentro de `<form action>` ni de `startTransition`.
6. **Sin `key`** que cambie con los datos guardados en el editor del informe ni en
   `IsakCard`/`IsakForm`.
7. **UI:** solo el sistema de diseño actual. `tailwind.config.ts` no se toca. Los colores nuevos
   son solo del PDF (`pdf-theme.ts`).
8. **El PDF del plan** se tiene que ver idéntico después de extraer `pdf-common.tsx`.
9. **Material de ejemplo:** no se copia nada de `docs/EJEMPLO DE INFORME ANTROPOMETRICO.pdf`
   ni de `docs/ISAKMetry_*`.
10. **No** correr `next build` ni levantar otro `next dev`.
11. **Rama** `hu-007-informe-antropometrico`, sin commit y sin `backlog.json`.

---

## Incidente de la ronda 1 (ya resuelto por el orquestador)

En la primera pasada, un `prisma migrate diff --from-migrations … --shadow-database-url
<DATABASE_URL>` que corrí yo **vació la base de desarrollo**. Prisma resetea la shadow DB. Paré
con `blocked` y no restauré nada. El orquestador recreó `public` y cargó
`backup-antes-HU-007.sql`. Conteos después de la restauración: 10 pacientes, 18 consultas, 15
mediciones, 4 mensajes, 5 planes, 980 alimentos, 16 turnos, 1 profesional y 14 migraciones. En
esta ronda no volví a usar `migrate diff` ni una shadow DB. El schema se verificó solo con
`prisma migrate status`.

## Ronda 2: migración

- **Respaldo nuevo, antes de aplicar:**
  `/private/tmp/claude-501/-Users-joelmiguelserrudo-Documents-Projects-Nutri-Bot/95bd3b1f-af2d-449f-b816-a2a22d5cd1a4/scratchpad/backup-antes-HU-007-v2.sql`.
  Pesa 747.456 bytes y tiene 23 `COPY`.
- **Antes de aplicar:** `migrate status` mostraba 15 migraciones y solo
  `20260924111042_anthropometric_report` pendiente.
- **Revisión del SQL:** `grep -Ei 'drop|alter column|rename|set not null'` no devuelve nada
  (exit 1).
- **Aplicación:** `npm run db:migrate </dev/null` (stdin cerrado, para que no pudiera aceptar
  ningún prompt de reset). Aplicó solo la pendiente: "Your database is now in sync".
- **Después:** `npm run db:generate` y `migrate status` → "Database schema is up to date!".

SQL de `packages/db/prisma/migrations/20260924111042_anthropometric_report/migration.sql`:

```sql
ALTER TYPE "MessageKind" ADD VALUE 'ANTHROPOMETRIC_REPORT_PDF';
ALTER TABLE "OutboundMessage" ADD COLUMN     "anthropometricReportId" TEXT;
ALTER TABLE "Professional" ADD COLUMN     "licenseNumber" TEXT,
ADD COLUMN     "title" TEXT;
CREATE TABLE "AnthropometricReport" (
    "id" TEXT NOT NULL, "isakEntryId" TEXT NOT NULL,
    "girthsText" TEXT, "distributionText" TEXT, "adiposeMuscleText" TEXT, "muscleBoneText" TEXT,
    "waistHipText" TEXT, "somatotypeText" TEXT, "conclusionsText" TEXT,
    "pdfData" BYTEA, "pdfFileName" TEXT, "pdfGeneratedAt" TIMESTAMP(3), "pdfSourceKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AnthropometricReport_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AnthropometricReport_isakEntryId_key" ON "AnthropometricReport"("isakEntryId");
ALTER TABLE "AnthropometricReport" ADD CONSTRAINT "AnthropometricReport_isakEntryId_fkey" FOREIGN KEY ("isakEntryId") REFERENCES "EvolutionEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OutboundMessage" ADD CONSTRAINT "OutboundMessage_anthropometricReportId_fkey" FOREIGN KEY ("anthropometricReportId") REFERENCES "AnthropometricReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

El único `NOT NULL` está en la tabla nueva y vacía. Las columnas que se agregan a
`Professional` y `OutboundMessage` son nullable.

**Conteos:** Patient | Consultation | EvolutionEntry | OutboundMessage | NutritionPlan | Food |
Appointment | Professional | _prisma_migrations | AnthropometricReport.

| Momento | Conteos |
|---|---|
| Antes de migrar (ronda 2) | `10 · 18 · 15 · 4 · 5 · 980 · 16 · 1 · 14 · —` |
| Después de migrar | `10 · 18 · 15 · 4 · 5 · 980 · 16 · 1 · 15 · 0` |
| Al final, después de todas las pruebas | `10 · 18 · 15 · 4 · 5 · 980 · 16 · 1 · 15 · 0` |

`Professional` al final: `1 | Nutricionista | title NULL | licenseNumber NULL | #2563eb |
Lic. en Nutrición · Mat. 1234 · Turnos: +54 9 351 555-2345`, igual que antes, con las columnas
nuevas en null. **`OutboundMessage` quedó en 4.**

---

## Archivos

### packages/core
- `src/isak-study.ts`: exporta `SOMATOTYPE_MEASURE_KEYS` y `buildIsakStudy` lo usa, sin cambio
  de comportamiento. `ISAK_TEXT` suma `deleteWithReportDescription` y `reportButton`.
- `src/isak-report.ts` (nuevo): `ISAK_REPORT_TEXT_KEYS`, tipos, `ISAK_REPORT_TEXT`,
  `ISAK_REPORT_STABLE_THRESHOLDS`, `buildIsakReportModel`, `buildIsakReportDrafts`,
  `resolveIsakReportTexts`, `variationLine`, `professionalSignature`, `isakReportFileName` e
  `isakReportSourceKey` (FNV-1a 32 sobre el UTF-8 del JSON canónico).
- `src/isak-report-charts.ts` (nuevo): `GIRTH_BARS`, `buildGirthBarsLayout`,
  `SOMATOCHART_ARC_MIDPOINTS`, `buildSomatochartLayout`, `REPORT_BODY_FIGURE`,
  `COMPOSITION_BARS`, `buildCompositionBarsLayout` y la constante auxiliar `SOMATOCHART_PADDING`.
- `src/isak-report.test.ts` y `src/isak-report-charts.test.ts` (nuevos). `src/index.ts`
  exporta los dos módulos nuevos.

### packages/db
- `prisma/schema.prisma` (3.1, diff aditivo de +39 líneas) y la migración de arriba.
- `domain/anthropometricReports.ts` (nuevo, 4.4) y su export en `domain/index.ts`.
- `scripts/test-anthropometric-report.ts` (nuevo) y el script `test:report` en `package.json`.

### apps/bot
- `src/outbound-payload.ts` (nuevo, 4.5): `OUTBOX_INCLUDE`, `OutboxRow`, `OutboundPayload` y
  `resolveOutboundPayload`. No importa `whatsapp.ts`.
- `src/workers.ts`: `include: OUTBOX_INCLUDE` y `resolveOutboundPayload` → `sendDocument` o
  `sendText`. El resto de `tick()` no cambia: SENT, reintentos, `MAX_ATTEMPTS` y la pausa sin
  conexión. El mensaje de error del plan sin PDF es el mismo de antes.
- `scripts/test-report-outbox.ts` (nuevo) y el script `test:report-outbox`.
- `conversation.ts`, `whatsapp.ts`, los menús y los textos no se tocaron.

### apps/web
- `lib/pdf-common.tsx` (nuevo): `FONT_FAMILY` (registra Inter una sola vez),
  `registerHyphenationCallback`, `pdfLogoSrc`, `buildCommonStyles`, `PdfHeader` y `PdfFooter`.
- `lib/plan-pdf.tsx`: usa `pdf-common`, conserva `server-only`, el pie `n / total` de ancho 40 y
  los mismos estilos (`mealHeader/mealMark/mealTitle` → `sectionHeader/sectionMark/sectionTitle`,
  con los mismos valores).
- `lib/pdf-theme.ts`: paleta del informe (5.5).
- `lib/report-pdf-charts.tsx` (nuevo): `SvgText`, `GirthBarsChart`, `BodyFigure`,
  `CompositionBarsChart` y `SomatochartPdf`.
- `lib/anthropometric-report-pdf.tsx` (nuevo): `ReportPdfInput`, `renderAnthropometricReportPdf`
  y `AnthropometricReportDocument`.
- `lib/anthropometric-report.ts` (nuevo, server-only): `IsakReportContext` y
  `loadIsakReportContext`.
- `lib/use-unsaved-changes-guard.ts` (nuevo): `useUnsavedChangesGuard`.
- `app/(panel)/pacientes/[id]/report-actions.ts` (nuevo): `saveIsakReportTextsAction`,
  `generateIsakReportPdfAction`, `sendIsakReportWhatsAppAction` y `ReportActionState`.
- `…/antropometria/informe/page.tsx`, `loading.tsx`, `report-editor.tsx` y `pdf/route.ts`
  (nuevos).
- `…/antropometria/page.tsx`: botón "Informe PDF" (ícono `FileText`) antes de "Editar", y
  `hasReport`.
- `…/delete-isak-study-button.tsx`: prop `hasReport`, que cambia la descripción del confirm.
- `…/isak-card.tsx`: `study.report`, botón "Informe PDF" y la línea "Informe generado el …". No
  se agregó ninguna `key`.
- `…/consultas/[consultationId]/page.tsx`: aviso `?aviso=sin-isak` y `study.report`.
- `app/(panel)/ajustes/actions.ts`, `settings-form.tsx`, `page.tsx` y `ajustes-tabs.tsx`: título
  y matrícula, card "Firma de los informes", pestaña "PDF" y nuevo hint del color.

---

## Verificación (salidas resumidas)

| Comando | Resultado |
|---|---|
| `git branch --show-current` | `hu-007-informe-antropometrico` |
| `prisma migrate status` | Database schema is up to date! |
| grep destructivo sobre `migration.sql` | sin salida |
| `npm run db:generate` | Generated Prisma Client (v5.22.0) |
| `npm run test` | **27 archivos, 407 tests passed** (los nuevos incluidos; `isak-study.test.ts` y el resto sin tocar, en verde) |
| `npm run typecheck` | core, db, bot y web limpios (0 `error TS`) |
| `npm run lint --workspace apps/web` | sin errores. Queda solo un warning previo en `ajustes/logo-form.tsx` |
| `npm run test:isak --workspace packages/db` | OK |
| `npm run test:report --workspace packages/db` | OK: 5 pasos (null, upsert sin duplicar con `""` respetado, PDF ida y vuelta, cascada al borrar el estudio, sin mensajes) |
| `npm run test:report-outbox --workspace apps/bot` | OK: encola `ANTHROPOMETRIC_REPORT_PDF` PENDING, `appointmentId` null; el payload es un documento `informe-antropometrico-2026-05-08.pdf` con los mismos bytes; `PLAN_PDF` sin plan tira el error de siempre; `AD_HOC` sale como texto; el informe sin PDF tira error. La transacción se revierte y deja 0 filas |
| `npm run test:confirm-flow --workspace apps/bot` | 5/5 escenarios OK. `OutboundMessage` sigue en 4 |
| `pgrep` del bot | no corre |
| `git status` y el PDF de ejemplo | no se tocó |
| `./ops/harness/verify.sh` | **Arnés OK**. Deja 2 WARN informativos: hay migración nueva y se tocó el bot, las dos cosas revisadas arriba |

No se corrió `next dev` ni `next build`.

### 11.2 El PDF del plan no cambia
Hice un render con `tsx` antes y después de extraer `pdf-common` (con copias sin `server-only`
en `apps/web/.tmp-pdf-test/`), en 2 variantes: 4 comidas con acento y pie, y 16 comidas sin
acento ni pie.
- `pdftotext -layout`: **idéntico** en las dos.
- `pdftoppm -png -r 72`: **los 6 PNG son idénticos byte a byte** (`cmp`).
- Miré la página 1 con `Read`: se ve igual que el plan de siempre.

### 11.3 El PDF del informe
Todas las variantes con el acento `#3c7a24`, `logo null` y la firma "Lic. Ana Pérez · M.P. 123",
salvo la última.

| Variante | Páginas |
|---|---|
| AB | 4 |
| Solo A | 4 |
| Menor (12 años) | 3 |
| Sin fémur | 4 |
| AB sin acento ni matrícula (firma "Ana Pérez") | 4 |

- **`pdftotext`:** ningún número con punto decimal en ninguna variante. Aparecen
  "Peso: 61,0 kg (6,6 kg menos)" (con anterior), "Página 1 de", "Lic. Ana Pérez · M.P. 123" y,
  solo en la variante sin fémur, "Somatotipo sin dato (falta fémur)". En el menor no hay
  "Composición corporal" ni "Índice adiposo muscular", y sí la nota de adultos.
- **`pdffonts`:** solo Inter (Regular, Medium y SemiBold) embebida, sin Helvetica.
- **Lo que se vio en los PNG:**
  - Ninguna sección ni gráfico queda cortado entre páginas, y el pie "firma · Página n de N"
    está en todas.
  - Las barras de perímetros van agrupadas (gris la anterior, acento la actual), con su valor al
    final, eje cada 10 hasta 60 y leyenda.
  - La silueta tiene las 3 zonas adiposas en tonos crecientes, los % a la izquierda y los % del
    músculo a la derecha con líneas guía.
  - Las barras apiladas muestran los 4 tonos distinguibles, con los % adentro y leyenda.
  - La somatocarta tiene el contorno curvado **hacia afuera** (las banderas `0 0 1` son
    correctas), los 3 ejes pasan por el origen, los rótulos Mesomorfia arriba y
    Endomorfia/Ectomorfia abajo, el punto actual en el acento y el anterior en gris, grilla con
    "−" y leyenda.
  - Sin fémur: carta sin punto actual, la nota abajo y "Sin dato" en óseo, residual, IMO y
    mesomorfia.
  - Solo A: una columna, una barra por grupo y un solo punto.
- Se borró `apps/web/.tmp-pdf-test/`, y `git status` no lo muestra. No se usó ningún dato del
  PDF de ejemplo: los datos fueron "Paciente de prueba" y "Ana Pérez".

---

## Decisiones no obvias

1. **Error de cuenta de la SDD en 10.2:** `plotWidth = 300 − 96 − 32 = 172`, no 174. Se respetó
   la fórmula de 4.3 y el test usa 172, con un comentario.
2. **Campo aditivo en el modelo:** `IsakReportModel.legend: { previous: string | null; current:
   string }` = `legendPrevious/legendCurrent(fecha)`. Los gráficos y los encabezados de las
   tablas lo necesitan, y sin este campo las fechas solo venían metidas dentro de otras cadenas.
   Tiene su test. No cambia ningún nombre del contrato.
3. **"→" en el PDF:** el subset latin de Inter no trae U+2192 y se dibujaba como `'`. El PDF
   muestra "Endomorfia 4,95 a 4,03" (`pdfGlyphs`, solo presentación). El panel sigue con "→".
4. **Texto dentro de `Svg`:** no hereda la familia de la página, así que caía en Helvetica, que
   no tiene "−". `SvgText` es un wrapper tipado sobre `Text` que fija `fontFamily: FONT_FAMILY`.
   No hay `@ts-ignore`.
5. **`lineHeight` del informe:** el PDF del informe pisa `content.lineHeight` a 1.2 y
   `sectionTitle.lineHeight` a 1.2. Con el 1.45 heredado del plan, react-pdf 4.9 duplicaba el
   interlineado en los textos anidados: quedaban 6 páginas y las leyendas desalineadas. Con 1.2
   son 4. `pdf-common` y el plan no cambian.
6. **Rótulos de la somatocarta:** Endomorfia y Ectomorfia van centrados, 20 pt debajo de su
   vértice. En la posición de partida de la SDD (+10) pisaban el arco inferior. Se ajustaron a
   ojo en el render, como permite la SDD.
7. **Etiqueta "Cadera"** en el informe (ISAK_MEASURES dice "Caderas"), porque así lo dicen la
   SDD y la HU.
8. **ICC del estudio anterior:** usa la misma regla que el actual. En adultos sale del
   diagnóstico de la HU-004, y en menores de `computeWaistHipRatio`, sin categoría.
9. **Textarea con su propio `<label htmlFor>`** en lugar de `Field`: `Field` envuelve con
   `<label>` y adentro quedarían el botón "Volver al borrador" y el badge. El marcado y las
   clases son los mismos. El error de conclusiones va en línea, con `role="alert"`,
   `aria-invalid` y `aria-describedby`, y el foco pasa a ese campo.
10. **Los avisos de la página están en el editor cliente**, porque el `GuardedBackLink` va antes
    del `PageHeader`. El editor recibe como props, además de las de 7.1, `stale`,
    `licenseMissing` y `editStudyHref`. Todas son serializables y siempre se leen de props, así
    que al revalidar se actualizan sin perder el estado.
11. **Sin `key`:** ni el editor ni la página ponen `key`. Los textos viven en `useState` y el
    snapshot `saved` se actualiza cuando la action sale bien.
12. **`confirm`:** en `resetDraft`, `send`, el guard de navegación y el borrado del estudio se
    espera siempre en el handler, antes de `startTransition`. Las actions se llaman directo, sin
    `<form action>`.
13. **`generateAndSave`** guarda primero los textos y después renderiza con los textos que
    devuelve la base. "Enviar" siempre regenera (D13) y recién después encola.
14. **`test-anthropometric-report.ts`:** en el `finally` borra `OutboundMessage` por el `toJid`
    único de la prueba (`test-hu007-<ts>@test.invalid`). Es un id propio, y la prueba verifica
    que haya 0 filas.

## Contrato compartido
Las firmas y los nombres coinciden con la sección 4 de la SDD:
- **core:** 4.1, 4.2 y 4.3. Solo se suman `legend` en el modelo y la constante exportada
  `SOMATOCHART_PADDING`.
- **db:** 4.4. `enqueueAnthropometricReportMessage(params, db?)` usa `prisma` por defecto.
- **bot:** 4.5.
- **web:** 5.2 (loader), 5.3 (actions y tipos), 5.5 (`ReportPdfInput` y
  `renderAnthropometricReportPdf`) y 7.6 (hook).

## Pendiente para el orquestador
- Reiniciar el `next dev` del usuario y hacer el recorrido de la sección 12 de la SDD.
- El aviso de la SDD sigue en pie: `docs/EJEMPLO DE INFORME ANTROPOMETRICO.pdf` está versionado
  en el historial de la rama. Es una decisión del usuario, no de esta HU.
