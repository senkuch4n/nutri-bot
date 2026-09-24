# Recorrido visual HU-002a (orquestador, Chrome, 2026-09-24)

Servidor: `next dev` del usuario en :3000, reiniciado después de los cambios de Tailwind.
Nada guardado, ningún turno ni aviso. Portal con un token de 30 min de una paciente de desarrollo;
se cerró la sesión con "Salir" al terminar.

## OK
- `/` (calendario), `/pacientes` y `/ajustes` a 1366 px: sidebar agrupada, paleta nueva en las
  clases viejas, sin scroll horizontal (`scrollWidth == innerWidth`).
- Colapsar la sidebar: pasa a íconos, el tooltip a la derecha funciona ("Pacientes"), el estado
  persiste al navegar (cookie). Expandir de nuevo funciona.
- 768 px: topbar con "Abrir menú". El Sheet abre, Tab queda atrapado dentro del diálogo, Escape
  lo cierra y devuelve el foco a "Abrir menú".
- 404: `/no-existe` (pantalla completa) y `/pacientes/id-que-no-existe` (dentro del shell), con
  "Volver al calendario".
- Portal a 500 px (el mínimo que permite la ventana de Chrome; no se pudo bajar a 360): tono
  cálido, barra inferior con 4 tabs (Inicio, Plan, Evolución, Diario) de 56 px, sin scroll
  horizontal. A 1366 px las tabs van arriba. "Salir" cierra la sesión y muestra la pantalla de
  "Portal del paciente" sin acceso.
- `/login` estando logueado redirige al calendario.

## Problema encontrado
- **Sidebar en la altura real de una notebook.** Con la ventana a 1366×800, el viewport queda de
  **663 px**. La lista de secciones no entra: el grupo "Herramientas / Asistente" queda cortado
  debajo del pie (Ajustes, estado de WhatsApp, cuenta). El `<nav>` tiene `overflow-y-auto`
  (scrollHeight 484 > clientHeight 464), así que se puede scrollear, pero no hay nada que lo
  indique. La nutricionista trabaja en una notebook: todas las secciones tienen que verse sin
  scroll a ~650 px de alto. Pasa lo mismo en el Sheet de 768 px.

## No verificado
- `/login` e `/inicio` sin sesión: hace falta una ventana privada, que la extensión no maneja.
- Página temporal `prueba-sistema` (catálogo de componentes) y `prueba-error`: no existen, el
  implementer no las dejó creadas.
- Contraste medido en DevTools.
- Nota: el círculo "N" abajo a la izquierda es el indicador de desarrollo de Next.js, no de la app.

## Ronda de resolución 1 (re-chequeo del orquestador)
- Sidebar a 1366×663: entran todas las secciones y el pie sin scroll (`nav` scrollHeight 494 ==
  clientHeight 494). Queda aire libre debajo de "Asistente".
- Trade-off visible: el email en el pie se trunca ("jo…errud…"), con el completo en `title`.
