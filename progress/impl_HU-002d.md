# impl HU-002d — `rediseno-ui-nutricion-portal` (rediseño UI 4/4: nutrición y portal)

**Estado: done.** Se completaron las 13 fases del checklist de la SDD
(`Refactorizaciones/rediseno-ui-nutricion-portal.md` §11). Resultado: typecheck en verde en los
4 workspaces, 56 tests en verde, `verify.sh` con exit 0, todos los greps de §13.2 y §13.3 en 0 y el
CLI de Tailwind compila el config sin alias.
No se commiteó.

> ## ⚠️ ACCIÓN PARA EL USUARIO AL CERRAR LA HU
> **Hay que reiniciar `npm run dev`** (Ctrl-C y `npm run dev`) para que el dev tome el
> `tailwind.config.ts` sin alias LEGACY. Tailwind 3.4 en Node 24 no recarga el config: el dev de
> hoy (PID 86416) sigue con el config con el que arrancó. **No debería cambiar nada visible.** Si
> después del reinicio algo pierde un color o un borde, es un alias que se escapó y hay que avisar
> (ver §13.6 de la SDD, "Después del recorrido"). No lo reinicié yo.

> **Nota de sesión:** un límite de uso de la API cortó la ejecución a la mitad. La retomé sin
> rehacer nada. Al retomar, las fases 0 a 11 ya estaban hechas y verificadas (lo confirmé con
> `git status`/`git diff`). Faltaban la fase 12 (páginas temporales) y la 13 (cierre), y las
> terminé.

## Restricciones duras (copiadas de la SDD §2.1)

1. **Cero cambios de funcionalidad**, salvo el formato del "Total del plan" del PDF, que pidió el
   usuario (§4 D-d3). No se tocan:
   - Ninguna server action: `alimentos/actions.ts`, `plantillas/actions.ts`,
     `portal/diario/actions.ts`, `pacientes/[id]/planes/[planId]/actions.ts`, `ai-actions.ts`.
   - Ninguna consulta: los `listFoods`, `getTemplate`, `listTemplates`, `prisma.*` y
     `Promise.all([...])` de las `page.tsx` quedan **idénticos**.
   - El schema, `packages/db`, `apps/bot`, las rutas del portal (`portal/login`, `portal/logout`,
     `portal/plan/pdf`, `portal/diario/photo/[id]`), `(portal)/layout.tsx`, `middleware.ts`,
     `auth*.ts`, el shell (`components/shell/**`, `(panel)/layout.tsx`), `confirm.tsx`,
     `data-table.tsx`, `modal.tsx` y `primitives/**`.
   - En `api/appointments/route.ts` solo cambian los **dos strings de color** (§4 D-d5): la consulta
     y la forma del JSON quedan iguales.

   Si un reordenamiento obliga a mover algo, se mueve **con su lógica tal cual**: mismo
   `useActionState`, mismos `name` de los campos, mismos `hidden`, misma action con los mismos
   argumentos. El server action inline `toggleActive` de `alimentos/[id]/page.tsx` queda
   **textual**.
2. **No correr `next build` ni levantar otro `next dev`.** El usuario tiene el suyo en el puerto 3000
   (PID 86416). Esta HU **sí toca `tailwind.config.ts`**, pero **solo en la última fase de código
   (fase 11)**. **No reiniciar el dev del usuario.** Anotar en `impl` que hay que reiniciarlo al
   cerrar la HU.
3. **WhatsApp: nada.** "Enviar por WhatsApp" no se toca. El PDF se genera **solo para mirarlo**
   (fixtures en memoria o la ruta temporal de solo lectura `prueba-pdf`). Nunca con "Generar PDF" de
   un plan real.
4. **Base de desarrollo: solo lectura.** No se guarda ningún formulario. Los flujos de escritura se
   prueban solo en las páginas temporales, con **acciones falsas en memoria**.
5. Rama `hu-002-rediseno-ui-empresarial`. **No commitear.** No tocar los archivos ajenos que ya
   estaban.
6. No correr `prisma migrate`, `db push`, `db:seed` ni `seed:demo`.
7. **Límite servidor/cliente:** ninguna `page.tsx` le pasa funciones a un componente cliente, salvo
   server actions. `MealsEditor`, `MacroTotals` y `PortalPlanView` quedan **sin** `"use client"`.
