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

# Recorrido HU-017b-2 (orquestador, 2026-10-04)

Solo lectura. Datos intactos: `AvailabilityRule` 17 filas (9 activas, 8 inactivas; el "16/9 inactivas" de la SDD era un
conteo errado), `Service` 9, `OutboundMessage` 12; el implementer comparó un hash de todas las filas antes/después.

## OK
- `/disponibilidad`: "Tu horario de todas las semanas y los días especiales", lista por día con solo las 9 reglas
  activas ("de 9:00 a 13:00 ›"), "Agregar horario" por día, "Domingo · No atendés", "Días especiales" vacío con su
  explicación y "Agregar excepción".
- `/servicios`: "Lo que el bot les ofrece a tus pacientes", "Activos (6)" y "Pausados (3)", precio destacado, resumen en
  una línea, "Editar" y switch "Lo ofrece el bot". Consola sin errores en las dos.

## Observación (dato, no defecto)
- El servicio "Antropometría" tiene la seña fija guardada como **$ 19.999,73** (editado el 2026-10-03). Se muestra
  bien; avisarle al usuario por si fue un error de carga.

# Recorrido HU-017b-3 (orquestador, 2026-10-04)

Solo lectura; no se envió ningún comunicado ni se marcó nada. Bot apagado; `OutboundMessage` 12, `Payment` 6,
`PatientInquiry` 0 (iguales antes y después).

## OK
- `/pagos`: "Lo que cobraste por mes…", "‹ Octubre 2026", tarjetas "Cobrado en octubre $ 31.999,73 · Señas esperando
  pago $ 0 · Cantidad de pagos 2 (2 Mercado Pago · 0 efectivo o transferencia)", buscador + segmentado Todos/Esperando
  pago/Cobrados, filas "Maria López · Antropometría · Turno: martes 6 de octubre, 17:00 · Cobrado · Seña · Mercado Pago
  · $ 19.999,73".
- `/avisos`: "Mandar un aviso a todas tus pacientes", "Le llega a 16 pacientes por WhatsApp" (= 11 + 5 por completar de
  Pacientes, sin los 5 canales: D13 OK), "Revisar y enviar"; cola "Mensajes que mandó el bot" con tipos en castellano
  ("Enviado · Confirmación de turno · Maria López"), segmentado Todos/Por enviar/Enviados/No se enviaron (1).
- `/mensajes`: "Pendientes (0) | Respondidas", vacío claro "No tenés mensajes pendientes.".
- Consola sin errores en las tres.

# Recorrido HU-017b-4 (orquestador, 2026-10-04/05)

Solo lectura. Ajustes de la profesional idénticos byte a byte al respaldo (verificado por el implementer); zona
`America/Argentina/Buenos_Aires`, moneda `ARS`, `updatedAt` original.

## OK
- `/ajustes`: índice General / Bot de WhatsApp / Google Calendar / Informes en PDF; aviso "WhatsApp desconectado: el bot
  no está respondiendo" + "Conectar WhatsApp"; zona horaria y moneda en listas con nombres comunes ("Argentina (Buenos
  Aires, Córdoba, …)", "Pesos argentinos (ARS)"); textos de ayuda simples; "Guardar" por grupo.
- `/asistente`: "¿En qué te ayudo?" con sugerencias ("¿Qué turnos tengo mañana?", "¿Cuánto cobré este mes?", "Contame
  de una paciente"), composer con "Preguntar" y el aviso de IA fijo.

## Defecto encontrado y arreglado antes del reviewer
- Reaparecía el error de hidratación del sidebar en `/ajustes` (ids de `useId` distintos; el arreglo R3 de 017c-3 no
  lo cubría). Arreglado en 0aec47b con un id estable; tras reiniciar el dev server, consola limpia en `/ajustes` y
  `/ajustes?tab=pdf` (el implementer: 0 errores en 144 recargas).
