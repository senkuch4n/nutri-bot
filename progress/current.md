# Sesión actual del arnés

## 2026-09-23

- Ronda 2 de ideas en `docs/historias-usuario-nutridesk.md` (épicas 17–43). La nutricionista
  trabaja sola (Épica 41 descartada) y atiende solo adultos.
- Reglas nuevas del usuario: antes de cada implementer, preguntar modelo + skills; antes de cada
  reviewer, preguntar modelo (CLAUDE.md, AGENTS.md).
- Orden: HU-001 → HU-002 (rediseño UI) → HU-003 (Épica 30) → Épicas 18/19 → Épica 20.
- **HU-001 aprobada**, probada por el usuario en el navegador, commiteada y mergeada a `main`.
- **HU-002** validada (resoluciones al final de docs/hu-rediseno-ui-empresarial.md) y partida en HU-002a/b/c/d. Referencia: Notion, neutro, más aire, shadcn/ui. Gráficos de evolución en barras (se puede cambiar de librería). Sin prototipo previo.
- HU-002a: SDD lista (Refactorizaciones/rediseno-ui-fundaciones.md, skills refactor + ui) → implementer (Fable) `done` → progress/impl_HU-002a.md. Typecheck y tests en verde. **Recorrido visual NO hecho**: el `next dev` del usuario quedó dando 500 porque Tailwind 3.4 en Node 24 no recarga `tailwind.config.ts`. Hay que reiniciar `npm run dev`.
- **Hallazgo O2 (confirmado por el orquestador):** el matcher de `apps/web/src/middleware.ts` no excluye `/portal`, así que el portal exige un email de Google permitido. Un paciente real no puede entrar. **Arreglado** (rama fix-portal-middleware, mergeada a main y a la rama de HU-002).
- **Hallazgo:** el webhook de Mercado Pago (`/api/webhooks/mercadopago`) también queda bloqueado por el middleware (307 a /inicio), y la ruta no valida la firma `x-signature`. Pendiente de decisión del usuario.

## Pendientes fuera de HU

- `apps/bot/scripts/test-confirm-attendance.ts` puede encolar WhatsApp a pacientes reales
  (crons sin filtrar por paciente). Arreglar antes de volver a correrlo.
- `apps/web/src/lib/age.ts` `calculateAge`: desfase de un día por zona horaria.
- Scripts de prueba contra la base: ¿se conservan o se borran? (SDD vs CHECKPOINTS C5).
- `docker-compose.prod.yml` es de otro proyecto: queda sin tocar.
- HU-002a: reviewer (Opus) CHANGES_REQUESTED (2 puntos chicos: espacio duro en `Quantity` y `aria-describedby` de `NumberInput`). Recorrido del orquestador en progress/recorrido_HU-002a.md: la sidebar no entra a 663 px de alto. → `rechazada_reintentando` (intento 1 de 2).
- **HU-002a aprobada** en la 2ª ronda (ver history). El usuario validó el login y el email truncado. Commiteada en la rama `hu-002-rediseno-ui-empresarial`, sin mergear a main (002b sale de esta rama). Siguiente: HU-002b (pacientes).
- **HU-002b** `rediseno-ui-pacientes` → `arquitectura_lista`: SDD en Refactorizaciones/rediseno-ui-pacientes.md. Recomienda Recharts 3 y sacar MUI. Usuario confirmó (acepta D-b1..D-b4) → `implementando` (Fable; ui-ux-pro-max, ui-styling, web-design-guidelines).
- Ronda 3 de épicas (44–55) a partir de los 2 PDF de la nutricionista. Contradicción abierta: ¿atiende desde los 5 años o solo adultos?
- HU-002b: implementer (Fable) `done`. Recorrido en progress/recorrido_HU-002b.md: todo OK salvo **Borrar plan sin diálogo** (probable deadlock de useConfirm dentro de una form action). → `en_revision`.
- HU-002b: reviewer (Opus) CHANGES_REQUESTED: (1) deadlock de useConfirm en delete-plan-button, confirmado; (2) subtítulo falso en peso vs. grasa. → `rechazada_reintentando` (intento 1 de 2).
- **HU-002b aprobada** (2ª ronda). Rutas `prueba-*` borradas. Commiteada en la rama, sin mergear. Siguiente: HU-002c (agenda y gestión).
- Usuario: la nutricionista atiende desde los 5 años (Épica 56, pediatría). InBody: $25.000 provisorio.
- **HU-002c** `rediseno-ui-agenda-gestion` → `en_arquitectura` (refactor + ui).
- HU-002c: SDD lista → usuario confirmó (acepta D-c1..D-c7) → `implementando` (Fable; ui-ux-pro-max, ui-styling, web-design-guidelines).
- El usuario no quiere sacar del historial el PDF de ejemplo con sus datos.
- Pendiente fuera de HU (después de 002c): confirmación con useConfirm para "Cancelar turno" y "Reintentar N fallidos" (O-c1).
- HU-002c: implementer (Fable) `done`. Recorrido en progress/recorrido_HU-002c.md: OK. **Bug anterior encontrado: el calendario muestra los turnos 3 h corridos (FullCalendar sin plugin de zona horaria)**; se arregla directo después de la 002c. → `en_revision`.
- **HU-002c aprobada** y commiteada en la rama. Siguiente: arreglo directo de la zona horaria del calendario, después confirmaciones de Cancelar turno/Reintentar y después HU-002d.
- **Arreglado (directo):** zona horaria del calendario con @fullcalendar/luxon3. Verificado en Chrome: Brenda a las 09:00 en el calendario y en el panel.