8. **`useConfirm` nunca dentro de `<form action>` ni de `startTransition`.** En el portal no hay
   `ConfirmProvider` ni `TooltipProvider`.
9. Las páginas temporales **las borra el orquestador** después del recorrido, junto con sus tipos en
   `apps/web/.next/types/`.
10. Sin `console.*`, `TODO` ni `FIXME` en los archivos de la HU.

## Fase 0: preflight

- Rama: `hu-002-rediseno-ui-empresarial`.
- `git status --porcelain` inicial: `?? docker-compose.prod.yml` (ajeno, no se tocó).
- `pgrep -fl "next dev"` → PID **86416**. No corrí `next build` ni levanté otro dev.
- Línea base: `npm run typecheck` en verde, `npm run test` en 49/49 y `curl /login` → 200.
- Leí §2.1, §4 D-d6 y §6.3 (reglas duras, orden del cierre de LEGACY y patrón de `useConfirm`).
- Skills: `ui-ux-pro-max` (consultas de UX sobre tablas, áreas táctiles y etiquetas de formulario,
  que coinciden con la SDD) y `ui-styling` antes del JSX. `web-design-guidelines` como autochequeo
  final (ver más abajo).

## Fase 1: `packages/core`

- `nutrition.ts`: se agregan `formatMacroAmount` y `formatMacrosLine` al final, textuales a §6.1.
  El `NBSP` va escrito como `" "` (el mismo carácter, visible en el código). No se borró ni
  cambió ninguna línea existente (`git diff -U0 | grep "^-[^-]"` → vacío).
- `nutrition.test.ts`: `describe("formato de macros (es-AR)")` con los 7 casos de §12. La única
  línea "borrada" del diff es el import, que suma los dos nombres.
- `npm run test` → **56/56**. `npm run typecheck` en verde en core, db, bot y web.

## Fase 2: componentes compartidos

- `components/submit-button.tsx` (nuevo, cliente): usa `useFormStatus` y la firma de §6.2.
- `components/macro-totals.tsx` (nuevo, server-safe): usa `gap-px bg-border`, y "Energía" lleva
  `col-span-2 sm:col-span-1`.
- `pacientes/[id]/planes/[planId]/page.tsx`: el `<dl>` y `totalCells` pasan a
  `<MacroTotals totals={totals} />` dentro del mismo envoltorio `sticky`. Se saca `Quantity` del
  import. Nada más cambió.
- `components/meals-editor.tsx` reescrito según §7.6. Mantiene los mismos props, tipos, 4
  `<form action=`, 4 `name={ownerField}` y el mismo conjunto de `name`, todo verificado con diff.
  "Quitar" lleva `aria-label="Quitar <alimento> de <comida>"`, que contiene el texto visible.

## Fase 3: PDF

- `lib/plan-pdf.tsx`: se borró la `macrosLine` local, se importó `formatMacrosLine` y se usa en
  `styles.totalsLine`. `PlanPdfInput`, `PlanDocument` y `renderPlanPdf` no cambiaron.
- **Render real con fixtures** (§13.4), 3 comidas y total > 1.000 kcal:
  - `pdftotext` → `Total del plan` / `1.515 kcal · P 123,2 g · C 164,3 g · G 39,1 g`. Coma decimal,
    kcal sin decimales y separador de miles.
  - El `od -c | grep -c "302 240"` da **0**: `pdftotext` normaliza el espacio duro a un espacio
    común (el volcado muestra un solo byte `' '`). Como dice la SDD, lo decisivo es el test de
    vitest (caso 7). El orquestador lo mira además en el visor.
  - `pdffonts` → Inter-SemiBold, Inter-Regular e Inter-Medium **embebidas**.
  - **Decisión no obvia sobre el script temporal:** `npx tsx` con la copia tal cual falla con
    `ERR_PACKAGE_PATH_NOT_EXPORTED` (`@react-pdf/hyphenate/en-us` en modo CJS) y después con
    `React is not defined` (JSX clásico). Se resolvió **solo en la carpeta temporal**, con un
    `package.json` `{"type":"module"}` y un `import React` en la copia. El código real no cambió.
    `apps/web/.tmp-pdf-002d/` se borró (no queda en `git status`) y el PDF quedó en el
    scratchpad.

## Fase 4: alimentos

