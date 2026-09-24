# Review — HU-002b (`rediseno-ui-pacientes`)

**Veredicto:** APPROVED (ronda 2, sobre la HU-002b completa)

## Ronda 2 (resolución 1)

Lo verificó el reviewer, sin tomar como dato el reporte del implementer.
- `npm run typecheck`: limpio en core, db, bot y web.
- `npm run test`: 7 archivos, 49/49 OK.
- `./ops/harness/verify.sh`: "Arnés OK".
- Archivos modificados después de la review anterior (`find -newer progress/review_HU-002b.md`):
  solo `delete-plan-button.tsx`, `evolution-charts.tsx`, `components/confirm.tsx` y la SDD
  (más `tsconfig.tsbuildinfo`, que es artefacto de tsc). La ronda no tocó nada más.

### Punto 1 (deadlock de "Borrar plan"): RESUELTO
- `apps/web/src/app/(panel)/pacientes/[id]/planes/[planId]/delete-plan-button.tsx:15-25`: ya no hay
  `<form action>`. `await confirm(...)` corre en `handleClick`, el `onClick` de un `Button type="button"`
  (líneas 28-34), fuera de toda transición. Solo con `ok === true` se llama a
  `startTransition(async () => { await deletePlanAction(planId, patientId); })`. Son la misma action y
  los mismos argumentos que en HEAD.
- Se conservaron el título, la descripción, `confirmLabel` "Borrar plan", el estilo destructivo
  (`destructive` por defecto de `ConfirmOptions` y clases `text-destructive`) y `Trash2 aria-hidden`.
- **Doble disparo:** `loading={pending}` (línea 32). En `components/ui.tsx:133-134` eso pone
  `disabled` y `aria-busy`. `isPending` de `useTransition` pasa a `true` apenas arranca el
  `startTransition`, y mientras el diálogo está abierto el overlay modal bloquea un segundo clic.
  Si llegara una segunda llamada a `confirm()`, `confirm.tsx:37-40` cancela la anterior con `false`.
  No encontré ningún camino para borrar dos veces.
- El recorrido del orquestador (`progress/recorrido_HU-002b.md`, "Ronda de resolución 1") confirma
  lo esencial en el navegador: el `alertdialog` abre con el foco en "Cancelar", Escape lo cierra y el
  plan sigue en la base.
- El desvío respecto de §7.9 está justificado en `impl_HU-002b.md`. La SDD lo marca como corregido
  en `Refactorizaciones/rediseno-ui-pacientes.md:817`.

### Punto 2 (subtítulo falso): RESUELTO
- `apps/web/src/app/(panel)/pacientes/[id]/evolution-charts.tsx:110`: ahora dice
  `"Peso en kg a la izquierda, grasa en % a la derecha."`. Es cierto siempre, porque describe los
  ejes. `hasWeightAndFat` (línea 83) no cambió.

### JSDoc de `useConfirm`: sin cambio de comportamiento
- `git diff HEAD -- apps/web/src/components/confirm.tsx`: el diff solo agrega un bloque de comentario
  `/** … */` en las líneas 93-103, justo antes de `export function useConfirm()`. No cambió ninguna
  línea de código. El texto describe bien el mecanismo y el patrón correcto, así que cubre la duda
  de la ronda anterior para 002c y 002d.

### Observaciones (no bloqueantes)
- Si `deletePlanAction` tira un error (no un `redirect`), el error se propaga desde el
  `startTransition` al error boundary de la ruta. Es el mismo comportamiento que las otras actions
  disparadas desde el cliente, así que es aceptable.
- Las páginas temporales `(panel)/prueba-002b`, `prueba-error` y `prueba-pdf` siguen ahí. El
  orquestador tiene que borrarlas antes de cerrar la HU y de commitear (C5).
- Siguen pendientes las dudas de la ronda anterior (formato de `macrosLine` en el PDF, base cero en
  perímetros, fecha por KPI, recorridos no hechos: `/login` sin sesión, reduced motion, `riskFlag`).
  Ninguna bloquea.

## Checkpoints (estado final)
- C1 backlog válido, 1 HU activa: [x]
- C1 progress/current.md refleja la HU: [x]
- C1 verify.sh exit 0: [x]
- C2 HU completa y validada: [x]
- C2 SDD con workspaces, checklist y contrato: [x] (§7.9 anotado como corregido)
- C2 firmas = Contrato compartido: [x] (`DeletePlanButton({ planId, patientId })`, `deletePlanAction`,
  `useConfirm` sin cambios de firma)
