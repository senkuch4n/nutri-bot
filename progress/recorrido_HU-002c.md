# Recorrido visual HU-002c (orquestador, Chrome, 2026-09-24)

`next dev` del usuario en :3000. No se creó, canceló ni confirmó ningún turno, no se tocó ningún
botón del panel del turno, no se envió la difusión real ni se tocaron el bot, los switches ni Google.
`OutboundMessage`: 4 antes y 4 después.

## OK
- **Sidebar** a 1366×663: entra entera (`nav.scrollHeight == clientHeight`).
- **Calendario `/`**: franja de una línea (Turnos hoy · Esta semana · Próximo turno); el calendario
  arranca a 199 px del borde. Semana anterior con los 4 turnos. Clic en un turno → **panel lateral
  a la derecha, sin overlay** (nombre, servicio, badges "Confirmado" y "En Google Calendar",
  paciente, teléfono, fecha en español, precio y acciones). Clic en otro turno con el panel
  abierto → cambia el contenido sin cerrarse. Sin scroll horizontal.
- **Servicios**: 3 tarjetas con punto de color, precio y duración, badge "Manda recomendaciones
  previas", "Editar" y switch "Activo".
- **Pagos**: 3 totales arriba, filtros visibles (búsqueda, control segmentado de estado, medio y
  tipo), "1 de 1" y tabla con la fila acreditada.
- **Avisos** (real): tarjeta del comunicado ("Se envía a 10 pacientes"), cola en tabla con el
  control segmentado Todos/Pendientes/Enviados/Fallidos, "En vivo · 0 pendientes", Actualizar y
  Pausar.
- **Ajustes**: índice lateral (General, Bot de WhatsApp, Google Calendar, PDF del plan); General
  con zona horaria, moneda, "Aviso previo" con unidad "h", WhatsApp y obras sociales. Formulario
  único con los 7 campos (`timezone`, `currency`, `reminderLeadHours`, `phone`,
  `acceptedInsurances`, `pdfAccentColor`, `pdfFooterText`).
- **/prueba-002c, difusión con action falsa**: "Enviar a los 3 pacientes" → **aparece el diálogo del
  sistema** "¿Enviar este comunicado?" con el foco en "Cancelar"; Escape → el texto sigue
  ("Prueba"). Otra vez → "Enviar a 3 pacientes" → toast "Encolado para 3 pacientes" y el textarea
  se vacía. **La regla de `useConfirm` funciona.**

## PROBLEMA (anterior a esta HU, no es regresión)
- **El calendario muestra los turnos 3 horas corridos.** El turno `cmtytsunv000bx91e24ssgyoh`
  (Brenda) está guardado a las 12:00 UTC, que son las **09:00 en Buenos Aires**. El panel del
  turno dice "09:00 Hs" y el recordatorio que le llegó a la paciente por WhatsApp decía "09:00
  hs", pero el calendario lo dibuja a las **12:00**. Lo mismo con María (13:00 en el calendario,
  10:00 real). Causa: `calendar-client.tsx` pasa `timeZone={tz}` (una zona con nombre) a
  FullCalendar **sin** el plugin de zonas horarias (`@fullcalendar/luxon3` o similar). Sin
  plugin, FullCalendar no puede convertir a una zona con nombre y muestra UTC. Está igual en
  `main` (línea 148): **no lo introdujo la 002c.** Afecta también el sombreado de las horas de
  atención y la franja que se elige al hacer clic en el calendario. Arreglar como cambio directo
  después de cerrar la 002c.

## No verificado
- Nuevo turno (diálogo), disponibilidad, `/ajustes/whatsapp`, `/asistente`, 768 px, Slow 4G,
  movimiento reducido y contraste medido.
