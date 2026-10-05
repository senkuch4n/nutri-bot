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
