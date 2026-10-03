# Recorrido HU-018a-1 (orquestador, 2026-10-03)

`npm run dev` reiniciado después de la migración `recipes`. Receta de prueba propia, borrada al final por id
(`cmus9q9th000179pwlftv017i`, sin uso en planes). Planes reales: no se tocaron.

## OK
- `/recetas` vacío: "Todavía no hay recetas. Cargá la primera." + "Nueva receta".
- "Guardar" sin datos: "Faltan 6 datos para guardar" con los 6 enlaces y 5 campos `aria-invalid`.
- Carga: nombre, tipo Plato principal, Almuerzo + Cena, rinde 8, "3 albóndigas", ingrediente "Lentejas, crudas"
  500 g (el picker mezcla SARA 2 y Propio): el aside "1 porción aporta" da 188 kcal · P 13 g · C 32,9 g · G 0,5 g y la
  barra "188 kcal / porción".
- Guardar → `/recetas/<id>` con "Publicada"; en `/recetas`, la tarjeta con "1 porción: 3 albóndigas" y macros.
- Buscador por ingrediente: "lenteja" → 1 receta; "zanahoria" → estado vacío con "Probá con otro ingrediente",
  "Quitar filtros" y "Crear receta".
- Consola sin errores.

## Observación
- `GET /api/recetas/fotos/<id>?size=full` sin sesión responde **307** (redirección al login del middleware), no 401
  como dice el paso 10 del reporte. No expone la foto; revisar si la SDD pedía 401 explícito.

No recorrido: foto (subida, formatos y tamaño), archivar/publicar, filtros combinados, celular y teclado (cubiertos por
tests y `test:recipes`).

## Ronda 2 (después de `87e8c42`)
- Receta de prueba ("Receta foto prueba HU-018a", borrada por id al final): guardar → abrirla → subir foto (JPG
  13 KB) → "Guardar" (toast "Receta guardada", foto servida por `/api/recetas/fotos/<id>?size=full`) → "‹ Recetas":
  navega a `/recetas` **sin** "¿Salir sin guardar?". Defecto de la ronda 1 resuelto.
- Nota de entorno: en `/recetas/nueva` el DOM tiene dos `h1` "Nueva receta" y dos `form` (uno oculto, probablemente
  la foto de salida de la transición de la HU-017a). El primer llenado se perdió porque la pestaña quedó oculta y el
  form se volvió a montar; a la segunda anduvo. Para mirar en el reviewer si el form duplicado es esperable.
