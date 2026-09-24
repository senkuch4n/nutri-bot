# Review — HU-002d

**Veredicto:** APPROVED

Revisé el diff sin commitear de la rama `hu-002-rediseno-ui-empresarial` contra la SDD
`Refactorizaciones/rediseno-ui-nutricion-portal.md` (D-d1 a D-d8 aceptadas) y la fila HU-002d de
"Resoluciones" en `docs/hu-rediseno-ui-empresarial.md`. Todos los comandos los corrí yo; no me basé
en `progress/impl_HU-002d.md`.

## Verificación propia

| Qué | Resultado |
|---|---|
| `npm run typecheck` (core, db, bot y web) | verde, exit 0 |
| `npm run test` | 56/56 (7 archivos); `nutrition.test.ts` pasa de 3 a 10 |
| `./ops/harness/verify.sh` | exit 0, "Arnés OK." (11 HU, 1 activa) |
| `git diff --stat -- packages/db apps/bot` | vacío |
| `git diff -- packages/core` | solo `nutrition.ts` (+29, 0 líneas borradas) y `nutrition.test.ts` (el import y el `describe` nuevo) |
| Archivos protegidos de §13.2 (actions, rutas del portal, `(portal)/layout.tsx`, shell, primitives, `confirm`/`data-table`/`modal`/`number-input`/`skeletons`/`evolution-chart`, `lib/*` salvo `plan-pdf.tsx`, middleware, auth y package.json/lock) | sin cambios |
| Consultas: HEAD contra ahora, en las 8 páginas (script §13.2) | idénticas |
| Conjuntos de `name` (5 archivos + `meals-editor`) | idénticos; `name={ownerField}` ×4 y `<form action=` ×4, igual que en HEAD |
| `toggleActive` (`alimentos/[id]/page.tsx:21-24`) | textual a HEAD |
| Greps §13.3 (1) a (6) sobre todo `apps/web/src` y `tailwind.config.ts` | 0 líneas cada uno |
| Tonos viejos: `"(slate\|green\|red\|amber\|blue)"` en `src` | 0 |
| CLI de Tailwind (`tailwindcss -c tailwind.config.ts -i src/app/globals.css`, salida en el scratchpad) | compila ("Done in 214ms"); 0 clases viejas en el CSS; las nuevas (`.theme-warm`, `.bg-success-muted`, `.file\:h-11`, `.first-letter\:uppercase`, `.gap-px`, `.bg-border`, `.hover\:bg-destructive-muted`…) están presentes |
| Clases usadas en `src` y ausentes del CSS generado (script propio que cruza los literales con el CSS) | 9 candidatos, todos falsos positivos: son variantes arbitrarias (`data-[state=on]:…`, `[&_…]:…`, `hover:`/`focus:` sobre `text-accent-foreground`) en `primitives/**` y `new-appointment-modal.tsx`, que esta HU no toca. Ninguna depende de un alias borrado |
| PDF real con fixtures (copia de `plan-pdf.tsx` sin `server-only` en el scratchpad, sin tocar el repo) | `pdftotext`: "Total del plan" / `1.515 kcal · P 123,2 g · C 183,3 g · G 39,1 g`; Inter 400/500/600 embebidas (`pdffonts`). `pdftotext` convierte el espacio duro en un espacio común; el U+00A0 lo cubre el test "no usa espacio común…" y confirmé los bytes `C2 A0` en el `NBSP` de `nutrition.ts` y del test |

## Puntos pedidos por el orquestador

- **Cierre de LEGACY:** `tailwind.config.ts` quedó sin `fontFamily.display`, sin el bloque
  `ink/leaf/mint/paper/line/brand`, sin `borderRadius.card` y sin `boxShadow`. El resto quedó
  textual. `globals.css` perdió solo el bloque `.press`/`.reveal` (21 líneas). `ui.tsx:317-323`:
  `badgeTones` quedó en `neutral|success|danger|warning|info`. Grep global en 0 y el CLI compila.
- **`useConfirm`:** `delete-template-button.tsx` es el fragmento de §6.3 tal cual: `type="button"`,
  sin `<form>`, `await confirm()` en `handleClick` y `startTransition` recién después (líneas
  21-31). Revisé también los otros 4 consumidores (`appointment-detail-sheet.tsx:225`,
  `avisos-view.tsx:184`, `broadcast-form.tsx:38-52` con `onSubmit` y `delete-plan-button.tsx:15`):
  todos piden la confirmación en el handler del evento, fuera de una transición. En `(portal)` no
  hay `useConfirm` ni `Tooltip`. No queda ningún `confirm()` nativo en `src`.
- **`formatMacrosLine`:** textual a §6.1, con los 7 casos de §12. Se usa en `plan-pdf.tsx:168`
  (import en `:5`; `PlanPdfInput` sin cambios) y en `meals-editor.tsx:108` con
  `{ includeFiber: true }`.