- `foods-list.tsx`: pasa a `DataTable`, con las columnas a nivel de módulo según §7.1.
  - Muestra el badge "Inactivo" en vez de la opacidad.
  - Buscador con ícono y `Select aria-label="Filtrar por grupo"`.
  - Los dos estados vacíos y "Limpiar filtros".
  - `FoodRow` y los props no cambiaron.
- `food-form.tsx`:
  - `<fieldset>`/`<legend>` "Composición cada 100 g" con 5 `NumberInput` (kcal/g).
  - Mismos `name`, `required`, `step` y `min`.
  - `useActionToast("Alimento guardado")`, `FormError` y botón `loading`.
- `page.tsx` usa el ícono `Plus`. `nuevo/page.tsx` y `[id]/page.tsx` usan `PageHeader back`, badge
  `success`/`neutral`, `SubmitButton` para activar y desactivar, y `Alert` si el alimento está
  inactivo. `toggleActive` quedó **textual**.
- Nuevos: `alimentos/loading.tsx` y `alimentos/[id]/loading.tsx`.

## Fase 5: plantillas

- `[id]/delete-template-button.tsx` usa el fragmento de §6.3 tal cual y la prop `deleteAction?`.
  Verificación: `grep "<form\|action="` → 0, `confirm(` → solo `await confirm({` (más el
  comentario) y `requestSubmit` → 0.
- `template-meta-form.tsx`: `Textarea rows={3}`, `useActionToast("Plantilla guardada")` y
  `FormError`.
- `new-template-form.tsx` (+`onCancel?`) y `new-template-dialog.tsx` (nuevo, mismo patrón que
  `manual-payment-dialog`).
- `templates-table.tsx` (nuevo). `page.tsx` con `EmptyState` o la tabla. `[id]/page.tsx` con la
  estructura del detalle del plan (franja `sticky` con `MacroTotals`, grid con el editor y la
  columna lateral).
- Nuevos: `plantillas/loading.tsx` y `plantillas/[id]/loading.tsx`. El segundo es una copia del de
  planes con una sola tarjeta lateral, porque la plantilla tiene una sola.

## Fase 6: portal

- `plan/plan-view.tsx` (nuevo, server-safe) y `plan/page.tsx`: `EmptyState` sin plan, "Descargar
  PDF" (`<a>` + `buttonVariants` lg) arriba y `MacroTotals` sin `sticky`.
- `page.tsx`: `ButtonLink` lg a ancho completo en el celular, peso con `Quantity` y "Obras sociales"
  al final con badges `neutral`. La lista se calcula en una variable en vez del IIFE: la consulta
  es la misma.
- `evolucion/page.tsx`: `EvolutionChart unit="kg"`, historial con `Quantity` y `EmptyState`.
- `diario/diary-form.tsx` (+`submitAction?`): etiquetas visibles, selector de archivo
  `file:h-11`, botón lg y toast. El `useEffect` de reset no cambió.
- `diario/page.tsx`: `<section>` con `h2`, `<time>` y `SubmitButton` lg con
  `aria-label="Borrar registro del <fecha>"`.
- `loading.tsx`: una sola columna.
- Revisión 6.6: `useConfirm|primitives/tooltip` en `(portal)` → 0. `Button/ButtonLink/SubmitButton`
  sin `size="lg"` en la misma línea: solo aparece `diario/page.tsx:49` (`<SubmitButton` multilínea),
  que lleva `size="lg"` dos líneas más abajo (revisado a mano).
- No se sacaron los "← Volver" del portal por otra vía: la barra de pestañas de la 002a sigue
  intacta.

## Fase 7: O-c2 (calendario)

- `api/appointments/route.ts`: `"#16a34a"` → `"hsl(var(--success))"`, `"#dc2626"` →
  `"hsl(var(--destructive))"` y un comentario de una línea. El diff es exactamente eso.
- `calendar-client.tsx`: la leyenda se renderiza siempre, con "Servicios" (si hay) y "Estados:
  Completado / No asistió".
- **Pendiente para el recorrido:** confirmar que FullCalendar aplica el `var()` inline. Si el evento
  queda azul, hay que aplicar el plan B (`#396F51` / `#B53A36`). No lo pude ver sin navegador.

## Fases 8 a 11: cierre del sistema viejo

