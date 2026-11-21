# HU-024 · Escrituras HTTP autenticadas de T2e.1b

**Veredicto: aprobado para L52.** Revisión independiente `mwpn5a79-5-rd91` sobre `c08a46a`. Se ejecutó `archiveRecipeAction` mediante el POST real de Next Server Actions, con dos consultorios sintéticos, sesiones de Auth.js y PostgreSQL 16 descartable. No se agregó un endpoint ni se reprodujo un defecto de aplicación.

| Intento | HTTP | Resultado de aplicación | Estado persistido |
|---|---:|---|---|
| `ua` archiva `ra`, de su propio consultorio | 200 | `{"ok":true}` | `ra:ARCHIVED`; `rb:PUBLISHED` |
| `ua` intenta archivar `rb`, que pertenece a `b` | 200 | `{"ok":false,"error":"La receta ya no existe."}` | Snapshot idéntico |
| `uc`, sin pertenencia, intenta archivar `rb` | 200 | `{"ok":false,"error":"Tu sesión venció. Volvé a entrar."}` | Snapshot idéntico |
| `ua`, tras revocar su pertenencia, intenta archivar `rb` | 200 | `{"ok":false,"error":"Tu sesión venció. Volvé a entrar."}` | Snapshot idéntico |
| Sin sesión, caso adicional | 307 | Redirección del middleware a `/inicio` | La solicitud no llegó a la acción; este control no compara snapshots |

Next usa HTTP `200` para transportar el resultado de la acción: la denegación se comprueba en `ok:false` y en la base. El snapshot SQL incluyó ambas recetas y sus fotos, ingredientes e imágenes importadas. Antes de archivar la receta propia: `7e3b94d13492763d5c7d84c20fc2a1a7b2c38c79b17857632a18a88fbd8742a1`. Después: `58079ed952e27e78a90b8fafaf8b6277a386609ea2549757682c3b49259cdbda`. Cada uno de los tres rechazos con sesión mantuvo este último SHA-256 antes y después. La revocación se confirmó aparte: `ua:a, ub:b` → `ub:b`.

## Ejecución y reproducción

1. Reutilizar el procedimiento aislado de [lecturas HTTP](review_HU-024-http.md), con un contenedor y una red nuevos, PostgreSQL en loopback, `app/` como copia de `git archive c08a46a`, sin `.env`, y ejecutar Next dev desde `app/apps/web`. La base y rol sintéticos de este script se llaman `synthetic`. Definir `CTR` con el ID de ese contenedor, `DOCKER_HOST` con el socket autorizado, `WEBPORT` con el puerto del servidor y generar `AUTH_SECRET` sintético. No contactar Google.
2. Aplicar los SQL de las migraciones en orden con `psql -X -v ON_ERROR_STOP=1`. Cargar los fixtures HTTP de lecturas, con `ra` y `rb` explícitamente en estado `PUBLISHED`. No revocar la pertenencia de `ua` hasta que lo haga el probe.
3. Desde la raíz del temporal, guardar el código de abajo como `write-probe.mjs` y ejecutar `node write-probe.mjs`. El probe obtiene el identificador de la acción existente de la compilación local y llama al mismo POST normal de Next; no requiere un endpoint de prueba. Los hashes incluyen valores generados durante el fixture, por lo que se compara antes/después dentro de una ejecución, no el valor absoluto de otra ejecución.

Ejecución final: **exit 0**. Una ejecución inicial produjo `URIError` en el extractor del probe antes de enviar POST; se corrigió solo el probe temporal. El revisor informó detención de servidores y eliminación de las redes y contenedores propios de los tres intentos, sin limpieza global. IDs finales: contenedor `0be826f39cc997175b7788b620242367a6fbfb0882ecf02264db4008e1363627`, red `de5a2a26fdf3ffd92bd1deccc3694291a547d5fffe560d675e5aed1a1eb146b4`.

