# Recorrido visual HU-017a (orquestador, 2026-10-03)

`npm run dev` recién levantado (Turbopack), Chrome con sesión del panel y del portal. Solo lectura.

- **Demo (fases 0–6):** el usuario la revisó y la aprobó tal cual. En la primera revisión `/dev-diseno` mostraba 2 errores de hidratación (`useId` distintos SSR/cliente en `AppSidebar` y en la demo); tras el commit f4f53ea y un servidor nuevo, **0 errores** de consola en `/dev-diseno`, `/`, `/pacientes/[id]`, `/servicios`, consulta, `/alimentos`, plan y `/portal`.
- **Después del flip (fases 7–9):** todas las pantallas recorridas toman el lenguaje Apple: acción principal y navegación activa en azul `#0066CC`, Inter con escala nueva, tarjetas sin borde con sombra, switches azules, destructivas en rojo suave ("Borrar estudio", "Borrar plan"), secundarios grises. Capturas en `docs/auditoria-apple/017a/despues/` (calendario, ficha, servicios, consulta, portal móvil).
- **Zona de imleticio (solo lectura):** `/alimentos` y un plan se ven coherentes con el sistema nuevo, sin roturas de layout (`x-alimentos-imleticio.jpg`, `x-plan-imleticio.jpg`). No se tocaron sus archivos.
- **Portal móvil (390×844):** saludo con large title, tarjetas sobre fondo cálido, botón gris lleno, tab bar inferior con material.
- No probado a fondo: reduced-transparency/contrast del sistema, teclado en todos los overlays reales, `next start` para el 404 de la demo (lo cubre el `next build` del implementer).
