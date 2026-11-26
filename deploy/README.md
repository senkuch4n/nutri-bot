# Producción en el VPS

Desde 2026-11-12 producción corre en un VPS propio (Ubuntu 24.04, `169.58.151.56`) en vez de
Vercel + Neon: Postgres, web, bot y Caddy en Docker Compose. URL: https://numa.arzium.com.ar (desde 2026-11-17; antes
`169-58-151-56.sslip.io`, que redirige al nuevo).

- Código en `/opt/nutribot` (en `main`, lo maneja `deploy.sh`); este directorio es `/opt/nutribot/deploy`.
- Secretos en `/opt/nutribot/deploy/.env` (no versionado, `chmod 600`; plantilla en `.env.example`).
- Solo Caddy publica puertos (80/443). ufw permite 22/80/443; Docker se saltea ufw en los puertos
  publicados, así que **no** publicar `db` ni `web`.
- El dominio sale de `DOMAIN` en `.env`. Para pasar a un dominio propio: registro A al VPS, cambiar
  `DOMAIN` y las URLs de Mercado Pago, `docker compose up -d`, y agregar el dominio en Google OAuth.

## Deploy automático (push a `main`)

`.github/workflows/deploy.yml`: cada push a `main` (el merge de `develop` → `main`) corre el CI y, si
pasa, entra por SSH al VPS y ejecuta `deploy/deploy.sh <sha>`:

1. Pone `/opt/nutribot` en ese commit (tiene que estar en `origin/main`).
2. `pg_dump` a `/root/backups/nutribot-<fecha>-<sha>.dump` (se guardan los últimos 14).
3. `docker compose build`, `run --rm migrate` y `up -d`. Si falla el build o la migración, los
   contenedores viejos siguen corriendo.
4. Chequea que `https://$DOMAIN/login` responda y que todos los servicios activos del compose estén
   corriendo (db, web, bot y, si no está apagado, caddy).

Las variables nuevas de `.env` se cargan en el VPS **antes** de mergear a `main`: el deploy no las
agrega. También se puede relanzar desde Actions → Deploy → "Run workflow".

Puesta en marcha (una sola vez):

```bash
# 1. Clave exclusiva para el deploy (en tu máquina)
ssh-keygen -t ed25519 -N "" -C github-actions-deploy -f ./deploy_key
# 2. En el VPS, restringida a ejecutar solo deploy.sh
echo "command=\"/opt/nutribot/deploy/deploy.sh\",restrict $(cat deploy_key.pub)" \
  | ssh root@169.58.151.56 'cat >> ~/.ssh/authorized_keys'
# 3. Secrets del repo (environment "production")
gh secret set VPS_SSH_KEY --env production < deploy_key
gh secret set VPS_HOST --env production --body 169.58.151.56
ssh-keyscan -t ed25519 169.58.151.56 | gh secret set VPS_KNOWN_HOSTS --env production
rm deploy_key deploy_key.pub
```

## Deploy a mano

```bash
/opt/nutribot/deploy/deploy.sh          # punta de origin/main
/opt/nutribot/deploy/deploy.sh <sha>    # un commit puntual de main (rollback de código)
```

Restaurar un respaldo: `docker compose exec -T db pg_restore -U nutri -d nutribot --clean < /root/backups/<archivo>.dump`.

## Acceso al panel por membresía (HU-025)

