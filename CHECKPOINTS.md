# CHECKPOINTS — Evaluación del estado final de una HU

> El `reviewer` recorre estos checkpoints contra el diff real de la HU y
> marca `[x]`/`[ ]` en su veredicto (`progress/review_<id>.md`). No aprueba
> con checkboxes vacíos sin justificar.

## C1 — El arnés está sano

- [ ] `backlog/` es válido y cada responsable tiene como mucho 1 HU en estado
      activo (`afinando`, `en_arquitectura`, `implementando`, `en_revision`).
- [ ] `progress/current-<responsable>.md` refleja la HU en curso.
- [ ] El diff no toca archivos de HU de la otra persona (`backlog/<id>.json`,
      su bitácora, sus docs).
- [ ] `./ops/harness/verify.sh` termina con exit code 0.

## C2 — La HU tiene su cadena de documentos completa

- [ ] Existe `docs/hu-<slug>.md` con Contexto, Gherkin, Datos, Diseño UX,
      Fuera de alcance y las dudas validadas.
- [ ] Existe `Refactorizaciones/<slug>.md` con workspaces afectados,
      checklist atómico y "Contrato compartido" si hay funciones o campos
      nuevos.
- [ ] Las firmas y los nombres del diff coinciden con el "Contrato
      compartido".

## C3 — El código respeta la arquitectura del repo

- [ ] Lógica pura en `packages/core`; operaciones de base compartidas en
      `packages/db/domain`, sin duplicarlas en `apps/web` y `apps/bot`.
- [ ] Si cambió `schema.prisma` o `packages/db/domain`, web **y** bot
      compilan y se ajustaron todos los consumidores.
- [ ] Migraciones Prisma nuevas: SQL coherente con el schema, sin pasos
      destructivos no pedidos, columnas `NOT NULL` nuevas con default o
      backfill.
- [ ] Rutas nuevas del panel protegidas por auth; el portal solo expone
      datos del propio paciente.
- [ ] El bot sigue en silencio fuera de una sesión activa, y los textos
      coinciden con la SDD.
- [ ] No hay `console.log` de debug ni TODOs sin contexto.

## C4 — La verificación es real

- [ ] `npm run typecheck` limpio.
- [ ] La lógica nueva de `packages/core` tiene tests en vitest y
      `npm run test` pasa.
- [ ] Si se tocó el flujo del bot, se simuló sin WhatsApp real y la
      simulación limpió sus propios datos por id.
- [ ] Si la HU genera un PDF o un documento, se verificó el resultado real.

## C5 — La sesión se cerró bien

- [ ] `progress/impl_<id>.md` existe y describe qué se tocó.
- [ ] `progress/review_<id>.md` tiene el veredicto final.
- [ ] No quedan scripts de prueba sueltos ni datos de prueba en la base de
      desarrollo.

---

**Cómo se usa:** cada checkbox se marca contra el diff real, no contra lo que
dice el implementer. Un `[ ]` que motiva `CHANGES_REQUESTED` cita archivo y
línea.
