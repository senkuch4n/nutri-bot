# Bitácora de imleticio

## HU-024 · Modelo multi-tenant y migración de la base de datos
- Issue #67 asignado a `imleticio`; estado del Project #5: **En curso**. Docker local recuperado; migración de agenda verificada de forma independiente con Postgres descartable.
- Rama local `feat/HU-024-modelo-multi-tenant` desde `develop`. Alcance en `docs/hu-modelo-multi-tenant.md`; especificación técnica en `Refactorizaciones/modelo-multi-tenant.md`. Baseline de 27 migraciones validado en Postgres 16 local descartable, sin usar el entorno habitual. Sin PR. Fundación aditiva en `9ec8fc7`; primer corte de T2 verificado (agenda, pacientes, servicios, disponibilidad y turnos). Pruebas solo en bases descartables.

- T2e.1b implementado en `c08a46a`: cinco defensas reconstruidas y sus controles positivos aprobados independientemente; suite 2.994 aprobadas y una omitida, y corroboración focal de 76 aprobadas. No se reprodujo un defecto funcional. El [ensayo HTTP autenticado](review_HU-024-http.md) aprobó las lecturas con dos consultorios, incluido el rechazo al revocar la pertenencia; también preservó una receta y foto legacy en un upgrade acotado. T2e.1b y T2e.1 cerrados en ODD L53: el [ensayo independiente de escritura HTTP](review_HU-024-http-write.md) confirmó archivado propio y rechazó escritura ajena, sin pertenencia y con pertenencia revocada sin cambios persistidos. Quedan T2e.2 (referencias privadas), T3 (contexto explícito) y T4 (aislamiento integral, upgrade y restauración). Ver [reporte de dominio](review_HU-024.md) y [ODD](../odd/tasks/hu-024-modelo-multi-tenant.md) para los límites de la evidencia. La publicación está pospuesta por el conflicto con HU-022, independientemente de la verificación local. Sin push, PR ni merge.

- T2e.2a implementado localmente: diagnóstico de cruces históricos, rollback transaccional de datos y DDL en PostgreSQL, guardas persistentes y de menú, y escrituras válidas/legacy preservadas. Tras corregir la pérdida del diagnóstico, la revisión independiente comprobó el ciclo real de recuperación con Prisma (P3018/23514, historial, rollback, resolve y retry con integridad). No dio aprobación final: el probe dejó su evidencia en un temporal fuera del scratch configurado. Suite anterior del autor: 2.996 aprobadas, una omitida. Ver [SDD](../Refactorizaciones/modelo-multi-tenant.md) y ODD L56–L58. Sin commit de T2e.2a ni migración real. T2e.2b verificó persistencia, escritores directos y menú semanal autenticado en los commits locales `5f4361d`, `e8097c6` y `a737316`, sin repetir el ciclo de Prisma de recetas ni aprobarlo. Ver [SDD de alimentos](../Refactorizaciones/referencias-alimentos-multi-tenant.md) y ODD L59–L62. T3 y T4 siguen abiertos.

- T3 en curso en el worktree `hu-024`: guardas en turnos, disponibilidad y relaciones clínicas seleccionadas, consumidores JID compuestos, Avisos y primeros límites de Calendar/Mercado Pago; evidencia y pendientes en ODD L65–L71. Sin migraciones ni cambios de claves; revisión T2e.2a sigue pendiente.

## Seguimiento anterior
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