- **Portal:** todos los `Button`/`ButtonLink`/`SubmitButton` llevan `size="lg"` (`h-11`, 44 px,
  según `primitives/button.tsx:22`). El único que abre en otra línea es `diario/page.tsx:49-51`, y lo
  revisé a mano. El selector de archivo tiene `file:h-11`. "Descargar PDF" usa `buttonVariants`
  con tamaño `lg`. Ninguna página usa colores fijos: todo sale de los tokens, y `theme-warm` lo
  aplica el layout, que no se tocó. No cambia la funcionalidad: las mismas consultas filtradas por
  `patient.id`, la misma condición `plan.pdfData` para el PDF, el mismo `useEffect` de reset del
  diario y la misma action de borrado. El portal sigue mostrando solo los datos del propio paciente.
- **O-c2:** `api/appointments/route.ts:26-30`: solo cambian los dos strings, a
  `hsl(var(--success))` y `hsl(var(--destructive))`, más un comentario. Los tokens existen en
  `globals.css:25,28` como canales HSL. La leyenda de `calendar-client.tsx:186-208` sigue a §7.12.
- **Alcance:** fuera de `apps/web`, solo `packages/core/src/nutrition{,.test}.ts`. No se tocan
  actions, consultas, schema ni bot.
- **Implementación cortada en la fase 10:** no quedó nada a medias. Las fases 8 a 11 están
  completas en el diff; `.tmp-pdf-002d` no existe; los 4 `loading.tsx`, `templates-table.tsx`,
  `new-template-dialog.tsx`, `plan-view.tsx`, `macro-totals.tsx` y `submit-button.tsx` están
  completos y compilan.

## Checkpoints

- C1 `backlog.json` válido, 1 HU activa (HU-002d `en_revision`): [x]
- C1 `progress/current.md` refleja la HU en curso: [x] (ver la duda sobre la última línea)
- C1 `verify.sh` exit 0: [x]
- C2 HU con sus secciones y dudas validadas (`docs/hu-rediseno-ui-empresarial.md`, "Resoluciones"): [x]
- C2 SDD con workspaces, checklist atómico y contrato compartido: [x]
- C2 Firmas del diff = contrato (§6.1 y §6.2: `formatMacroAmount`, `formatMacrosLine`, `SubmitButton`, `MacroTotals`, `MealsEditor` con la API idéntica, `FoodsList`/`FoodRow`, `TemplatesTable`/`TemplateRow`, `NewTemplateDialog`, `NewTemplateForm({ onCancel? })`, `DeleteTemplateButton({ id, deleteAction? })`, `PortalPlanView`, `DiaryForm({ submitAction? })`, `Badge.tone`): [x]
- C3 Lógica pura en `packages/core` (el formateador), sin duplicar en web: [x]
- C3 Cambios en schema/domain y sus consumidores: [x] (no aplica: sin cambios; bot y db compilan)
- C3 Migraciones: [x] (no aplica: no hay)
- C3 Rutas nuevas protegidas y portal limitado a los datos del propio paciente: [x] (no hay rutas nuevas permanentes; `prueba-pdf/route.ts` es temporal y valida `auth()`; las consultas del portal siguen filtradas por `patient.id`)
- C3 Bot en silencio y textos según la SDD: [x] (no aplica: el bot no se toca)
- C3 Sin `console.log` de debug ni TODOs: [x]
- C4 `npm run typecheck` limpio: [x]
- C4 Lógica nueva de core con tests y `npm run test` verde: [x] (56/56)
- C4 Flujo del bot simulado sin WhatsApp: [x] (no aplica)
- C4 PDF verificado sobre el resultado real: [x] (lo rendericé yo con fixtures; ver la tabla)
- C5 `progress/impl_HU-002d.md` existe y describe lo tocado: [x]
- C5 `progress/review_HU-002d.md` con el veredicto: [x]
- C5 Sin scripts de prueba sueltos ni datos de prueba en la base: [x] con condición: quedan `(panel)/prueba-002d/` y `(panel)/prueba-pdf/`, a propósito y por encargo, y las borra el orquestador (§13.7) antes de commitear. No escriben en la base.

## Cambios requeridos (si CHANGES_REQUESTED)

Ninguno.

## Dudas (no bloqueantes)

- **Borrar las rutas temporales antes de commitear:** `apps/web/src/app/(panel)/prueba-002d/` y
  `prueba-pdf/` (más sus tipos en `apps/web/.next/types/app/(panel)/`, §13.7). Después, volver a
  correr `npm run typecheck --workspace apps/web`.
- **O-c2 sin ver en el navegador:** `progress/recorrido_HU-002d.md` no dice si FullCalendar aplicó
  `hsl(var(--success))` a los turnos COMPLETED y NO_SHOW (paso 8 de §13.6). El CSS es válido, pero
  si el evento sale azul hay que pasar al plan B (`#396F51`/`#B53A36`).
- **Falta ver en el navegador:** los iframes de 360 px, el diario del portal y el efecto del config
  sin alias. Quedan para después de que el usuario reinicie `npm run dev`, como dice §13.6.
- **`progress/current.md:69` dice `implementando`, pero `backlog.json` ya está en `en_revision`.**
  Es la bitácora del orquestador.
- **O-d1 y O-d2 siguen abiertos:** "Borrar comida" y "Borrar" del diario siguen sin confirmación,
  igual que antes. Ya está anotado como pendiente directo.
