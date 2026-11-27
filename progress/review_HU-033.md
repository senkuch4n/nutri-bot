# Review — HU-033 (entrega 025c)

**Veredicto:** APPROVED

Verificado por el reviewer: `npm run typecheck` (4 workspaces) sin errores; `npm run test`: 241 archivos pasan, 1 skipped, 4166 tests OK.

## Checkpoints
- Alcance vs checklist §7.3 (sin runBotAiTool ni línea de handleIncoming, D-c1 b): [x]
- Token v2 (§4.7): [x] `packages/db/domain/patientAuth.ts` formato p2, clave con separación de dominio, regex de ids, timingSafeEqual; rechaza v1 (5 partes), tenant/paciente/firma/exp cambiados; test con 11 casos.
- getPortalSession: [x] `apps/web/src/lib/patient-session.ts` `findFirst({id, tenantId})`, sin archivedAt (D9c), con test de archivado y cookie v1 sin tocar la base.
- Consultas y descargas por paciente Y tenant, 404 indistinguible: [x] plan/pdf, diario/photo, recetas/fotos (`recipes.ts` con recipe.tenantId y plan/patient del tenant), páginas portal/plan/diario/evolución; tests dedicados.
- Candado ENABLED_TENANT_IDS eliminado sin abrir acceso sin membresía: [x] `tenant-context.ts` y `middleware.ts` llaman `decideTenantAccess(facts)`; el acceso sigue dependiendo de la membresía; el test usa identidad sin membresía.
- booking.ts / conversation.ts por tenant: [x] servicios y turnos cancelables filtrados por `getConversationTenant()`; opción 4 con token v2 y sin tenant no manda link.
- getProfessional solo en definición, botAi.ts y handleIncoming (`conversation.ts:175`, con comentario 028c): [x] grep confirma, sin otros usos.
- Logs solo con códigos (D11): [x] no se agregaron logs con datos; el bot lanza `portal_link_without_tenant` como código.
- Tests reales / typecheck / tests: [x]

## Hallazgos
- Sin bloqueantes.
- Menor, aceptado: el borrado del diario ajeno devuelve `{ ok: true }` sin borrar (`diario/actions.ts`), igual que inexistente. Es coherente con la regla §2 de la SDD (ids ajenos = inexistentes), no es un defecto.

## Dudas (no bloqueantes)
- No corrí `test-tenant-isolation.sh`, `test:confirm-flow` ni `verify.sh` (escriben en la base de desarrollo); quedan para el orquestador/CI.
- Conflicto esperado con PR #88 en `portal/login/route.ts` al rebasear.
