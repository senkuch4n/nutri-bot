# NutriBot — instrucciones para agentes de IA

Sistema de turnos y seguimiento clínico para una nutricionista: bot de
WhatsApp (Baileys) + panel web (Next.js) + portal del paciente. Cualquier
agente que trabaje en este repo debería leer esto antes de tocar código.
El detalle funcional está en `README.md`.

## Stack (monorepo con npm workspaces)

| Workspace | Qué es |
|---|---|
| `apps/web` | Next.js 15 (App Router) + React 19 + Tailwind. Panel de la profesional (`(panel)`) y portal del paciente (`(portal)`). Login con Google (Auth.js). |
| `apps/bot` | Proceso Node (tsx): Baileys, cola de envíos (`OutboundMessage`), crons de recordatorios/confirmación, sync con Google Calendar. |
| `packages/core` | Lógica de dominio **pura** (disponibilidad, formato, textos, antropometría, nutrición). Único workspace con tests (vitest). |
| `packages/db` | Prisma: `prisma/schema.prisma`, migraciones, seeds, y `domain/` con operaciones compartidas por web y bot. |

- **La base de datos es la única fuente de verdad.** El bot y el panel no se
  hablan entre sí: se comunican por la base (p. ej. `OutboundMessage` como
  cola de mensajes salientes).
- Postgres corre en Docker en desarrollo (`docker compose up -d db`); web y
  bot corren en la máquina. `.env` único en la raíz.

## Comandos habituales (desde la raíz)

```bash
npm run dev                 # panel en :3000
npm run dev:bot             # bot
npm run typecheck           # tsc en todos los workspaces
npm run test                # vitest de packages/core
npm run db:generate         # regenerar cliente Prisma (después de tocar el schema)
npm run test:confirm-flow --workspace apps/bot   # simula el flujo sí/no sin WhatsApp real
```

## Dónde va la lógica

- Lógica de dominio que se pueda escribir sin base ni red → `packages/core`,
  con su `*.test.ts` al lado. Es el lugar natural para lo que haya que testear.
- Operaciones sobre la base que usan **web y bot** → `packages/db/domain`.
  No duplicar la misma consulta en `apps/web` y `apps/bot`.
- Textos que ve el paciente por WhatsApp → donde ya viven los textos del bot
  (buscar antes de crear uno nuevo).

## El "contrato" de este repo

No hay un cliente/servidor separados con DTOs a mano como en otros
proyectos: web y bot comparten los tipos que genera Prisma y las funciones
de `packages/db/domain`. El punto de fricción real es otro: **un cambio en
`schema.prisma` o en `packages/db/domain` impacta a los dos procesos a la
vez.** Si se cambia la forma de un modelo o la firma de una función de
`domain`, hay que revisar (y correr `typecheck` en) `apps/web` **y**
`apps/bot`, no solo el lado que motivó el cambio.

## Migraciones (Prisma)

- Cambios de esquema: editar `schema.prisma` y crear la migración con
  `npx prisma migrate dev --create-only --name <nombre>` (desde
  `packages/db`, con el `.env` de la raíz). Revisar el SQL generado antes de
  aplicarlo.
- **Nunca `prisma migrate reset`, ni aceptar el "reset" que ofrece
  `migrate dev` cuando detecta drift.** Borra la base de desarrollo entera.
  Si aparece drift, parar y avisar — no resolverlo reseteando.
- Nunca `prisma db push` contra una base que tenga migraciones.
- **Nunca pasar la base de desarrollo (`DATABASE_URL`) como `--shadow-database-url`, ni correr
  `prisma migrate diff --from-migrations` contra ella**: Prisma resetea la base shadow y la deja
  vacía (incidente del 2026-09-24 en la HU-007; se restauró desde un `pg_dump`). Para comparar
  schema contra migraciones, usar `migrate status` o una base shadow descartable.
- Antes de aplicar una migración, respaldar con `pg_dump` fuera del repo.
- Producción aplica con `prisma migrate deploy`. Una migración que agrega una
  columna `NOT NULL` a una tabla con filas necesita default o backfill en el
  mismo SQL.
- Después de tocar el schema: `npm run db:generate` antes del `typecheck`.

## WhatsApp: nunca mensajes reales en pruebas

- Ninguna verificación puede mandar mensajes de WhatsApp a números reales.
  El número del bot puede ser el personal de la profesional.
- Para probar flujos del bot, el patrón es un script tipo
  `apps/bot/scripts/test-confirm-attendance.ts`: simula la conversación sin
  Baileys, crea sus propios datos y los borra por id.
