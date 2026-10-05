# Recorrido HU-017d-1 (orquestador, 2026-10-05, modo autónomo)

Portal de María González con un token de 60 min generado localmente (no se guarda en la base; solo lectura).

## OK
- `/portal`: "Hola, María 👋", "Tu espacio con tu nutricionista", tarjetas tocables: "Tu próximo turno · No tenés turnos
  próximos · Escribile a tu nutricionista por WhatsApp para sacar uno.", "Tu plan · Plan bajo en sodio · Mirá qué
  comer hoy", "Tu diario · ¿Qué comiste hoy? · Anotar comida", "Tu evolución · Tu último peso 74,5 kg · hace 1 mes",
  obras sociales. Sin botón WhatsApp porque la profesional no cargó su número (D7). Consola sin errores.
- `/portal/evolucion`: "Peso 74,5 kg · Último registro: hace 1 mes", "Altura 1,65 m · Medida hace 2 meses", "1,5 kg menos
  que el 13 de agosto" (neutral, sin colores), historial "5 de septiembre · 74,5 kg …".

## Defectos encontrados y arreglados antes del reviewer
- Gráfico de peso con barras en 0: la animación de Recharts no avanza en pestañas en segundo plano. Sin animación de
  crecimiento en el componente compartido (9831216); verificado en portal y ficha del panel.
- Título de la pestaña del portal "NutriBot — Panel" → "Tu espacio — <profesional>" (37cf2ac).

## Nota
- Para mirar la ficha del panel en runtime, el implementer armó una cookie de sesión local de Auth.js con AUTH_SECRET
  (15 min, sin escribir en la base, borrada al terminar).

# Recorrido HU-017d-2 (orquestador, 2026-10-05)

Solo lectura sobre el diario de María González (no se anotó nada). `Patient` 21 al final (la paciente de prueba del
implementer se borró).

## OK
- `/portal/diario`: "Tu diario · Anotá lo que comés, con foto si querés. Tu nutricionista lo ve.", "Anotar comida",
  vacío "Todavía no anotaste nada". Título de pestaña "Tu espacio". Consola sin errores.
- "Anotar comida" abre el sheet (lateral en escritorio): "¿Qué comiste?" con ejemplo, "Elegir foto", "Guardar"; Esc
  cierra sin guardar.
- Alta con foto, foto grande, borrar con Deshacer, sheet arrastrable y aviso al recargar con borrado pendiente: los
  probó el implementer en runtime con su paciente de prueba (progress/impl_HU-017d.md).

# Recorrido HU-017d-3 (orquestador, 2026-10-05)

Rama con el merge de 018d (03cd797); `prisma migrate status` al día. Solo lectura sobre el plan de María González.
Datos: `Patient` 21, `NutritionPlan` 11, `FoodMeasure` 0, `Recipe` 9 (iguales antes y después).

## OK
- `/portal/plan`: "Plan bajo en sodio", comidas en tarjetas ("Desayuno · Todos los días", "Yogur descremado · 200 g"),
  **sin kcal ni macros** (D1), gramos sin decimales de más. Sin "Descargar plan (PDF)" porque el plan no tiene PDF
  generado. Título "Tu espacio". Consola sin errores.
- "Ver receta" como fila entera con sheet inferior y medida casera "1½ tazas · 270 g": probados por el implementer en
  runtime con su plan de prueba (progress/impl_HU-017d.md).
