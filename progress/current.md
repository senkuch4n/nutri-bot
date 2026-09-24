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

## Modo autónomo (autorizado por el usuario, 2026-09-24, solo por esta ocasión)

- El orquestador **valida las HU** en lugar del usuario y resuelve solo lo que surja.
- Elecciones fijas: architect con `refactor` + `ui` (en HU de UI; en otras, lo que aplique del
  catálogo); **implementer en Opus** con `ui-ux-pro-max`, `ui-styling` y `web-design-guidelines`
  cuando haya UI; reviewer en Opus.
- Límites que se mantienen: no push; no merge a `main` (lo revisa el usuario); nada que borre
  datos, mande WhatsApp o escriba datos de negocio en la base; nada de `migrate reset`.
- Orden: (1) confirmación en "Cancelar turno" y "Reintentar"; (2) HU-002d; (3) HU-003 (consulta
  como entidad central), y lo que siga del backlog mientras no dependa de datos que solo tiene la
  nutricionista.
- (1) Confirmación en Cancelar turno / Reintentar: hecha (commit ea8694a). No se probó con un clic real, para no arriesgar una cancelación.
- (2) **HU-002d** → `en_arquitectura` (refactor + ui).

### Ampliación del modo autónomo (pedido del usuario, 2026-09-24)

El usuario pide resolver **sí o sí** también lo que antes quedaba para él. Decisiones del
orquestador, para que las revise a la mañana:
- **SARA 2:** importar desde el PDF (`pdftotext -layout`), con validaciones (macros cerca de 100 g,
  kcal ≈ 4·CHO + 4·P + 9·G + 7·alcohol) y un reporte de las filas que no se pudieron leer.
- **Informe ISAK:** se usan los métodos de **ISAKMetry**, que es lo que ella usa: Kerr (1991),
  Lee (2000), Rocha (1974), residual por diferencia, Durnin-Womersley (1974), Phantom y
  Heath-Carter. ArgoRef queda como alternativa futura. Se valida localmente contra los archivos
  de ISAKMetry, que están en el gitignore; esos datos personales no se commitean.
- **Pediatría (5 a 18 años):** referencia OMS 2007 (IMC para la edad y talla para la edad, puntaje
  Z con tablas LMS públicas de la OMS) y ecuaciones de **Schofield** para la TMB en chicos.
- **Merge a `main` y push:** al final, cuando todas las HU estén aprobadas y `verify.sh` dé OK.
  Antes del push, revisar el remoto.
- **Condición de parada:** ninguna HU pendiente en `backlog.json`, más las épicas priorizadas
  (18/19, 20, 30, 44–46 y 56) convertidas en HU y cerradas.
- HU-002d: SDD lista; el orquestador acepta D-d1..D-d8 (modo autónomo) → aprobada (ver history). Pendiente directo después: confirmación en "Borrar comida" (O-d1).
- Backlog: se sumaron HU-004 (18/19), HU-005 (20), HU-006 (44/45), HU-007 (46) y HU-008 (56).
- **HU-002d aprobada**: el rediseño completo (002a–d) quedó cerrado. Rutas `prueba-*` borradas.
- "Borrar comida" con confirmación (commit d5c87e5).
- **HU-003** → `afinando`, en la rama `hu-003-consulta-entidad-central` (sale de la de la HU-002, encadenada).
- HU-003 afinada; el orquestador valida D1–D11 según las recomendaciones (migración solo aditiva) → `en_arquitectura` (migracion-prisma + ui).
- HU-003: SDD lista → `implementando` (Opus), con respaldo `pg_dump` antes de migrar.
- HU-003 implementada (18 consultas migradas, sin pérdida). El orquestador reinició el `next dev` (proceso nuevo en segundo plano). → `en_revision`.
- **HU-003 aprobada** (épica 30). Siguiente: HU-004 (épicas 18/19).
- HU-004 afinada y validada (D1–D14 según las recomendaciones) → `en_arquitectura`.
- HU-004: SDD lista (formato de kcal unificado con separador de miles) → `implementando` (Opus).
- **HU-004 aprobada** (épicas 18/19). Siguiente: HU-005 (SARA 2, épica 20).
- HU-005 afinada y validada (D1–D16 según las recomendaciones) → `en_arquitectura`.
- HU-005: el architect paró con 2 preguntas; el orquestador resolvió Q1=b (90–110 g) y Q2=5 % (entra la banana) → `implementando` (Opus).
- **HU-005 aprobada** (épica 20). Siguiente: HU-006 (ISAK, épicas 44/45).
- HU-006 afinada y validada (D1–D21 según las recomendaciones) → `en_arquitectura`.
- HU-006: SDD lista → `implementando` (Opus).
- HU-006: reviewer CHANGES_REQUESTED (onDone llamado durante el render en isak-form.tsx) → ronda 1 (Opus).
- **HU-006 aprobada** (épicas 44/45). Siguiente: HU-007 (informe PDF, épica 46).
- HU-007 afinada y validada (D1–D13 según las recomendaciones) → `en_arquitectura`.
- HU-007: SDD lista → `implementando` (Opus). El PDF de ejemplo sigue en el historial por decisión del usuario (repo privado).
- **INCIDENTE HU-007 (2026-09-24 08:11):** el implementer corrió `prisma migrate diff
  --from-migrations --shadow-database-url <DATABASE_URL>` y Prisma vació la base de desarrollo.
  El orquestador verificó que las 23 tablas tenían 0 filas, guardó el estado vacío, recreó el
  esquema `public` y **restauró `backup-antes-HU-007.sql`** (pg_dump de las 08:10). Conteos
  restaurados: 10 pacientes, 18 consultas, 15 mediciones, 4 mensajes, 5 planes, 980 alimentos,
  16 turnos, 1 profesional, 14 migraciones. `migrate status`: solo falta la migración nueva de la
  HU-007. Regla agregada a AGENTS.md y a skills/migracion-prisma.md.
- **HU-007 aprobada** (épica 46). Siguiente: HU-008 (pediatría, épica 56).