La escritura HTTP verifica L52 para esta acción; no constituye una prueba HTTP de todas las rutas. Para el resto del corte se combina con la [revisión de dominio](review_HU-024.md), el PostgreSQL independiente de ODD L41 y las [lecturas HTTP](review_HU-024-http.md). El upgrade integral y restauración pertenecen al ensayo de aceptación de T4. No se repitieron suite, typecheck o lecturas HTTP en esta prueba acotada. No hubo cambios a HU-022, `develop` o `main`, ni push, PR o merge.

## Fuente exacta ejecutada

```js
import {encode} from './app/node_modules/next-auth/jwt.js';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const base=`http://127.0.0.1:${process.env.WEBPORT}`, salt='authjs.session-token';
const sql=q=>execFileSync('docker',['exec',process.env.CTR,'psql','-X','-A','-t','-v','ON_ERROR_STOP=1','-U','synthetic','-d','synthetic','-c',q],{encoding:'utf8'}).trim();
const snap=()=>sql(`SELECT jsonb_build_object('recipes',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM "Recipe" r WHERE id IN ('ra','rb')),'photos',(SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM "RecipePhoto" p WHERE "recipeId" IN ('ra','rb')),'ingredients',(SELECT jsonb_agg(to_jsonb(i) ORDER BY id) FROM "RecipeIngredient" i WHERE "recipeId" IN ('ra','rb')),'images',(SELECT jsonb_agg(to_jsonb(i) ORDER BY id) FROM "RecipeImportImage" i WHERE "recipeId" IN ('ra','rb')))::text`);
const hash=s=>createHash('sha256').update(s).digest('hex');
async function cookie(u){return `${salt}=${await encode({secret:process.env.AUTH_SECRET,salt,token:{email:`${u[1]}@example.test`,sub:u,privateContentUserId:u}})}`}
const a=await cookie('ua'), c=await cookie('uc');
let page=await fetch(`${base}/recetas/ra`,{headers:{cookie:a}}); console.log('own page',page.status); await page.text();
const js=readFileSync('app/apps/web/.next/server/app/(panel)/recetas/[id]/page.js','utf8'); const match=js.match(/id%22%3A%22([a-f0-9]+)%22%2C%22exportedName%22%3A%22archiveRecipeAction/); if(!match) throw Error('action id absent'); const action=match[1]; console.log('action',action);
async function attempt(label,cookie,id,expected){const before=snap(); const res=await fetch(`${base}/recetas/ra`,{method:'POST',headers:{cookie,'next-action':action,'content-type':'text/plain;charset=UTF-8',origin:base},body:JSON.stringify([id]),redirect:'manual'});const body=await res.text();const after=snap();console.log(label,'http',res.status,'body',JSON.stringify(body),'before',hash(before),'after',hash(after));const ok=body.includes('"ok":true'); const denied=body.includes('"ok":false'); if(res.status!==200 || (expected==='ok'?!ok:!denied) || (expected==='ok'?before===after:before!==after)) throw Error(label+' assertion');}
await attempt('owned',a,'ra','ok'); console.log('owned statuses',sql(`SELECT id||':'||status FROM "Recipe" WHERE id IN ('ra','rb') ORDER BY id`));
await attempt('foreign',a,'rb','deny'); await attempt('absent',c,'rb','deny'); console.log('membership before',sql(`SELECT "userId"||':'||"tenantId" FROM "TenantMembership" ORDER BY 1`)); sql(`DELETE FROM "TenantMembership" WHERE "userId"='ua'`); console.log('membership after',sql(`SELECT "userId"||':'||"tenantId" FROM "TenantMembership" ORDER BY 1`)); await attempt('revoked',a,'rb','deny'); let r=await fetch(`${base}/recetas/ra`,{method:'POST',headers:{'next-action':action,'content-type':'text/plain;charset=UTF-8',origin:base},body:'["rb"]',redirect:'manual'}); console.log('no-session',r.status,'location',r.headers.get('location')); console.log('DONE');
```
