#!/usr/bin/env bash
# ops/harness/verify.sh — Verificación del arnés RDD/SDD.
#
# La corre el hook Stop de .claude/settings.json antes de cerrar sesión.
# typecheck y tests corren solo sobre los workspaces con cambios sin
# commitear. Si falla, no declarar ninguna HU "aprobada" ni
# "arquitectura_lista".

set -u
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'; NC='\033[0m'
EXIT_CODE=0
ok()   { printf "${GREEN}[OK]${NC}    %s\n" "$1"; }
warn() { printf "${YELLOW}[WARN]${NC}  %s\n" "$1"; }
fail() { printf "${RED}[FAIL]${NC}  %s\n" "$1"; EXIT_CODE=1; }

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"
if [ -z "$REPO_ROOT" ]; then
  fail "No estoy dentro de un repo git"
  exit 1
fi
cd "$REPO_ROOT" || exit 1

echo "── 1. Archivos base del arnés ──────────────────────────"
for f in AGENTS.md CLAUDE.md backlog/_reglas.json progress/history.md CHECKPOINTS.md skills/CATALOGO.md; do
  if [ -f "$f" ]; then ok "Existe $f"; else fail "Falta archivo base: $f"; fi
done
YO="$(git config user.name)"
if [ -f "progress/current-$YO.md" ]; then
  ok "Existe progress/current-$YO.md"
else
  warn "No existe progress/current-$YO.md (bitácora de $YO): crearla al arrancar la sesión"
fi

echo ""
echo "── 2. Validando backlog/ ───────────────────────────────"
node -e '
const fs = require("fs");
try {
  const { reglas } = JSON.parse(fs.readFileSync("backlog/_reglas.json", "utf8"));
  const archivos = fs.readdirSync("backlog").filter(n => n.endsWith(".json") && n !== "_reglas.json");
  const features = archivos.map(n => {
    try { return { archivo: n, ...JSON.parse(fs.readFileSync("backlog/" + n, "utf8")) }; }
    catch (e) { console.log("[FAIL]  backlog/" + n + " inválido: " + e.message); process.exit(1); }
  });
  for (const f of features) {
    if (!f.id || !f.estado) { console.log("[FAIL]  HU sin id/estado: backlog/" + f.archivo); process.exit(1); }
    if (f.archivo !== f.id + ".json") { console.log("[FAIL]  backlog/" + f.archivo + " tiene id " + f.id + " (el archivo tiene que llamarse <id>.json)"); process.exit(1); }
    if (!reglas.valid_status.includes(f.estado)) { console.log("[FAIL]  Estado inválido en HU " + f.id + ": " + f.estado); process.exit(1); }
  }
  const activas = features.filter(f => reglas.estados_activos.includes(f.estado));
  const sinDueno = activas.filter(f => !f.responsable);
  if (sinDueno.length) { console.log("[FAIL]  HU activas sin responsable: " + sinDueno.map(f => f.id).join(", ")); process.exit(1); }
  const porPersona = {};
  for (const f of activas) (porPersona[f.responsable] ??= []).push(f.id);
  for (const [quien, ids] of Object.entries(porPersona)) {
    if (ids.length > reglas.max_activas_por_responsable) {
      console.log("[FAIL]  " + quien + " tiene " + ids.length + " HU activas a la vez (máximo " + reglas.max_activas_por_responsable + "): " + ids.join(", "));
      process.exit(1);
    }
  }
  const resumen = Object.entries(porPersona).map(([q, ids]) => q + ": " + ids.join(",")).join("; ") || "ninguna activa";
  console.log("[OK]    backlog/ válido (" + features.length + " HU; " + resumen + ")");
} catch (e) {
  console.log("[FAIL]  backlog/ inválido: " + e.message);
  process.exit(1);
}
'
if [ $? -ne 0 ]; then EXIT_CODE=1; fi

echo ""
echo "── 3. Typecheck y tests (solo workspaces con cambios) ──"
# -uall para listar archivos nuevos dentro de carpetas sin trackear.
CHANGED="$(git status --porcelain -uall | cut -c4- | sed 's/.* -> //')"

# Un cambio en packages/db o packages/core puede romper a web y bot:
# en ese caso se chequean todos los workspaces.
if echo "$CHANGED" | grep -qE '^packages/(db|core)/'; then
  WS_TO_CHECK="packages/core packages/db apps/web apps/bot"
else
  WS_TO_CHECK=""
  for ws in apps/web apps/bot; do
    if echo "$CHANGED" | grep -q "^$ws/"; then WS_TO_CHECK="$WS_TO_CHECK $ws"; fi
  done
fi

if echo "$CHANGED" | grep -q '^packages/db/prisma/schema.prisma'; then
  echo "  schema.prisma cambió -> prisma validate + generate"
  if (cd packages/db && npx dotenv -e ../../.env -- prisma validate >/dev/null 2>&1); then ok "schema.prisma válido"; else fail "schema.prisma inválido (npx prisma validate)"; fi
  if npm run db:generate >/dev/null 2>&1; then ok "cliente Prisma regenerado"; else fail "npm run db:generate falló"; fi
fi

if [ -z "$WS_TO_CHECK" ]; then
  warn "Sin cambios sin commitear en apps/ ni packages/, se saltea typecheck"
else
  for ws in $WS_TO_CHECK; do
    if npm run typecheck --workspace "$ws" >/dev/null 2>/tmp/nutribot_tsc_err.log; then
      ok "$ws: typecheck limpio"
    else
      fail "$ws: typecheck con errores (npm run typecheck --workspace $ws)"
    fi
  done
  rm -f /tmp/nutribot_tsc_err.log
fi

if echo "$CHANGED" | grep -q '^packages/core/'; then
  if npm run test >/dev/null 2>&1; then ok "packages/core: tests OK"; else fail "packages/core: tests fallando (npm run test)"; fi
fi

echo ""
echo "── 4. Recordatorios manuales (no bloquean, avisan) ─────"
if echo "$CHANGED" | grep -q '^packages/db/prisma/migrations/'; then
  warn "Hay migraciones nuevas: revisar el SQL (NOT NULL sin default, DROP no pedidos) antes de marcar 'aprobada'"
fi
if echo "$CHANGED" | grep -q '^apps/bot/'; then
  warn "Se tocó el bot: confirmar que se probó sin WhatsApp real y que no quedaron filas de prueba en OutboundMessage"
fi
if echo "$CHANGED" | grep -qE '^apps/bot/scripts/.*(tmp|smoke)'; then
  warn "Parece haber un script de smoke test en apps/bot/scripts: borrarlo antes de commitear"
fi

echo ""
echo "── 5. Resumen ───────────────────────────────────────────"
if [ "$EXIT_CODE" -eq 0 ]; then
  ok "Arnés OK."
else
  fail "Arnés con problemas: revisar arriba antes de cerrar la sesión."
fi

exit $EXIT_CODE
