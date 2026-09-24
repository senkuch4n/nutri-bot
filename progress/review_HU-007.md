# Review — HU-007

**Veredicto:** APPROVED

Primer intento de revisión. Revisé el diff real (`git diff HEAD` y los archivos nuevos sin
trackear), sin tener en cuenta `backlog.json`, los `progress/*` del orquestador, `AGENTS.md`,
`skills/` ni `docker-compose.prod.yml`. Todos los comandos los corrí yo. La base la consulté solo
en lectura.

## Verificación que corrí

| Comando | Resultado |
|---|---|
| `npm run typecheck` | exit 0: core, db, bot y web limpios |
| `npm run test` | 27 archivos, **407 tests OK** |
| `./ops/harness/verify.sh` | exit 0, "Arnés OK". Deja 2 WARN informativos (migración nueva y bot tocado), revisados abajo |
| `prisma migrate status` (sin shadow DB) | 15 migraciones, "Database schema is up to date!", sin drift |
| Conteos (solo lectura) | Patient 10 · Consultation 18 · EvolutionEntry 15 · OutboundMessage 4 · AnthropometricReport 0 · Professional 1 · _prisma_migrations 15 |
| Restos de pruebas | 0 pacientes `%test.invalid` o `hu007%`. `OutboundMessage` = 4 filas previas, todas `SENT` (CANCELLATION 1, CONFIRMATION 2, REMINDER 1). `Professional.title` y `licenseNumber` en NULL |
| `pgrep -fl apps/bot` | no corre |
| `apps/web/.tmp-pdf-test/` | no existe. `git status` no muestra `EJEMPLO` modificado |

No corrí `test:confirm-flow`, `test:report` ni `test:report-outbox`: escriben en la base o encolan.
Los dos últimos los revisé leyendo el código (ver C4).

## Checkpoints

### C1 — El arnés está sano
- `backlog.json` válido y con 1 HU activa: [x] (verify.sh: "11 HU, 1 activa". HU-007 está `en_revision`)
- `progress/current.md` refleja la HU en curso: [x] (líneas 87-90: HU-007 y el incidente)
- `verify.sh` con exit 0: [x]

### C2 — Cadena de documentos
- `docs/hu-informe-antropometrico.md` completa y con Resoluciones: [x]
- `Refactorizaciones/informe-antropometrico.md` con workspaces, checklist y contrato: [x]
- Las firmas coinciden con el Contrato compartido: [x]
  - Core, db, bot y web coinciden con las secciones 4.1 a 4.5, 5.2, 5.3, 5.5 y 7.6.
  - Hay 2 cosas aditivas, documentadas en impl: `IsakReportModel.legend` (con su test) y
    `SOMATOCHART_PADDING`.
  - `REPORT_TEXT_COLUMNS` usa un alias `TextColumn` con la misma unión literal que la SDD.

### C3 — Arquitectura
- Lógica pura en core y operaciones de base en `domain`, sin duplicar: [x]
  - Modelo, borradores, umbrales (`ISAK_REPORT_STABLE_THRESHOLDS`), huella FNV-1a y geometría de
    los gráficos: en `packages/core/src/isak-report*.ts`.
  - El ICC del menor sale de `computeWaistHipRatio` dentro de core (`isak-report.ts:310-322`).
  - Lecturas y escrituras: en `packages/db/domain/anthropometricReports.ts`.
  - El PDF (`anthropometric-report-pdf.tsx`, `report-pdf-charts.tsx`) solo llama a los
    `build*Layout` de core. Lo único que calcula son offsets de rótulos (layout visual).
- Cambió `schema.prisma` o `domain` y compilan web y bot: [x]
  - Web y bot compilan.
  - Bot: `workers.ts` usa `OUTBOX_INCLUDE` y `resolveOutboundPayload`. El resto de `tick()` no
    cambia.
  - `resolveOutboundPayload` (`apps/bot/src/outbound-payload.ts:21-38`) conserva `PLAN_PDF` tal
    cual: mismo mensaje de error y mismo default `plan-alimentario.pdf`. La rama nueva
    `ANTHROPOMETRIC_REPORT_PDF` es simétrica y el resto de los kinds sigue saliendo como texto.
  - `conversation.ts` y `whatsapp.ts` no se tocaron.
