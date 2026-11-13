# Recorrido HU-018b-2 (orquestador, 2026-10-03)

Paciente de prueba propio ("Prueba HU-018b", jid inventado), creado por script y borrado por id al final con su
único plan. Planes reales: no se tocaron.

**Entorno:** el `next dev` del usuario venía de antes de la migración de 018b-1 y tenía el cliente de Prisma viejo
(`Unknown argument mode` al crear un plan → "Algo salió mal"). Se reinició con permiso del usuario. No es un
defecto del código, pero **cualquiera que actualice `develop` tiene que reiniciar `npm run dev` después de
`db:migrate`/`db:generate`** (mencionarlo en el PR).

## OK
- "Nuevo plan": trae Desayuno/Almuerzo/Merienda/Cena por día y Colaciones "Todos los días · Elegí una"; abre en
  `?dia=semana`.
- Lunes → banana 120 g en Desayuno con "Agregar al lunes": franja del lunes 106 kcal; "Lun" pierde el punto.
- Sin prescripción: "Calculá el requerimiento para ver cuánto falta. Ir a la consulta".
- "Copiar este día a…" martes y miércoles → toast "Lunes copiado a martes y miércoles · Deshacer"; "Deshacer"
  vuelve a dejarlos "sin cargar".
- Vista Semana: tabla por comida, "Sin cargar" en días vacíos, fila Total, "Promedio diario de la semana" sobre
  los días cargados.
- "Generar PDF" del plan de prueba: sin errores ("Último PDF: …").
- Consola sin errores.

## Observaciones (menores, para el reviewer)
- En la vista Semana el "Promedio diario de la semana" aparece dos veces (franja fija y bloque abajo), y el bloque
  de abajo redondea distinto ("1 g" vs "1,4 g" en proteínas).
- Con la franja fija (desde `md`), al desplazar, el aviso azul de la franja tapa el encabezado de la tabla Semana.

No recorrido: repetir, cambio de modo, opciones con 3 alimentos, renombrar/mover, portal, plantillas y celular
(cubiertos por `test-weekly-menu.ts` y tests).
