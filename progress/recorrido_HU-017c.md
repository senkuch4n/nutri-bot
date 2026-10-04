# Recorrido HU-017c-1 (orquestador, 2026-10-04, modo autónomo)

Dev en :3100 reiniciado (cliente Prisma de esta rama). Solo lectura: no se puso nombre a ningún contacto.

## OK
- `/pacientes`: buscador grande ("Buscá por nombre o teléfono"), "11 pacientes", filas con nombre grande y segunda línea
  en lenguaje común: "Martes 6 de octubre, 17:00", "Sin turno · Última consulta hace 1 semana", "Sin turno · Te
  escribió ayer", teléfono con formato "+54 9 351 555-2345".
- Búsqueda sin acentos: "maria" → María González y Maria López ("2 de 11"); la ✕ limpia.
- Los 5 `@newsletter` no aparecen. "Por completar (5)" cerrada al final con "Contactos que te escribieron y todavía no
  tienen nombre."; abierta muestra los 5 `@lid` sin nombre como "WhatsApp no muestra el número · Escribió ayer" con
  "Poner nombre".
- Ficha de María González: teléfono con formato en el encabezado.
- Consola de `/pacientes` sin errores al recargar.

## Tareas D1 (como si fuera ella; línea base antes de 017c-2)
1. Encontrar a una paciente y abrir su ficha: buscador + clic, sin dudas (~5 s).
2. Último peso: visible en el Resumen actual ("Peso 74,5 kg ↓ 1,5 kg"), sin dudas.
3. Empezar la consulta de hoy: es de 017c-2 (la ficha todavía tiene 7 pestañas y muchas acciones del mismo peso).

## Observaciones
- **Las 5 filas de "Por completar" son idénticas** ("WhatsApp no muestra el número"): no hay forma de saber a quién se
  le pone nombre. Esos contactos no tienen consultas, turnos ni consultas guardadas (`PatientInquiry` = 0). Arreglarlo
  pide guardar el nombre de WhatsApp (`pushName`) al crear el `Patient` en el bot (columna nueva): **idea para una
  tarea aparte**, fuera de 017c.
- Un error de hidratación del sidebar (`useId` de `aside`) quedó en la consola desde una carga anterior de
  `/alimentos` en la rama de 018d; no se reproduce en `/pacientes`. Vigilar.

# Recorrido HU-017c-2 (orquestador, 2026-10-04)

Solo lectura sobre María González (no se creó consulta ni se editaron datos).

## Defecto encontrado y arreglado antes del reviewer
- La ficha nueva rompía en runtime ("Algo salió mal"): íconos de lucide pasados como función de componentes servidor a
  componentes cliente (`SummaryCard`, `EmptyState`). El build no lo detecta. Arreglado en f5e6e2f + verificación en
  runtime (9c6017b). Re-test: la ficha abre y la consola no muestra esos errores.

## OK
- 4 pestañas (Resumen, Consultas 5, Plan, Historial). Una acción principal "Nueva consulta" → panel con la fecha de hoy
  ya cargada (no crea nada). Tarjetas: "Próximo turno · Sin turno", "Última consulta · Hace 4 semanas · 05/09 · Peso y
  medidas", "Plan · Plan bajo en sodio desde el 12/09", "Peso · 74,5 kg · Bajó 1,5 kg desde el 13/08" (neutral, con
  sparkline). "Datos de la paciente" en lenguaje común con aviso "Para calcular calorías falta: …" + "Completar".
- Alias: `?tab=evolucion` → Historial / "Peso y medidas". Consultas en lenguaje común ("Con turno (Consulta de
  seguimiento) · 9:30 · Sin registros").

## Tareas D1 (repetidas sobre la ficha nueva)
1. Buscar y abrir: igual que en 017c-1.
2. Último peso: tarjeta "Peso" del Resumen, a la vista.
3. Empezar la consulta de hoy: "Nueva consulta" es el único botón principal; la fecha ya está puesta. Sin dudas.

## Observaciones
- Error de hidratación del sidebar (`AppSidebar`: `id`/`aria-controls` de `useId` distintos entre servidor y cliente) en
  todas las páginas del panel. Viene de 017a; se suma a 017c-3 (R3).
- Placeholder del peso "70.5" con punto (debería ser "70,5"). Previo; se suma a 017c-3 (R4).
- No se pudo achicar la ventana a 390 px (la extensión no aplicó el resize); el responsive queda a cargo del reviewer
  y de tests.