- **Fase 8:** grep de los tonos viejos → 0. Se borraron `slate/green/red/amber/blue` y el
  comentario de `badgeTones`. typecheck en verde.
- **Fase 9:** grep `press|reveal` en `*.tsx` → 0. Se borró de `globals.css` el bloque LEGACY
  (`.press`, `.press:active`, `@keyframes reveal`, `.reveal`). `curl /login` → **200**.
- **Fase 10:** §13.3 (1) a (5) → **0 líneas cada uno**.
- **Fase 11:** en `tailwind.config.ts` se borraron `fontFamily.display`, el bloque LEGACY de
  `colors` (`ink`, `leaf`, `mint`, `paper`, `line`, `brand`), `borderRadius.card` y `boxShadow`
  entero. El resto quedó textual.
  - §13.3 (6) → 0.
  - **CLI de Tailwind** (§13.5): compila sin errores ("Done in 331ms"). Clases viejas en el CSS
    generado: **0**. Clases nuevas: `.theme-warm` 2, `.bg-success-muted` 1, `.text-muted-foreground`
    1, `.bg-destructive` 2, `.rounded-lg` 1, `.file\:h-11` 1, `.first-letter\:uppercase` 1 y
    `.gap-px` 1 (todas ≥ 1).
  - `curl /login` → **200**, con el dev sin reiniciar.

## Fase 12: páginas temporales (LAS BORRA EL ORQUESTADOR)

