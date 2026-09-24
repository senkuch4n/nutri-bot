# Skill: migración Prisma segura

Aplicar cuando la HU cambia `packages/db/prisma/schema.prisma`.

## Pasos

1. Editar `schema.prisma`.
2. Crear la migración **sin aplicarla**, desde `packages/db`:
   `npx dotenv -e ../../.env -- prisma migrate dev --create-only --name <nombre_snake>`
3. Leer el `migration.sql` generado antes de aplicarlo:
   - `ADD COLUMN ... NOT NULL` sobre una tabla con filas → agregar
     `DEFAULT` o hacerlo en dos pasos (nullable → `UPDATE` backfill →
     `SET NOT NULL`) editando el SQL.
   - `DROP COLUMN` / `DROP TABLE` / cambio de tipo que la SDD no pide
     explícitamente → parar: suele ser un rename que Prisma interpretó como
     borrar + crear. Reescribirlo como `RENAME COLUMN` si corresponde.
   - Enums: agregar un valor está bien; quitarlo o renombrarlo es destructivo.
4. Aplicar: `npm run db:migrate` (desde la raíz) y después
   `npm run db:generate`.
5. `npm run typecheck`: tiene que pasar en `apps/web` **y** `apps/bot`.

## Prohibido

- `prisma migrate reset`, o aceptar el "reset" que Prisma ofrece cuando
  detecta drift. Borra la base de desarrollo entera, con los datos del
  usuario.
- `prisma db push`.
- Pasar `DATABASE_URL` como `--shadow-database-url` o correr `prisma migrate diff
  --from-migrations` contra la base de desarrollo: Prisma la resetea (incidente HU-007).
- Editar una migración que ya está aplicada (en dev o en producción). Si
  hace falta corregirla, se crea una migración nueva.

## Si aparece drift

Parar y reportar `blocked` con la salida de
`npx prisma migrate status`. No resolverlo por cuenta propia.
