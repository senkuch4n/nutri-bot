# Recorrido visual HU-012 (orquestador, 2026-10-02)

Panel con `npm run dev` (Chrome, 1456×833). Solo lectura: no se guardó nada en /ajustes.

- **/ajustes?tab=whatsapp** — OK. Bloque nuevo "Preguntas con IA" debajo de "Horario de consultas":
  descripción (opción 5, sin indicaciones de salud), aviso amarillo "Falta configurar la clave de la
  IA en el servidor (`API_KEY_IA_ANTHROPIC`). Hasta que esté cargada, la opción 5 no aparece en el
  bot." (correcto: en desarrollo no hay clave), interruptor "Responder preguntas con IA" apagado
  (default D11) con la ayuda "La opción 5 no aparece en el menú.", textarea "Información para el
  asistente" con placeholder de ejemplo, contador 0 / 2.000 y aviso "No pongas datos de pacientes",
  botón Guardar. El bloque de la HU-011 sigue igual.
- No probado: guardar (interruptor/textarea), el bot con la IA (sin clave real por regla: no se
  llama a la API). Cubiertos por tests y `test:bot-ai` (18/18, proveedor falso), o para el usuario
  cuando cargue la clave.