- Migración `20260924111042_anthropometric_report` coherente y solo aditiva: [x]
  - `ALTER TYPE ... ADD VALUE 'ANTHROPOMETRIC_REPORT_PDF'`.
  - `OutboundMessage.anthropometricReportId TEXT` nullable.
  - `Professional.title` y `licenseNumber TEXT` nullable.
  - `CREATE TABLE "AnthropometricReport"`: los únicos NOT NULL están en esta tabla nueva y vacía.
  - Índice único en `isakEntryId`.
  - FK a `EvolutionEntry` con `ON DELETE CASCADE` y FK de `OutboundMessage` con `SET NULL`.
  - No hay DROP, ALTER COLUMN, RENAME ni SET NOT NULL. Coincide con el schema.
- Rutas protegidas por auth y portal intacto: [x]
  - `informe/page.tsx` y `informe/pdf/route.ts` quedan bajo el matcher del middleware.
  - El route handler además chequea `auth()` (401) y que la consulta sea del paciente (404).
  - Las actions validan con zod, `belongsToPatient` y el contexto `ok`. Siguen el patrón del repo:
    ninguna action del panel llama a `auth()`, las cubre el middleware.
  - `(portal)` no se tocó (D11).
- El bot sigue en silencio y los textos coinciden con la SDD: [x]
  - No cambia ningún estado conversacional.
  - El caption es `ISAK_REPORT_TEXT.whatsappCaption`, idéntico a la sección 6, y queda en `body`
    (D7).
- Sin `console.log` de debug ni TODO sueltos: [x]
  - Solo `console.error` en los catch de las actions (lo pide la SDD 5.3).
  - Hay `console.log` en los scripts de prueba, que es su salida.

### C4 — Verificación real
- `npm run typecheck` limpio: [x]
- Lógica nueva de core con tests y `npm run test` en verde: [x]
  - Los tests no son circulares: comparan contra cadenas y números literales de la HU y la SDD.
    Por ejemplo "6,6 kg menos", "Bajó de 0,59 a 0,57 (−0,02)" y los 7 borradores AB completos.
    No re-derivan los valores con la función que prueban.
  - Cubren: sin anterior, sin fémur, menor, umbrales (−0,02 dentro de `index`, O3 mixto ausente),
    la huella (cambia con el tríceps anterior, el sexo, la edad, `previous` null, `entryId` y
    fémur null), `resolveIsakReportTexts` con `""` respetado y la geometría (equilátero, ejes por
    el origen, suma de anchos, ampliación del dominio).
  - `isak-study.test.ts` sigue en verde sin tocarlo (`SOMATOTYPE_MEASURE_KEYS` es un refactor sin
    cambio de comportamiento).
- Flujo del bot simulado sin WhatsApp real y limpio por id: [x]
  - `apps/bot/scripts/test-report-outbox.ts` hace todo dentro de `prisma.$transaction` y termina
    con `throw new Rollback()` (línea 95). Fuera de la transacción verifica 0 filas por `toJid` y
    que el paciente no exista (líneas 102-104). No importa `whatsapp.ts`. El jid es
    `@test.invalid`.
  - `packages/db/scripts/test-anthropometric-report.ts` borra por arrays de ids propios
    (líneas 130-134) y `OutboundMessage` por un `toJid` único con timestamp. No encola nada.
  - Estado final de la base: sin restos (ver tabla).
- Resultado real del PDF verificado: [x] (con matiz)
  - El implementer documenta renders en 5 variantes con pdftotext, pdffonts y los PNG revisados
    (`progress/impl_HU-007.md`, sección 11.3).
  - Intenté reproducirlo en el scratchpad, sin escribir en el repo, y no pude: fuera de
    `apps/web`, tsx carga `@react-pdf/textkit` como CJS y falla `@react-pdf/hyphenate/en-us`
    (`ERR_PACKAGE_PATH_NOT_EXPORTED`). Es un problema del entorno, no del código.
  - Lo revisé en estático: `plan-pdf.tsx` y `pdf-common.tsx` conservan los mismos valores de
    estilo, el mismo pie `n / total` con ancho 40 y `server-only` en el plan. Solo cambian los
    nombres `meal*` → `section*`, con los mismos valores. No hay cambio visual esperable.

### C5 — Cierre
- `progress/impl_HU-007.md` existe y describe qué se tocó: [x]
- `progress/review_HU-007.md` con el veredicto: [x]
- Sin scripts de prueba sueltos ni datos de prueba en la base: [x]
  - Los dos scripts nuevos son entregables de la SDD y tienen su entrada en `package.json`.
  - `.tmp-pdf-test` fue borrado.
  - La base está sin restos.

