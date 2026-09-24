# SDD — HU-002d `rediseno-ui-nutricion-portal` (Rediseño UI 4/4: nutrición y portal)

HU validada: `docs/hu-rediseno-ui-empresarial.md`. **Manda su sección final "Resoluciones"**
(D1–D18). Esta SDD cubre **solo la fila HU-002d** de la partición: alimentos (lista, alta y
edición), plantillas (lista, detalle y editor de comidas), `components/meals-editor.tsx` y **todo el
portal del paciente** (inicio, plan, evolución, diario y pantallas de acceso), con el tono cálido
de D11 y diseño mobile-first. Reordenamientos aprobados que tocan acá: **5** (alimentos en una
tabla densa con encabezado fijo, con alta y edición en panel lateral o en página) y **8** ("Plan"
en la navegación del portal, que ya hizo la 002a y acá solo se verifica).

Es la **última** HU del rediseño. Además de migrar sus pantallas, cierra el sistema viejo: borra
los alias LEGACY de `tailwind.config.ts`, el bloque LEGACY de `globals.css` y los tonos viejos de
`Badge`, y deja el grep global en 0.

Base: HU-002a, 002b y 002c, aprobadas y commiteadas en esta rama (`hu-002-rediseno-ui-empresarial`,
HEAD `ea8694a`). El contrato de UI está en `Refactorizaciones/rediseno-ui-fundaciones.md` §6.2,
§8.5 y §10, más lo que sumaron `rediseno-ui-pacientes.md` §6.2 y `rediseno-ui-agenda-gestion.md`
§6.2. Todo lo de acá se leyó contra el **código real** de `apps/web/src/components/`,
`primitives/` y las pantallas de esta HU, y contra la base de desarrollo en **solo lectura**.

Skills aplicados:

- **`refactor`**: Diagnóstico en §3, Radio de impacto en §10 y Checklist de ejecución en §11,
  atómico y sin romper nada en el medio.
- **`ui`**: cada vista con su nombre, su estructura base y sus componentes clave, en §7.

---

## 1. Resumen funcional

Las pantallas de nutrición y el portal del paciente pasan al sistema nuevo. **Alimentos** pasa a
una tabla ordenable con encabezado fijo, búsqueda y filtro por grupo; los valores van con cifras
tabulares y alineados a la derecha, y la unidad va en el encabezado de cada columna. El alta y la
edición siguen en **página propia**, con el formulario agrupado y campos numéricos con unidad.
**Plantillas** muestra la lista en una tabla y crea plantillas desde un diálogo. El detalle de una
plantilla toma la misma estructura que el detalle del plan de la 002b: franja fija de totales,
columna lateral con los datos y el editor de comidas. Para borrar una plantilla aparece el
**diálogo de confirmación del sistema** (se va el último `confirm()` nativo del repo). El
**editor de comidas**, que comparten plantillas y planes, se ordena con etiquetas visibles, campo
de gramos con unidad y botones que muestran "Agregando…" mientras trabajan. El **portal** pasa a
mobile-first con tono cálido: tarjetas claras, botones táctiles de 44 px, totales del plan
legibles en el celular y el PDF como acción principal del plan. El **PDF del plan** muestra el
"Total del plan" en formato es-AR (coma decimal, espacio duro antes de la unidad y kcal sin
decimales). Es el único cambio que ve el paciente fuera de la pantalla y lo pidió el usuario.
En el calendario, los turnos completados y ausentes pasan a los colores del sistema y quedan
explicados en la leyenda (O-c2 de la 002c). **No cambia ninguna otra funcionalidad**: son las
mismas server actions, las mismas consultas, los mismos datos y los mismos mensajes del bot.

---

## 2. Workspaces afectados

| Workspace | ¿Se toca? | Qué |
|---|---|---|
| `apps/web` | **Sí** | Pantallas de alimentos, plantillas y portal; `meals-editor.tsx`; `lib/plan-pdf.tsx` (solo el formato del total); `components/ui.tsx` (se borran tonos de `Badge`); `tailwind.config.ts` y `globals.css` (se borran los alias LEGACY); `api/appointments/route.ts` y `calendar-client.tsx` (O-c2: dos colores y la leyenda); 2 componentes compartidos nuevos; `loading.tsx` por ruta; páginas temporales de prueba |
| `packages/core` | **Sí (solo se agrega)** | 2 funciones puras nuevas de formato de macros en `nutrition.ts`, con tests (§6.1). No cambia ninguna firma existente |
| `packages/db` | **No** | Ni `schema.prisma`, ni migraciones, ni `domain/` |
| `apps/bot` | **No** | Nada. Ningún mensaje cambia. El bot solo ve el nuevo export de `@nutri-bot/core`, que no usa; su `typecheck` tiene que seguir verde |

### 2.1 Restricciones duras para el implementer (copiarlas tal cual en `progress/impl_HU-002d.md`)

1. **Cero cambios de funcionalidad**, salvo el formato del "Total del plan" del PDF, que pidió el
   usuario (§4 D-d3). No se tocan:
   - Ninguna server action: `alimentos/actions.ts`, `plantillas/actions.ts`,
     `portal/diario/actions.ts`, `pacientes/[id]/planes/[planId]/actions.ts`,
     `ai-actions.ts`.
   - Ninguna consulta: los `listFoods`, `getTemplate`, `listTemplates`, `prisma.*` y
     `Promise.all([...])` de las `page.tsx` quedan **idénticos**.
   - El schema, `packages/db`, `apps/bot`, las rutas del portal (`portal/login`,
     `portal/logout`, `portal/plan/pdf`, `portal/diario/photo/[id]`), `(portal)/layout.tsx`,
     `middleware.ts`, `auth*.ts`, el shell (`components/shell/**`, `(panel)/layout.tsx`),
     `confirm.tsx`, `data-table.tsx`, `modal.tsx` y `primitives/**`.
   - En `api/appointments/route.ts` solo cambian los **dos strings de color** (§4 D-d5): la
     consulta y la forma del JSON quedan iguales.

   Si un reordenamiento obliga a mover algo, se mueve **con su lógica tal cual**: mismo
   `useActionState`, mismos `name` de los campos, mismos `hidden`, misma action con los mismos
   argumentos. El server action inline `toggleActive` de `alimentos/[id]/page.tsx` queda
   **textual**.
2. **No correr `next build` ni levantar otro `next dev`.** El usuario tiene el suyo en el puerto
   3000 (hoy PID 86416). Esta HU **sí toca `tailwind.config.ts`**, pero **solo en la última fase de
   código (fase 11)**, cuando todo ya compila sin los alias. Ver §4 D-d6: el dev sigue funcionando
   porque se queda con el config con el que arrancó, y la verificación del config nuevo se hace con
   el CLI de Tailwind. **No reiniciar el dev del usuario.** Anotar en `impl` que hay que
   reiniciarlo al cerrar la HU.
3. **WhatsApp: nada.** "Enviar por WhatsApp" del detalle del plan **no se toca**, ni en el panel
   ni en el recorrido. El PDF se genera **solo para mirarlo**: con fixtures en memoria (§13.4) o con
   la ruta temporal de solo lectura `prueba-pdf`, que **no guarda** el PDF. Nunca con
   "Generar PDF" de un plan real, porque sobrescribe `pdfData`.
4. **Base de desarrollo: solo lectura.** No se guarda ningún formulario: alimentos, plantillas,
   comidas, ítems, metadatos ni diario. No se tocan "Activar"/"Desactivar" de un alimento,
   "Borrar comida", "Quitar", "Borrar plantilla", "Borrar" del diario ni "Salir" del portal. Los
   flujos de escritura se prueban solo en las páginas temporales, con **acciones falsas en
   memoria** (§8).
5. Rama `hu-002-rediseno-ui-empresarial`. **No commitear.** Anotar el `git status --porcelain`
   inicial y no tocar los archivos ajenos que ya estaban: `docker-compose.prod.yml` y los
   `backlog.json`/`progress/*` que modifica el orquestador.
6. No correr `prisma migrate`, `db push`, `db:seed` ni `seed:demo`.
7. **Límite servidor/cliente:** ninguna `page.tsx` (server) le pasa **funciones** a un componente
   cliente, salvo server actions. `FoodsList`, `TemplatesTable` y `DataTable` reciben datos
   planos; los `cell`/`sortValue` se definen **dentro** del componente cliente.
   `MealsEditor`, `MacroTotals` y `PortalPlanView` quedan **sin** `"use client"`.
8. **`useConfirm` nunca dentro de `<form action>` ni de `startTransition`** (regla aprendida en la
   002b: en React 19 queda en deadlock, porque el diálogo no se monta y el botón queda colgado).
   Patrón exacto en §6.3, igual al de `delete-plan-button.tsx`. **En el portal no hay
   `ConfirmProvider` ni `TooltipProvider`**: ni `useConfirm` ni `Tooltip` en páginas del portal.
9. Las páginas temporales de prueba (§8) **las borra el orquestador** después del recorrido, junto
   con sus tipos generados en `apps/web/.next/types/` (§13.7).
10. Sin `console.*`, `TODO` ni `FIXME` en los archivos de la HU.

---

## 3. Diagnóstico (skill `refactor`)

Analizado en solo lectura sobre la rama (HEAD `ea8694a`). **Todos** los consumidores que quedan
de los alias LEGACY están en archivos de esta HU. El grep global (§13.3) no encuentra ninguno
fuera de `(portal)/portal/**`, `alimentos/**`, `plantillas/**` y `meals-editor.tsx`, más las
propias definiciones en `tailwind.config.ts`, `globals.css` y `ui.tsx`. No se escapó nada de las
HU anteriores. Estas pantallas ya toman la paleta nueva por los alias, pero conservan la estructura
y los restos del sistema viejo.

**Alimentos (`page.tsx`, `foods-list.tsx`, `nuevo/page.tsx`, `[id]/page.tsx`, `food-form.tsx`)**

- `foods-list.tsx` es una `<table>` a mano con `min-w-[640px]`. El encabezado usa `text-[11px]
  uppercase tracking-[0.08em]` y **no es fijo**: con 90 alimentos, al bajar se pierde qué columna
  es qué (reordenamiento 5). No se puede ordenar. El buscador y el `select` están hechos a mano
  (`border-line bg-paper … focus:border-leaf`), y el `select` no tiene nombre accesible. Los
  inactivos se marcan **solo con opacidad** (`opacity-50`), así que dependen del color. El vacío
  es un `border-dashed` y dice "Sin resultados." aunque la base esté vacía.
- Los números se muestran como el `toString()` del `Decimal` ("165.5", con punto) y sin unidad.
- `nuevo/page.tsx` y `[id]/page.tsx` arman el "← Volver a alimentos" a mano (`text-ink-soft`) en
  vez de usar `PageHeader back`. `[id]` usa `Badge tone="green"|"slate"` (tonos viejos).
- `food-form.tsx` tiene 5 campos numéricos con etiquetas "Kcal /100g" y sin unidad visible. El
  feedback es "✓ Guardado" en `reveal text-leaf-deep` y el error va en `text-red-600`, inline.
- Hoy hay 90 alimentos, todos activos: los inactivos solo se ven con fixtures.

**Plantillas (`page.tsx`, `new-template-form.tsx`, `[id]/page.tsx`, `template-meta-form.tsx`,
`delete-template-button.tsx`)**

- **`delete-template-button.tsx` usa `confirm()` nativo dentro de `<form action={async () => …}>`**.
  Es el último `confirm()` del repo (Gherkin "Confirmación de una acción destructiva",
  reordenamiento 7). Pasarlo tal cual a `await confirm()` de `useConfirm` **reproduce el deadlock
  de la 002b**, porque la form action corre en una transición.
- La lista es una `ul` con `border-line bg-paper hover:bg-mint` y una flecha "→" de texto. El vacío
  es un `border-dashed`. El alta es un formulario inline en una tarjeta arriba de la lista, con
  el error en `reveal text-red-600`.
- El detalle arma los 5 totales como tarjetas con `text-[10px] uppercase tracking-[0.14em]` y
  `font-display text-2xl font-bold`. Los números van sin formato es-AR ("1845.6") y la estructura
  **no coincide** con la del detalle del plan de la 002b (franja fija + columna lateral), aunque
  usan el mismo editor.
- **La base de desarrollo no tiene ninguna plantilla** (0 filas). El detalle solo se puede ver con
  fixtures, y crear una para mirarla es escribir en la base (prohibido).

**Editor de comidas (`components/meals-editor.tsx`)**, que comparten `plantillas/[id]` y
`pacientes/[id]/planes/[planId]` (002b, que lo dejó "sin cambios internos, 002d")

- Server component con 4 `<form action>`. Título de comida en `font-display text-lg font-bold`.
  "Borrar comida" y "Borrar" son `button` de texto en `text-ink-faint hover:text-red-600`, sin
  nombre accesible que diga **qué** borran. La lista usa `divide-line border-line`.
