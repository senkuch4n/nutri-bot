# Producción en el VPS

Desde 2026-11-12 producción corre en un VPS propio (Ubuntu 24.04, `169.58.151.56`) en vez de
Vercel + Neon: Postgres, web, bot y Caddy en Docker Compose. URL: https://169-58-151-56.sslip.io

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
4. Chequea que `https://$DOMAIN/login` responda y que db, web, bot y caddy estén corriendo.

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

## Útiles

```bash
docker compose ps
docker compose logs -f web | bot | caddy
```

El QR de WhatsApp se escanea desde el panel (`/ajustes/whatsapp`). La sesión vive en el volumen
`whatsapp-auth`: ningún otro proceso puede correr el bot con el mismo número.