Desde 025a-2 el panel no usa una lista de emails: entra quien tiene una membresía vigente (se lee en
cada request). Procedimiento completo de la migración (fases 0 a 4, y la 5 de soporte con 025d) en
[`Refactorizaciones/autenticacion-permisos-tenant.md`, sección 6.4](../Refactorizaciones/autenticacion-permisos-tenant.md#64-procedimiento-de-producción-daiana-owner-joel-solo-soporte).
Resumen de lo que se corre en el VPS:

```bash
cd /opt/nutribot/deploy
ta() { docker compose run --rm migrate npx --no-install tsx packages/db/scripts/tenant-access.ts "$@"; }
ta pending                                                   # identidades pendientes (sub enmascarado)
ta grant --email <email> --tenant legacy-tenant --role OWNER # dry-run; repetir con --apply
ta members --tenant legacy-tenant                            # verificar
ta forget-pending --email <cuenta de prueba> --apply         # borrar una identidad pendiente sin membresía
```

- **Orden:** deploy de 025a-1 → Daiana vuelve a entrar (queda pendiente) → `grant` OWNER → recién
  después el deploy de 025a-2. Si se publica 025a-2 sin la membresía cargada, nadie entra al panel.
- **Rollback:** `deploy.sh <sha de 025a-1>` (vuelve a entrar por la lista). Por eso la línea
  `ALLOWED_EMAILS` se deja en `deploy/.env` hasta que 025b-1 esté en producción y estable.

## Mercado Pago de señas por consultorio (HU-028a)

La migración `mercadopago_account_per_tenant` pasa `MercadoPagoAccount` a una fila por consultorio
(id generado, `tenantId` obligatorio, `userId` único) y ata el state del OAuth a la persona y al consultorio.
La fila de `legacy-tenant` conserva `id = 1` y sus tokens cifrados: no hay que reconectar.

- **Antes de mergear a `main`**, en producción (solo lectura):
  `SELECT id, "tenantId", "userId" IS NOT NULL AS connected, "liveMode" FROM "MercadoPagoAccount";`
  (esperado: `1 | legacy-tenant | t | t`) y `SELECT count(*) FROM "MercadoPagoAccount" WHERE "tenantId" IS NULL;` = 0.
  Si hay una fila sin `tenantId`, la migración aborta a propósito: resolverla a mano antes.
- **Durante el deploy** (entre `migrate` y `up -d`) el binario viejo sigue cobrando, conciliando y
  renovando; lo único que falla es *iniciar* una conexión de Mercado Pago. No conectar MP durante el
  deploy; un state en vuelo se pierde y hay que reintentar.
- **Después:** Ajustes → Mercado Pago de `legacy-tenant` sigue "Conectada" con la misma cuenta; la
  consulta de arriba da lo mismo; en los logs del bot la conciliación corre con `tenantId: "legacy-tenant"`
  y no aparecen `unknown_account` para pagos de la cuenta conectada.
- **Webhook:** la cuenta sale del `user_id` del cuerpo de la notificación. Si Mercado Pago mandara
  notificaciones sin `user_id`, se ignoran (`unknown_account`) y la conciliación del bot confirma la
  seña en ≤ 1 min: no se pierde ningún pago, solo se demora. Verificarlo con el primer pago real.
- **`ARZIUM_MERCADOPAGO_USER_ID`:** dejarla **vacía** en 028a. Si se setea con el `user_id` de la cuenta
  conectada hoy en `legacy-tenant`, no la desconecta, pero le impide reconectarla (decisión de HU-029).
- **Rollback:** código y base juntos, con el `pg_dump` del deploy. Volver solo el código con la base
  migrada deja andando cobro y conciliación de `legacy-tenant`, pero rompe "Conectar".
- Sin variables nuevas obligatorias.

## Útiles

```bash
docker compose ps
docker compose logs -f web | bot | caddy
```

## VPS compartido con Factum

Desde el 2026-11-16 el VPS también corre Factum (`/srv/factum`), y los puertos 80/443 los atiende el
Caddy de Factum para los dos sitios. En el VPS hay un `deploy/compose.override.yml` **no versionado**
que apaga el `caddy` de acá (profile `sin-uso`) y suma `web` a la red `factum_web` con el alias
`numa-web`. El sitio de nutribot está en `/srv/factum/repo/deploy/cloud/caddy-sitios/numa.caddy`
(también no versionado): para cambiar el dominio se edita ese archivo y `DOMAIN` en `.env`, y se
recrea el Caddy de Factum (`/srv/factum/repo/deploy/cloud/scripts/compose.sh up -d --force-recreate caddy`,
como `deploy`). Sin cortar Factum alcanza con recargarlo en caliente:
`docker exec factum-caddy-1 caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile`
(antes, `caddy validate` con los mismos argumentos). Después de cambiar `DOMAIN`, `docker compose up -d`
acá y actualizar las URLs en Google OAuth y en la aplicación Numa de Mercado Pago.

El QR de WhatsApp se escanea desde el panel (`/ajustes/whatsapp`). La sesión vive en el volumen
`whatsapp-auth`: ningún otro proceso puede correr el bot con el mismo número.
Si WhatsApp cierra la sesión (logout), el bot vacía el volumen solo y genera un QR nuevo: alcanza
con volver a escanear desde el panel. Para restaurar una sesión respaldada, parar el bot antes.
