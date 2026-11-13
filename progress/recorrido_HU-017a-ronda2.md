# Recorrido HU-017a — ronda 2 (orquestador, 2026-10-03)

`npm run dev` recién levantado, Chrome con sesión. Consola: 0 errores.

## OK
- **Dialog, clic durante la salida (1366):** `/` → "Nuevo turno" → Esc → clic inmediato en "Pacientes" de la
  sidebar: navega. Después: 0 `[role=dialog]`, 0 `[data-scrim]`, `body` con `pointer-events: auto`.
- **Menú móvil (390×844), tap durante la entrada:** el tap sobre un ítem navega (el sheet no queda clavado).
- **Menú móvil, Esc y scroll de la página durante la salida (sin tocar el panel antes):** el panel sale del
  todo y se desmonta (0 dialog, 0 scrim); la página scrollea.

## Defecto reproducido (2 de 2 intentos)
**Scroll con la rueda dentro del panel durante la ENTRADA y después cerrar con Esc → el sheet nunca se
desmonta.**
- Pasos: `/alimentos` a 390×844 → "Abrir menú" → inmediatamente rueda hacia abajo 2 ticks sobre el panel
  (x=120, y=500) → esperar 1 s → Esc → esperar 3–5 s.
- Resultado: sigue montado un `[role=dialog]` con `data-state="closed"`, `getBoundingClientRect().left = -4`
  (posición de abierto), un `[data-scrim]` con `pointer-events: none` y opacidad computada 0,99, y **el foco
  sigue adentro** (`document.activeElement` = "Cerrar sesión" del panel). En la captura el panel no se ve,
  pero queda en el DOM con el foco atrapado (teclado y lector de pantalla).
- Variante vista antes: rueda durante la entrada → Esc → rueda sobre la página: quedó montado con
  `left = -305` (15 px adentro) y el scrim al 4,5 % de opacidad, más de 4 s.
- Probable causa: la rueda (o el scroll que dispara) entra al flujo de `use-dismiss-drag`/`dismiss-drag`
  durante la entrada y detiene la animación sin captura; la salida posterior no llama a `safeToRemove`.

## Sidebar a 1366×768
- Con viewport 1470×819: `nav` scrollHeight 618 = clientHeight 618 (entra).
- Contenido real de la sidebar: header 56 + ítems 471 + pie 129 = **656 px**. Con ~650 px útiles
  (1366×768 con la barra del navegador) el `nav` tendría ~6 px de scroll: **al límite**.

## Re-test después de `3ed662d` (orquestador, 2026-10-03)
Chrome no se dejó achicar a 390 px (ventana maximizada: `innerWidth` 1470), así que el caso se repitió con
el sheet derecho de `/servicios` → "Editar", que usa el mismo `Sheet`/`use-dismiss-drag`:
- Abrir → rueda 2 ticks dentro del sheet durante la entrada → 1 s → Esc → 2 s: **0 `[role=dialog]`, 0
  `[data-scrim]`** (2 de 2).
- Variante con rueda sobre la página durante la salida: la página scrollea mientras el sheet sale; a los 2 s,
  0 dialog y 0 scrim.
- **Observación para el reviewer:** después de cerrar con Esc, `document.activeElement` es el link "Saltar
  al contenido" (el primero del documento), no el botón "Editar" que abrió el sheet. Con teclado, el foco
  debería volver al disparador (SDD §9.0, criterio de teclado). Puede ser efecto del `inert` + sacar el foco
  del panel al empezar la salida.
- No se pudo re-probar el menú móvil a 390 px ni la sidebar a 650 px útiles (el implementer midió en su copia:
  56 + 449 + 129 = 634 px, entra justo).

## Ronda 3 (orquestador, 2026-10-03, después de `4249f51`)
- **Reabrir durante la salida:** `/` "Nuevo turno" → Esc → clic inmediato en "Nuevo turno": queda 1 dialog
  `open`, no `inert`. OK.
- **Foco al disparador:** Esc en "Nuevo turno" → foco en el botón "Nuevo turno". Esc en el sheet de
  `/servicios` "Editar" → foco en ese mismo "Editar". OK. (`useConfirm` lo verificó el implementer.)
- **Nota de entorno:** la pestaña que maneja la extensión reporta `document.visibilityState = "hidden"`, así que
  el navegador no le da frames: las salidas tardan más y algunos clics no llegan. Explica las anomalías
  "colgadas" de la ronda 2 que no se reprodujeron; el fallback de 1 s del sheet igual las cubre. Un dialog
  quedó `closed` + `inert` unos segundos y se desmontó solo.
