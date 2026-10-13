# Recorrido HU-018d-1a (orquestador, 2026-10-04, modo autónomo)

Dev en :3100 reiniciado (cliente Prisma nuevo). Alimento SARA 2 "Quinoa, semilla, hervida"; la medida de prueba se
creó y se quitó desde la UI (FoodMeasure = 0 al final). Sin planes ni pacientes de prueba.

## OK (pasos 1, 2, 3 parcial, 5 parcial de 12.2)
- Tarjeta "Medidas caseras" arriba de Energía, con la nota de SARA 2 y "Todavía no tiene medidas caseras."
- "Agregar medida": chips (taza, taza de té, pocillo, vaso, cda…), "Para líquidos, 1 ml ≈ 1 g". Chip "taza" + 180 →
  vista previa "1 taza de Quinoa, semilla, hervida = 180 g · 196 kcal" / "2 tazas = 360 g". Guardar → toast
  "Medida guardada" y fila "1 taza = 180 g · 196 kcal" con flechas, Editar y Quitar. La composición no cambió.
- "Taza" repetida → "Este alimento ya tiene la medida «taza»", sin guardar.
- Quitar → confirmación "¿Quitar la medida «taza»? Los planes que ya la usan no cambian." → toast "Medida quitada",
  vuelve el estado vacío. Consola sin errores.

## Observaciones menores
- El toast "Medida guardada" quedó visible más de un minuto (hasta que lo reemplazó "Medida quitada"). Revisar la
  duración del toast (puede ser el throttling de la pestaña oculta de la extensión).

## No recorrido
- Pasos 6–12 (editor de comidas, copias, plantilla, portal, PDF): cubiertos por `test-food-measures.ts` contra la base
  y por tests (progress/impl_HU-018d.md).

# Recorrido HU-018d-1b (orquestador, 2026-10-04)

Solo lectura ("Arroz blanco cocido", PROPIO, por URL directa; nada guardado).

## OK
- Paso 15: la tarjeta muestra "Tenías anotado: «1 taza ≈ 180 g». Pasalo a una medida para usarlo en los planes." con
  "Pasar a medida".

## Mejora pedida al implementer
- "Pasar a medida" con un `unitHint` legible abría el cuadro con el texto entero en el nombre y los gramos vacíos.
  Se pidió prellenar nombre y gramos con `parseUnitHint` cuando lo puede leer.
