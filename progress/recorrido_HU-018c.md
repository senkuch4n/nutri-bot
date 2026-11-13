# Recorrido HU-018c-1 (orquestador, 2026-10-03, modo autónomo)

Paciente "Prueba HU-018c" y 3 recetas "Prueba 018c …" del implementer; plan creado desde el panel. Todo borrado por id
al final (1 plan, 3 recetas, el paciente). Datos reales sin tocar.

## OK
- Plan nuevo → `?dia=semana`; "Lun" → "Agregar receta" en "Desayuno · Lunes" abre el panel "Agregar a Desayuno ·
  Lunes" con la franja compacta del día, buscador, chips Tipo/Momento/Etiquetas, **Momento "Desayuno" preseleccionado**
  (inferido del nombre), "Mostrando 2 de 4 recetas", "Agregar en: Lun (fijo) Mar … Dom".
- Tarjetas con foto (o ícono), "1 porción: …", kcal y P/C/G, botón "Agregar".
- "Agregar" en Panqueques: "Agregada", stepper de porciones, toast "… agregada a Desayuno (lunes) · Deshacer"; la franja
  del lunes pasa a 199 kcal (también la del panel).
- "+" → "1½ porciones": la franja pasa a 299 kcal (199 × 1,5).
- Consola sin errores.

## No recorrido
- Impacto contra objetivo ("Entra"/"Se pasa"): requiere una consulta con prescripción (no se cargó).
- Varios días, plantillas, PDF, portal, celular y teclado: cubiertos por `test:recipe-picker` y tests.

## Nota de entorno
- La pestaña de la extensión queda oculta y algunos clics por `ref` se pierden (el DOM tiene una copia oculta de la
  página por el streaming de Suspense en dev); con coordenadas anduvo.

# Recorrido HU-018c-2 (orquestador, 2026-10-04, modo autónomo)

Dev en :3100 (el :3000 lo ocupa otro proyecto). Solo lectura sobre "plan maria" (no se agregó ni quitó nada).

## OK
- Buscador de "Desayuno · Lunes" → "Quitar filtros" → tocar la foto de "Receta Con imagen" abre el diálogo de detalle:
  foto grande, "Rinde 1 porción · 1 porción: 1 plato", 698 kcal por porción con P/C/G, Ingredientes con medida casera
  y gramos ("Leche materna · 1 taza (1.000 g)").
- Pie fijo con "Agregada", stepper de porciones y "Quitar" (la receta ya estaba en la comida); el contenido scrollea
  por debajo sin taparse.
- Esc cierra el diálogo y el foco vuelve a la tarjeta. Consola sin errores.

## No recorrido
- Impacto contra objetivo: el plan no tiene consulta con prescripción.
- Portal "Ver receta": requiere un token de paciente; lo verificó el implementer contra la base con build de producción
  (progress/impl_HU-018c.md). 390 px y PDF real: cubiertos por tests.
