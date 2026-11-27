# impl HU-029a · Prueba en sandbox de suscripciones de Mercado Pago

**Estado: done (código, tests y runbook).** La corrida contra el sandbox la tiene que hacer el
usuario: `docs/mp-suscripciones-sandbox.md` queda en **"pendiente de corrida"** con las tablas de
S1–S17, G1–G4 y los valores para 029b vacíos. Hasta que se complete, **029b sigue bloqueada**
(SDD §A.1). Checklist §A.6: ítems 1–6 y 9 hechos; 7–8 (corrida y resolución de compuertas) son del
usuario.

Rama `feat/HU-028-integraciones-por-consultorio` (sin cambiar). No se tocó `schema.prisma`,
migraciones, `domain/`, la base, nada de la 028a, ni WhatsApp. Ninguna llamada a Mercado Pago.

## Commits

| Commit | Qué |
|---|---|
| `995e4da` feat(db): redacción de respuestas de Mercado Pago para el sandbox de suscripciones | `mp-sandbox-redact.ts` + test |
| `69d9f8e` feat(db): compuertas del sandbox de suscripciones | `mp-sandbox-guard.ts` + test |
| `684db71` feat(db): script de sandbox de suscripciones de Mercado Pago (mp:subs-sandbox) | script, libs de payloads/ids/webhook + tests, script npm, `tsconfig` |
| `2763420` docs: runbook e informe de la prueba en sandbox | `docs/mp-suscripciones-sandbox.md` |

Sin trailer `Co-Authored-By`. Solo se agregaron archivos propios (los cambios ajenos del árbol no se tocaron).

## Archivos

- `packages/db/scripts/mp-subscriptions-sandbox.ts` (nuevo): CLI con `whoami`, `create`, `get`,
  `search --ref`, `cancel`, `pause`, `invoices`, `invoice`, `payment`, `listen`, `help` (§A.4).
  Importa solo `mercadopago`, `node:*` y sus libs de `scripts/lib/` (la de webhook usa
  `../../domain/mercadopago-signature`, crypto puro). Todos los subcomandos (salvo `help`) arrancan
  con `assertSandboxEnv` → `assertCaptureDirOutsideRepo` → `GET /users/me` → `assertSandboxSeller`.
- `packages/db/scripts/lib/mp-sandbox-redact.ts` (+ test): `redactMercadoPagoResource(value: unknown): unknown`
  (firma de la SDD), `REDACTED`, `shortMercadoPagoId`, `isMercadoPagoIdEntry`.
- `packages/db/scripts/lib/mp-sandbox-guard.ts` (+ test): `assertSandboxSeller(me: unknown): void`,
  `assertSandboxEnv(env)` (firmas de la SDD) y `assertCaptureDirOutsideRepo(dir, repoRoot)`.
- `packages/db/scripts/lib/mp-sandbox-payloads.ts` (+ test): `parseCreateArgs`, `buildPreapprovalBody`,
  `computeEndDate`, `makeExternalReference`, `projectPreapproval`, `projectInvoice`, `projectPayment`,
  `describeMercadoPagoError`.
- `packages/db/scripts/lib/mp-sandbox-ids.ts` (+ test): `collectMercadoPagoIds`, `mergeIds`, `resolveIdArg`.
- `packages/db/scripts/lib/mp-sandbox-webhook.ts` (+ test): `extractWebhookDataIds`, `analyzeWebhookRequest`.
- `packages/db/package.json`: `"mp:subs-sandbox": "dotenv -e ../../.env.mp-sandbox.local -- tsx scripts/mp-subscriptions-sandbox.ts"` (exacto de la SDD).
- `packages/db/tsconfig.json`: se agregó `scripts/mp-subscriptions-sandbox.ts` al `include` para que el typecheck cubra el script (las libs ya entraban por `scripts/lib/**`).
- `docs/mp-suscripciones-sandbox.md` (nuevo): runbook + tabla S1–S17 (columna Resultado vacía) +
  compuertas G1–G4 + valores para 029b/029c + limpieza.

## Cómo corre el usuario la prueba

Todo el detalle está en `docs/mp-suscripciones-sandbox.md`. Resumen:

1. Con la cuenta de Arzium, en el panel de developers, crear dos **cuentas de prueba** (vendedor y comprador, Argentina).
2. Logueado como el vendedor de prueba: crear una aplicación (Suscripciones), copiar el Access Token
   de producción y configurar **Webhooks** con la URL del túnel y los eventos de "Planes y
   suscripciones" + "Pagos"; copiar la clave secreta.
3. `cloudflared tunnel --url http://localhost:4010`.
4. Crear `.env.mp-sandbox.local` en la raíz (plantilla en el doc; ya ignorado por `.env*.local`).
5. `npm run mp:subs-sandbox --workspace packages/db -- whoami` (tiene que mostrar `test_user`), dejar
   `listen` corriendo y seguir los pasos 2–14 de la tabla del runbook (create → autorizar en el
   `init_point` como comprador con tarjeta `APRO` → get/invoices/search → idempotencia → variantes
   3/6/12 meses, días, prueba de 1 mes, `--cycles 1` → rechazo `OTHE` → devoluciones → cancelaciones).
