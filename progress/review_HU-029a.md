Revisión 2 de 2 (re-revisión tras el rechazo 1). Resultado de los hallazgos de la revisión 1: (1) encabezado: resuelto; (2) tabla de 5 celdas: resuelto; (3) §5 y §6: resuelto; (4) conclusiones vs evidencia: resuelto; (5) impl_HU-029a.md: resuelto.

# Review — HU-029a

**Veredicto:** APPROVED

Rama `feat/HU-029a-sandbox-suscripciones` (worktree `Nutri-Bot-HU029a`), `git diff origin/develop...HEAD`: 13 commits, árbol limpio. No se corrió el script contra Mercado Pago.

## Verificación corrida por el reviewer
- `npm run typecheck` → exit 0.
- `npx vitest run packages/db` → 54 archivos passed, 1 skipped; 943 tests passed.
- `./ops/harness/verify.sh` → "Arnés OK".

## Hallazgos de la revisión 1
1. Encabezado coherente: `docs/mp-suscripciones-sandbox.md:3-10` dice "corrida hecha (2026-11-27)", G1–G4 resueltas, 029b desbloqueada, hecha por Joel con el orquestador, SDK 3.6.1. Resuelto.
2. Tabla §3: las 17 filas S1–S17 tienen exactamente 5 celdas (contado con awk); la evidencia queda en su columna. Resuelto.
3. §5 (`:151-`) y §6 completos con valores tomados de §3; lo no visto figura "no verificado" (estados paused/cancelled/finished, reintentos, devolución total, contracargo, URL de gestión, `payer_id`). Sin valores inventados. Resuelto.
4. Conclusiones: S1 confirmado (días y meses), S6 confirmado, S9 refutado (con el matiz de `card_validation` de $0), S8 y S14 "no verificado", S5/S11/S12/S13 "en parte" con lo que falta dicho. Ids a 6 caracteres (`191990…`). Resuelto.
5. `progress/impl_HU-029a.md`: estado, commits, rama y sección "Corrección tras review 1" actualizados. Resuelto. (Nota menor: el listado de commits cita hashes de la rama anterior y hay un párrafo viejo "Rama `feat/HU-028…` (sin cambiar)"; no bloquea.)

## Cambio de rama
- Cherry-pick limpio: `packages/db/package.json` conserva `gcal:*`/`test:gcal-tenants` y `mp:subs-sandbox`; `packages/db/tsconfig.json:9` conserva `scripts/google-calendar-*.ts` y `scripts/mp-subscriptions-sandbox.ts`.
- Código del script y libs igual al aprobado; se agregó `authorization` a `REDACTED_KEYS` (`mp-sandbox-redact.ts:22`) con test (`mp-sandbox-redact.test.ts:5-8`).
- La HU y la SDD de la 029 están en la rama; sin cambios en schema, migraciones, `domain/`, web ni bot.

## Checkpoints
- C1 verify.sh: [x]
- C2 HU + SDD con contrato, firmas = contrato: [x]
- C3 arquitectura (solo `packages/db/scripts`), migraciones n/a, rutas n/a, bot n/a: [x]
- C4 typecheck: [x] · tests: [x]
- C5 impl actualizado: [x] · review con veredicto: [x] · sin datos ni capturas en el repo: [x]

## Dudas (no bloqueantes)
- Limpieza menor de `impl_HU-029a.md` (hashes y párrafo de rama anterior).
