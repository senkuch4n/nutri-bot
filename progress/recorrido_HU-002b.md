# Recorrido visual HU-002b (orquestador, Chrome, 2026-09-24)

`next dev` del usuario en :3000. Nada guardado, sin WhatsApp, sin "Generar PDF" ni "Enviar".
Portal con token de 30 min del paciente cmtyq7tzm0017xnwskwm1ttlb; se cerró con "Salir".

## OK
- **Ficha a 1366×663** (`/pacientes/cmtyq7tzm0017xnwskwm1ttlb`): encabezado (nombre, 31 años,
  teléfono, "Sin turnos próximos", WhatsApp) y 6 pestañas con contadores. *Resumen* muestra sin
  scroll la tarjeta Evolución (peso, cintura, grasa, masa muscular, con su variación, y las barras
  de peso con los valores encima) y Datos para cálculos (aviso de faltantes y valores con fecha).
  Sin scroll horizontal.
- **Evolución**: formulario con unidad dentro del campo, los dos desplegables, gráficos de peso,
  peso vs. grasa (dos ejes con unidad), bioimpedancia en tarjetas, y tabla de mediciones con los
  números a la derecha y el ícono de borrar. El encabezado con las pestañas queda fijo al
  scrollear. La URL cambia a `?tab=evolucion`.
- **Planes**: tabla + "Nuevo plan" con el control segmentado.
- **Detalle del plan**: "Volver a Juan Pérez", totales con unidades y columna "Datos del plan".
- **/prueba-002b**: la tabla de 30 filas con el encabezado fijo dentro de la tabla; perímetros y
  pliegues agrupados por estudio (4 colores, el último azul, leyenda con fechas); NumberInput con
  `aria-describedby="prueba-hint <id-unidad>"` (el pendiente de la 002a queda cubierto).
- **/prueba-error**: "Algo salió mal", con Reintentar, Volver al calendario y código.
- **/prueba-pdf**: Inter, título oscuro, franja de acento azul (#2563eb de /ajustes), el nombre
  de la nutricionista + "NutriBot" arriba a la derecha, "Generado el 24 sept 2026", 2 páginas.
- **Portal a 500 px** `/portal/evolucion`: peso en barras con el tono cálido, sin scroll
  horizontal.
- **768×1024**: esqueleto de carga visible; topbar con menú; el encabezado fijo queda debajo de
  la topbar; *Resumen* en una columna; las pestañas entran; sin scroll horizontal.
- **Sheet "Editar" de Datos para cálculos**: se abre a la derecha con los 4 selects; Escape lo
  cierra y el foco vuelve a "Editar".

## PROBLEMA (bloqueante)
- **"Borrar plan" no abre el diálogo de confirmación.** Al hacer clic, no aparece ningún
  `alertdialog` (se chequeó 1 s después) y no hay errores en la consola. El plan **no** se borró
  (verificado en la base). Causa probable, por el código (`delete-plan-button.tsx`): el
  `useConfirm` se llama **dentro del `action` del `<form>`**. En React 19 las actions de formulario
  corren dentro de una transición, así que la actualización de estado que abre el diálogo queda
  retenida hasta que termine la action, que a su vez espera la respuesta del diálogo (deadlock).
  Arreglo sugerido: pedir la confirmación en el `onClick`/`onSubmit` (fuera de la transición) y
  recién después llamar a la action, o usar `useConfirm` con un botón `type="button"`. No se pudo
  reintentar la prueba: el clasificador de permisos bloqueó un segundo clic por riesgo de borrado.

## Observaciones (no bloquean)
- **Peso vs. grasa corporal** con datos reales: ninguna fecha tiene las dos medidas, así que el
  gráfico alterna barras sueltas y el subtítulo "Cada fecha con las dos medidas" no es cierto. Con
  datos dispersos convendría ocultarlo o cambiar el texto.
- **Perímetros agrupados con base en cero**: diferencias de 2 a 4 cm apenas se ven (88 → 84 en
  cintura). El informe real de la nutricionista usa **barras horizontales anterior vs. actual por
  perímetro** (`docs/EJEMPLO DE INFORME ANTROPOMETRICO.pdf`, p. 3). Evaluarlo cuando se haga el
  informe (épicas 44–46).
- **PDF, "Total del plan"**: `2016.8 kcal · P 130.6g · C 241.2g · G 61.3g` usa punto decimal y no
  deja espacio antes de la unidad; el resto del panel usa coma y espacio (es-AR).
- `/login` e `/inicio` sin sesión, reduced motion y Slow 4G: no verificados en esta ronda.

## Ronda de resolución 1 (re-chequeo del orquestador)
- **"Borrar plan"**: al hacer clic se abre el `alertdialog` "¿Borrar este plan?" con el foco en
  "Cancelar". Escape lo cierra y el plan sigue (verificado en la base). No se confirmó el borrado.
  Nota: con el clic por referencia de la extensión el `onClick` no se disparó; con el clic por
  coordenadas sí. Es un tema de la herramienta, no de la app.
- Subtítulo de peso vs. grasa: corregido en el código (no re-verificado visualmente).
