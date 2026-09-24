# Sesión actual del arnés

## 2026-09-23

- Ronda 2 de ideas en `docs/historias-usuario-nutridesk.md` (épicas 17–43). La nutricionista
  trabaja sola (Épica 41 descartada) y atiende solo adultos.
- Reglas nuevas del usuario: antes de cada implementer, preguntar modelo + skills; antes de cada
  reviewer, preguntar modelo (CLAUDE.md, AGENTS.md).
- Orden: HU-001 → HU-002 (rediseño UI) → HU-003 (Épica 30) → Épicas 18/19 → Épica 20.
- **HU-001 aprobada**, probada por el usuario en el navegador, commiteada y mergeada a `main`.
- **HU-002** validada (resoluciones al final de docs/hu-rediseno-ui-empresarial.md) y partida en HU-002a/b/c/d. Referencia: Notion, neutro, más aire, shadcn/ui. Gráficos de evolución en barras (se puede cambiar de librería). Sin prototipo previo.
- HU-002a: SDD lista (Refactorizaciones/rediseno-ui-fundaciones.md, skills refactor + ui) → implementer (Fable) `done` → progress/impl_HU-002a.md. Typecheck y tests en verde. **Recorrido visual NO hecho**: el `next dev` del usuario quedó dando 500 porque Tailwind 3.4 en Node 24 no recarga `tailwind.config.ts`. Hay que reiniciar `npm run dev`.
- **Hallazgo O2 (confirmado por el orquestador):** el matcher de `apps/web/src/middleware.ts` no excluye `/portal`, así que el portal exige un email de Google permitido. Un paciente real no puede entrar. **Arreglado** (rama fix-portal-middleware, mergeada a main y a la rama de HU-002).
- **Hallazgo:** el webhook de Mercado Pago (`/api/webhooks/mercadopago`) también queda bloqueado por el middleware (307 a /inicio), y la ruta no valida la firma `x-signature`. Pendiente de decisión del usuario.

## Pendientes fuera de HU

- `apps/bot/scripts/test-confirm-attendance.ts` puede encolar WhatsApp a pacientes reales
  (crons sin filtrar por paciente). Arreglar antes de volver a correrlo.
- `apps/web/src/lib/age.ts` `calculateAge`: desfase de un día por zona horaria.
- Scripts de prueba contra la base: ¿se conservan o se borran? (SDD vs CHECKPOINTS C5).
- `docker-compose.prod.yml` es de otro proyecto: queda sin tocar.
- HU-002a: reviewer (Opus) CHANGES_REQUESTED (2 puntos chicos: espacio duro en `Quantity` y `aria-describedby` de `NumberInput`). Recorrido del orquestador en progress/recorrido_HU-002a.md: la sidebar no entra a 663 px de alto. → `rechazada_reintentando` (intento 1 de 2).
- **HU-002a aprobada** en la 2ª ronda (ver history). El usuario validó el login y el email truncado. Commiteada en la rama `hu-002-rediseno-ui-empresarial`, sin mergear a main (002b sale de esta rama). Siguiente: HU-002b (pacientes).