6. Pegar la salida (ya redactada) en las tablas del doc y resolver G1–G4. Con eso el orquestador
   puede destrabar 029b.

## Verificación (real)

- `npx vitest run packages/db/scripts/lib/mp-sandbox-*.test.ts` → 5 archivos, **47 tests passed**.
  RED observado antes de cada implementación (archivos de lib inexistentes → fallo de carga).
- `npm run typecheck` (core, db, bot, web) → exit 0.
- `npm run test` → **233 archivos passed, 1 skipped; 4010 tests passed, 1 skipped**.
- `grep -nE "from \"(\.\./index|@nutri-bot/db)\"|prisma" packages/db/scripts/mp-subscriptions-sandbox.ts packages/db/scripts/lib/mp-sandbox-*.ts` → vacío (exit 1).
- `git status --short | grep -E "schema.prisma|migrations/"` → vacío (exit 1).
- Humo del CLI sin red (las compuertas cortan antes de cualquier llamada):
  - `help` imprime la ayuda.
  - sin `MP_SUBS_SANDBOX` → "Falta MP_SUBS_SANDBOX=true …".
  - `MP_SUBS_CAPTURE_DIR` dentro del repo → "MP_SUBS_CAPTURE_DIR tiene que estar fuera del repo".
  - `NODE_ENV=production` → "el script de sandbox no corre en producción".
  - sin token → "Falta ARZIUM_MERCADOPAGO_ACCESS_TOKEN …".
  - El directorio de captura de prueba (en el scratchpad) se borró después.
- `./ops/harness/verify.sh` → exit 0, "Arnés OK" (backlog válido; web y bot typecheck limpio;
  vitest OK). Un WARN "Se tocó el bot": lo disparan las carpetas ajenas sin trackear
  `apps/bot/.whatsapp-auth.vieja*`, no esta entrega (029a no toca `apps/bot`).
- No verificado (requiere MP): las llamadas reales del SDK y el servidor `listen` de punta a punta
  (su lógica de análisis/firma/redacción sí está cubierta por `mp-sandbox-webhook.test.ts`).

## Decisiones no obvias

1. **Ids completos solo en local.** La SDD pide que todo lo impreso esté redactado (ids a 6
   caracteres), pero los subcomandos necesitan el id completo. El script guarda los ids que ve en
   `MP_SUBS_CAPTURE_DIR/state.json` (modo 600) y acepta el id acortado (`get 2c9380…`); un prefijo
   ambiguo da error. El `init_point` completo va a `init-point-<ref>.txt` (o se abre con `--open`);
   en la salida se tapa su query (lleva el id completo).
2. **`MP_SUBS_CAPTURE_DIR` por defecto = `<tmpdir>/numa-mp-subs-sandbox`**, no un `mktemp -d` por
   invocación como dice la SDD: con un directorio nuevo por comando se perdería el estado entre
   `create` y `get`. Igual se exige que esté fuera del repo (`assertCaptureDirOutsideRepo`).
3. **Redacción más estricta que la lista de la SDD:** además de las claves pedidas, tapa
   `nickname`, `address`, claves que terminan en `first_name`/`last_name` (p. ej.
   `payer_first_name`) y emails dentro de textos (mensajes de error de MP). Los ids se acortan solo
   si la clave es `id`/`*_id`/`*.id` **y** el valor parece un id (número de 7+ dígitos o alfanumérico
   con dígitos), para no romper `currency_id: "ARS"` o `payment_method_id: "account_money"`.
4. **Libs extra** (`payloads`, `ids`, `webhook`) fuera de las dos que lista la SDD, para que el
   armado de payloads y el parseo de respuestas/webhooks tengan tests (pedido del orquestador).
5. **`--cycles N`** calcula `end_date` = ahora + prueba + (N−1) períodos + medio período (15 días
   por mes de frecuencia, 12 h por día). Si MP cuenta distinto, S5 lo muestra; también hay
   `--end-date ISO` para probar a mano. `--ref` y `--open` se agregaron para S4 y comodidad.
6. **`create` siempre manda `X-Idempotency-Key`** (la de `--idem` o un UUID que imprime), así el
   paso de S4 se puede repetir con la key mostrada. El body con `free_trial` usa el tipo local
   `SandboxPreapprovalBody` (el SDK 3.6.1 no lo declara en `create`).
7. `projectPreapproval` agrega `collector_matches_seller` (comparado con ids completos antes de
   acortar, S13) y `free_trial_type` (S15).
8. `listen` acepta cualquier path: sirve tanto de URL de notificaciones como de `back_url`
   (`/volver`); registra `query_data_id`/`body_data_id` y con cuál valida la firma
   (`verifyMercadoPagoSignature` existente, sin cambios).

## Contrato compartido

029a no define contrato compartido con web/bot. Las firmas que nombra la SDD (§A.3) coinciden:
`redactMercadoPagoResource(value: unknown): unknown`, `assertSandboxSeller(me: unknown): void`,
`assertSandboxEnv(env)`; script npm `mp:subs-sandbox` con el comando exacto; archivos en las rutas
de la tabla §A.3. Migraciones creadas: ninguna.
- 2026-11-27: corrida real: el import por defecto de MercadoPagoConfig fallaba con tsx ("is not a constructor"); se corrigió a import con nombre.
