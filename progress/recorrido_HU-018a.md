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

## 018a-2 (orquestador, 2026-10-03)
- 1ª pasada: `/recetas` con **Build Error de Turbopack** (`export type { … } from` en `actions.ts` `"use server"`,
  `bc034b7`). Devuelto al implementer; arreglado en `cccfd78` (verificado con `next build --turbopack`).
- 2ª pasada (después de `cccfd78`):
  - `/recetas?estado=revisar`: pestaña "Para revisar 8", texto de la carga asistida, "Empezar a revisar", tarjetas
    con la foto candidata.
  - "Empezar a revisar" → `/recetas/revisar/<id>`: "Borrador 1 de 8", selector "Todos los recetarios (8)", aside
    "1 porción aporta", "Según el recetario: 262 kcal (¾ albóndigas)", fotos encontradas (3 + "Ninguna").
  - "Aceptar las 10 sugerencias": toast "10 alimentos aceptados"; el aside pasa a 213 kcal y aparece "El recetario
    dice 262 kcal; con los ingredientes da 213 kcal".
  - "Publicar y seguir" con gramos faltantes: "Faltan 4 datos para publicar" con "Cargá los gramos o marcá «Sin
    cantidad (c.n.)»". No se publicó nada.
  - Consola sin errores.
- Observación menor: "Ninguna" aparece ya elegida en "Fotos encontradas"; el reporte decía "sin ninguna elegida".
- Los 8 borradores de muestra siguen en la base de desarrollo (para que el usuario los vea); se limpian con
  `recipes:undo` de las dos corridas.
