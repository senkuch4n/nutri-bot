# Catálogo de skills del arnés

> Al pasar una HU a `architect` o `implementer`, el orquestador pregunta qué
> skill de esta lista aplica, o "ninguno". El contenido del skill elegido se
> pega en el prompt del subagente.

| Skill | Archivo | Cuándo usarlo |
|---|---|---|
| `migracion-prisma` | `skills/migracion-prisma.md` | La HU cambia `schema.prisma`, sobre todo si agrega columnas a tablas con datos. |
| `refactor` | `skills/refactor.txt` | La HU es un refactor de algo existente, no una feature nueva: modo "solo analizar y planificar primero". |
| `ui` | `skills/ui.txt` | Bajar objetivos UX a pantallas concretas. Etapa previa a la HU, no del implementer. |

Los skills de UI de Claude Code (`ui-ux-pro-max`, `ui-styling`,
`web-design-guidelines` y `apple-design`, este último del proyecto en
`.claude/skills/apple-design/SKILL.md`) no van en esta tabla: el `implementer` los invoca
solo con el `Skill` tool cuando el checklist toca UI visible.
