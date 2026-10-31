# Bitácora de imleticio

## Sin HU activa
- **HU-021 · Lista de turnos** (issue #50): `aprobada` 2026-10-26. Rama local `feat/HU-021-lista-turnos`
  (sale de `feat/morph-dialog`). Pendiente, cuando el usuario lo pida: push, PR a `develop` con `Closes #50`,
  label del issue (título y cuerpo ya actualizados el 2026-10-26). Ajuste visual V1 (02a464a): la pantalla copia la captura. Falta el recorrido visual (§10.1 de la SDD).
- Revisar en el navegador las dudas 1 y 2 de `progress/review_HU-021.md`.

## Tarea directa en pausa
- `feat/morph-dialog` (odd/tasks/morph-dialog.md): T1 y T2 hechas; falta T3 (hoja inferior en mobile)
  y la prueba manual en el navegador.

## Animación del modal (v2, 2026-10-26)
- `feat/morph-dialog` 5059c08: MorphDialog más parecido al video de referencia (origen que se levanta,
  etiqueta compartida, fondo claro 8 %/12 % apilado, esquinas 24 px, tamaños md/lg, modales apilados).
  Reporte: `progress/morph-dialog-v2.md`. Mergeado en `feat/HU-021-lista-turnos` (a9a59a5). Falta verlo en el navegador.

## Rediseño de /pacientes (2026-10-26, tarea directa, sin commit)
- Sobre el árbol de `feat/HU-021-lista-turnos`, sin rama propia (Leo: "trabajá con lo que tenemos, después lo subimos").
- Encabezado (buscar, Filtros por estado, cuadrícula/lista, «+ Nuevo»), tarjetas Total/En proceso/De baja/Archivados,
  lista de tarjetas con iniciales y pill. Cada paciente abre `patient-quick-dialog.tsx` (MorphDialog con datos mínimos y
  link a la ficha): el contenido del modal falta definirlo.
- Estado derivado en core (`patientStageFor`): en proceso = turno próximo o consulta ≤ 90 días; si no, de baja. Sin migración.
- `StatCard` pasó a `components/stat-card.tsx` (lo usa también Turnos). Falta verlo en el navegador.
- Ficha completa en modal (odd/tasks/pacientes-modal-ficha.md): ruta interceptada `pacientes/(directorio)/@modal/(.)[id]`,
  `PatientRecord` compartido por la página y el modal, encabezado nuevo (avatar, estado, Agendar/Editar/Archivar/Historial).
  Sin commit. Falta verlo en el navegador.
- Animación de la ficha como el video de referencia (odd/tasks/pacientes-modal-ficha.md, T6): MorphDialog con `lift`
  (la fila se levanta, cierre rápido) y `cascade` (cuerpo de arriba hacia abajo); iniciales, nombre y etapa viajan con
  `data-morph-id`; el loading del modal muestra ese encabezado con lo que sabía la fila. Sin commit. Falta verlo en el navegador.
- Ajuste de fluidez (T7): tempo `brisk`, cuerpo sin escala y con blur chico, `will-change` solo al animar, prefetch de la fila. Probar en build de producción.
- Traba en las primeras aperturas (T8): la ficha se monta cuando termina la animación (`onOpenSettled`); mientras, el esqueleto.
- T8 rehecho: el montaje diferido rompía el modal (pantalla "Algo salió mal"); se revirtió y ahora se precargan los módulos de la ficha en ocioso desde la lista.
- T9: el error del modal era la animación de duración 0 del tempo `brisk` (Motion no devuelve controles); arreglado en `runAnimations`.
- T10: la ficha entra con la cascada cuando llega (antes: barras grises y salto), el cierre deja ver el cuerpo desenfocado hasta llegar a la fila, la etapa no queda bajo la X. Falta verlo en el navegador.
- T11: el nombre ya no se corta en "Juan" mientras viaja; la ficha entra desenfocada cuando llega. Falta verlo en el navegador.
- T12: la apertura ya no salta: curva del video (460 ms) y arranque en un cuadro limpio. Falta verlo en el navegador (mejor en build de producción).
