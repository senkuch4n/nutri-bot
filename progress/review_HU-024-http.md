# HU-024 · Ensayo HTTP autenticado de T2e.1b

**Veredicto: lectura HTTP verificada; aceptación parcial.** Candidato `c08a46a`, revisión `mwpms4sd-3-wux6`. Dos consultorios sintéticos usaron sesiones emitidas con el encoder real de Auth.js y PostgreSQL 16 descartable. No se usó Google ni otro servicio externo. No se reprodujo un defecto de aplicación.

## Resultado observado

| Sesión → foto | HTTP | Cuerpo |
|---|---:|---|
| A → propia | 200 | `thumb-a` |
| B → propia | 200 | `thumb-b` |
| A → B y B → A | 404 | `{"error":"no encontrada"}` |
| Usuario sin pertenencia → A | 401 | `{"error":"unauthorized"}` |
| A tras revocar su pertenencia → propia | 401 | `{"error":"unauthorized"}` |

Las seis respuestas incluyeron `Cache-Control: no-store`. La consulta final devolvió `remaining=ra:a,rb:b`. Esto confirma que las dos recetas seguían presentes; no acredita invariancia de escrituras rechazadas, porque no se enviaron escrituras HTTP. El ensayo verificó la cadena sesión de Auth.js → pertenencia vigente → ruta real → PostgreSQL, no el inicio de sesión con Google.

| Cuerpo | SHA-256 registrado |
|---|---|
| `thumb-a` | `3b85b28a0e975d3fcc0bf64a8a564fcf9e60c63d7164af9965a9642736a901b1` |
| `thumb-b` | `b5b0cb65a92aff9880f8a1ba1701e2ceb1d35ef27cdc998e030545edd0eaba85` |
| `{"error":"no encontrada"}` | `ab4ad35b0c30636e4d256aa91cbd421fe990ae07479e41decb42ac07b8c8c18a` |
| `{"error":"unauthorized"}` | `782eeaa7f1915f6783146f8180751785584f0f24bd4e503165c7fc4a597da600` |

## Cómo reproducirlo

Esta guía recupera los pasos y la fuente del probe desde el historial del revisor; el archivo de ejecución y los logs completos del temporal ya no estaban disponibles para copiar.

1. Extraer `git archive c08a46a` al subdirectorio `app` de un temporal nuevo, junto a `evidence`, sin crear worktree ni copiar `.env`. Copiar solo las dependencias instaladas. Mantener `HOME`, `TMPDIR` y `NODE_COMPILE_CACHE` en el temporal; usar `NO_UPDATE_NOTIFIER=1`.
2. Usar `DOCKER_HOST=unix:///Users/leonel/.docker/run/docker.sock` con `DOCKER_CONTEXT` sin definir. Crear una red Docker nueva con nombre y etiqueta únicos y un contenedor nuevo `postgres:16-alpine` con `--pull never`, `--tmpfs /var/lib/postgresql/data` y `-p 127.0.0.1::5432`. No usar recursos existentes. Conservar ambos IDs para limpiar únicamente el contenedor y la red propios en un `trap`.
3. Aplicar `packages/db/prisma/migrations/*/migration.sql` por orden de ruta mediante `psql -X -v ON_ERROR_STOP=1` dentro del contenedor. Para comprobar el upgrade acotado, insertar las dos filas siguientes justo antes de `20261120060519_private_content_ownership`:

   ```sql
   INSERT INTO "Recipe" (id,name,"updatedAt")
   VALUES ('legacy-r','legacy synthetic',now());
   INSERT INTO "RecipePhoto" (id,"recipeId",data,"thumbData","byteSize")
   VALUES ('legacy-p','legacy-r',decode('1234','hex'),decode('5678','hex'),2);
   ```

   Tras aplicar el resto de las migraciones, el siguiente control devolvió `upgrade=legacy-r:legacy-tenant:1234`. Demuestra el backfill de una receta y la conservación de los bytes de su foto; no certifica un upgrade integral o una restauración.

   ```sql
   SELECT 'upgrade=' || r.id || ':' || r."tenantId" || ':' || encode(p.data,'hex')
   FROM "Recipe" r JOIN "RecipePhoto" p ON p."recipeId"=r.id
   WHERE r.id='legacy-r';
   ```

