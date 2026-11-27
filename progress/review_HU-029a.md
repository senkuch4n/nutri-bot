# Review — HU-029a (script de sandbox de suscripciones de Mercado Pago, issue #72)

**Veredicto:** CHANGES_REQUESTED

Revisado: `git diff origin/develop...HEAD` en `feat/HU-028-integraciones-por-consultorio` (commits `995e4da`..`5526ebd`:
script, libs, tests, fix `b48ea9e` y los docs de la corrida del 2026-11-27) contra
`Refactorizaciones/suscripcion-arzium-mercadopago.md` Parte A (§A.1–§A.7), el bloque B.0 y `CHECKPOINTS.md`.
No se corrió el script contra Mercado Pago.

Verificación corrida por el reviewer:
- `npx vitest run packages/db/scripts/lib/` → 5 archivos, 47 tests passed.
- `npm run typecheck` (árbol principal) → exit 0 (el cliente Prisma de este árbol no molestó).
- `./ops/harness/verify.sh` → "Arnés OK." (tests de todo el monorepo OK; el WARN de bot viene de
  `apps/bot/.whatsapp-auth.vieja*` sin trackear, ajeno a esta entrega).
- `grep -nE "from \"(\.\./index|@nutri-bot/db)\"|prisma"` sobre el script y `scripts/lib/mp-sandbox-*.ts` → vacío.
- Ningún archivo de `apps/` ni de `packages/` fuera de `packages/db/scripts` importa el script o sus libs.
- Sin cambios en `schema.prisma`, migraciones ni `domain/`. `.env.mp-sandbox.local` existe y está ignorado
  (`.gitignore:26`).

## Checkpoints
- C1 arnés sano / verify.sh: [x]
- C2 HU + SDD con contrato: [x] — `assertSandboxSeller(me: unknown)`, `assertSandboxEnv(env)`,
  `redactMercadoPagoResource(value: unknown): unknown` y el npm `mp:subs-sandbox` coinciden con §A.3. Ojo: la HU y
  la SDD siguen sin trackear (ver Dudas).
- C2 firmas = contrato: [x]
- C3 arquitectura (solo `packages/db/scripts`, nada de Prisma, web ni bot): [x]
- C3 migraciones: n/a · rutas/portal: n/a · bot: n/a · sin console.log de debug: [x] (los `console.log` son la salida del CLI)
- C4 typecheck: [x] · tests: [x] (las libs tienen tests aunque no estén en core: correcto, son del script)
- C4 bot simulado: n/a · PDF: n/a
- C5 impl existe y describe lo tocado: [ ] — `progress/impl_HU-029a.md:3-7` sigue diciendo que el informe queda
  "pendiente de corrida" con tablas vacías; no registra los commits `d24d869`..`5526ebd` ni el estado real de los
  ítems 7–8 de §A.6.
- C5 review con veredicto: [x] · sin datos de prueba ni capturas en el repo: [x]

## Compuertas de seguridad del script (foco pedido): OK
- `assertSandboxEnv` (`scripts/lib/mp-sandbox-guard.ts:19-26`) exige `MP_SUBS_SANDBOX === "true"` y
  `NODE_ENV !== "production"`, y corre antes de cualquier red (`mp-subscriptions-sandbox.ts:101`).
- `assertCaptureDirOutsideRepo` (`mp-sandbox-guard.ts:29-35`) corre antes de crear el directorio (`:102-103`);
  `state.json`, `init-point-*.txt` y capturas con modo 600/700.
- `assertSandboxSeller` (`mp-sandbox-guard.ts:8-16`) se cumple sobre `/users/me` antes de cualquier operación que
  escribe (`:107-108`); fail closed si `tags` no es array o no trae `test_user`.
- Redacción (`mp-sandbox-redact.ts`): emails (también dentro de textos), nombres, documento, teléfono, tarjeta,
  tokens; ids a 6 caracteres; `init_point` sin query. La salida de `listen` imprime solo el `pathname` y los ids
  acortados.
- Solo `.env.mp-sandbox.local` (`packages/db/package.json`, comando exacto de §A.3); no lee `DATABASE_URL`.

## Cambios requeridos
1. **El informe se contradice con su propio contenido.** `docs/mp-suscripciones-sandbox.md:3-5` sigue diciendo
   "Estado: pendiente de corrida… las tablas de resultados están vacías… 029b queda bloqueada", y `:9` deja
   "Corrida hecha por: _(completar)_ · Fecha: _(completar)_". Las secciones §3–§4 y la SDD (tabla de entregas y
   §A.5 "Resultados (corrida del 2026-11-27)") dicen que la corrida se hizo y que G1–G4 están resueltas. Hay que
   actualizar el encabezado (estado, quién y cuándo corrió).
