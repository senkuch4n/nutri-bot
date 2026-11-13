# Recorrido visual HU-016 (orquestador, 2026-10-03)

Panel con `npm run dev` (Turbopack, Chrome). Solo lectura: no se subió firma ni se guardó nada.

- **/ajustes → PDF** — OK. Tarjeta "Firma y matrícula": texto "Tu título, matrícula y firma aparecen en el informe antropométrico, y tu título y matrícula en el portal del paciente." (P2), campos Título ("Lic.") y Matrícula ("M.P. 852"), "Imagen de la firma" con ayuda (hoja blanca, PNG transparente, PNG o JPG hasta 1 MB), estado "Sin firma", "Seleccionar archivo" + "Subir firma", y vista previa "Así se ve al final de tus PDF" con la línea y la aclaración ("Nutricionista", porque la fila de desarrollo no tiene título ni matrícula). Debajo sigue la tarjeta Logo.
- **Informe antropométrico** (Brenda Yebara, 11/05/2026) — OK. Aviso warning "Tu matrícula y tu firma no están cargadas. Completalas en Ajustes para que aparezcan en tus PDF." con botón "Ir a Ajustes"; no bloquea.
- **Portal** (sesión de paciente de prueba ya abierta en Chrome) — OK. "Este es tu espacio con Nutricionista." (sin título/matrícula en la fila de desarrollo). No se ve la firma.
- No probado: subir/borrar la firma ni generar el PDF (cubierto por tests y por el render de prueba del implementer en el scratchpad).
- Nota ajena a la HU: la marca del panel ahora dice "Numa" (viene de `ae7edcb fix/bot-mp`, de imleticio), no de esta HU.