4. Cargar los fixtures HTTP en el mismo PostgreSQL descartable:

   ```sql
   INSERT INTO "Tenant" (id) VALUES ('a'),('b');
   INSERT INTO "User" (id,email,"googleSubject") VALUES
     ('ua','a@example.test','sub-a'),
     ('ub','b@example.test','sub-b'),
     ('uc','c@example.test','sub-c');
   INSERT INTO "TenantMembership" ("tenantId","userId",role) VALUES
     ('a','ua','OWNER'),('b','ub','STAFF');
   INSERT INTO "Recipe" (id,name,"tenantId","updatedAt") VALUES
     ('ra','a recipe','a',now()),('rb','b recipe','b',now());
   INSERT INTO "RecipePhoto" (id,"recipeId",data,"thumbData","byteSize") VALUES
     ('pa','ra',convert_to('photo-a','UTF8'),convert_to('thumb-a','UTF8'),7),
     ('pb','rb',convert_to('photo-b','UTF8'),convert_to('thumb-b','UTF8'),7);
   ```

5. Definir `DATABASE_URL` con el puerto de loopback del contenedor y credenciales sintéticas nuevas, un `AUTH_SECRET` aleatorio para esta ejecución, credenciales Google ficticias y `ALLOWED_EMAILS=a@example.test,b@example.test,c@example.test`. Desde `app/apps/web`, iniciar `../../node_modules/.bin/next dev -H 127.0.0.1 -p "$WEBPORT"` con un puerto libre. Nombre y salt de la cookie local Auth.js: `authjs.session-token`.
6. Guardar el bloque siguiente como `evidence/probe.mjs` y ejecutar `node evidence/probe.mjs` desde la raíz del temporal. Luego revocar en PostgreSQL la pertenencia de `ua` con `DELETE FROM "TenantMembership" WHERE "userId"='ua';` y repetir con `MODE=revoked`. Para auditar el resultado, comprobar también la cabecera `no-store` que el probe imprime.

```js
import { encode } from '../app/node_modules/next-auth/jwt.js';
import { createHash } from 'node:crypto';
const secret=process.env.AUTH_SECRET, salt='authjs.session-token';
async function test(user,email,photo,expected,body) {
 const token=await encode({secret,salt,token:{email,sub:user,privateContentUserId:user}});
 const response=await fetch(`http://127.0.0.1:${process.env.WEBPORT}/api/recetas/fotos/${photo}`,{headers:{cookie:`${salt}=${token}`},redirect:'manual'});
 const bytes=Buffer.from(await response.arrayBuffer()); const text=bytes.toString();
 console.log(`${user} ${photo} status=${response.status} body=${JSON.stringify(text)} sha256=${createHash('sha256').update(bytes).digest('hex')} cache=${response.headers.get('cache-control')}`);
 if(response.status!==expected || text!==body) throw Error('unexpected HTTP result');
}
if(process.env.MODE==='revoked') await test('ua','a@example.test','pa',401,'{"error":"unauthorized"}');
else {
 await test('ua','a@example.test','pa',200,'thumb-a');
 await test('ub','b@example.test','pb',200,'thumb-b');
 await test('ua','a@example.test','pb',404,'{"error":"no encontrada"}');
 await test('ub','b@example.test','pa',404,'{"error":"no encontrada"}');
 await test('uc','c@example.test','pa',401,'{"error":"unauthorized"}');
}
```

## Intentos y limpieza

- Primer intento: exit 1. La red `--internal` no publicó el puerto en loopback.
- Segundo intento: exit 1. Next se inició desde el directorio incorrecto y falló la compilación de CSS.
- Ejecución final, desde `apps/web`: exit 0. El `trap` informó `server stopped`; los comandos de eliminación devolvieron el ID del contenedor `1980b75640b38957206afa934f64223883c412cda047e49e30fa151568ea6a27` y de la red `1e889bbf2f5b4fa5ad2589667f7f1877b75a326a8fb199a545965932ab3f64ec`. Los traps de los dos primeros intentos también informaron la eliminación de sus recursos. Se usó `tmpfs`, sin volumen persistente. El temporal de la revisión ya no estaba presente al transferir la evidencia; no se eliminaron otros temporales ni recursos Docker.

## Cierre pendiente

S20–S22 tienen ahora evidencia HTTP de lectura y evidencia anterior de mutaciones en dominio ([reporte de los cinco casos](review_HU-024.md), más PostgreSQL independiente en ODD L41). Falta ejecutar una escritura propia y otra ajena por la interfaz normal, con verificación del estado antes y después. S28 suma un upgrade acotado; el ensayo integral y la restauración siguen en T4. No se repitieron suite ni typecheck: el candidato no cambió y se conserva el resultado anterior. No se implementó HU-025, ni se tocó HU-022, `develop` o `main`.