- C3 lógica en lugar correcto / schema / migraciones: [x] (no aplica)
- C3 rutas protegidas / portal: [x]
- C3 bot: [x] (no aplica)
- C3 sin console.log ni TODO: [x]
- C4 typecheck limpio: [x]
- C4 tests core: [x] (49/49)
- C4 flujo del bot: [x] (no aplica)
- C4 PDF verificado: [x] (ronda 1)
- C5 impl_HU-002b.md describe lo tocado: [x] (incluye "Ronda de resolución 1")
- C5 review con veredicto: [x]
- C5 sin scripts ni datos de prueba sueltos: [ ] solo por las rutas `prueba-*`, que se dejaron a
  propósito y que el orquestador borra al cerrar. No es un hallazgo del implementer. En la base no
  quedaron datos de prueba: el recorrido no confirmó ningún borrado.

---

# Ronda 1 (histórico)


Verificado por el reviewer (no por el reporte del implementer): `npm run typecheck` limpio en
core, db, bot y web. `npm run test`: 7 archivos, 49 tests OK. `./ops/harness/verify.sh`: "Arnés OK".
`git diff` contra el checklist de la SDD §11 y el radio de impacto §10: coincide. `packages/`,
`apps/bot`, las server actions, `middleware.ts`, `confirm.tsx` y el portal no cambiaron. Los bloques
de consulta de `pacientes/[id]/page.tsx` y `planes/[planId]/page.tsx` son iguales a los de HEAD.

## Checkpoints
- C1 backlog válido, 1 HU activa: [x]
- C1 progress/current.md refleja la HU: [x]
- C1 verify.sh exit 0: [x]
- C2 docs/hu-rediseno-ui-empresarial.md completa y validada: [x]
- C2 SDD con workspaces, checklist y contrato: [x]
- C2 firmas del diff = "Contrato compartido" §6.2: [x] (`PATIENT_TABS`, `PatientTabs`, `PatientTabLink`,
  `EvolutionChart` +unit/decimals/showValues, `StudyComparisonChart`, `evolution-series.ts`,
  `chart-theme.ts`, `pdf-theme.ts`, `PlanPdfInput`/`renderPlanPdf` sin cambios, `bare` en esqueletos)
- C3 lógica en el lugar correcto: [x] (sin cambios en `packages/`; `evolution-series.ts` en web por §12)
- C3 schema/domain: [x] (no aplica, sin cambios)
- C3 migraciones: [x] (no aplica)
- C3 rutas protegidas / portal solo sus datos: [x] (todo bajo `(panel)`, que pasa por el layout con `auth()`
  y el matcher de `middleware.ts`; el portal no se tocó. Las rutas `prueba-*` son temporales y
  también quedan detrás del middleware)
- C3 bot en silencio / textos: [x] (no aplica, `apps/bot` sin cambios)
- C3 sin console.log ni TODO: [x]
- C4 typecheck limpio: [x]
- C4 tests core: [x] (no hay lógica nueva en core; 49/49 pasan)
- C4 flujo del bot simulado: [x] (no aplica)
- C4 PDF verificado con el resultado real: [x] (fixtures del implementer con pdffonts/pdftotext y
  `/prueba-pdf` en el navegador durante el recorrido del orquestador)
- C5 impl_HU-002b.md existe y describe lo tocado: [x]
- C5 review con veredicto: [x]
- C5 sin scripts ni datos de prueba sueltos: [ ] quedan `(panel)/prueba-002b`, `prueba-error` y
  `prueba-pdf`. Están a propósito y los borra el orquestador antes de cerrar la HU (no los cuento
  como hallazgo del implementer). `apps/web/.tmp-pdf-test/` no existe (ya borrado).

**Checkpoint funcional que falla (bloqueante):** Gherkin "Confirmación de una acción destructiva" /
SDD §7.9 y §13.5.5. "Borrar plan" no abre el diálogo, así que hoy **no se puede borrar un plan**.
Es una regresión: con el `confirm()` nativo de HEAD funcionaba.

## Cambios requeridos

1. **`apps/web/src/app/(panel)/pacientes/[id]/planes/[planId]/delete-plan-button.tsx:11-23`: deadlock
   de `useConfirm` dentro de una form action (bloqueante).** Confirmé en el código la causa que
   sospechaba el recorrido. El `<form action={async () => …}>` hace que React 19 corra la función
   dentro de una transición (async action). `confirm()` (`components/confirm.tsx:35-42`) llama a
   `setPending` en la parte síncrona de esa action, así que la actualización toma el lane de la
   transición. React no la confirma hasta que la promesa de la action se resuelve, y esa promesa
   espera a que el usuario conteste un diálogo que nunca se monta. Por eso no aparece el
   `alertdialog`, no hay errores en la consola y el plan no se borra. El mismo mecanismo
   (`pending` de la transición colgado) también bloquea los clics siguientes.
   Lo que hay que cambiar: pedir la confirmación **fuera** de cualquier transición o form action,
   es decir en un handler de evento (`onClick` de un `Button type="button"`, o `onSubmit` con
   `preventDefault` incondicional). Recién con `true` se llama a
   `deletePlanAction(planId, patientId)` dentro de `startTransition`, con la misma action y los
   mismos argumentos. Hay que conservar el título, la descripción, `confirmLabel`, el estilo
   destructivo y el ícono `Trash2`. Mientras la action corre, el botón va deshabilitado o con
   `loading`, para que no se dispare dos veces. Esto se aparta a propósito del fragmento de la SDD
   §7.9 (líneas 815-830 de `Refactorizaciones/rediseno-ui-pacientes.md`), que es el que tiene el
   bug: el implementer lo copió tal cual. Anotarlo en `impl_HU-002b.md` como desvío justificado.
   Verificación que se pide: el orquestador repite §13.5.5 en el navegador (diálogo con foco en
   "Cancelar", Escape y "Cancelar" no borran). Sin confirmar el borrado, salvo sobre un plan creado
   para la prueba y borrado por id.