2. **La tabla de resultados está rota y, renderizada, pierde la evidencia.** En
   `docs/mp-suscripciones-sandbox.md:120-121, 123-126, 128-132, 134-135` (S1, S2, S4, S5, S6, S7, S9, S10, S11, S12,
   S13, S15, S16) hay una celda vacía de más (`| | **confirmado** …`): 6 celdas contra 5 columnas. En GitHub la
   columna "Resultado" queda vacía, el resultado cae en "Evidencia" y **la evidencia real se descarta**. S3 y S17
   (`:122`, `:136`) están bien formadas. Hay que sacar la celda de más.
3. **§5 "Valores para 029b/029c" sigue todo en _(pendiente)_** (`docs/mp-suscripciones-sandbox.md:151-163`), y
   §6 "Notas de la corrida" vacía (`:167-168`). El ítem 8 de §A.6 pide escribir **en el informe** los valores
   reales (`ALLOWED_MONTH_FREQUENCIES`, `PLAN_BILLING_CYCLES_SUPPORTED`, manifiesto de firma, estados de
   S8/S11/S12…). Los datos ya están en §3 y en la SDD B.0 (R6–R15); falta volcarlos acá, y marcar como
   "no verificado" lo que no se vio (S8 pending cancelada, S11 reintentos, S12 total/contracargo, S14).
4. **Conclusiones que no se corresponden con la evidencia del mismo informe:**
   - S1 (`:120`) dice "falta variante en meses", pero S16 (`:135`) registra "Prueba de 1 mes →
     `first_invoice_offset: 30`": la variante en meses se vio. Unificar.
   - S9 (`:128`) está como "confirmado con matiz", pero el supuesto literal ("`next_payment_date` = autorización +
     prueba") quedó **refutado** por la propia evidencia (creación + 7 días). La SDD B.0 R5 ya lo trata como
     cambio de diseño; el informe debería decir "refutado" (con el matiz del cobro de validación de $0).
   - S6 (`:125`) dice "confirmado en parte" y la evidencia cubre los tres tópicos, el cuerpo y la firma con el id de
     la query; la SDD B.0 R10 lo da por confirmado. Decir qué parte falta o marcarlo confirmado.
   - S8 y S14 (`:127`, `:133`) quedaron con Resultado y Evidencia vacíos: poner "no verificado" (como resume §A.5).
5. **`progress/impl_HU-029a.md` desactualizado** (`:3-7`, `:41-42`): actualizar estado, commits de la corrida y
   checklist §A.6 (ítems 7–8).

## Dudas (no bloqueantes)
- `docs/mp-suscripciones-sandbox.md:131`: el id del pago aparece como `191990…914` (prefijo **y** sufijo); el
  formato del script es solo 6 caracteres + `…`. Es un id de sandbox, bajo riesgo, pero conviene respetar la regla.
- `describeMercadoPagoError` (`scripts/lib/mp-sandbox-payloads.ts:241-250`) copia `cause`/`causes` y la redacción
  no tapa claves `authorization`. Con el SDK 3.6.1 los errores traen el cuerpo de la respuesta (sin headers), así
  que hoy no filtra el token; sumar `authorization` a `REDACTED_KEYS` sería defensa en profundidad.
- La rama de la entrega es `feat/HU-028-integraciones-por-consultorio` y su merge-base con `origin/develop` es
  `766c5c3` (anterior a 028b/028c/025c). Para el PR va a hacer falta rebase; `packages/db/tsconfig.json` y
  `packages/db/package.json` van a chocar con las líneas que agregaron 028b/028c. AGENTS.md pide
  `feat/<id>-<slug>`.
- `docs/hu-suscripcion-arzium-mercadopago.md` y `Refactorizaciones/suscripcion-arzium-mercadopago.md` siguen sin
  trackear: el PR de 029a tendría que incluirlos (o decir qué documentos lo respaldan).
- El script queda dentro de la imagen del bot (`migrate` usa esa imagen con todo `packages/db/scripts`). No es
  alcanzable desde web ni bot y las tres compuertas cortan con `NODE_ENV=production`, así que no lo considero
  riesgo; solo dejarlo anotado.
