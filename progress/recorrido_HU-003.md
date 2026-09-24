# Recorrido visual HU-003 (orquestador, Chrome, 2026-09-24, modo autónomo)

**Reinicio del `next dev`:** la ficha daba "Algo salió mal" porque el dev del usuario (pid 86416)
tenía el cliente de Prisma viejo en memoria, sin `Consultation`. Además la HU-002d necesitaba el
reinicio por Tailwind. El orquestador detuvo ese proceso y levantó `npm run dev` en segundo plano
(log en el scratchpad). El panel responde en :3000. **El usuario va a ver su terminal con el
proceso terminado.**

Base después de la migración: 18 consultas, 15 mediciones (0 sin consulta), 10 pacientes,
`OutboundMessage` = 4 (sin cambios).

## OK (solo lectura, con datos reales migrados)
- Pestaña **Consultas**, segunda y con contador (5). Tabla Fecha / Origen / Contenido, de la más
  nueva a la más vieja: 4 "Sin turno" (una por día con mediciones) y 1 vinculada al turno
  "Primera consulta · 16:00 hs". Chips Antropometría / Bioimpedancia.
- **Detalle** `Consulta del 01/08/2026`: "Turno · Primera consulta · 16:00 hs · Fecha del turno"
  (sin "Cambiar fecha"); mediciones en el grupo Antropometría (68 kg, 178 cm, IMC 21,5); "Plan
  indicado" con "Crear plan" e "Indicar un plan existente"; Notas. Sin sección de requerimiento
  (D6).
- **Evolución:** los gráficos siguen (12 barras) y la tabla suma la columna "Consulta".
- Después del reinicio (config de Tailwind sin LEGACY), la ficha, la sidebar y las tablas se ven
  bien.

## No verificado en el navegador (escribe datos o encola WhatsApp)
- Pasos 2 a 12 del §12 (completar o revertir turnos, agregar o borrar mediciones, notas, planes,
  nueva consulta, eliminar). Crear un turno encola WhatsApp y los demás escriben en la base. Los
  cubre el script `packages/db/scripts/test-consultations.ts` del implementer (datos propios,
  borrados por id) y los tests de core.
