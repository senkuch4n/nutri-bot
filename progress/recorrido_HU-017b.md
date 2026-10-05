# Recorrido HU-017b-1 (orquestador, 2026-10-04, modo autónomo)

Bot apagado (sin proceso de `apps/bot`; `OutboundMessage` = 12 antes y después). Solo lectura: no se creó ni canceló
ningún turno real.

## OK
- `/?fecha=2026-10-06` abre la vista Día del martes 6 y la URL pasa a `?fecha=2026-10-06&vista=dia` (cierra Q7 de 017c).
  Resumen en palabras: "Hoy: sin turnos · Esta semana: 2 turnos · Próximo: Martes 6 de octubre, 17:00 · Maria López ·
  Antropometría". Segmentado Día/Semana/Mes, "‹ Hoy ›". Consola sin errores.
- Panel del turno: "Maria López · Antropometría · Martes 6 de octubre, 17:00", "Confirmado · En Google Calendar",
  "Ver ficha", "WhatsApp no muestra el número" (es `@lid`), precio "$ 40.000", motivo con "Editar motivo",
  recordatorios en palabras, acción principal "Vino a la consulta", "No vino", "Enviar recordatorio", "Registrar pago",
  y "Cancelar turno" separado en texto rojo con "Le avisamos por WhatsApp.".
- "Nuevo turno": pasos "1 ¿Para quién?" (buscador + lista de pacientes con su próximo turno + "Paciente nueva"),
  "2 Servicio", "3 Día".

## Tareas D1 (como si fuera ella)
1. Qué turnos tiene el martes: resumen + vista Día, inmediato.
2. Sacar un turno a una paciente existente: "Nuevo turno" → elegirla de la lista (no se guardó).
3. Cancelar y deshacer: no se hizo sobre un turno real; lo cubren los tests y la verificación del implementer.

## Observaciones
- Al abrir el panel del turno el foco inicial cae en "Editar motivo" (anillo visible); sería más natural en el título
  o en cerrar. Menor: pasa a 017b-2 (R1).
