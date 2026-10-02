# Recorrido visual HU-011 (orquestador, 2026-10-02)

Panel con `npm run dev` (Chrome, 1456×833). Solo lectura: no se guardó nada en /ajustes ni se crearon consultas.

- **/mensajes** — OK. Título "Mensajes", tarjeta "Mensajes por WhatsApp", pestañas Pendientes/Respondidas/Todas con conteo (0), botón Actualizar, estado vacío con ícono. Ítem "Mensajes" en la sidebar (grupo Pacientes, ícono Inbox), activo. Sin badge porque no hay pendientes (esperado).
  - Observación: el texto del estado vacío dice "Las consultas que te dejen **fuera de horario** por el bot aparecen acá", pero por D4 también aparecen las de día. Texto a corregir.
- **/ajustes?tab=whatsapp** — OK. Bloque "Horario de consultas" con interruptor "Activado" y dos horas "Desde las 09:00 / Hasta las 22:00".
  - Observación: la UI expresa el **horario de atención** (09–22), mientras que la base guarda la franja fuera de horario (`afterHoursStart` 22:00, `afterHoursEnd` 09:00). Es coherente si el mapeo es intencional; el reviewer tiene que confirmar que "Desde" → `afterHoursEnd` y "Hasta" → `afterHoursStart`, y que el "resumen a las 09:00" del texto no está fijo sino que sale de la configuración.
- No probado: guardar el formulario (validación de horas iguales, toast), lista con datos, badge con pendientes, Sheet móvil. Quedan cubiertos por los tests y el script `test:after-hours`, o para el usuario.
