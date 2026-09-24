# Sesión actual del arnés

## 2026-09-23

- Ronda 2 de ideas en `docs/historias-usuario-nutridesk.md` (épicas 17–43). La nutricionista
  trabaja sola (Épica 41 descartada) y atiende solo adultos.
- Reglas nuevas del usuario: antes de cada implementer, preguntar modelo + skills; antes de cada
  reviewer, preguntar modelo (CLAUDE.md, AGENTS.md).
- Orden: HU-001 → HU-002 (rediseño UI) → HU-003 (Épica 30) → Épicas 18/19 → Épica 20.
- **HU-001 aprobada**, probada por el usuario en el navegador, commiteada y mergeada a `main`.
- **HU-002** validada (resoluciones al final de docs/hu-rediseno-ui-empresarial.md) y partida en HU-002a/b/c/d. Referencia: Notion, neutro, más aire, shadcn/ui. Gráficos de evolución en barras (se puede cambiar de librería). Sin prototipo previo.
- HU-002a: SDD lista (Refactorizaciones/rediseno-ui-fundaciones.md, skills refactor + ui) → `arquitectura_lista`, esperando confirmación, modelo y skills del implementer.
- **Hallazgo O2 (confirmado por el orquestador):** el matcher de `apps/web/src/middleware.ts` no excluye `/portal`, así que el portal exige un email de Google permitido. Un paciente real no puede entrar. Pendiente de decisión del usuario.

## Pendientes fuera de HU

- `apps/bot/scripts/test-confirm-attendance.ts` puede encolar WhatsApp a pacientes reales
  (crons sin filtrar por paciente). Arreglar antes de volver a correrlo.
- `apps/web/src/lib/age.ts` `calculateAge`: desfase de un día por zona horaria.
- Scripts de prueba contra la base: ¿se conservan o se borran? (SDD vs CHECKPOINTS C5).
- `docker-compose.prod.yml` es de otro proyecto: queda sin tocar.
