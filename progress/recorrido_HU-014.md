# Recorrido visual HU-014 (orquestador, 2026-10-02)

Panel con `npm run dev` (Chrome). Solo lectura: no se guardó nada, no se envió ningún recordatorio.

- **/servicios** — OK. Cada servicio activo muestra el badge "Recordatorios: 3 días (pide confirmar) y 24 h antes" (backfill). En "Editar · Antropometría", sección "Recordatorios" con ayuda ("Podés poner hasta 3", qué hace "pide confirmar"), dos filas (3 días + pide confirmar ✓; 24 horas), número + unidad días/horas, check, tacho, "Agregar recordatorio". Se cerró con Escape, sin guardar.
- **/ajustes → General** — OK. Ya no está el campo de horas del recordatorio; en su lugar, "Los recordatorios se configuran en cada servicio."
- **Detalle del turno** (María López, 29/09 17:00, ya pasado) — línea "Recordatorios: 3 días antes, pide confirmar (no se envió) · 24 h antes (no se envió)".
  - **Observación para el reviewer:** en un turno **ya pasado** (o reservado después del momento del recordatorio, D5) "no se envió" es literal pero confunde; quizá debería decir "no aplica"/"salteado" o no mostrar los que ya no van a salir. Y el botón "Enviar recordatorio ahora" se sigue viendo en un turno pasado (P8 lo bloquea del lado del servidor; confirmar que el usuario ve un mensaje claro). No se hizo clic.
- No probado: guardar el editor, el botón manual, el envío real. Cubiertos por tests y `test:service-reminders` (15/15).