1. `apps/web/src/app/(panel)/prueba-002d/page.tsx` + `prueba-002d-client.tsx`:
   - Alimentos: 120 filas, 10 inactivas, una con kcal de 4 cifras, más la instancia vacía.
   - Plantillas: 12 filas, 4 sin notas y 2 con notas largas.
   - `MacroTotals` (2016.8 / 130.6 / 241.2 / 61.3 / 20).
   - `MealsEditor` con 3 comidas (una con 4 ítems con macros y notas, una libre sin gramos y una
     vacía) y otro sin comidas. Todas las acciones son `accionFalsa` (700 ms).
   - `DeleteTemplateButton deleteAction={borradoFalso}` (800 ms + toast "Página de prueba: no se
     borró nada").
2. `apps/web/src/app/(panel)/prueba-002d/portal/page.tsx` + `portal-client.tsx`: envuelto en
   `theme-warm`. Tiene `PortalPlanView` con `hasPdf` y nombres largos, `DiaryForm` con `diarioFalso`
   (mismo texto de error que la action) y una tarjeta con una foto PNG de 1200 × 800 generada con
   `canvas` (sin binarios en el repo).
3. `apps/web/src/app/(panel)/prueba-002d/360/page.tsx`: 4 iframes de 360 × 780 (`/portal`,
   `/portal/plan`, `/portal/evolucion` y `/portal/diario`).
4. `apps/web/src/app/(panel)/prueba-pdf/route.ts`:
   - `GET ?planId=` con `auth()`, porque los route handlers no pasan por el layout del panel.
   - Lee lo mismo que `buildAndSavePdf` y devuelve `application/pdf` inline.
   - No guarda, no revalida y no encola. Da 404 si no existe el plan.

Verificación 12.2:
- En `prueba-002d` no hay ningún import de `actions.ts`. Los únicos `@/app/...` son los
  componentes `plan-view` y `diary-form`.
- `grep savePlanPdf|revalidatePath|enqueue` en `prueba-pdf/route.ts` → 0. Reescribí el comentario
  de cabecera para que no nombrara esas funciones.

Limpieza (§13.7):
```bash
rm -r "apps/web/src/app/(panel)/prueba-002d" "apps/web/src/app/(panel)/prueba-pdf"
rm -rf "apps/web/.next/types/app/(panel)/prueba-002d" "apps/web/.next/types/app/(panel)/prueba-pdf"
```
Ojo: el dev del usuario registró estas rutas en `.next/types/routes.d.ts`/`validator.ts`. Justo
después de crearlas, `tsc` falló unos segundos con tipos viejos, hasta que el dev regeneró los
tipos. Al borrarlas puede pasar lo inverso: si `typecheck` falla con `prueba-*` en
`.next/types/validator.ts`, hay que esperar a que el dev los regenere o borrar esas referencias.

## Fase 13: verificación final

| Comando | Resultado |
|---|---|
| `npm run typecheck` (4 workspaces) | verde, 0 `error TS` |
| `npm run test` | **56/56** (7 archivos) |
| `./ops/harness/verify.sh` | exit 0, "Arnés OK." |
| `git diff --stat -- packages/db apps/bot` | vacío |
| `git diff --stat -- packages/core` | solo `nutrition.ts` y `nutrition.test.ts` |
| Diff de archivos protegidos (§13.2) | vacío |
| `PlanPdfInput` en el diff | vacío; `formatMacrosLine` aparece en el import y en 1 uso |
| Consultas HEAD vs. ahora (8 páginas) | todas idénticas |
| `toggleActive` | textual |
| Conjuntos de `name` (5 archivos + editor) | idénticos; `name={ownerField}` ×4 y `<form action=` ×4 |
| §13.3 (1)–(6), repetidos al final con las páginas temporales incluidas | 0 en todos |
| `.tmp-pdf` en `git status` | 0 |
| `curl /login` | 200 |
| `next build` | no se corrió (dev levantado, PID 86416) |

**Contrato compartido:** las firmas coinciden con §6.1 y §6.2: `formatMacroAmount`,
`formatMacrosLine`, `SubmitButton`, `MacroTotals`, `MealsEditor` (API idéntica), `FoodRow`/`FoodsList`,
`TemplateRow`/`TemplatesTable`, `NewTemplateDialog`, `NewTemplateForm({ onCancel? })`,
`DeleteTemplateButton({ id, deleteAction? })`, `PortalPlanView` y `DiaryForm({ submitAction? })`.
`Badge.tone` queda en `neutral|success|danger|warning|info`.

**Autochequeo `web-design-guidelines`** (sin cambios necesarios; lo que queda está fuera del
alcance o ya lo decidió la SDD):
- "Borrar comida" y "Borrar" del diario siguen sin confirmación, como hoy (O-d1, O-d2).
- El `<img>` del diario no tiene `width`/`height` (ya pasaba antes; el tamaño es desconocido y lo
  acota `max-h-64`).
- Los filtros de alimentos no van en la URL (hoy tampoco).
- La tabla de alimentos no está virtualizada: son 90 filas, igual que la de pacientes de la 002b.
- Los placeholders "Ej: …" no terminan en "…": son los textos fijados por la SDD.

**No verificado (necesita navegador, lo hace el orquestador en el recorrido §13.6):**
- El aspecto visual.
- Que FullCalendar aplique el `var()` (plan B pendiente si no).
- Las medidas de 44 px en los iframes de 360 px.
- El deadlock del diálogo de "Borrar plantilla" (el código sigue el patrón aprobado).
- El espacio duro en el visor de PDF.
- `/prueba-pdf` con un plan real (solo lectura).

## Archivos

**Modificados:**
- `packages/core/src/nutrition.ts`, `nutrition.test.ts`
- `apps/web/tailwind.config.ts`, `src/app/globals.css`, `src/components/ui.tsx`,
  `src/components/meals-editor.tsx`, `src/lib/plan-pdf.tsx`
- `src/app/api/appointments/route.ts`, `src/app/(panel)/calendar-client.tsx`,
  `src/app/(panel)/pacientes/[id]/planes/[planId]/page.tsx`
- `(panel)/alimentos/{page,foods-list,food-form}.tsx`, `nuevo/page.tsx`, `[id]/page.tsx`
- `(panel)/plantillas/{page,new-template-form}.tsx`, `[id]/{page,template-meta-form,delete-template-button}.tsx`
- `(portal)/portal/{page,loading}.tsx`, `plan/page.tsx`, `evolucion/page.tsx`,
  `diario/{page,diary-form}.tsx`

**Creados:**
- `src/components/submit-button.tsx`, `src/components/macro-totals.tsx`
- `(panel)/plantillas/templates-table.tsx`, `new-template-dialog.tsx`
- `(portal)/portal/plan/plan-view.tsx`
- `(panel)/alimentos/loading.tsx`, `alimentos/[id]/loading.tsx`, `plantillas/loading.tsx`,
  `plantillas/[id]/loading.tsx`
- Las páginas temporales de la fase 12.

**Migraciones:** ninguna. **Base:** no se escribió nada. **WhatsApp:** nada. **Seeds:** no.
