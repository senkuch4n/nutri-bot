# Producción en el VPS

Desde 2026-11-12 producción corre en un VPS propio (Ubuntu 24.04, `169.58.151.56`) en vez de
Vercel + Neon: Postgres, web, bot y Caddy en Docker Compose. URL: https://169-58-151-56.sslip.io

- Código en `/opt/nutribot` (clon de `develop`); este directorio es `/opt/nutribot/deploy`.
- Secretos en `/opt/nutribot/deploy/.env` (no versionado, `chmod 600`; plantilla en `.env.example`).
- Solo Caddy publica puertos (80/443). ufw permite 22/80/443; Docker se saltea ufw en los puertos
  publicados, así que **no** publicar `db` ni `web`.
- El dominio sale de `DOMAIN` en `.env`. Para pasar a un dominio propio: registro A al VPS, cambiar
  `DOMAIN` y las URLs de Mercado Pago, `docker compose up -d`, y agregar el dominio en Google OAuth.

## Actualizar después de un merge a develop

```bash
cd /opt/nutribot && git pull
cd deploy
# si hay migración, respaldar antes:
docker compose exec -T db pg_dump -U nutri nutribot > /root/backup-$(date +%F).sql
docker compose build
docker compose run --rm migrate      # prisma migrate deploy (imagen del bot)
docker compose up -d
```

## Útiles

```bash
docker compose ps
docker compose logs -f web | bot | caddy
```

El QR de WhatsApp se escanea desde el panel (`/ajustes/whatsapp`). La sesión vive en el volumen
`whatsapp-auth`: ningún otro proceso puede correr el bot con el mismo número.