2. **`apps/web/src/app/(panel)/pacientes/[id]/evolution-charts.tsx:110`: subtítulo falso.**
   `description="Cada fecha con las dos medidas."` no está en la SDD (§7.5 no define descripción
   para esta tarjeta) y no es cierto. `hasWeightAndFat` (línea 83) se cumple con **cualquier**
   medición de peso y **cualquier** medición de grasa, aunque sean de fechas distintas.
   `ComparativeChart` une las fechas y deja huecos, y el recorrido lo vio con datos reales: ninguna
   fecha tenía las dos medidas. Arreglo mínimo, sin cambiar la condición de HEAD: sacar la
   descripción o reemplazarla por un texto que sea cierto siempre (p. ej. "Peso en kg a la
   izquierda, grasa en % a la derecha."). Entra en esta ronda porque es texto nuevo de esta HU que
   le da información falsa a la profesional, y cuesta una línea.

## Dudas (no bloqueantes)

- **Contrato de `useConfirm` de la 002a (`components/confirm.tsx:93` y
  `Refactorizaciones/rediseno-ui-fundaciones.md:303-305`).** El "uso previsto"
  (`if (!(await confirm(...))) return;`) no avisa que **no** se puede llamar dentro de una form
  action ni de `startTransition`. En esta HU `delete-plan-button.tsx` es el único consumidor
  (`grep useConfirm` → 1). Pero la 002c (`avisos/broadcast-form.tsx`) y la 002d
  (`plantillas/[id]/delete-template-button.tsx`) van a migrar con el mismo patrón.
  `delete-template-button.tsx:8-12` tiene exactamente la forma de `<form action={async…}>` y va a
  fallar igual si se copia la SDD. `broadcast-form.tsx:17-24` confirma en `onSubmit` de forma
  síncrona. Con un `confirm` async hay que hacer `preventDefault` siempre y después despachar la
  action de `useActionState` dentro de `startTransition` (no con `requestSubmit`, porque vuelve a
  entrar al `onSubmit`). Recomiendo que el orquestador:
  (a) corrija el fragmento de §7.9 de esta SDD,
  (b) deje la regla escrita en las SDD de 002c/002d antes de lanzar el architect, y
  (c) si lo acepta, sume un JSDoc en `useConfirm` con la restricción. Tocar `confirm.tsx` está
  fuera del radio de §10 de esta HU, así que no lo exijo acá.
  Hacer que `confirm()` sea inmune (diferir el `setPending` a una microtarea para escapar del lane
  de la transición) también funcionaría, pero es un parche menos obvio que arreglar el uso.
- **Formato de "Total del plan" en el PDF** (`lib/plan-pdf.tsx:106-107`): `2016.8 kcal · P 130.6g`,
  con punto decimal y sin espacio antes de "g". Es la `macrosLine` de HEAD, sin cambios, y la SDD
  §7.11 pide explícitamente "la **misma** `macrosLine(totals)` de hoy". No es un defecto de esta
  implementación y no entra en la ronda. Conviene una tarea puntual o sumarlo a la 002d o a las
  épicas de informe (44-46): formatear en es-AR con espacio duro y redondear kcal a 0 decimales.
  Ojo: cambia lo que recibe el paciente por WhatsApp.
- **Perímetros con base en cero** (diferencias de 2-4 cm casi no se ven): coincide con la SDD
  (D14 bis, `StudyComparisonChart`). Que se evalúe el formato "anterior vs. actual en barras
  horizontales" del informe real cuando se haga el informe (épicas 44-46). No entra.
- `EvolutionSummary`: cada KPI muestra el último valor **de su serie**, que puede ser de una fecha
  anterior a "Última medición: …" (p. ej. cintura medida hace 3 estudios). Es lo que pide §7.3,
  pero no se aclara la fecha por KPI. Para evaluar a futuro.
- No verificados en el recorrido: `/login` e `/inicio` sin sesión, reduced motion, Slow 4G y un
  paciente con `riskFlag` (alerta compacta). Conviene cubrirlos en el re-recorrido de la ronda 2.