- Si una prueba encola en `OutboundMessage`, tiene que borrar esas filas por
  id antes de que el bot (si está corriendo) las despache.

## Datos de la base de desarrollo — regla dura

La Postgres de desarrollo puede tener datos cargados a mano por el usuario
(pacientes, turnos, planes de prueba). **Ningún agente puede borrar ni
modificar datos de negocio preexistentes.**

- Una prueba que escribe limpia **solo por los ids que ella misma insertó**,
  nunca con un filtro amplio (`deleteMany({ where: { patientId } })` se
  lleva todo lo que hubiera).
- Cuando se pueda, la prueba va dentro de una transacción que se revierte
  (`prisma.$transaction` que termina tirando un error a propósito).
- No correr `npm run db:seed` / `seed:demo` sin que el usuario lo pida.

## Arnés de orquestación RDD/SDD (backlog.json + progress/)

Las HU nuevas pasan por un arnés con estado en disco, no en el chat, así una
sesión nueva puede retomar donde quedó otra. Mapa:

| Archivo / carpeta | Qué contiene | Quién lo escribe |
|---|---|---|
| `backlog.json` | Estado de cada HU (`no_afinada` → ... → `aprobada`/`bloqueada`), máx. 1 HU activa a la vez, tope de 2 reintentos de revisión | **Solo el orquestador** |
| `progress/current.md` | Bitácora viva de la sesión en curso | Orquestador |
| `progress/history.md` | Log append-only de HU cerradas | Orquestador, al cerrar cada HU |
| `progress/impl_<id>.md` | Lo que hizo el implementador: archivos, verificación, bloqueos | Subagente `implementer` |
| `progress/review_<id>.md` | Veredicto del reviewer | Subagente `reviewer` |
| `docs/hu-<slug>.md` | RDD: Historia de Usuario completa (Contexto, Gherkin, Datos, UX, Fuera de alcance, Dudas) | Subagente `afinador`, validada por el usuario |
| `Refactorizaciones/<slug>.md` | SDD: spec técnica (esquema Prisma, workspaces afectados, checklist atómico, verificación) | Subagente `architect` |
| `docs/historias-usuario-nutridesk.md` | Lista de HU de origen (épicas). Fuente de borradores para el afinador | — |
| `skills/CATALOGO.md` | Skills seleccionables por HU al lanzar el implementador | — |
| `CHECKPOINTS.md` | Checklist objetiva del reviewer | — |
| `.claude/agents/{afinador,architect,implementer,reviewer}.md` | Subagentes | — |
| `ops/harness/verify.sh` | Verificación (typecheck/tests de los workspaces con cambios + chequeos de `backlog.json`). Corre en el hook `Stop` | — |

**Motor:** el arnés corre en modelos Claude. Afinador y architect van en
**Opus**. El modelo del `implementer` y del `reviewer` (Fable, Opus o Sonnet)
lo elige el usuario en cada HU, junto con los skills del implementer (decisión del usuario
2026-09-23). No se usa Codex ni otro motor externo. Por eso hay **un solo implementador** para
todo el monorepo, en vez de separar backend/frontend.

**Regla anti-teléfono-descompuesto:** los subagentes escriben su resultado
completo en el archivo que les corresponde y devuelven una sola línea de
referencia (`done -> progress/...`), nunca el contenido completo en el chat.

**Antes de armar una HU, chequear si hace falta:** un typo, un texto del bot,
un color o una config se hacen directo, sin backlog. HU + SDD + review son
4 subagentes; no se gastan en un cambio de tres líneas.

## Ramas de HU: encadenadas, no en paralelo

El estado del arnés vive en archivos versionados, así que dos ramas de HU
abiertas a la vez fragmentan también el estado (`backlog.json`,
`progress/history.md`), no solo el código. **Mientras haya una rama de HU sin
mergear, la siguiente sale de esa rama**, no de `main`.

Ojo también con las migraciones de Prisma: dos ramas que crean migraciones a
la vez generan carpetas con timestamps que se aplican en otro orden del
esperado.

## Git / flujo de trabajo

- Nunca commitear directo a `main`: rama de feature → merge.
- Un commit no mezcla trabajo de tareas distintas: si el working tree tiene
  cambios ajenos, `git add` solo los archivos de la tarea actual.
- Cada agente se identifica en el trailer del commit
  (`Co-Authored-By: <agente> <email>`).
