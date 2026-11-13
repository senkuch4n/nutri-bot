#!/usr/bin/env bash
# Deploy en el VPS. Lo dispara GitHub Actions (.github/workflows/deploy.yml) al pushear a main,
# por SSH con una clave restringida a este script (forced command en authorized_keys):
#
#   command="/opt/nutribot/deploy/deploy.sh",restrict ssh-ed25519 AAAA... github-actions-deploy
#
# El commit a desplegar llega en SSH_ORIGINAL_COMMAND (sha de 40 caracteres). A mano:
#   /opt/nutribot/deploy/deploy.sh <sha>     (o sin argumento: la punta de origin/main)
#
# Pasos: actualiza el código a ese commit (tiene que estar en origin/main), respalda la base,
# construye las imágenes, aplica migraciones y recién entonces reemplaza los contenedores.
# Si falla el build o la migración, los contenedores viejos siguen corriendo.
#
# Todo va dentro de main(): bash termina de leer la función antes de ejecutarla, así el
# `git checkout` que reescribe este mismo archivo no lo cambia a mitad de camino.

main() {
  set -euo pipefail
  local repo=/opt/nutribot
  local backups=/root/backups
  local keep_backups=14

  exec 9>/tmp/nutribot-deploy.lock
  flock -n 9 || { echo "Ya hay un deploy en curso." >&2; exit 1; }

  local sha="${1:-${SSH_ORIGINAL_COMMAND:-}}"
  cd "$repo"
  git fetch --quiet --prune origin main
  if [[ -z "$sha" ]]; then
    sha="$(git rev-parse origin/main)"
  fi
  if [[ ! "$sha" =~ ^[0-9a-f]{40}$ ]]; then
    echo "Commit inválido: se espera un sha de 40 caracteres." >&2
    exit 2
  fi
  if ! git merge-base --is-ancestor "$sha" origin/main; then
    echo "El commit $sha no está en origin/main." >&2
    exit 2
  fi

  echo "==> Código: $(git rev-parse --short HEAD) -> ${sha:0:7}"
  git checkout --quiet --force -B main "$sha"

  cd deploy
  [[ -f .env ]] || { echo "Falta deploy/.env" >&2; exit 1; }

  echo "==> Respaldo de la base"
  mkdir -p "$backups"
  local dump="$backups/nutribot-$(date +%Y%m%d-%H%M%S)-${sha:0:7}.dump"
  docker compose exec -T db pg_dump -U nutri -Fc nutribot > "$dump"
  echo "    $dump ($(du -h "$dump" | cut -f1))"
  ls -1t "$backups"/nutribot-*.dump | tail -n +$((keep_backups + 1)) | xargs -r rm --

  echo "==> Build"
  docker compose build --pull web bot

  echo "==> Migraciones"
  docker compose run --rm migrate

  echo "==> Contenedores"
  docker compose up -d --remove-orphans

  echo "==> Chequeo de salud"
  local domain
  domain="$(grep -E '^DOMAIN=' .env | cut -d= -f2-)"
  local ok=""
  for _ in $(seq 1 30); do
    if curl -fsS -o /dev/null --max-time 5 "https://$domain/login"; then ok=1; break; fi
    sleep 2
  done
  [[ -n "$ok" ]] || { echo "La web no respondió en https://$domain/login" >&2; docker compose ps; exit 1; }
  sleep 10   # que el bot llegue a arrancar (o a caerse) antes de mirar su estado
  docker compose ps --format '{{.Service}}: {{.State}}'
  local running
  running="$(docker compose ps --status running --services)"
  for svc in db web bot caddy; do
    grep -qx "$svc" <<<"$running" || { echo "El servicio $svc no está corriendo." >&2; docker compose logs --tail 50 "$svc"; exit 1; }
  done

  docker image prune -f >/dev/null
  echo "==> Deploy OK: ${sha:0:7}"
}

main "$@"
exit