### Puntos pedidos por el orquestador
- **Formularios y `useConfirm`:** [x]
  - `report-editor.tsx` espera `confirm` en `resetDraft` (209-216) y en `send` (246-255) antes de
    `run()`/`startTransition`. No hay `<form action>`: las actions se llaman directo.
  - `delete-isak-study-button.tsx` sigue con el confirm en el handler.
  - El guard (`use-unsaved-changes-guard.ts:26-57`) confirma desde handlers y listeners, nunca
    dentro de una transición.
- **Sin `key` que cambie con los datos guardados:** [x]
  - `informe/page.tsx` no pone `key` al `ReportEditor`.
  - En `consultas/[consultationId]/page.tsx` e `isak-card.tsx` no hay ningún `key=`.
  - Los props que cambian al revalidar (`hasPdf`, `lastPdfLabel`, `stale`, `licenseMissing` y el
    modelo) se leen siempre de props.
- **Guarda de cambios sin guardar:** [x]
  - `dirty` compara contra el snapshot `saved`, que se actualiza solo si la action sale bien.
  - `beforeunload` y un clic en captura sobre `<a>` internos. Ignora `_blank`, `download`, teclas
    modificadoras y la misma ruta.
  - El link de volver pasa por `guardNavigation`.
- **Privacidad:** [x]
  - No encontré nombres ni datos de pacientes del PDF de ejemplo ni de `ISAKMetry_*` en el código,
    los tests ni los scripts. Busqué con grep "daiana", "ponce", "isakmetry" y "EJEMPLO".
  - Los tests usan "Paciente de prueba" y "Ana Pérez".
  - El PDF de ejemplo no está modificado.
- **UI:** [x]
  - Solo se usan componentes del sistema: `Card`, `PageHeader`, `Alert`, `Badge`, `Button`,
    `ButtonLink`, `Textarea`, `FormError`, `Table`, `useConfirm` y `notify`.
  - No hay colores nuevos en el panel. La paleta nueva está solo en `pdf-theme.ts`.
  - `tailwind.config.ts` no se tocó.
  - El textarea con `<label htmlFor>` propio, en lugar de `Field`, está justificado (impl,
    decisión 9) y conserva la accesibilidad: `aria-invalid`, `aria-describedby` y `role="alert"`.

## Dudas (no bloqueantes)
- **"→" en el PDF.** La HU (Gherkin "Somatotipo", línea 268) pide
  "Endomorfia 4,95 → 4,03 · …" en el PDF. `anthropometric-report-pdf.tsx:81-83` lo reemplaza
  por " a " porque el subset latin de Inter no trae U+2192. Es una desviación visible del
  criterio de aceptación, documentada y razonable, pero la tiene que aceptar el usuario. La
  alternativa es dibujar la flecha con `Svg` o sumar un subset con ese glifo. El panel sigue
  mostrando "→".
- **Placeholder "M.P. 852".** Aparece en `apps/web/src/app/(panel)/ajustes/settings-form.tsx:180`
  y en el comentario de `schema.prisma:25`. Es la matrícula real de la profesional que figura en
  el informe de ejemplo. Lo pidió la SDD (7.5), así que no es del implementer, y no es un dato de
  un paciente. Aun así conviene un placeholder genérico (p. ej. "M.P. 1234") para no dejar datos
  del PDF de ejemplo en el código.
- **Recorrido en el navegador incompleto.** Según `progress/recorrido_HU-007.md`, "Generar PDF",
  "Enviar por WhatsApp", el aviso de PDF desactualizado y el borrado con informe no se probaron
  en el navegador. Lo que cubre el código (actions, tests de db y bot) está bien, pero el
  orquestador o el usuario deberían completar los pasos 4 a 10 y 15 de la sección 12 de la SDD
  antes del merge.
- **Detalle de UX.** Si "Generar PDF" guarda los textos y después falla el render, el snapshot
  `saved` del cliente no se actualiza aunque la base ya tenga los textos. La página queda "dirty"
  hasta que se guarde de nuevo. No se pierde nada.
- **Pendiente heredado de la SDD, fuera de esta HU.** `docs/EJEMPLO DE INFORME
  ANTROPOMETRICO.pdf` sigue versionado en el historial de la rama.
