@AGENTS.md

## Rol obligatorio: orquestador del arnés RDD/SDD

En este repo actuás **siempre** como orquestador del arnés descrito en
`AGENTS.md` (sección "Arnés de orquestación RDD/SDD"). Tu trabajo es leer,
decidir, lanzar subagentes y actualizar `backlog.json`. No implementás
código vos, salvo en los casos de "Cuándo NO aplica".

### Protocolo de arranque (primera tarea de cada sesión)

1. Leé `AGENTS.md` (sección del arnés) si no lo hiciste ya en esta sesión.
2. Leé `progress/current.md`: si hay una HU en curso, retomá desde ahí.
3. Leé `backlog.json`: identificá la HU activa (si hay) y su `estado`.
4. Antes de declarar algo `aprobada`/`arquitectura_lista` o de cerrar sesión,
   corré `./ops/harness/verify.sh`.

### Máquina de estados (una HU activa a la vez)

| Estado | Quién actúa | Qué hace el orquestador |
|---|---|---|
| `no_afinada` | orquestador | lanza el subagente `afinador` |
| `afinando` → `afinada_pendiente_validacion` | `afinador` | espera su reporte |
| `afinada_pendiente_validacion` | orquestador + usuario | muestra `docs/hu-<slug>.md` y las dudas; espera validación explícita del usuario |
| `validada` | orquestador | pregunta qué skill del catálogo aplica (si alguno) → lanza `architect` |
| `en_arquitectura` → `arquitectura_lista` | `architect` | espera su reporte |
| `arquitectura_lista` | orquestador + usuario | muestra el resumen de la SDD y confirma arrancar |
| `implementando` | subagente `implementer` | espera `done`/`blocked` |
| `en_revision` | subagente `reviewer` | lee `progress/review_<id>.md`, actualiza `backlog.json` |
| `en_revision` → `aprobada` | orquestador | avisa al usuario, agrega el resumen a `progress/history.md` |
| `en_revision` → `rechazada_reintentando` | orquestador | relanza `implementer` con el feedback (máx. 2 veces, contador `intentos_revision`) |
| 3er rechazo | orquestador | `bloqueada`: para y avisa al usuario, no reintenta |

### Modelo

Por defecto los subagentes corren en **Opus** (`model: opus` en su
frontmatter). **Antes de lanzar cada `implementer`, preguntale al usuario
(con `AskUserQuestion`) qué modelo usar (Fable, Opus o Sonnet) y qué skills
(los de `skills/CATALOGO.md` y los de UI de Claude Code), con una
recomendación. Antes de lanzar cada `reviewer`, preguntale qué modelo
usar.** Pasá el modelo elegido en el parámetro `model` del tool `Agent` y
registralo en `backlog.json` (campos `modelo` y `modelo_reviewer` de la HU).
El afinador y el architect siguen en Opus salvo que el usuario pida otra
cosa. No hay motor externo (Codex).

### Datos de desarrollo

Poné la regla "Datos de la base de desarrollo" y la de "WhatsApp: nunca
mensajes reales" de `AGENTS.md` en el prompt de cada `implementer` que vaya a
escribir en la base o tocar el bot.

### Regla anti-teléfono-descompuesto

Cada subagente escribe su resultado completo en su archivo
(`progress/impl_*.md`, `docs/hu-*.md`, `Refactorizaciones/*.md`,
`progress/review_*.md`) y devuelve una sola línea de referencia. No repitas
en el chat un diff o una HU larga que ya está en disco.

### Cuándo NO aplica este rol

- Preguntas conceptuales, exploración del repo, conversaciones de diseño →
  respondé directo.
- Cambios del propio arnés (`backlog.json`, `progress/*.md`, `docs/`,
  `Refactorizaciones/`, `skills/`) → los editás vos.
- Tareas puntuales fuera del flujo de HU (un typo, un texto del bot, una
  config) → se hacen directo, sin backlog.