- El formulario de alta de ítem **no tiene etiquetas**: los `placeholder` hacen de etiqueta ("—
  Alimento libre / sin macros —", "Gramos", "Descripción libre…", "Nota (opcional)"). Los gramos
  van sin unidad. El separador es un `border-dashed border-line`.
- Ningún botón muestra que está trabajando (no hay pendiente), en contra del Gherkin "Guardado
  exitoso".
- La línea de macros por ítem es `247.5 kcal · P 46.5g · …`, con punto decimal y sin espacio antes
  de la unidad.

**PDF (`lib/plan-pdf.tsx`)**

- `macrosLine` es una función **local** del archivo (no vive en `packages/core`):
  `` `${m.kcal} kcal · P ${m.protein}g · C ${m.carbs}g · G ${m.fat}g` ``. Imprime "1845.6 kcal · P
  92.5g …": punto decimal, kcal con decimales y la unidad pegada al número. `sumMacros` (core)
  redondea a 1 decimal, así que el total **siempre** trae un decimal posible.
- El mismo formato "crudo" se repite en el editor (ítems), en los totales de plantillas y en los
  totales del portal. No hay un formateador compartido ni testeado.

**Portal (`(portal)/portal/page.tsx`, `plan/page.tsx`, `evolucion/page.tsx`, `diario/page.tsx`,
`diario/diary-form.tsx`, `loading.tsx`)**

- Las cuatro páginas usan `font-display text-2xl font-bold text-ink`, `text-ink-soft/faint` y
  enlaces "← Volver" a mano. Desde la 002a sobran, porque la barra de pestañas ya lleva a todas
  las secciones.
- **Controles táctiles chicos:** los enlaces "Ver plan →", "Ver evolución →" y "Abrir diario →"
  son texto de ~20 px de alto. "Borrar" del diario es un `text-xs` de ~16 px. El botón de
  "Agregar registro" es `h-9` (36 px). El selector de archivo usa `file:border-2 file:uppercase
  file:tracking-[0.08em]`. Ninguno llega a los 44 px del Gherkin "Portal en el celular".
- **Plan:** los totales van en una grilla fija de 5 columnas (`grid-cols-5`). A 360 px cada celda
  mide ~60 px, y con `text-[10px] uppercase` y cifras en `font-display text-lg font-bold` los
  números de 4 cifras ("1845.6") no entran. "Descargar PDF" es un `a` con `press border-2
  border-ink hover:bg-ink hover:text-white` y está **al final** de la página, debajo de todas las
  comidas.
- **Inicio:** "🏥 Obras sociales" va en `uppercase tracking-[0.06em]`, y el último peso usa
  `Badge tone="green"` (tono viejo) para mostrar un número.
- **Evolución:** la lista usa `divide-line`, y el peso va como `toString()` del Decimal ("72.5
  kg"). El gráfico ya es de barras (002b, sin `unit`).
- **Diario:** el feedback es "✓ Guardado" en `reveal text-leaf-deep`, el error va en
  `text-red-600` y la fecha en `uppercase tracking-[0.06em]`. "Borrar" no dice qué registro borra.
- `portal/loading.tsx` usa `PageSkeleton`, que a partir de `lg` pinta **dos columnas**: no tiene la
  forma de ninguna página del portal (todas son de una columna, `max-w-2xl`).
- **Pantallas de acceso:** la de "sin acceso" (`(portal)/layout.tsx`) y el error del portal ya
  están en el sistema nuevo (002a). `/portal/login?token=<inválido>` redirige a
  `/portal?error=invalid`, que muestra esa misma pantalla. No hay nada que migrar, solo que
  verificar.
- Datos reales (solo lectura, 2026-09-24): Juan Pérez (`cmtyq7tzm0017xnwskwm1ttlb`) tiene plan
  activo de 4 comidas sin PDF, 5 mediciones (3 con peso) y 2 registros de diario sin foto. María
  González (`cmtyq7tys0000xnwszq8d9maa`) tiene plan activo de 3 comidas, 3 mediciones y el diario
  vacío. `cmtyq7u07003dxnwssti9gv8c` no tiene plan. **Ningún plan activo tiene PDF** y **ningún
  registro de diario tiene foto**, así que el botón "Descargar PDF" y la foto solo se ven con
  fixtures. Nadie tiene turnos confirmados futuros.

**Sistema viejo que queda definido (lo borra esta HU)**

- `tailwind.config.ts`: `fontFamily.display`; `colors.ink`, `leaf`, `mint`, `paper`, `line` y
  `brand`; `borderRadius.card`; y `boxShadow.card` y `lift`. Todo bajo comentarios `LEGACY`.
- `globals.css` (líneas 102–121): `.press`, `.press:active`, `@keyframes reveal` y `.reveal`.
- `ui.tsx` (`badgeTones`): `slate`, `green`, `red`, `amber` y `blue`. Solo 2 usos:
  `alimentos/[id]/page.tsx:35` y `portal/page.tsx:94`.

**Colgado de la 002c (O-c2):** `api/appointments/route.ts` pinta COMPLETED con `#16a34a` y NO_SHOW
con `#dc2626`, fuera de los tokens. El texto blanco del evento sobre `#16a34a` tiene un contraste de
**~3,3:1** (no llega a AA para texto), y la leyenda del calendario no explica esos dos colores.

**Conclusión:** la lógica ya está bien separada, con server actions y `useActionState` o forms con
action. El trabajo es de **presentación y composición**, con cinco puntos delicados:

1. El borrado de plantillas tiene que pedir confirmación **sin** caer en el deadlock.
2. El editor de comidas es **compartido** con el plan del paciente (002b, aprobado): cambia de
   aspecto en las dos pantallas y su API no puede cambiar.
3. El formato del total tiene que quedar **testeado**, y el único lugar con tests es
   `packages/core`.
4. El cierre del sistema viejo toca `tailwind.config.ts`, que el dev del usuario no recarga.
5. El portal se verifica a 360 px, pero la ventana del navegador no baja de 500 px.

---

## 4. Decisiones técnicas

### D-d1 Alta y edición de alimentos: **página**, no panel lateral (reordenamiento 5)

El reordenamiento deja elegir "panel lateral o página, según lo que convenga a la base SARA 2".
Queda en **página** (`/alimentos/nuevo` y `/alimentos/[id]`) porque:

- SARA 2 (Épica 20) suma ~40 nutrientes por alimento. Un formulario de ese tamaño no entra
  cómodo en un `Sheet` de ~36 rem a 1366 × 663; en una página se agrupa por secciones con aire.
- `createFoodAction` **redirige** a `/alimentos/[id]` al crear. En un Sheet, esa redirección
  sacaría a la profesional de la lista igual, así que el Sheet no ahorra nada sin tocar la action
  (prohibido).
- Las URLs `/alimentos/[id]` siguen siendo enlazables, y la fila de la tabla ya lleva a la
  página con un clic.

La lista sí cumple el resto del reordenamiento: tabla densa, encabezado fijo, orden por columna y
números a la derecha.

### D-d2 `delete-template-button.tsx` → `useConfirm` sin deadlock

Mismo patrón que `delete-plan-button.tsx` (aprobado en la 002b): `Button type="button"` con
`onClick`, `await confirm()` en el handler del evento y la action **recién después**, dentro de
`startTransition`. **Sin `<form>`**. El texto de confirmación conserva la consecuencia que dice hoy
("No afecta los planes ya creados a partir de ella"). Para probar el diálogo sin borrar nada, el
componente suma la prop opcional `deleteAction?`, que en producción nunca se pasa (mismo recurso
que `sendAction?` en la 002c). Fragmento exacto en §6.3.

### D-d3 Formato del "Total del plan": función nueva en `packages/core`, con tests

`macrosLine` **no** vive en `packages/core`: es local de `plan-pdf.tsx`. Igual se **crea** el
formateador en `packages/core/src/nutrition.ts`, al lado de `Macros` y `sumMacros`, porque:

- Es lógica pura, sin base ni red. `AGENTS.md` ("Dónde va la lógica") y `CHECKPOINTS.md` C3/C4
  dicen que va a `packages/core` con su `*.test.ts`. Es **el único** workspace con vitest, y este
  cambio lo recibe el paciente: tiene que quedar testeado, no solo mirado en un PDF.
- Lo usan dos lugares de `apps/web`: el PDF (`formatMacrosLine`) y la línea de macros por ítem del
  editor de comidas (`formatMacrosLine(…, { includeFiber: true })`). Así el panel y el PDF dicen
  lo mismo.
- Es **aditivo**: dos exports nuevos, sin tocar `computeItemMacros` ni `sumMacros`. El bot no lo
  importa; su `typecheck` tiene que seguir verde.

Formato exacto (pedido del usuario): **coma decimal, espacio duro (U+00A0) entre el número y la
unidad y kcal sin decimales**. Los gramos van con hasta 1 decimal, sin ",0" cuando el número es
entero, y con separador de miles "." de es-AR. Las etiquetas "P", "C", "G" y el separador " · "
no cambian.

- Antes: `1845.6 kcal · P 92.5g · C 210.3g · G 61g`
- Después: `1.846 kcal · P 92,5 g · C 210,3 g · G 61 g` (cada espacio antes de `kcal`/`g` es
  U+00A0)

Afecta a los PDF que se generen **desde ahora**. Los ya guardados en `pdfData` no cambian hasta
que la profesional los regenere.

### D-d4 `MacroTotals` compartido (plan del paciente, plantilla y portal)

La franja de 5 totales está escrita a mano en tres lugares: el detalle del plan (002b, con
`Quantity`), el detalle de la plantilla (tarjetas viejas) y el portal (grilla de 5 columnas).
Pasa a un solo componente server-safe, `components/macro-totals.tsx` (§6.2):

- El detalle del plan reemplaza su `<dl>` por `<MacroTotals totals={totals} />`. El envoltorio
  `sticky` queda en la página, y el aspecto a ≥ 640 px es el mismo.
- Mobile-first: a < 640 px, "Energía" ocupa la fila entera y los 4 macros van en 2 × 2. En 360 px
  entran "2.017 kcal" y "241,2 g" sin cortarse. Los bordes internos salen de `gap-px bg-border`,
  así que no dependen de la cantidad de columnas.

### D-d5 O-c2: colores de COMPLETED y NO_SHOW sobre los tokens — **se incluye**

Se incluye porque no cambia funcionalidad: la consulta y la forma del JSON quedan iguales, solo
cambian dos strings. Además, corrige un contraste que no llega a AA.

- `api/appointments/route.ts`: `"#16a34a"` → `"hsl(var(--success))"` y `"#dc2626"` →
  `"hsl(var(--destructive))"`. FullCalendar pone `backgroundColor`/`borderColor` como estilo
  **inline**, y un `var()` en un estilo inline se resuelve contra los tokens de `:root`.
  Contraste del texto blanco: 5,88:1 y 5,80:1 (antes ~3,3:1 y ~4,8:1).
- `calendar-client.tsx`: la leyenda suma un grupo "Estados" con "Completado" (`bg-success`) y
  "No asistió" (`bg-destructive`). Los confirmados siguen con el color del servicio.
- **Plan B**, si en el recorrido el color no se aplica (el evento queda con el azul por defecto de
  FullCalendar): usar los hex de los tokens, `"#396F51"` y `"#B53A36"` (§7.1 de la 002a). Se
  anota en `impl`.

### D-d6 Cierre de LEGACY: orden, reinicio del dev y cómo se verifica sin reiniciar

Causa raíz, documentada en `progress/impl_HU-002a.md`: Tailwind 3.4 en Node 24 **no puede
invalidar** la caché del `tailwind.config.ts` (se carga con `require(esm)`), así que el
`next dev` **se queda con el config con el que arrancó** hasta que se reinicie. En la 002a dio 500
porque el `globals.css` nuevo usaba una clase (`border-border`) que el config viejo en memoria no
tenía.

Acá el cambio es solo **quitar** claves, así que el escenario se invierte:

- El dev sigue con el config viejo, que **incluye** los alias. Como ningún archivo los usa ya, no
  cambia nada visible y no hay 500: ni `globals.css` ni ningún `@apply` depende de una clase que
  falte en el config en memoria. El recorrido del orquestador se puede hacer **con el dev de hoy,
  sin reiniciarlo**.
- Por eso el orden del checklist es estricto:
  1. Migrar todos los consumidores (fases 2–7).
  2. Borrar los tonos viejos de `Badge` (fase 8).
  3. Borrar el bloque LEGACY de `globals.css` (fase 9).
  4. Correr los greps en 0 (fase 10).
  5. **Recién al final** borrar el bloque LEGACY de `tailwind.config.ts` (fase 11).

  Después de las fases 9 y 11 se prueba el dev con `curl` (tiene que seguir en 200).
- **Verificación del config nuevo sin el dev:** compilar con el CLI de Tailwind (como en la 002a)
  y buscar en el CSS generado:
  - que **no** aparezca ninguna clase vieja;
  - que **sí** aparezcan las nuevas;
  - que `globals.css` compile, porque un `@apply` inválido corta el CLI (§13.5).
- **Reinicio:** el orquestador **avisa al usuario** al cerrar la HU que reinicie `npm run dev`
  (Ctrl-C y `npm run dev`), para que el dev tome el config nuevo. No tiene que cambiar nada visible;
  si algo se ve distinto después del reinicio, es un alias que se escapó, y el grep de §13.3 lo
  tendría que haber marcado. El recorrido corto que queda para el usuario después del reinicio
  está en §13.6.

### D-d7 Páginas temporales con fixtures y dos props de prueba

Faltan datos para mirar varias cosas: no hay plantillas, no hay alimentos inactivos, no hay planes
activos con PDF ni fotos en el diario, y ningún flujo de escritura se puede ejecutar. Por eso el
recorrido usa rutas temporales con datos en memoria (§8). Dos componentes suman una prop opcional
que **en producción nunca se pasa**:

- `DeleteTemplateButton({ id, deleteAction? })`: por defecto usa `deleteTemplateAction`.
- `DiaryForm({ submitAction? })`: por defecto usa `addDiaryEntryAction`.

Para ver el portal a **360 px** aunque la ventana del navegador no baje de 500 px, una página
temporal lo muestra dentro de `<iframe>` de 360 × 780. Las media queries del iframe usan **su**
ancho, y como el origen es el mismo, se puede medir desde la consola (§13.6).

### D-d8 Portal: sin enlaces "← Volver" y "Descargar PDF" arriba

- Los "← Volver" de plan, evolución y diario se quitan, porque la barra de pestañas (abajo en el
  celular, arriba en ≥ 768 px) ya lleva a Inicio desde cualquier pantalla. Se sigue pudiendo hacer
  lo mismo que hoy.
- "Descargar PDF" es la acción principal del plan: sube debajo del título, a ancho completo en el
  celular. Mismo `href="/portal/plan/pdf"`, mismo `<a>` (es una descarga, no una navegación de
  Next).
- El borrado de un registro del diario **sigue sin confirmación**, como hoy. Sumarla sería un
  cambio de funcionalidad y además el portal no tiene `ConfirmProvider` (ver O-d2).

---

## 5. Esquema

**No cambia.** Sin migración. Solo lecturas que ya existen.

---

## 6. Contrato compartido

### 6.1 `packages/core` (nuevo, aditivo) — consumidor: **solo `apps/web`**

En `packages/core/src/nutrition.ts`, al final (`index.ts` ya hace `export * from "./nutrition"`):

```ts
const NBSP = " ";
const kcalFormat = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0, useGrouping: true });
const gramsFormat = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1, useGrouping: true });

/**
 * Cantidad de un macro en es-AR con espacio duro antes de la unidad.
 * kcal sin decimales ("1.846 kcal"); gramos con hasta 1 decimal ("92,5 g", "61 g").
 */
export function formatMacroAmount(value: number, unit: "kcal" | "g"): string {
  return (unit === "kcal" ? kcalFormat : gramsFormat).format(value) + NBSP + unit;
}

/**
 * Línea de totales del plan: "1.846 kcal · P 92,5 g · C 210,3 g · G 61 g".
 * Con `includeFiber`, suma " · Fibra 25,2 g" al final.
 */
export function formatMacrosLine(m: Macros, options?: { includeFiber?: boolean }): string {
  const parts = [
    formatMacroAmount(m.kcal, "kcal"),
    `P ${formatMacroAmount(m.protein, "g")}`,
    `C ${formatMacroAmount(m.carbs, "g")}`,
    `G ${formatMacroAmount(m.fat, "g")}`,
  ];
  if (options?.includeFiber) parts.push(`Fibra ${formatMacroAmount(m.fiber, "g")}`);
  return parts.join(" · ");
}
```

| Función | Consumidores |
|---|---|
| `formatMacroAmount(value, unit)` | (interno de `formatMacrosLine`; exportada para Épica 23 y los tests) |
| `formatMacrosLine(m)` | `apps/web/src/lib/plan-pdf.tsx` ("Total del plan") |
| `formatMacrosLine(m, { includeFiber: true })` | `apps/web/src/components/meals-editor.tsx` (línea por ítem con `showMacros`) |

`packages/db/domain`: **sin cambios**.

### 6.2 Contrato de UI de `apps/web` (lo que agrega o cambia esta HU)

Las firmas de 002a §6.2, 002b §6.2 y 002c §6.2 **no se rompen**, con una **excepción
intencional**: el tipo de `tone` de `Badge` pierde `slate | green | red | amber | blue` (lo pide la
002a §10). Cuando se hace, ya no queda ningún consumidor (§11, fase 8).

```ts
// src/components/ui.tsx — Badge
tone?: "neutral" | "success" | "danger" | "warning" | "info";   // se borran los 5 alias viejos
```

```ts
// src/components/submit-button.tsx ("use client", NUEVO)
import { useFormStatus } from "react-dom";
export function SubmitButton(
  props: Omit<ComponentProps<typeof Button>, "type" | "loading"> & { pendingLabel?: string }
): JSX.Element;
// <Button type="submit" loading={pending} {...rest}>{pending && pendingLabel ? pendingLabel : children}</Button>
// Sirve para forms con action (server actions o funciones) que no usan useActionState:
// da el estado "Agregando…/Borrando…" sin tocar la action. Se puede importar desde server components.
```

```ts
// src/components/macro-totals.tsx (server-safe, sin "use client", NUEVO)
import type { Macros } from "@nutri-bot/core";
export function MacroTotals(props: {
  totals: Macros;
  label?: string;       // aria-label del <dl>; default "Total del plan"
  className?: string;
}): JSX.Element;
// <dl aria-label={label} className={cn("grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-5", className)}>
// 5 celdas <div className="bg-card px-4 py-3"> con <dt className="text-sm text-muted-foreground"> y
// <dd className="mt-0.5"><Quantity … className="text-lg font-semibold" /></dd>.
// Orden y formato: Energía (kcal, decimals 0), Proteínas, Carbohidratos, Grasas, Fibra (g, decimals 1).
// La primera celda lleva "col-span-2 sm:col-span-1".
```

```ts
// src/components/meals-editor.tsx (server-safe; API y tipos IDÉNTICOS)
export interface FoodOption { id: string; name: string; group: string }           // sin cambios
export interface MealItemView { … }                                                // sin cambios
export interface MealView { id: string; name: string; items: MealItemView[] }      // sin cambios
export interface MealsEditorProps { …los mismos 9 props… }                         // sin cambios
export function MealsEditor(props: MealsEditorProps): JSX.Element;
// Mismos 4 <form action>, mismos name (mealId, itemId, foodId, quantityGrams, customLabel, notes, name)
// y name={ownerField} en los 4 hidden. Solo cambia la presentación (§7.6).
```

```ts
// src/app/(panel)/alimentos/foods-list.tsx ("use client"; FoodRow y props SIN cambios)
export interface FoodRow { id; name; group; kcalPer100: string; proteinPer100: string; carbsPer100: string; fatPer100: string; active: boolean }
export function FoodsList(props: { foods: FoodRow[] }): JSX.Element;
// Pasa a DataTable (§7.1). Los strings se convierten con Number(...) adentro para Quantity y sortValue.

// src/app/(panel)/alimentos/food-form.tsx (props SIN cambios: action, defaults, submitLabel; FoodDefaults sin cambios)
```

```ts
// src/app/(panel)/plantillas/templates-table.tsx ("use client", NUEVO)
export interface TemplateRow { id: string; title: string; notes: string | null }
export function TemplatesTable(props: { rows: TemplateRow[] }): JSX.Element;

// src/app/(panel)/plantillas/new-template-dialog.tsx ("use client", NUEVO)
export function NewTemplateDialog(props: { variant?: "primary" | "secondary" }): JSX.Element;
//   Button (Plus) "Nueva plantilla" + <Modal title="Nueva plantilla"
//   description="Ponele un nombre; las comidas se cargan en el paso siguiente."> con <NewTemplateForm onCancel={cerrar} />

// src/app/(panel)/plantillas/new-template-form.tsx (+1 opcional)
export function NewTemplateForm(props: { onCancel?: () => void }): JSX.Element;
//   misma action (createTemplateAction), mismos name: "title" y el hidden "notes" con value "".

// src/app/(panel)/plantillas/[id]/template-meta-form.tsx: props SIN cambios ({ action, defaults }).

// src/app/(panel)/plantillas/[id]/delete-template-button.tsx (+1 opcional)
export function DeleteTemplateButton(props: {
  id: string;
  deleteAction?: (id: string) => Promise<void>;   // NUEVO, solo para la página de prueba; default deleteTemplateAction
}): JSX.Element;
```

```ts
// src/app/(portal)/portal/plan/plan-view.tsx (server-safe, NUEVO)
import type { Macros } from "@nutri-bot/core";
import type { MealView } from "@/components/meals-editor";
export function PortalPlanView(props: {
  title: string;
  notes: string | null;
  meals: MealView[];
  totals: Macros;
  hasPdf: boolean;
}): JSX.Element;
// La usa portal/plan/page.tsx (con los datos de su consulta de hoy) y la página temporal (fixtures).

// src/app/(portal)/portal/diario/diary-form.tsx (+1 opcional)
export function DiaryForm(props: {
  submitAction?: (prev: DiaryState, formData: FormData) => Promise<DiaryState>;   // NUEVO; default addDiaryEntryAction
}): JSX.Element;
```

### 6.3 Regla dura: `useConfirm` fuera de toda transición (fragmento exacto)

`await confirm()` **nunca** dentro de `<form action={…}>` ni de `startTransition`: en React 19 la
action corre en una transición, el `setPending` del diálogo toma ese lane y React no lo confirma
hasta que la promesa termina. Como la promesa espera al diálogo, queda en deadlock (bug real de
"Borrar plan" en la 002b; está en el JSDoc de `components/confirm.tsx`). El botón es
`type="button"` y **no** hay `<form>`.

```tsx
"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { useConfirm } from "@/components/confirm";
import { Button } from "@/components/ui";
import { deleteTemplateAction } from "../actions";

export function DeleteTemplateButton({
  id,
  deleteAction = deleteTemplateAction,
}: {
  id: string;
  deleteAction?: (id: string) => Promise<void>;
}) {
  const confirm = useConfirm();
  const [pending, startTransition] = useTransition();

  // La confirmación se pide en el handler del evento, fuera de toda transición o form action:
  // en React 19 `await confirm()` dentro de una action queda en deadlock (el diálogo nunca se monta).
  async function handleClick() {
    const ok = await confirm({
      title: "¿Borrar esta plantilla?",
      description: "No afecta los planes ya creados a partir de ella. Esta acción no se puede deshacer.",
      confirmLabel: "Borrar plantilla",
    });
    if (!ok) return;
    startTransition(async () => {
      await deleteAction(id);
    });
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      loading={pending}
      onClick={handleClick}
      className="text-destructive hover:bg-destructive-muted hover:text-destructive"
    >
      {pending ? null : <Trash2 aria-hidden />}
      {pending ? "Borrando…" : "Borrar plantilla"}
    </Button>
  );
}
```

`deleteTemplateAction` redirige a `/plantillas` (igual que `deletePlanAction` en la 002b). El
router de Next resuelve esa redirección dentro de la transición, sin cambios.

---

## 7. Vistas (skill `ui`)

**Panel** (alimentos y plantillas): referencia Notion, **mucho aire** (D6), notebook a **1366 ×
663 px útiles**. Con la sidebar expandida quedan ~1046 px de contenido. **Portal**: mobile-first a
**360 px**, tono cálido (`theme-warm` ya aplicado por el layout: fondo crema, tarjetas blancas,
`--radius` de 12 px) y controles táctiles con `size="lg"` (`h-11`, 44 px).

Reglas comunes:

- Todo en caso oración.
- Prohibido: `uppercase`, `tracking-[…]`, `border-2`, `font-bold` en títulos, `text-[Npx]`,
  `font-display` y los colores de la paleta de Tailwind (`red-600`, etc.).
- Números con `Quantity` o `tabular-nums`.
- Íconos solo de `lucide-react`, `h-4 w-4` (`h-5 w-5` en la barra del portal), con `aria-hidden`.
- Los "+ …" pasan a ícono `Plus` + texto.
- Una sola acción `variant="primary"` por pantalla.
- Se borran todos los "✓ Guardado" y los `reveal`/`press`.

| Formulario / acción | Feedback |
|---|---|
| `FoodForm` (editar) | `useActionToast(state, { success: "Alimento guardado" })` + `FormError`. Al crear, la action redirige: sin toast (como hoy) |
| `NewTemplateForm` | Redirige al crear. Error con `FormError` |
| `TemplateMetaForm` | `useActionToast(state, { success: "Plantilla guardada" })` + `FormError` |
| `DeleteTemplateButton` | Diálogo del sistema → "Borrando…" → redirige |
| `MealsEditor` (4 forms) | `SubmitButton` con `pendingLabel` ("Agregando…", "Borrando…", "Quitando…"). Sin toast (hoy tampoco hay feedback; el cambio se ve en la lista) |
| Activar/desactivar alimento | `SubmitButton` ("Activando…" / "Desactivando…"). Sin toast |
| `DiaryForm` (portal) | `useActionToast(state, { success: "Registro guardado" })` + `FormError`. El toast sale arriba al centro (`Toaster` del layout del portal) |
| Borrar registro del diario | `SubmitButton` ("Borrando…"). Sin toast |

### 7.1 Alimentos (`/alimentos`) — reordenamiento 5

**Estructura base:** shell con sidebar → `PageHeader` → barra de filtros → tarjeta a sangre con la
tabla (encabezado fijo, scroll interno).

```
┌ Alimentos ─────────────────────────────────────────────── [+ Nuevo alimento] ┐
│ Base de alimentos con macros por 100 g, usada para armar los planes.          │
├──────────────────────────────────────────────────────────────────────────────┤
│ [🔍 Buscar alimento…      ] [Todos los grupos ▾]   90 de 90                    │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │ Alimento ↑        Grupo            Energía (kcal) Proteínas (g) Carb. (g) Grasas (g)│ ← sticky
│ │ Aceite de girasol Grasas                    884,0          0         0      100 │
│ │ Alfajor … [Inactivo] Azúcares y dulces       …                                  │
│ └──────────────────────────────────────────────── scroll interno ─────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```

- `page.tsx`: **consulta idéntica**. Solo cambia el `action`:
  `<ButtonLink href="/alimentos/nuevo"><Plus aria-hidden />Nuevo alimento</ButtonLink>`.
- **Barra de filtros** (`mb-4 flex flex-wrap items-center gap-3`), el mismo patrón que
  `patients-list.tsx`:
  - Búsqueda: `relative w-full sm:max-w-xs`, con `Search` a la izquierda y `Input id="food-search"
    type="search" placeholder="Buscar alimento…" className="pl-9"`. El `<label sr-only>` "Buscar
    alimentos" no cambia.
  - `Select aria-label="Filtrar por grupo" className="w-full sm:w-56"` con las mismas opciones.
  - Contador `text-sm tabular-nums text-muted-foreground`: "{n} de {total}".
  - La lógica de filtro (`normalize`, `group`) queda igual.
- **`Card padding="none"` → `DataTable<FoodRow>`**, con las columnas definidas **a nivel de módulo**
  en el archivo cliente:

  | id | header | cell | numeric | sortValue |
  |---|---|---|---|---|
  | `nombre` | "Alimento" | `font-medium` + si `!active`: `<Badge tone="neutral">Inactivo</Badge>` con `ml-2` | — | `name` |
  | `grupo` | "Grupo" | etiqueta de `FOOD_GROUP_LABELS`, `text-muted-foreground` | — | etiqueta |
  | `kcal` | "Energía (kcal)" | `<Quantity value={Number(f.kcalPer100)} />` | sí | `Number(…)` |
  | `proteinas` | "Proteínas (g)" | ídem con `proteinPer100` | sí | ídem |
  | `carbos` | "Carbohidratos (g)" | ídem con `carbsPer100` | sí | ídem |
  | `grasas` | "Grasas (g)" | ídem con `fatPer100` | sí | ídem |

  - Los inactivos se distinguen por el **badge**, no por la opacidad (no depende solo del color).
  - Props: `getRowId={(f) => f.id}`, `rowHref={(f) => \`/alimentos/${f.id}\`}`,
    `initialSort={{ columnId: "nombre", direction: "asc" }}` (mismo orden que `listFoods`),
    `caption="Alimentos, valores cada 100 g"` y `maxHeightClassName="max-h-[calc(100vh-15rem)]"`
    (encabezado fijo con scroll interno, como pacientes).
  - `empty`:
    - Si `foods.length === 0`: `EmptyState icon={Apple} title="Todavía no hay alimentos"
      description="Cargá el primero para usarlo al armar planes y plantillas."
      action={<ButtonLink href="/alimentos/nuevo" variant="secondary"><Plus aria-hidden />Nuevo
      alimento</ButtonLink>}`.
    - Si no: `EmptyState icon={SearchX} title="Ningún alimento coincide con la búsqueda"
      description="Probá con otro nombre o con otro grupo." action={<Button variant="secondary"
      onClick={limpiar}>Limpiar filtros</Button>}`, donde `limpiar` hace `setQ(""); setGroup("")`.
- A 768 px la tabla scrollea en horizontal **dentro** de la tarjeta (permitido por el Gherkin). La
  página no scrollea.
- **Componentes:** `PageHeader`, `ButtonLink`, `Input`, `Select`, `Card`, `DataTable`, `Quantity`,
  `Badge`, `EmptyState`.
- **Carga (`alimentos/loading.tsx`):** encabezado (`Skeleton h-8 w-40` + `h-4 w-96 max-w-full`,
  `mb-8`), barra (`Skeleton h-9 w-80 max-w-full mb-4`) y `TableSkeleton rows={10} columns={6}
  bare`, envueltos en `role="status" aria-busy` con "Cargando…" `sr-only` (patrón de
  `pacientes/loading.tsx`).

### 7.2 Nuevo alimento (`/alimentos/nuevo`)

**Estructura base:** `PageHeader` con `back` → tarjeta de formulario a ancho de lectura
(`max-w-3xl`).

- `PageHeader title="Nuevo alimento" description="Los valores son cada 100 g de alimento."
  back={{ href: "/alimentos", label: "Volver a alimentos" }}`. Se va el `Link` "←" a mano.
- `<Card className="max-w-3xl"><FoodForm … /></Card>`, con los mismos `action`, `defaults` y
  `submitLabel="Crear alimento"`.

**`FoodForm` (§6.2, props sin cambios):**

```
Nombre [                          ]   Grupo [Otros ▾]
─ Composición cada 100 g ───────────────────────────────
Energía [   kcal]  Proteínas [   g]  Carbohidratos [   g]  Grasas [   g]  Fibra [   g]
                                                                  Opcional
Equivalencia [                                            ]
Opcional. Ej: "1 huevo mediano ≈ 50 g". Solo informativo.
────────────────────────────────────────────────────────
[Guardar cambios]
```

- `form className="space-y-8"`.
- Fila 1 `grid gap-4 sm:grid-cols-2`: `Field "Nombre"` → `Input name="name" required` y
  `Field "Grupo"` → `Select name="group" required`, iguales a hoy.
- `<fieldset>` con `<legend className="mb-4 text-sm font-semibold">Composición cada 100
  g</legend>` y `grid gap-4 sm:grid-cols-3 lg:grid-cols-5`, con 5 `Field` + `NumberInput`:

  | Etiqueta | `name` | `unit` | Otros |
  |---|---|---|---|
  | Energía | `kcalPer100` | `kcal` | `step="0.1" min="0" required` |
  | Proteínas | `proteinPer100` | `g` | ídem |
  | Carbohidratos | `carbsPer100` | `g` | ídem |
  | Grasas | `fatPer100` | `g` | ídem |
  | Fibra | `fiberPer100` | `g` | `step="0.1" min="0"`, `hint="Opcional"`, **sin** `required` |

  Cada uno conserva su `defaultValue={defaults.…}`.
- `Field "Equivalencia" hint='Opcional. Ej: "1 huevo mediano ≈ 50 g". Solo informativo.'` →
  `Input name="unitHint"`.
- Pie `flex items-center gap-3 border-t pt-6`: `Button type="submit" loading={pending}` con
  `{pending ? "Guardando…" : submitLabel}`. Debajo, `<FormError message={state.error} />`.
- `useActionToast(state, { success: "Alimento guardado" })`.
- **Componentes:** `Field`, `Input`, `Select`, `NumberInput`, `Button`, `FormError`,
  `useActionToast`.

### 7.3 Detalle de alimento (`/alimentos/[id]`)

- **Consulta y `toggleActive` textuales.**
- `PageHeader title={food.name} description={FOOD_GROUP_LABELS[food.group]} back={{ href:
  "/alimentos", label: "Volver a alimentos" }}` con este `action`:
  ```tsx
  <div className="flex items-center gap-3">
    <Badge tone={food.active ? "success" : "neutral"}>{food.active ? "Activo" : "Inactivo"}</Badge>
    <form action={toggleActive}>
      <SubmitButton variant="secondary" size="sm" pendingLabel={food.active ? "Desactivando…" : "Activando…"}>
        {food.active ? "Desactivar" : "Activar"}
      </SubmitButton>
    </form>
  </div>
  ```
- Si `!food.active`: `<Alert tone="info" className="mb-6 max-w-3xl">Este alimento está inactivo: no
  aparece al armar planes ni plantillas.</Alert>`. Es un hecho: los editores usan `listFoods({
  activeOnly: true })`.
- `<Card className="max-w-3xl"><FoodForm … submitLabel="Guardar cambios" /></Card>`, con los mismos
  `defaults`.
- **Carga (`alimentos/[id]/loading.tsx`):** encabezado (`h-4 w-40`, `h-8 w-64`, `h-4 w-48`) +
  `<div className="max-w-3xl"><CardSkeleton lines={6} bare /></div>`.

### 7.4 Plantillas (`/plantillas`)

**Estructura base:** `PageHeader` con la acción principal → tarjeta a sangre con la tabla, o el
estado vacío.

- **Consulta idéntica** (`listTemplates()`).
- `PageHeader title="Plantillas" description="Planes reutilizables que podés aplicar a cualquier
  paciente en un click." action={<NewTemplateDialog />}` (mismo texto de hoy).
- Si `templates.length === 0`: `<Card><EmptyState icon={Files} title="Todavía no creaste ninguna
  plantilla" description="Armá una vez las comidas de un plan tipo y aplicalo a cualquier
  paciente." action={<NewTemplateDialog variant="secondary" />} /></Card>`.
- Si no: `<Card padding="none"><TemplatesTable rows={templates.map((t) => ({ id: t.id, title:
  t.title, notes: t.notes }))} /></Card>`.
- **`TemplatesTable`** (cliente), con `DataTable`:
  - Columnas `plantilla` ("Plantilla", `font-medium`, `sortValue: title`) y `notas` ("Notas",
    `line-clamp-1 text-muted-foreground`; sin notas → `<span className="text-muted-foreground">—</span>`).
  - `rowHref` → `/plantillas/${id}`, `initialSort` plantilla asc, `caption="Plantillas"` y
    `maxHeightClassName="max-h-[calc(100vh-15rem)]"`.
- **`NewTemplateDialog`** (cliente), con el mismo patrón que `manual-payment-dialog.tsx`: `Button
  variant={variant}` con `<Plus aria-hidden />Nueva plantilla` y un `Modal` (§6.2).
- **`NewTemplateForm`** dentro del diálogo:
  - `form action={action} className="space-y-4"`.
  - `Field "Nombre"` → `Input name="title" required placeholder="Ej: Plan bajo en sodio"`.
  - `<input type="hidden" name="notes" value="" />` (igual que hoy).
  - `FormError`.
  - Pie `flex justify-end gap-2`: si hay `onCancel`, `Button type="button" variant="secondary"
    onClick={onCancel}` "Cancelar"; siempre `Button type="submit" loading={pending}` con
    `{pending ? "Creando…" : "Crear plantilla"}`.
  - Al crear, la action redirige a `/plantillas/[id]`, como hoy.
- **Carga (`plantillas/loading.tsx`):** encabezado + `TableSkeleton rows={5} columns={2} bare`.
- **Componentes:** `PageHeader`, `Button`, `Modal`, `Field`, `Input`, `FormError`, `Card`,
  `DataTable`, `EmptyState`.

### 7.5 Detalle de plantilla (`/plantillas/[id]`)

**Estructura base:** la **misma** que el detalle del plan (002b §7.9), para que plantillas y planes
se lean igual.

```
← Volver a plantillas
Plan bajo en sodio                                              [🗑 Borrar plantilla]
Plantilla · 3 comidas
┌ Energía ┬ Proteínas ┬ Carbohidratos ┬ Grasas ┬ Fibra ┐  ← franja fija (sticky)
└─────────┴───────────┴───────────────┴────────┴───────┘
┌ MealsEditor ─────────────────────────┐  ┌ Datos de la plantilla ┐
│ Desayuno                 [Borrar …]  │  │ Título […]            │
│ …                                    │  │ Notas […]             │
└──────────────────────────────────────┘  │ [Guardar]             │
                                          └───────────────────────┘
```

- **Consulta idéntica** (`Promise.all([getTemplate(id), listFoods({ activeOnly: true })])`). Se
  quedan igual `toMealView`, `sumMacros` y `boundUpdate`.
- `PageHeader title={template.title} description={\`Plantilla · ${meals.length} comida${meals.length
  === 1 ? "" : "s"}\`} back={{ href: "/plantillas", label: "Volver a plantillas" }}
  action={<DeleteTemplateButton id={template.id} />}`.
- Franja: `<div className="sticky top-14 z-10 -mx-6 mb-6 bg-background px-6 py-3 lg:top-0 lg:-mx-10
  lg:px-10"><MacroTotals totals={totals} /></div>`. Son las mismas clases del detalle del plan.
- `<div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start">`:
  - Principal: `<MealsEditor …mismos props de hoy… />`.
  - Lateral: `<Card title="Datos de la plantilla" description="El título y las notas se copian al
    plan cuando la aplicás a un paciente."><TemplateMetaForm … /></Card>`. Es cierto:
    `applyTemplateToPatient` copia `title` y `notes`.
- **`TemplateMetaForm`:** `Field "Título"` → `Input name="title" required`; `Field "Notas"` →
  `Textarea name="notes" rows={3}`; `Button type="submit" loading={pending}` con
  `{pending ? "Guardando…" : "Guardar"}`; `FormError`; `useActionToast`.
- **Carga (`plantillas/[id]/loading.tsx`):** la misma estructura que
  `pacientes/[id]/planes/[planId]/loading.tsx`, copiada. No se importa entre rutas.
- **Componentes:** `PageHeader`, `MacroTotals`, `MealsEditor`, `Card`, `Field`, `Input`,
  `Textarea`, `Button`, `useConfirm` (vía `DeleteTemplateButton`).

### 7.6 Editor de comidas (`components/meals-editor.tsx`, compartido con el plan del paciente)

**Server component, sin `"use client"`**. Los props y los 4 `<form action>` quedan idénticos.

```
┌ Desayuno ──────────────────────────────── [🗑 Borrar comida] ┐
│ 3 alimentos                                                    │
│ ┌──────────────────────────────────────────────────────────┐   │
│ │ Avena                                   40 g   [Quitar] │   │
│ │ 152 kcal · P 5,3 g · C 26,5 g · G 2,8 g · Fibra 4 g     │   │
│ ├──────────────────────────────────────────────────────────┤   │
│ │ Banana                                 120 g   [Quitar] │   │
│ └──────────────────────────────────────────────────────────┘   │
│ ─────────────────────────────────────────────────────────────  │
│ Agregar alimento                                               │
│ Alimento [— Alimento libre / sin macros — ▾]   Cantidad [  g]  │
│ Descripción libre [          ]   Nota [          ]             │
│ Solo si no elegiste un alimento.  Opcional                     │
│ [+ Agregar]                                                    │
└────────────────────────────────────────────────────────────────┘
┌ Nueva comida [Ej: Desayuno       ] [+ Agregar comida] ┐
```

- Contenedor `space-y-6`.
- **Sin comidas:** `<Card><EmptyState icon={UtensilsCrossed} title="Todavía no hay comidas"
  description="Agregá la primera (por ejemplo, Desayuno) con el formulario de abajo." /></Card>`.
- **Cada comida:** `Card` con `title={meal.name}`, `description` = "{n} alimento(s)" (o "Sin
  alimentos todavía") y este `actions`:
  ```tsx
  <form action={deleteMealAction}>
    <input type="hidden" name="mealId" value={meal.id} />
    <input type="hidden" name={ownerField} value={ownerId} />
    <SubmitButton variant="ghost" size="sm" pendingLabel="Borrando…" aria-label={`Borrar comida ${meal.name}`}
      className="text-destructive hover:bg-destructive-muted hover:text-destructive">
      <Trash2 aria-hidden />Borrar comida
    </SubmitButton>
  </form>
  ```
- **Ítems** (si hay): `ul className="divide-y rounded-md border"`. Cada `li` es `flex items-start
  justify-between gap-4 px-4 py-3`:
  - Izquierda (`min-w-0 flex-1`):
    - `p text-sm font-medium` con `{foodName ?? customLabel ?? "(sin descripción)"}`.
    - Si hay `notes`: `p mt-0.5 text-xs text-muted-foreground`.
    - Si `showMacros && macros`: `p mt-1 text-xs tabular-nums text-muted-foreground` con
      `{formatMacrosLine(item.macros, { includeFiber: true })}`.
  - Derecha (`flex shrink-0 items-center gap-2`):
    - Si hay `quantityGrams`: `<Quantity value={Number(item.quantityGrams)} unit="g" decimals={1}
      className="text-sm" />`.
    - Form `deleteItemAction` con los mismos hidden (`itemId`, `ownerField`) y `<SubmitButton
      variant="ghost" size="sm" pendingLabel="Quitando…" aria-label={\`Quitar ${nombre} de
      ${meal.name}\`}>Quitar</SubmitButton>`. El nombre accesible contiene el texto visible
      "Quitar" (WCAG 2.5.3).
- **Alta de ítem:** `form action={addItemAction} className="mt-6 space-y-4 border-t pt-6"`.
  - `h3 className="text-sm font-semibold"` "Agregar alimento".
  - Los mismos 2 hidden (`mealId`, `ownerField`).
  - `grid gap-4 sm:grid-cols-[minmax(0,1fr)_9rem]`:
    - `Field "Alimento"` → `Select name="foodId" defaultValue=""`, con la misma opción vacía "—
      Alimento libre / sin macros —" y los mismos `optgroup`.
    - `Field "Cantidad"` → `NumberInput unit="g" name="quantityGrams" min="0" step="1"`.
  - `grid gap-4 sm:grid-cols-2`:
    - `Field "Descripción libre" hint="Solo si no elegiste un alimento."` → `Input
      name="customLabel"`.
    - `Field "Nota" hint="Opcional"` → `Textarea name="notes" rows={1} className="min-h-9"`.
  - `<SubmitButton variant="secondary" size="sm" pendingLabel="Agregando…"><Plus aria-hidden
    />Agregar</SubmitButton>`.
- **Nueva comida:** `<Card>` con `form action={addMealAction} className="flex flex-wrap items-end
  gap-3"`:
  - hidden `ownerField`.
  - `<div className="w-full sm:w-72"><Field label="Nueva comida"><Input name="name" required
    placeholder="Ej: Desayuno" /></Field></div>`.
  - `<SubmitButton variant="secondary" pendingLabel="Agregando…"><Plus aria-hidden />Agregar
    comida</SubmitButton>`.
- React 19 resetea los forms con action después de cada envío, como hoy.
- Sin confirmación en "Borrar comida" ni "Quitar", como hoy (ver O-d1).
- **Efecto en el plan del paciente (002b):** la misma presentación aparece en
  `/pacientes/[id]/planes/[planId]`. La página del plan solo cambia su `<dl>` por `<MacroTotals>`
  (D-d4).
- **Componentes:** `Card`, `EmptyState`, `SubmitButton`, `Quantity`, `Field`, `Select`,
  `NumberInput`, `Input`, `Textarea`. `formatMacrosLine` sale de `@nutri-bot/core`.

### 7.7 Portal — inicio (`/portal`)

**Estructura base** (celular, 360 px): header del layout (h-14) → saludo → tarjetas apiladas
(`space-y-4`) → barra de pestañas fija abajo. A ≥ 768 px, la misma columna (`max-w-2xl`) con las
pestañas arriba.

```
Hola, Juan 👋
Este es tu espacio con Nutricionista.
┌ Tu próximo turno ──────────────────┐
│ No tenés turnos próximos. …         │
└─────────────────────────────────────┘
┌ Tu plan vigente ───────────────────┐
│ Plan Inicial                        │
│ [        Ver plan  ›             ]  │  ← size lg, ancho completo en el celular
└─────────────────────────────────────┘
┌ Tu evolución ──────────────────────┐
│ Último peso registrado              │
│ 72,5 kg                             │  ← text-2xl font-semibold
│ [      Ver evolución  ›          ]  │
└─────────────────────────────────────┘
┌ Diario alimentario ────────────────┐
│ Anotá lo que comiste hoy, …         │
│ [       Abrir diario  ›          ]  │
└─────────────────────────────────────┘
┌ Obras sociales ────────────────────┐
│ [OSDE] [Swiss Medical] [Galeno] …   │
└─────────────────────────────────────┘
```

- **Consultas idénticas.**
- `header`:
  - `h1 className="text-balance text-2xl font-semibold tracking-tight"` con `Hola{patient.name ?
    \`, ${patient.name}\` : ""} 👋` (texto de hoy).
  - `p mt-1 text-sm text-muted-foreground` "Este es tu espacio con {pro.name}.".
- **Tarjetas** (`Card` con `title`):
  - **"Tu próximo turno"**:
    - Con turno: `p className="text-base font-medium first-letter:uppercase"` `{formatDateTime(…)}
      hs` y debajo `p mt-1 text-sm text-muted-foreground` `{service.name} · {formatPrice(…)}`.
      Son los mismos datos que hoy, ordenados con la fecha primero.
    - Sin turno: el texto de hoy en `text-sm text-muted-foreground`.
  - **"Tu plan vigente"**:
    - Con plan: `p text-sm font-medium` `{latestPlan.title}` + `<ButtonLink href="/portal/plan"
      variant="secondary" size="lg" className="mt-4 w-full sm:w-auto">Ver plan<ChevronRight
      aria-hidden /></ButtonLink>`.
    - Sin plan: el texto de hoy, sin botón (como hoy).
  - **"Tu evolución"**:
    - Con peso: `p text-sm text-muted-foreground` "Último peso registrado" y `<Quantity
      value={Number(latestEntry.weightKg)} unit="kg" className="mt-1 block text-2xl
      font-semibold" />`.
    - Sin peso: "Todavía no hay registros.".
    - Siempre: `ButtonLink href="/portal/evolucion"` "Ver evolución" (mismos props que "Ver plan").
  - **"Diario alimentario"**: el texto de hoy + `ButtonLink href="/portal/diario"` "Abrir diario".
  - **"Obras sociales"** (solo si `formatInsuranceList` devuelve algo): pasa del encabezado al
    final, como dato secundario. `ul className="flex flex-wrap gap-2"` con un `li` por ítem, cada
    uno con `<Badge tone="neutral">{i}</Badge>`. Se van el emoji 🏥, el `uppercase` y los "·".
- Se va `Badge tone="green"`.
- **Componentes:** `Card`, `ButtonLink` (lg), `Quantity`, `Badge`.

### 7.8 Portal — plan (`/portal/plan`)

- **Consulta idéntica.** Se quedan igual `toMealView` y `sumMacros`.
- Sin plan: `<Card><EmptyState icon={ClipboardList} title="Todavía no tenés un plan activo."
  description="Cuando tu nutricionista te lo comparta, lo vas a ver acá." /></Card>`.
- Con plan: `<PortalPlanView title={plan.title} notes={plan.notes} meals={meals} totals={totals}
  hasPdf={Boolean(plan.pdfData)} />`.

**`PortalPlanView`** (`space-y-6`):

```
Plan Inicial                         ← h1 text-2xl font-semibold tracking-tight text-balance
Notas del plan…                      ← p mt-2 text-sm text-muted-foreground
[⤓        Descargar PDF          ]   ← a con buttonVariants primary lg, w-full sm:w-auto (si hasPdf)
┌ Energía  2.017 kcal ────────────┐  ← MacroTotals (col-span-2 en el celular)
├ Proteínas 130,6 g ┬ Carb. 241,2 g┤
├ Grasas 61,3 g     ┬ Fibra 20 g  ─┤
┌ Desayuno ───────────────────────┐
│ Avena                      40 g  │
│ Banana                    120 g  │
└──────────────────────────────────┘
```

- Si `hasPdf`: `<a href="/portal/plan/pdf" className={cn(buttonVariants({ variant: "default", size:
  "lg" }), "w-full sm:w-auto")}><FileDown aria-hidden />Descargar PDF</a>`. `buttonVariants` sale
  de `@/components/primitives/button` (server-safe; `ui.tsx` ya lo usa así).
- `<MacroTotals totals={totals} label="Total del plan" />`. **No** es `sticky` en el portal:
  ocuparía ~150 px de una pantalla de 780.
- Cada comida: `<Card key title={meal.name}>` con `ul className="-my-3 divide-y"`. Cada `li` es
  `flex items-baseline justify-between gap-4 py-3 text-sm`: nombre `min-w-0 break-words` (`foodName
  ?? customLabel ?? "—"`, igual que hoy) y, si hay gramos, `<Quantity value={Number(qty)} unit="g"
  decimals={1} className="shrink-0 text-muted-foreground" />`. **No** se suman las notas del ítem:
  hoy el portal no las muestra.
- **Componentes:** `MacroTotals`, `Card`, `Quantity`, `buttonVariants`, `EmptyState`.

### 7.9 Portal — evolución (`/portal/evolucion`)

- **Consultas idénticas.** `weightPoints` queda igual.
- `h1` "Tu evolución" (mismas clases que en 7.7).
- `<Card title="Peso">`:
  - Si `weightPoints.length < 2`: el mismo texto de hoy, en `text-sm text-muted-foreground` (misma
    condición).
  - Si no: `<EvolutionChart points={weightPoints} seriesLabel="Peso (kg)" height={220} unit="kg"
    />`. Se suma `unit`, que ya existe (002b O-b3).
- `<Card title="Historial" padding="none">`:
  - Sin registros: `<EmptyState icon={TrendingUp} title="Todavía no hay registros." />`.
  - Con registros: `ul className="divide-y"`. Cada `li` es `flex items-start justify-between gap-4
    px-4 py-3 sm:px-6`:
    - `div min-w-0` con `p text-sm font-medium first-letter:uppercase` `{formatDate(…)}` y, si hay
      nota, `p mt-0.5 text-sm text-muted-foreground`.
    - Si hay peso: `<Quantity value={Number(e.weightKg)} unit="kg" className="shrink-0 text-sm
      font-medium" />`.
- **Componentes:** `Card`, `EvolutionChart`, `Quantity`, `EmptyState`.

### 7.10 Portal — diario (`/portal/diario`)

- **Consultas idénticas.**
- `header`: `h1` "Diario alimentario" + `p mt-1 text-sm text-muted-foreground` "Anotá lo que
  comiste, con foto si querés." (textos de hoy).
- `<Card title="Nuevo registro"><DiaryForm /></Card>`.
- **`DiaryForm`**:
  - `const [state, action, pending] = useActionState(submitAction ?? addDiaryEntryAction, initial)`.
  - El `useEffect` de reset queda **igual** (`[state.ok]`).
  - `useActionToast(state, { success: "Registro guardado" })`.
  - `form ref action={action} className="space-y-4"`, con:
    - `Field "¿Qué comiste?"` → `Textarea name="note" rows={3} placeholder="Ej: Almuerzo: ensalada
      de lentejas y una fruta."`.
    - `Field "Foto (opcional)" hint="JPG, PNG o WEBP, hasta 3 MB."` (son los límites de la action)
      → `<input type="file" name="photo" accept="image/png,image/jpeg,image/webp" className="block
      w-full rounded-md text-sm text-muted-foreground file:mr-3 file:h-11 file:cursor-pointer
      file:rounded-md file:border file:border-solid file:border-input file:bg-background file:px-4
      file:text-sm file:font-medium file:text-foreground hover:file:bg-accent
      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />`.
    - `<Button type="submit" size="lg" loading={pending} className="w-full sm:w-auto">{pending ?
      "Guardando…" : "Agregar registro"}</Button>`.
    - `<FormError message={state.error} />`.
- **Registros:**
  - Sin registros: `<Card><EmptyState icon={NotebookPen} title="Todavía no cargaste ningún
    registro." /></Card>`.
  - Con registros: `<section aria-labelledby="diario-registros" className="space-y-4">` con `<h2
    id="diario-registros" className="text-base font-semibold">Tus registros</h2>` y una `Card` por
    registro:
    - Fila `flex items-start justify-between gap-3`:
      - `p text-sm text-muted-foreground first-letter:uppercase` con `<time
        dateTime={e.createdAt.toISOString()}>{formatDateTime(…)} hs</time>`.
      - `form action={deleteDiaryEntryAction}` con el mismo hidden `id` y `<SubmitButton
        variant="ghost" size="lg" pendingLabel="Borrando…" aria-label={\`Borrar registro del
        ${fecha}\`} className="-mr-3 -mt-3 text-destructive hover:bg-destructive-muted
        hover:text-destructive"><Trash2 aria-hidden />Borrar</SubmitButton>`.
    - Si hay nota: `p mt-2 text-sm`.
    - Si hay foto: el mismo `<img>` (con su `eslint-disable`), `className="mt-3 max-h-64 w-auto
      max-w-full rounded-md border object-cover"` y el mismo `alt`.
- **Componentes:** `Card`, `Field`, `Textarea`, `Button` (lg), `SubmitButton` (lg), `FormError`,
  `EmptyState`, `useActionToast`.

### 7.11 Portal — carga, error y acceso

- `(portal)/portal/loading.tsx` (fallback de las 4 pantallas) pasa a una sola columna:
  `role="status" aria-busy` con "Cargando…" `sr-only`, `space-y-4`, `Skeleton h-8 w-48` +
  `Skeleton h-4 w-64 max-w-full` y 3 × `CardSkeleton lines={2} bare`.
- `portal/error.tsx` (ya con `size="lg"`), "sin acceso" (`(portal)/layout.tsx`) y
  `app/not-found.tsx` bajo `/portal/*`: **sin cambios**, solo se verifican (§13.6).
- Reordenamiento 8 (Plan en la navegación): hecho por la 002a en `PortalNav`. Se verifica.

### 7.12 Calendario (solo O-c2, §4 D-d5)

- `calendar-client.tsx`, bloque de la leyenda. El contenedor se renderiza **siempre**, y el grupo
  de servicios solo si `legend.length > 0`:
  ```tsx
  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
    {legend.length > 0 ? (
      <>
        <span className="font-medium text-foreground">Servicios</span>
        {legend.map((s) => (…lo de hoy…))}
      </>
    ) : null}
    <span className="font-medium text-foreground">Estados</span>
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className="h-2.5 w-2.5 rounded-sm bg-success" />
      Completado
    </span>
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className="h-2.5 w-2.5 rounded-sm bg-destructive" />
      No asistió
    </span>
  </div>
  ```
  El comentario pasa a "Leyenda: color del servicio (dato) y de los estados cerrados".

---

## 8. Rutas / server actions / API

- **No se crean ni cambian** server actions ni rutas públicas.
- `api/appointments/route.ts` cambia solo los dos valores de `statusColor` (§4 D-d5). La consulta,
  la autenticación y la forma del JSON quedan idénticas.
- **Rutas temporales para el recorrido** (checklist fase 12; las usa y **las borra el
  orquestador**, §13.7). Todas quedan detrás de `middleware.ts` y del `auth()` del layout del
  panel, y ninguna escribe en la base:
  1. `src/app/(panel)/prueba-002d/page.tsx` (server, solo renderiza el cliente) +
     `prueba-002d-client.tsx` (cliente). Datos **en memoria**, y **no importa ninguna server
     action directamente**, salvo lo que ya importan los componentes que se muestran y que acá
     nunca se ejecuta. Arriba, `Alert tone="info"` "Página de prueba: nada se guarda ni se borra.".
     Secciones:
     - **Alimentos:** `FoodsList` con **120** filas ficticias (todos los grupos, 10 inactivas,
       nombres con tildes y "ñ", valores con y sin decimales, uno de 4 cifras en kcal) y otra
       instancia con `foods={[]}`.
     - **Plantillas:** `TemplatesTable` con 12 filas (4 sin notas, 2 con notas largas).
     - **Editor:** `MacroTotals` con `{ kcal: 2016.8, protein: 130.6, carbs: 241.2, fat: 61.3, fiber:
       20 }` + `MealsEditor` con 3 comidas ficticias. Una tiene 4 ítems con macros y notas, otra
       tiene ítems libres sin gramos y la tercera está vacía. Lleva `showMacros`,
       `ownerField="templateId"`, `ownerId="prueba"` y las 4 actions =
       `accionFalsa` (definida **a nivel de módulo** en el archivo cliente: `async (_fd: FormData)
       => { await new Promise((r) => setTimeout(r, 700)); }`). Otra instancia va con `meals={[]}`.
       Al lado, `<DeleteTemplateButton id="prueba" deleteAction={borradoFalso} />`, con
       `borradoFalso = async () => { await new Promise((r) => setTimeout(r, 800));
       notify.info("Página de prueba: no se borró nada"); }`.
  2. `src/app/(panel)/prueba-002d/portal/page.tsx` (server) + `portal-client.tsx` (cliente),
     envueltos en `<div className="theme-warm mx-auto max-w-2xl space-y-10 bg-background">`. La
     página entera toma el tono cálido por `:root:has(.theme-warm)`, y es lo esperado:
     - `PortalPlanView` con `hasPdf` y 4 comidas ficticias (nombres largos: "Yogur descremado con
       granola sin azúcar y frutillas").
     - `DiaryForm submitAction={diarioFalso}`, con `diarioFalso = async (_prev, fd) => { await
       sleep(800); const note = String(fd.get("note") ?? "").trim(); const photo =
       fd.get("photo"); return note || (photo instanceof File && photo.size > 0) ? { ok: true } :
       { ok: false, error: "Escribí algo o adjuntá una foto" }; }` (mismo texto de error que la
       action).
     - Una tarjeta de registro de diario de ejemplo con una foto: un `data:` URI de un PNG sólido
       de 1200 × 800 generado en memoria con un `canvas` en un `useEffect`. Sin archivos binarios
       en el repo. Sirve para ver `max-h-64` y el borde.
  3. `src/app/(panel)/prueba-002d/360/page.tsx` (server): 4 `<iframe>` de `width={360}
     height={780}` a `/portal`, `/portal/plan`, `/portal/evolucion` y `/portal/diario`, con `title`
     = ruta, en `flex flex-wrap gap-6`. Dependen de la cookie de sesión del portal (§13.6).
  4. `src/app/(panel)/prueba-pdf/route.ts` (`export const dynamic = "force-dynamic"`): `GET
     ?planId=<id>`. Lee exactamente lo mismo que `buildAndSavePdf`, que tampoco se toca:
     `getPlan`, `prisma.patient.findUniqueOrThrow`, `getProfessional()` y el logo con `select: {
     logoData, logoMimeType }`. Llama a `renderPlanPdf` y devuelve `application/pdf` con
     `Content-Disposition: inline`. **Sin `savePlanPdf`, sin `revalidatePath`, sin encolar nada.**
     404 si no hay plan.

## 9. Mensajes del bot

No aplica. No cambia ningún mensaje. El PDF que el bot manda por WhatsApp es el `pdfData` guardado:
toma el formato nuevo del total solo cuando la profesional lo regenera desde el panel.

---

## 10. Radio de impacto (lista exacta)

**Modificados**

- `packages/core/src/nutrition.ts` (+2 exports)
- `packages/core/src/nutrition.test.ts` (+tests)
- `apps/web/tailwind.config.ts` (se borra LEGACY; **última fase**)
- `apps/web/src/app/globals.css` (se borra el bloque LEGACY)
- `apps/web/src/components/ui.tsx` (se borran los tonos viejos de `Badge`)
- `apps/web/src/components/meals-editor.tsx`
- `apps/web/src/lib/plan-pdf.tsx` (`macrosLine` → `formatMacrosLine`)
- `apps/web/src/app/api/appointments/route.ts` (2 strings)
- `apps/web/src/app/(panel)/calendar-client.tsx` (leyenda)
- `apps/web/src/app/(panel)/pacientes/[id]/planes/[planId]/page.tsx` (`<dl>` → `MacroTotals`,
  import de `Quantity` fuera)
- `apps/web/src/app/(panel)/alimentos/page.tsx`, `foods-list.tsx`, `food-form.tsx`,
  `nuevo/page.tsx`, `[id]/page.tsx`
- `apps/web/src/app/(panel)/plantillas/page.tsx`, `new-template-form.tsx`, `[id]/page.tsx`,
  `[id]/template-meta-form.tsx`, `[id]/delete-template-button.tsx`
- `apps/web/src/app/(portal)/portal/page.tsx`, `plan/page.tsx`, `evolucion/page.tsx`,
  `diario/page.tsx`, `diario/diary-form.tsx`, `loading.tsx`

**Creados**

- `apps/web/src/components/submit-button.tsx`, `apps/web/src/components/macro-totals.tsx`
- `apps/web/src/app/(panel)/plantillas/templates-table.tsx`, `new-template-dialog.tsx`
- `apps/web/src/app/(portal)/portal/plan/plan-view.tsx`
- `apps/web/src/app/(panel)/alimentos/loading.tsx`, `alimentos/[id]/loading.tsx`,
  `plantillas/loading.tsx`, `plantillas/[id]/loading.tsx`
- Temporales (§8): `apps/web/src/app/(panel)/prueba-002d/page.tsx`, `prueba-002d-client.tsx`,
  `prueba-002d/portal/page.tsx`, `prueba-002d/portal/portal-client.tsx`,
  `prueba-002d/360/page.tsx`, `apps/web/src/app/(panel)/prueba-pdf/route.ts`
- `progress/impl_HU-002d.md`

**No se tocan** (verificable por diff, §13.2):

- Las actions: `alimentos/actions.ts`, `plantillas/actions.ts`, `portal/diario/actions.ts`,
  `pacientes/[id]/planes/[planId]/actions.ts` y `ai-actions.ts`.
- Las rutas del portal: `portal/login`, `portal/logout`, `portal/plan/pdf` y
  `portal/diario/photo/[id]`.
- `(portal)/layout.tsx`, `portal/error.tsx` y `app/not-found.tsx`.
- `components/shell/**`, `confirm.tsx`, `data-table.tsx`, `modal.tsx`, `number-input.tsx`,
  `skeletons.tsx`, `evolution-chart.tsx` y `primitives/**`.
- `lib/meal-view.ts`, `lib/pdf-theme.ts`, `lib/notify.ts` y `lib/food-groups.ts`.
- `middleware.ts` y `auth*.ts`.
- `packages/db/**` y `apps/bot/**`.
- `package.json` y `package-lock.json` (esta HU no instala nada).

---

## 11. Checklist de ejecución (atómico y en orden; al final de cada fase todo compila y funciona)

Cada fase termina con `npm run typecheck --workspace apps/web` en verde. Primero
`packages/core`, después `apps/web`, y `tailwind.config.ts` **al final** (fase 11).

### Fase 0: preflight

- [ ] 0.1 `git -C /Users/joelmiguelserrudo/Documents/Projects/Nutri-Bot branch --show-current` →
      `hu-002-rediseno-ui-empresarial`. Copiar el `git status --porcelain` inicial en `impl`.
- [ ] 0.2 `pgrep -fl "next dev"`: anotar el PID (hoy 86416). Con un dev levantado, **nada de `next
      build`**, y no se levanta otro.
- [ ] 0.3 Línea base: `npm run typecheck` (todos los workspaces) y `npm run test` → verdes (49
      tests). `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/login` → `200`.
- [ ] 0.4 Anotar en `impl` que se leyeron §2.1, §4 D-d6 y §6.3 (reglas duras, orden del cierre
      LEGACY y patrón de `useConfirm`).

### Fase 1: `packages/core` (formato de macros)

- [ ] 1.1 Agregar `formatMacroAmount` y `formatMacrosLine` al final de
      `packages/core/src/nutrition.ts`, textual a §6.1.
- [ ] 1.2 Tests en `packages/core/src/nutrition.test.ts` (§12).
- [ ] 1.3 `npm run test` → verde (49 + los nuevos). `npm run typecheck` → verde en **todos** los
      workspaces (core, db, bot y web).

### Fase 2: componentes compartidos

- [ ] 2.1 Crear `components/submit-button.tsx` (§6.2).
- [ ] 2.2 Crear `components/macro-totals.tsx` (§6.2).
- [ ] 2.3 `pacientes/[id]/planes/[planId]/page.tsx`: reemplazar el `<dl>…</dl>` y el array
      `totalCells` por `<MacroTotals totals={totals} />` dentro del mismo envoltorio `sticky`.
      Sacar `Quantity` del import. Nada más cambia en ese archivo (§13.2 lo verifica).
- [ ] 2.4 Reescribir `components/meals-editor.tsx` (§7.6): mismos props, tipos, forms, `name` e
      hidden. Import de `formatMacrosLine` desde `@nutri-bot/core`. typecheck verde.

### Fase 3: PDF

- [ ] 3.1 `lib/plan-pdf.tsx`: borrar la función local `macrosLine`, importar `formatMacrosLine`
      junto a `sumMacros` y `type Macros`, y usar `{formatMacrosLine(totals)}` en
      `styles.totalsLine`. `PlanPdfInput`, `PlanDocument` y `renderPlanPdf` quedan idénticos.
- [ ] 3.2 Render real con fixtures (§13.4) y anotar el resultado en `impl`.

### Fase 4: alimentos

- [ ] 4.1 `foods-list.tsx` → `DataTable` (§7.1). `FoodRow` sin cambios.
- [ ] 4.2 `food-form.tsx` (§7.2). Mismos `name`, `required`, `step` y `min`.
- [ ] 4.3 `alimentos/page.tsx` (ícono `Plus`), `nuevo/page.tsx` y `[id]/page.tsx` (§7.2, §7.3).
      `toggleActive` textual.
- [ ] 4.4 Crear `alimentos/loading.tsx` y `alimentos/[id]/loading.tsx`. typecheck verde.

### Fase 5: plantillas

- [ ] 5.1 `delete-template-button.tsx` con **el fragmento de §6.3, tal cual**. Verificación local:
      - `grep -n "<form\|action=" "apps/web/src/app/(panel)/plantillas/[id]/delete-template-button.tsx"`
        → 0 líneas.
      - `grep -n "confirm(" …` → solo `await confirm({`.
      - `grep -n "requestSubmit" …` → 0.
- [ ] 5.2 `template-meta-form.tsx` (§7.5).
- [ ] 5.3 `new-template-form.tsx` (+`onCancel?`) y crear `new-template-dialog.tsx` (§7.4).
- [ ] 5.4 Crear `templates-table.tsx`. Después, `plantillas/page.tsx` (§7.4) con la consulta
      idéntica.
- [ ] 5.5 `plantillas/[id]/page.tsx` (§7.5) con la consulta idéntica.
- [ ] 5.6 Crear `plantillas/loading.tsx` y `plantillas/[id]/loading.tsx`. typecheck verde.

### Fase 6: portal

- [ ] 6.1 Crear `portal/plan/plan-view.tsx` y reescribir `portal/plan/page.tsx` (§7.8).
- [ ] 6.2 `portal/page.tsx` (§7.7).
- [ ] 6.3 `portal/evolucion/page.tsx` (§7.9).
- [ ] 6.4 `portal/diario/diary-form.tsx` (+`submitAction?`) y `portal/diario/page.tsx` (§7.10).
- [ ] 6.5 `portal/loading.tsx` (§7.11). typecheck verde.
- [ ] 6.6 Revisión local: `grep -rn "useConfirm\|primitives/tooltip" "apps/web/src/app/(portal)"` →
      0. Todos los `Button`/`ButtonLink`/`SubmitButton` de `(portal)/portal/**` llevan
      `size="lg"`: `grep -rnE "<(Button|ButtonLink|SubmitButton)\b" "apps/web/src/app/(portal)/portal" | grep -v 'size="lg"'`
      → 0. Si una etiqueta abre en una línea y el `size` va en la siguiente, revisarla a mano y
      anotarla.

### Fase 7: O-c2 (calendario)

- [ ] 7.1 `api/appointments/route.ts`: los 2 valores de `statusColor` (§4 D-d5), con un comentario
      de una línea. Nada más en ese archivo.
- [ ] 7.2 `calendar-client.tsx`: leyenda (§7.12). typecheck verde.

### Fase 8: tonos viejos de `Badge`

- [ ] 8.1 `grep -rnE "tone(=|: )\"(slate|green|red|amber|blue)\"" apps/web/src` → 0 (ya no quedan
      consumidores).
- [ ] 8.2 `components/ui.tsx`: borrar el comentario `// LEGACY: …` y las 5 claves `slate`, `green`,
      `red`, `amber` y `blue` de `badgeTones`. typecheck verde. Si falla, hay un consumidor que se
      escapó: migrarlo, no volver a poner el alias.

### Fase 9: bloque LEGACY de `globals.css`

- [ ] 9.1 `grep -rnE "\b(press|reveal)\b" apps/web/src --include=*.tsx` → 0.
- [ ] 9.2 Borrar de `globals.css` el comentario `/* LEGACY (sistema Spring): … */`, `.press`,
      `.press:active`, `@keyframes reveal` y `.reveal` (hoy, líneas 102–121). Nada más.
- [ ] 9.3 Probar el dev: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/login` →
      `200`. Si da otra cosa, **restaurar el bloque borrado**, anotarlo en `impl` y seguir sin
      esta fase. El orquestador decide.

### Fase 10: greps en 0 (antes de tocar el config)

- [ ] 10.1 Correr §13.3 (1) a (5). Todo en 0 salvo las excepciones escritas. Todavía **no** la
      (6), que es la del config.

### Fase 11: bloque LEGACY de `tailwind.config.ts` (**último cambio de código**)

- [ ] 11.1 Borrar de `tailwind.config.ts`:
      - `fontFamily.display` y su comentario (queda solo `sans`);
      - el comentario `// ── LEGACY: …` y las claves `ink`, `leaf`, `mint`, `paper`, `line` y
        `brand` de `colors`;
      - `card: "var(--radius)", // LEGACY` de `borderRadius`;
      - el objeto `boxShadow` **entero** (sus dos claves son LEGACY).

      El resto queda textual: tokens, `darkMode`, `content`, `plugins` y los comentarios de
      arriba.
- [ ] 11.2 Compilar con el CLI y verificar el CSS generado (§13.5).
- [ ] 11.3 `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/login` → `200`. Se
      espera, porque el dev sigue con el config con el que arrancó (§4 D-d6). **No reiniciar el
      dev.** Anotar en `impl`: "El usuario tiene que reiniciar `npm run dev` para que tome el
      config sin alias; no debería cambiar nada visible".
- [ ] 11.4 typecheck verde.

### Fase 12: páginas temporales para el recorrido (las borra el orquestador)

- [ ] 12.1 Crear las 4 rutas temporales de §8, con datos en memoria. Sin clases del sistema viejo.
- [ ] 12.2 `grep -rn "from \"@/app\|actions\"" "apps/web/src/app/(panel)/prueba-002d"` → solo los
      imports de componentes (ningún import directo de un `actions.ts`).
      `grep -n "savePlanPdf\|revalidatePath\|enqueue" "apps/web/src/app/(panel)/prueba-pdf/route.ts"`
      → 0.
- [ ] 12.3 typecheck verde. Anotar en `impl` las rutas temporales, con el aviso de que las borra el
      orquestador después del recorrido, junto con sus tipos de `.next/types` (§13.7).

### Fase 13: verificación y cierre

- [ ] 13.1 Correr §13.1–§13.5 y anotar los resultados en `progress/impl_HU-002d.md`, con lo que no
      se pudo verificar y por qué.
- [ ] 13.2 No commitear. Devolver `done -> progress/impl_HU-002d.md`.

---

## 12. Tests

Lógica nueva en `packages/core`: `formatMacroAmount` y `formatMacrosLine`. Van en
`packages/core/src/nutrition.test.ts`, dentro de un `describe("formato de macros (es-AR)")`
nuevo, con `const NBSP = " "`:

| # | Caso | Esperado |
|---|---|---|
| 1 | `formatMacroAmount(1845.6, "kcal")` | `"1.846" + NBSP + "kcal"` (sin decimales, separador de miles) |
| 2 | `formatMacroAmount(999.5, "kcal")` | `"1.000" + NBSP + "kcal"` (redondea hacia arriba) |
| 3 | `formatMacroAmount(92.5, "g")`, `(61, "g")` y `(12345.5, "g")` | `"92,5" + NBSP + "g"`, `"61" + NBSP + "g"` (sin ",0") y `"12.345,5" + NBSP + "g"` |
| 4 | `formatMacrosLine({ kcal: 1845.6, protein: 92.5, carbs: 210.3, fat: 61, fiber: 25.2 })` | `` `1.846${NBSP}kcal · P 92,5${NBSP}g · C 210,3${NBSP}g · G 61${NBSP}g` `` |
| 5 | Lo mismo con `{ includeFiber: true }` | lo anterior + `` ` · Fibra 25,2${NBSP}g` `` |
| 6 | Todo en cero | `` `0${NBSP}kcal · P 0${NBSP}g · C 0${NBSP}g · G 0${NBSP}g` `` |
| 7 | Sin espacio común entre número y unidad ni punto decimal (caso 4) | `expect(line).not.toMatch(/\d (kcal|g)\b/)` y `expect(line).not.toContain("92.5")` |

`npm run test` → **≥ 56** tests en verde (49 de hoy + 7).

Lo demás (filtros de alimentos, armado de filas, `MacroTotals`) es presentación sobre datos que ya
trae la página, sin reglas de negocio. Queda en `apps/web`, sin tests (vitest solo corre en
`packages/core`).

---

## 13. Verificación (comandos exactos antes de declararse `done`)

Todo desde `/Users/joelmiguelserrudo/Documents/Projects/Nutri-Bot`, salvo que se indique otra
cosa.

### 13.1 Compilación y arnés

```bash
npm run typecheck --workspace apps/web     # verde
npm run typecheck                          # todos los workspaces (core cambia; bot y db tienen que seguir verdes)
npm run test                               # vitest de packages/core, ≥ 56 en verde
./ops/harness/verify.sh                    # exit 0
```

`next build` **no** se corre si `pgrep -fl "next dev"` devuelve algo (es lo esperado). Anotarlo.

### 13.2 Alcance del diff

```bash
git status --porcelain
git diff --stat -- packages/db apps/bot                                  # vacío
git diff --stat -- packages/core                                         # solo nutrition.ts y nutrition.test.ts
git diff -U0 -- packages/core/src/nutrition.ts | grep -E "^-[^-]"        # vacío (solo se agrega)
git diff --name-only -- \
  'apps/web/src/app/(panel)/alimentos/actions.ts' 'apps/web/src/app/(panel)/plantillas/actions.ts' \
  'apps/web/src/app/(portal)/portal/diario/actions.ts' \
  'apps/web/src/app/(panel)/pacientes/[id]/planes/[planId]/actions.ts' \
  'apps/web/src/app/(panel)/pacientes/[id]/planes/[planId]/ai-actions.ts' \
  'apps/web/src/app/(portal)/portal/login' 'apps/web/src/app/(portal)/portal/logout' \
  'apps/web/src/app/(portal)/portal/plan/pdf' 'apps/web/src/app/(portal)/portal/diario/photo' \
  'apps/web/src/app/(portal)/layout.tsx' 'apps/web/src/app/(portal)/portal/error.tsx' \
  apps/web/src/components/shell apps/web/src/components/primitives apps/web/src/components/confirm.tsx \
  apps/web/src/components/data-table.tsx apps/web/src/components/modal.tsx apps/web/src/components/number-input.tsx \
  apps/web/src/components/skeletons.tsx apps/web/src/components/evolution-chart.tsx \
  apps/web/src/lib/meal-view.ts apps/web/src/lib/pdf-theme.ts apps/web/src/lib/notify.ts apps/web/src/lib/food-groups.ts \
  apps/web/src/middleware.ts apps/web/src/auth.ts apps/web/src/auth.config.ts \
  apps/web/package.json package-lock.json                                 # vacío

# La API del calendario: solo cambian los 2 colores (+ 1 comentario)
git diff -U0 -- apps/web/src/app/api/appointments/route.ts | grep -E "^[-+][^-+]"
#   → exactamente: -"#16a34a", -"#dc2626", +"hsl(var(--success))", +"hsl(var(--destructive))" y +el comentario

# Detalle del plan (002b): solo el cambio a MacroTotals
git diff -U0 -- 'apps/web/src/app/(panel)/pacientes/[id]/planes/[planId]/page.tsx'   # revisar: import, totalCells y <dl> → <MacroTotals>

# PlanPdfInput idéntico y macrosLine reemplazada
git diff -U0 -- apps/web/src/lib/plan-pdf.tsx | grep -A12 "interface PlanPdfInput"   # vacío
grep -n "macrosLine\|formatMacrosLine" apps/web/src/lib/plan-pdf.tsx                 # solo import + 1 uso de formatMacrosLine

# Consultas idénticas (HEAD vs. ahora). Cada diff → vacío.
Q='prisma\.|list[A-Z][A-Za-z]*\(|get[A-Z][A-Za-z]*\(|where:|orderBy|include:|take:|select:|findUnique|findFirst|findMany|Promise\.all'
for p in "(panel)/alimentos/page.tsx" "(panel)/alimentos/[id]/page.tsx" "(panel)/plantillas/page.tsx" \
         "(panel)/plantillas/[id]/page.tsx" "(portal)/portal/page.tsx" "(portal)/portal/plan/page.tsx" \
         "(portal)/portal/evolucion/page.tsx" "(portal)/portal/diario/page.tsx"; do
  echo "== $p"; diff <(git show HEAD:"apps/web/src/app/$p" | grep -E "$Q") <(grep -E "$Q" "apps/web/src/app/$p")
done

# toggleActive textual
grep -n '"use server";' -A2 "apps/web/src/app/(panel)/alimentos/[id]/page.tsx"       # igual que en HEAD

# Mismos "name" de campos (conjuntos). Cada diff → vacío.
N='name="[a-zA-Z]+"'
for f in "(panel)/alimentos/food-form.tsx" "(panel)/plantillas/new-template-form.tsx" \
         "(panel)/plantillas/[id]/template-meta-form.tsx" "(portal)/portal/diario/diary-form.tsx" \
         "(portal)/portal/diario/page.tsx"; do
  echo "== $f"; diff <(git show HEAD:"apps/web/src/app/$f" | grep -oE "$N" | sort -u) <(grep -oE "$N" "apps/web/src/app/$f" | sort -u)
done
diff <(git show HEAD:apps/web/src/components/meals-editor.tsx | grep -oE "$N" | sort -u) <(grep -oE "$N" apps/web/src/components/meals-editor.tsx | sort -u)
grep -c "name={ownerField}" apps/web/src/components/meals-editor.tsx                  # 4 (igual que en HEAD)
grep -c "<form action=" apps/web/src/components/meals-editor.tsx                      # 4
```

Los únicos cambios fuera de `apps/web/` son `packages/core/src/nutrition.ts`,
`packages/core/src/nutrition.test.ts`, `progress/impl_HU-002d.md` y los archivos ajenos anotados
en 0.1.

### 13.3 Sistema viejo, confirm y consola (global, desde `apps/web`)

```bash
cd apps/web
# (1) Tokens, clases y componentes del sistema viejo en TODO src → 0 líneas
grep -rnE "(bg|text|border|ring|fill|stroke|divide|accent|outline|from|to|placeholder|decoration|caret|shadow)-(ink|leaf|mint|paper|line|brand)\b|font-display|--font-display|rounded-card|shadow-card|shadow-lift|\breveal\b|\bpress\b|btn-(solid|outline|leaf)|SpringShapes|CornerTriangle|Eyebrow|Space_Grotesk|Space Grotesk|float-slow|(^|[^:])uppercase|file:uppercase|tracking-\[|border-2|text-\[[0-9]+px\]|(amber|red|green|blue|gray|slate|emerald|zinc|neutral|stone|sky|rose|pink|violet|purple|indigo|teal|cyan|lime|yellow|orange|fuchsia)-[0-9]{2,3}\b|(bg|text|border)-(white|black)\b|tone(=|: )\"(slate|green|red|amber|blue)\"|✓|← " src
#     (`first-letter:uppercase` está permitido: pone en mayúscula solo la primera letra de una fecha; por eso el patrón excluye `:uppercase` salvo `file:uppercase`)
# (2) Marcadores LEGACY en src → 0 (el "legacy" en minúscula de api/webhooks/mercadopago no cuenta: es otra cosa)
grep -rn "LEGACY" src
# (3) Hex sueltos → solo los permitidos: brand.tsx (GoogleG), chart-theme.ts, pdf-theme.ts,
#     primitives/chart.tsx (selectores [stroke='#ccc'|'#fff'] de la 002b), service-form.tsx (PRESET_COLORS)
#     y servicios/actions.ts (default del color del servicio)
grep -rnE "#[0-9a-fA-F]{3,8}\b" src | grep -vE "src/components/brand.tsx|src/lib/chart-theme.ts|src/lib/pdf-theme.ts|src/components/primitives/chart.tsx|servicios/service-form.tsx:.*PRESET_COLORS|servicios/actions.ts:.*default\(" | grep -vE "^\S+:[0-9]+:\s*//"
#     → 0 (api/appointments ya no aparece)
# (4) confirm() nativo en todo src → 0 llamadas (solo el comentario de delete-plan-button y de delete-template-button)
grep -rn "confirm(" src | grep -v "useConfirm\|components/confirm.tsx\|await confirm({\|// "
# (5) Sin console.* ni TODO en los archivos de la HU
grep -rnE "console\.|TODO|FIXME" "src/app/(panel)/alimentos" "src/app/(panel)/plantillas" "src/app/(portal)" \
  src/components/meals-editor.tsx src/components/submit-button.tsx src/components/macro-totals.tsx src/lib/plan-pdf.tsx
# (6) (DESPUÉS de la fase 11) Config sin alias
grep -nE "LEGACY|\b(ink|leaf|mint|paper|line|brand|display|lift)\s*:|card: \"(var\(--radius\)|none)\"|boxShadow" tailwind.config.ts   # 0
cd ..
```

### 13.4 PDF con fixtures (lo verifica el implementer, sin base ni sesión)

`plan-pdf.tsx` importa `server-only`, así que no se puede importar tal cual desde `tsx`. Se copia
**sin esa línea** a una carpeta temporal y se renderiza con fixtures en memoria:

```bash
cd apps/web
mkdir -p .tmp-pdf-002d
sed '/^import "server-only";$/d' src/lib/plan-pdf.tsx > .tmp-pdf-002d/plan-pdf.tsx
# .tmp-pdf-002d/render.tsx: importa { renderPlanPdf } de "./plan-pdf", arma 3 comidas ficticias
# (MealView con macros calculados con computeItemMacros de @nutri-bot/core, un total > 1.000 kcal
# y macros con decimales), escribe el Buffer en process.argv[2].
npx tsx --tsconfig tsconfig.json .tmp-pdf-002d/render.tsx "<scratchpad>/plan-002d.pdf"
pdftotext -enc UTF-8 "<scratchpad>/plan-002d.pdf" - | grep -a -A1 "Total del plan"
#   → una línea "N.NNN kcal · P NN,N g · C NNN,N g · G NN,N g" (coma decimal, kcal sin decimales)
pdftotext -enc UTF-8 "<scratchpad>/plan-002d.pdf" - | grep -a "kcal" | od -c | grep -c "302 240"
#   → ≥ 1 (espacio duro U+00A0 = UTF-8 C2 A0). Si pdftotext lo normaliza a espacio común, anotarlo:
#     lo decisivo es el test de vitest; el orquestador lo mira además en el visor (§13.6).
pdffonts "<scratchpad>/plan-002d.pdf"                                  # Inter embebida, como en la 002b
rm -r .tmp-pdf-002d                                                    # no puede quedar en el repo
cd ..
```

**Prohibido** usar "Generar PDF" o "Enviar por WhatsApp" de un plan real.

### 13.5 Config nuevo de Tailwind sin el dev (fase 11)

```bash
cd apps/web
SCR="<scratchpad del agente>"   # fuera del repo
../../node_modules/.bin/tailwindcss -c tailwind.config.ts -i src/app/globals.css -o "$SCR/tw-002d.css"
#   → compila sin errores (valida el config y cada @apply de globals.css)
grep -cE "\.(text|bg|border|divide|ring|placeholder|fill|stroke|accent|outline|decoration)-(ink|leaf|mint|paper|line|brand)\b|\.font-display|\.rounded-card|\.shadow-(card|lift)|\.press\b|\.reveal\b|@keyframes reveal" "$SCR/tw-002d.css"   # 0
for c in '\.theme-warm' '\.bg-success-muted' '\.text-muted-foreground' '\.bg-destructive\b' '\.rounded-lg' '\.file\\:h-11' '\.first-letter\\:uppercase' '\.gap-px'; do
  printf "%s " "$c"; grep -cE "$c" "$SCR/tw-002d.css"                  # cada uno ≥ 1
done
cd ..
```

### 13.6 Recorrido visual (lo hace el orquestador con el navegador; lista concreta)

**Con el `next dev` del usuario tal como está, sin reiniciarlo** (§4 D-d6). Ventana de **1366 ×
800** (viewport útil **1366 × 663**), salvo que se diga otra cosa. En cada pantalla, en la
consola: `document.documentElement.scrollWidth <= window.innerWidth` → `true`.

**Prohibido en todo el recorrido** (reales):

- "Crear alimento", "Guardar cambios", "Activar"/"Desactivar".
- "Crear plantilla", "Guardar", "Borrar plantilla".
- "Agregar", "Quitar", "Borrar comida" y "Agregar comida" en un plan real.
- "Generar PDF" y "Enviar por WhatsApp".
- En el portal: "Agregar registro", "Borrar" y "Salir".
- "Cerrar sesión".

Contar los mensajes antes y después:
`docker compose exec -T db psql -U nutri -d nutribot -Atc 'select count(*) from "OutboundMessage";'`
tiene que dar **lo mismo** al final (hoy 4). Lo mismo con `select count(*) from "Food"` (90),
`"PlanTemplate"` (0) y `"DiaryEntry"` (2).

**Ids de solo lectura** (consultados el 2026-09-24):

- Alimento: `cmtynk2e8001j1y4ze3wudfat` (Aceite de girasol). Hay 90 alimentos, todos activos, y 0
  plantillas.
- Planes activos:
  - `cmtyq7tz8000gxnws8oyvhrg7` (María González `cmtyq7tys0000xnwszq8d9maa`, "Plan bajo en
    sodio", 3 comidas; total esperado ≈ `960 kcal · P 100,6 g · C 87,8 g · G 22,6 g`).
  - `cmtytptog0003gnmfp4qzm5sx` (Juan Pérez `cmtyq7tzm0017xnwskwm1ttlb`, "Plan Inicial", 4
    comidas; ≈ `2.017 kcal · P 130,6 g · C 241,2 g · G 61,3 g`).
  - Si algún decimal difiere, manda la franja de totales del panel.
- Paciente sin plan: `cmtyq7u07003dxnwssti9gv8c`.
- Turnos: COMPLETED `cmtyq7u0d0042xnwsyrmtgsqa` (7 sept) y NO_SHOW `cmtyq7u02002mxnwsfjuso8am`
  (2 sept).

1. **`/alimentos`**:
   - Tabla con 90 filas, "90 de 90" y encabezado fijo al scrollear **dentro** de la tarjeta.
   - Números a la derecha, con coma y cifras tabulares, y la unidad en el encabezado.
   - Orden por Energía (ícono + `aria-sort`).
   - Buscar "aceite" → filtra. Grupo "Grasas" → filtra.
   - Una búsqueda sin resultado → "Ningún alimento coincide…" + "Limpiar filtros", que lo
     restablece.
   - Clic en una fila → `/alimentos/<id>`. Tab hasta el nombre + Enter → lo mismo.
   - A 768 × 1024, la tabla scrollea en horizontal dentro de la tarjeta, no la página.
2. **`/alimentos/cmtynk2e8001j1y4ze3wudfat`**:
   - "Volver a alimentos", título, grupo como descripción, badge "Activo" y "Desactivar" (**no
     tocar**).
   - Formulario a ancho de lectura, "Composición cada 100 g" con unidades kcal/g dentro de los
     campos.
   - **No guardar.**
3. **`/alimentos/nuevo`**: mismo formulario vacío, "Grupo" en "Otros" y "Fibra" con "Opcional".
   Tab recorre los campos con foco visible. **No crear.**
4. **`/plantillas`** (real, 0 filas):
   - Estado vacío "Todavía no creaste ninguna plantilla" con el botón secundario.
   - "Nueva plantilla" del encabezado → diálogo con descripción, foco en "Nombre". Escape cierra
     y el foco vuelve al botón.
   - Abrir de nuevo → "Cancelar" cierra. **No crear.**
5. **`/prueba-002d`**:
   - **Alimentos:** 120 filas, 10 con badge "Inactivo", orden por nombre con tildes, y la
     instancia vacía con "Todavía no hay alimentos" + "Nuevo alimento".
   - **Plantillas:** 12 filas, notas largas en una línea y "—" sin notas.
   - **Editor:**
     - Franja de totales `2.017 kcal · 130,6 g · 241,2 g · 61,3 g · 20 g`.
     - Comidas con etiquetas visibles y "Cantidad" con "g".
     - Línea de macros por ítem con coma y espacio antes de la unidad (`… kcal · P … g · … ·
       Fibra … g`).
     - "Agregar" → "Agregando…" deshabilitado ~0,7 s.
     - "Quitar" y "Borrar comida" → "Quitando…"/"Borrando…". El lector de pantalla dice "Quitar
       <alimento> de <comida>": verificar con el árbol de accesibilidad de DevTools.
     - La comida vacía dice "Sin alimentos todavía", y la instancia sin comidas muestra el estado
       vacío.
   - **Borrar plantilla (flujo completo, acción falsa):**
     - Clic → **diálogo del sistema** "¿Borrar esta plantilla?", con la consecuencia y el foco en
       "Cancelar". El botón "Borrar plantilla" del diálogo va en rojo.
     - Escape → no pasa nada. Otra vez → "Cancelar" → nada.
     - Otra vez → "Borrar plantilla" → el botón pasa a "Borrando…" ~0,8 s → toast "Página de
       prueba: no se borró nada".
     - **El diálogo tiene que aparecer** (si no aparece, es el deadlock: rechazar).
6. **`/pacientes/cmtyq7tys0000xnwszq8d9maa/planes/cmtyq7tz8000gxnws8oyvhrg7`** (regresión de la
   002b, sin tocar nada):
   - La franja de totales se ve como antes (5 columnas a 1366, fija al scrollear).
   - El editor con el aspecto nuevo.
   - "Borrar plan" abre su diálogo → **Cancelar**.
7. **PDF (solo lectura):**
   - `/prueba-pdf?planId=cmtytptog0003gnmfp4qzm5sx` → el PDF se abre en el visor. "Total del plan"
     ≈ `2.017 kcal · P 130,6 g · C 241,2 g · G 61,3 g`, sin cortes entre número y unidad.
   - Lo mismo con `cmtyq7tz8000gxnws8oyvhrg7`.
   - Comparar con la franja del panel del paso 6.
   - `select "pdfGeneratedAt" from "NutritionPlan" where id in (…)` → **sin cambios** antes y
     después.
8. **`/`** (O-c2):
   - `<` hasta la semana del 7 de septiembre → el turno COMPLETED en verde del sistema. Hasta la
     del 2 → el NO_SHOW en rojo del sistema.
   - En la consola, `getComputedStyle(<elemento .fc-event del turno>).backgroundColor` (elegirlo con
     el inspector y usar `$0`) → `rgb(57, 111, 81)` para el COMPLETED y `rgb(181, 58, 54)` para el
     NO_SHOW.
   - La leyenda muestra "Estados: Completado, No asistió".
   - Si el evento sale con el azul por defecto, aplicar el plan B de §4 D-d5 y anotarlo.
9. **Portal, entrada sin escribir en la base** (el token es un HMAC sin estado):
   ```bash
   cd apps/web
   PATIENT_ID=cmtyq7tzm0017xnwskwm1ttlb npx tsx --env-file=../../.env -e 'import("@nutri-bot/db/domain").then(m=>console.log(m.createPatientToken(process.env.PATIENT_ID, 60)))'
   ```
   Abrir `http://localhost:3000/portal/login?token=<token>` (Juan Pérez).
10. **Portal a 360 px** con **`/prueba-002d/360`**: 4 iframes de 360 × 780 con la sesión de Juan.
    En la consola, para cada iframe:
    ```js
    [...document.querySelectorAll("iframe")].map((f) => {
      const d = f.contentDocument;
      const small = [...d.querySelectorAll("a, button, input, textarea, select")]
        .filter((el) => el.offsetParent !== null)
        .map((el) => { const r = el.getBoundingClientRect(); return [el.getAttribute("aria-label") || el.textContent.trim().slice(0, 24) || el.name, Math.round(r.width), Math.round(r.height)]; })
        .filter(([, w, h]) => h < 44 || w < 44);
      return [f.title, d.documentElement.scrollWidth <= f.clientWidth, small];
    });
    ```
    → cada iframe con `true` y `small` vacío. Excepción esperable: nada, porque el `Wordmark` no
    es un enlace. Si aparece algo, anotarlo con su tamaño.

    A mirar:
    - Tono cálido, pestañas abajo con "Plan", sin "← Volver".
    - Inicio: botones "Ver plan / Ver evolución / Abrir diario" a ancho completo y peso "NN,N kg".
    - Plan: totales con "Energía" en una fila y 2 × 2 debajo, "2.017 kcal" sin cortar, sin botón
      de PDF (no hay).
    - Evolución: barras con "kg" y historial con fechas en mayúscula inicial.
    - Diario: formulario, selector de archivo de 44 px y 2 registros.
11. **Portal a ancho real**:
    - Ventana al mínimo (500 px) y a 1366: `/portal`, `/portal/plan`, `/portal/evolucion`,
      `/portal/diario`.
    - Sin scroll horizontal. A 1366, las pestañas pasan arriba (activa con fondo).
    - A 500, la barra de abajo mide ≥ 44 px (DevTools).
    - Cambiar de sesión a María (`cmtyq7tys0000xnwszq8d9maa`, token nuevo): diario vacío con
      `EmptyState`.
    - Con `cmtyq7u07003dxnwssti9gv8c`: plan vacío con "Todavía no tenés un plan activo.".
12. **`/prueba-002d/portal`**:
    - Plan con "Descargar PDF" **arriba** a ancho completo (**no** hacer clic: fuera de una
      sesión con PDF da 404/401, y no importa) y nombres largos que parten línea sin empujar los
      gramos.
    - Diario con acción falsa:
      - Enviar vacío → "Guardando…" → error "Escribí algo o adjuntá una foto" en rojo debajo.
      - Con texto → toast "Registro guardado" arriba al centro, y el formulario se vacía.
      - Foto de ejemplo con `max-h-64`, borde y esquinas redondeadas.
13. **Acceso al portal:**
    - En una ventana privada, `/portal` → "Portal del paciente" con el texto de hoy, tono cálido.
    - `/portal/login?token=invalido` → la misma pantalla.
    - `/portal/no-existe` (con sesión) → "No encontramos esta página" + "Volver al inicio".
14. **Movimiento reducido** (DevTools → Rendering → `prefers-reduced-motion: reduce`): el diálogo
    de "Borrar plantilla" y el de "Nueva plantilla" aparecen sin animación. El spinner de
    `loading` gira igual: es indicador de estado, lo cubre la regla global y queda en un solo
    ciclo (como en 002a–c).
15. **Contraste** (DevTools): encabezados de la tabla de alimentos, badge "Inactivo", hints del
    formulario de alimento y texto secundario del portal sobre el fondo crema ≥ 4,5:1. Borde de
    los `NumberInput` ≥ 3:1. Texto blanco sobre los eventos COMPLETED/NO_SHOW ≥ 4,5:1.
16. **Carga** (DevTools → Network → "Slow 4G"): navegar a `/alimentos`, `/alimentos/<id>`,
    `/plantillas` y `/portal/plan` desde otra sección → cada uno con su esqueleto (tabla, formulario
    y una columna de tarjetas en el portal).

**Después del recorrido y del cierre, para el usuario** (lo avisa el orquestador; no bloquea la
aprobación):

1. Reiniciar `npm run dev` (Ctrl-C y `npm run dev`), para que el dev tome `tailwind.config.ts` sin
   alias.
2. Abrir `/`, `/pacientes`, `/alimentos` y `/portal` (con una sesión de paciente): **no tiene que
   cambiar nada** respecto de lo que se vio en el recorrido. Si algo pierde el color o el borde,
   es un alias que se escapó: avisar.

### 13.7 Cierre del recorrido (lo hace el orquestador)

Después del recorrido y **antes** de aprobar:

```bash
cd /Users/joelmiguelserrudo/Documents/Projects/Nutri-Bot
rm -r "apps/web/src/app/(panel)/prueba-002d" "apps/web/src/app/(panel)/prueba-pdf"
rm -rf "apps/web/.next/types/app/(panel)/prueba-002d" "apps/web/.next/types/app/(panel)/prueba-pdf"   # si no, tsc falla con tipos viejos
git status --porcelain | grep -E "prueba-|tmp-pdf"          # vacío
npm run typecheck --workspace apps/web                     # verde otra vez
```

Si quedara alguna otra ruta temporal de HU anteriores (`prueba-002b`, `prueba-002c`,
`prueba-error`), mismo tratamiento: borrar la carpeta en `src/app/(panel)/` **y** su carpeta en
`apps/web/.next/types/app/(panel)/`. Hoy no hay ninguna.

Al cerrar la HU, el orquestador actualiza la memoria `design-system.md`, que todavía describe el
sistema "Spring" (lo pide la HU en "Notas de implementación").

---

## 14. Observaciones y decisiones para el orquestador (no bloquean)

- **D-d1, alimentos en página.** Si la nutricionista prefiere editar sin salir de la lista, el
  cambio es envolver `FoodForm` en un `Sheet` desde `FoodsList`. La redirección de
  `createFoodAction` la sacaría de la lista igual al crear, así que convendría hacerlo junto con la
  Épica 20, que va a reescribir el formulario.
- **D-d3, formateador en `packages/core`.** Es la única salida de `apps/web` de esta HU, y es
  aditiva. Si el orquestador prefiere no tocar `packages/`, la alternativa es dejar
  `formatMacrosLine` en `apps/web/src/lib/`, pero se pierde el test (vitest solo corre en core) y
  CHECKPOINTS C4 queda con verificación solo visual.
- **D-d4, `MacroTotals` en el plan del paciente.** Toca una pantalla aprobada en la 002b, pero
  solo reemplaza su `<dl>` por el mismo contenido. El recorrido (paso 6) cubre la regresión.
- **D-d5, colores de estado con `var()`.** Si FullCalendar no aplica el valor (plan B: hex de los
  tokens), queda anotado. Los turnos cancelados no se muestran en el calendario (la consulta los
  excluye), así que no hace falta un tercer color.
- **D-d6, reinicio del dev.** No cambia nada visible, pero hasta que el usuario reinicie, el dev
  sigue generando las clases viejas si alguien las escribe. Después del reinicio, una clase vieja
  simplemente no pinta. El grep de §13.3 es la red.
- **O-d1, borrados sin confirmación en el editor de comidas.** "Borrar comida" borra la comida con
  todos sus ítems con un clic, hoy y después de esta HU (sumar confirmación es un cambio de
  funcionalidad). Recomendación: una tarea puntual con `useConfirm` (respetando §6.3) para "Borrar
  comida". Obliga a pasar ese botón a un componente cliente dentro del editor.
- **O-d2, borrado del diario sin confirmación.** El paciente borra un registro con un clic, igual
  que hoy. En el portal no hay `ConfirmProvider`: sumar uno al layout del portal y la
  confirmación sería otra tarea.
- **O-d3, el diario pierde el texto si la action falla.** "Foto de más de 3 MB" o "formato
  inválido" borran también la nota escrita, porque React resetea los forms con action, hoy y
  después. Se arregla con el patrón `onSubmit` + `startTransition` de la difusión (002c D-c5). Se
  deja fuera para no tocar el flujo del paciente sin pedido.
- **O-d4, orden de la tabla de alimentos.** `listFoods` ordena en Postgres y la tabla reordena en
  el cliente con `Intl.Collator("es")`. En casos con tildes o "ñ" puede diferir de a una posición
  del orden de hoy. Es aceptable.
- **O-d5, PDF guardados.** Los PDF ya generados (`pdfData`) conservan el formato viejo hasta que la
  profesional los regenere. El único plan con PDF hoy es un borrador de Juan Pérez.
- **O-d6, `sumMacros` redondea a 1 decimal y el PDF muestra las kcal sin decimales.** 959,9 kcal se
  ve como "960 kcal". Es lo pedido.

## 15. Dudas técnicas abiertas

Ninguna bloqueante. Las decisiones D-d1 a D-d8 están tomadas y justificadas. El orquestador puede
revisarlas con el usuario, en especial D-d3 (formateador en `packages/core`) y D-d5 (O-c2
incluido), pero no impiden implementar.
