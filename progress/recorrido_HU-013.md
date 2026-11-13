# Recorrido visual HU-013 (orquestador, 2026-10-02)

Panel con `npm run dev` (Chrome). Solo lectura: no se guardó nada, no se creó ningún turno ni se tocó ningún servicio.

- **/servicios** — OK. Los 6 servicios activos muestran el badge "Pide motivo" (default de la migración, D4). En "Editar · Antropometría" aparece el switch "Pedir motivo al reservar" encendido, con la ayuda "El bot le pide al paciente que cuente el motivo antes de confirmar el turno." Se cerró con Escape, sin guardar.
- **Calendario → "Nuevo turno"** — OK. Campo "Motivo de consulta (opcional)" con placeholder de ejemplos, ayuda "No se le manda al paciente." y contador 0/500. Se cerró con Cancelar.
- **Detalle del turno** (María López, 29/9 17:00) — OK. Fila "Motivo —" con el lápiz para editar (turno viejo sin motivo, D10). No se editó. El bloque del calendario no muestra el motivo (D9).
- No probado: guardar motivo en el panel, columna de la ficha, tarjeta de la consulta clínica y el flujo del bot. Cubiertos por tests y `test:booking-reason` (17/17), o para el usuario.
