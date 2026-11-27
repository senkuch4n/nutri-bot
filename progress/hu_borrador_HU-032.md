## Historia de usuario

Como nutricionista de un consultorio, quiero diseñar, personalizar y reutilizar documentos clínico-nutricionales mediante un editor visual tipo Canva, para entregar planes alimentarios y otros PDF con mi propia identidad visual sin salir de NutriBot ni cargar nuevamente los datos de mis pacientes.

**Estado inicial:** `backlog` / `no_afinada`. **Tamaño:** alto. **Prisma:** cambios previstos. HU paraguas, divisible en HU hijas tras validar el SDD. No implementar en un único PR ni convertirla en bloqueo del lanzamiento SaaS sin decisión del equipo.

## Dependencias y contexto

- Depende de #67 (HU-024) y #68 (HU-025). Cerradas; en `develop` se observan los merges #75, #77, #79, #80 y #81. T0 debe verificar los flujos y permisos que Studio necesita; una rama local no es evidencia de integración.
- Relacionada con #48 (HU-020): preservar la extracción de planes desde PDF existentes hacia borradores de `PlanTemplate`. La plantilla nutricional no es la plantilla visual; no duplicar datos del plan.
- Coordinar con #70 (HU-027, WhatsApp), #73 (HU-030, licencia) y #74 (HU-031, QA SaaS). Solo el envío multi-sesión depende de HU-027; el editor y la descarga no.
- Stack: Next.js 15 App Router, React 19, Tailwind, TypeScript, Zod y Prisma/PostgreSQL (monorepo npm). `apps/web/package.json` en `develop` declara `@react-pdf/renderer` `^4.9.0` según el relevamiento inicial; auditar uso, rutas, permisos, portal, estilos y pruebas antes de reemplazarlo.

## Experiencia objetivo

- Acceso desde Documentos/Plantillas del panel y desde el plan alimentario del paciente. Integración con el design system existente: barra superior (nombre, guardado, undo/redo, zoom, vista previa, exportación), panel izquierdo (plantillas, texto, imágenes, figuras, bloques clínicos), lienzo A4 multipágina y panel derecho de propiedades contextuales. No copiar Canva ni rediseñar todo el panel.
- Crear desde blanco o catálogo global de solo lectura clonable al tenant; duplicar, renombrar, editar, guardar, archivar y elegir una predeterminada por tipo.
- Seleccionar, arrastrar, reordenar, redimensionar y alinear. Posición libre para decoración; flujo paginable para datos variables. Editar texto, tipografía, tamaño, color, fondo, bordes, espaciado, imágenes, logo y firma visual.
- A4 vertical inicial, márgenes, cabecera/pie, zoom y guías. Añadir, duplicar, ordenar y eliminar páginas de diseño; distinguirlas de las generadas automáticamente.
- Brand Kit por consultorio: logo, paleta, tipografías autorizadas, contacto y firma visual (no certificada).
- Vista previa ficticia al diseñar y real solo con paciente autorizado. Estados vacío/carga/error, feedback accesible, validación, aviso de cambios sin guardar, autoguardado, undo/redo y gestión de conflictos.
- Guardar plantilla no altera planes ni documentos históricos. Personalizar un documento para un paciente sin cambiar la plantilla; reabrir borradores. Editar un emitido crea una revisión. Descargar PDF y preservar entrega por portal/WhatsApp si corresponde; renderer legacy como fallback durante la transición.

## Bloques y reglas clínicas

- **Estáticos:** texto libre, imagen/logo, figuras simples, separador, fondo, cabecera/pie y firma visual.
- **Dinámicos:** datos autorizados de paciente y profesional, fecha, objetivo, plan por días/comidas, alimentos, porciones/cantidades/unidades, recomendaciones, energía/macros y, según fuentes existentes, micronutrientes y antropometría. **MVP:** datos básicos, plan y recomendaciones. Validar servicios y necesidades antes de ampliar.
- Configurar visibilidad, títulos, estilos y orden. Consumir servicios existentes y conservar unidades, precisión y semántica. No recalcular ni inventar datos clínicos; faltantes como no disponibles u omitidos por configuración, nunca cero por defecto. El texto libre no modifica el plan estructurado.
- Paginar tablas y textos largos sin pérdida, solape, recorte ni escala ilegible. Definir división de filas, repetición de cabeceras y límites con errores comprensibles.

## Arquitectura propuesta (a validar en SDD y PoC)

Editor React → contrato versionado → resolución autorizada → render/paginación → PDF/almacenamiento/entrega.

- PDF como producto, no fuente editable. JSON tipado con Zod, versión, formato, tema, páginas/regiones, bloques, estilos, unidades, configuración, assets y variables permitidas. Separar layout, datos clínicos y bytes del PDF; definir límites y migración del contrato. Editor y exportación interpretan el mismo contrato.
- Layout híbrido: flujo variable más elementos libres en regiones controladas. Documentar mm/pt o transformación, límites, capas y overflow. Ejemplo **ilustrativo** (no definitivo):

```json
{
  "schemaVersion": 1,
  "format": { "size": "A4", "orientation": "portrait" },
  "theme": { "primaryColor": "#477863", "fontFamily": "Inter" },
  "pages": [{
    "id": "page-1",
    "blocks": [
      { "id": "logo", "type": "image", "assetId": "asset-1", "layout": "fixed" },
      { "id": "title", "type": "text", "content": "Mi plan alimentario", "layout": "flow" },
      { "id": "patient", "type": "patientInfo", "layout": "flow" },
      { "id": "plan", "type": "mealPlan", "layout": "flow", "showCalories": true },
      { "id": "notes", "type": "recommendations", "layout": "flow" }
    ]
  }]
}
```

- Comparar [Puck](https://puckeditor.com/) / [Craft.js](https://craft.js.org/), [React Konva](https://konvajs.org/) o drag/resize para regiones libres, [GrapesJS](https://grapesjs.com/) si justifica HTML controlado y [Polotno](https://polotno.com/) solo con evaluación comercial. Comparar [react-pdf](https://react-pdf.org/) con HTML/CSS + [Playwright/Chromium](https://playwright.dev/docs/api/class-page#page-pdf) si corresponde. No adoptar todas las dependencias ni contratar servicios sin aprobación; no exigir Chromium sin evidencia.
- PoC: composición por bloques vs. libre/híbrida, compatibilidad React 19/Next 15, licencias, accesibilidad, paginación, texto seleccionable, fuentes/imágenes, fidelidad preview/export, bundle, mantenimiento, CPU/RAM/latencia y Docker/VPS. Entregar matriz, PDFs de muestra y ADR.
- Cliente para interacción; servidor para autorización, resolución y emisión. `packages/core`: validación/transformación pura; `packages/db/domain`: persistencia y ownership; `apps/web`: editor/export; `apps/bot`: entrega si corresponde. Reutilizar UI y contratos actuales.
- Revisar modelos existentes y candidatos (`DocumentTemplate`, `DocumentTemplateVersion`, `DocumentAsset`, `BrandKit`, `GeneratedDocument/Revision`). Definir relaciones tenant/paciente/plan/profesional, índices, constraints, lifecycle y predeterminada por tenant/tipo. Guardar snapshot autorizado, versiones de plantilla/assets y renderer, PDF o referencia inmutable. Minimizar datos y definir retención/borrado según política clínica y legal aplicable.
- Storage privado y abstracto, claves por tenant, URLs autorizadas de vida corta si corresponde, cuotas y límites. No incrustar imágenes grandes en JSON ni persistir en filesystem efímero.
- Runtime Node o worker según medición; timeout, límites de concurrencia/memoria, idempotencia/reintentos y limpieza. No bloquear bot ni otros tenants. Si hay cola, BD como fuente de verdad; no imponer infraestructura sin justificar.

## Seguridad multi-tenant y privacidad (no negociable)

- Resolver tenant y permisos en servidor desde contexto confiable. No confiar en `tenantId` del cliente. Validar ownership y permisos en listado, CRUD, duplicación, preview, export, descarga, archivo, assets, versiones, jobs y envío. Rechazar accesos cruzados sin revelar existencia; validar que paciente, plan, plantilla, versión, assets y documento pertenezcan al mismo tenant; constraints compuestas y transacciones donde corresponda. Catálogo global con diseños públicos y datos ficticios.
- Validar MIME real, extensión, tamaño y dimensiones. Rechazar o sanitizar contenido activo y referencias no permitidas; prevenir XSS, traversal y SSRF. Renderer aislado de código del usuario, red interna, credenciales y archivos del host; allowlist de variables y componentes.
- No enviar datos clínicos a servicios externos ni IA para renderizar; no incluir PII en logs, métricas o URLs. Auditar emisión/entrega por IDs y actor sin contenido clínico. Autorizar portal y descarga y validar vigencia de tokens. Reutilizar gate de licencia cuando HU-030 esté disponible; no inventar política de suspensión.
- Migraciones aditivas/compatibles y backfill si aplica; no modificar históricos ni migrar producción sin aprobación.

## Hitos

- [ ] **T0 — RDD/afinador:** recorrer plan, PDFs, HU-020, permisos y UX; fixtures sintéticos cortos/largos; registrar dudas y validar alcance con el usuario.
- [ ] **T1 — SDD/architect + PoC:** librerías/renderers, ADR, JSON, layout/paginación, API, storage, modelo, amenazas, pruebas y despliegue. Sin migraciones ni adopción de dependencias hasta validar. Decidir división en HU hijas.
- [ ] **T2 — Fundamentos:** contrato, validación, repositorios/servicios tenant-aware, migración revisada, fixtures, galería y CRUD de plantillas/assets. Coordinar lock de migración.
- [ ] **T3 — Editor MVP:** lienzo A4, selección, arrastre/resize, bloques de flujo, propiedades, texto/imágenes/figuras, páginas, zoom, undo/redo, guardado y Brand Kit básico.
- [ ] **T4 — Datos clínicos y render:** paciente, plan, recomendaciones, tablas, paginación, preview y PDF seleccionable; activación/fallback legacy verificable.
- [ ] **T5 — Documentos emitidos:** instancias y overrides por paciente, snapshots/versiones, historial, descarga autorizada, auditoría y entrega existente. WhatsApp multi-sesión tras HU-027 y sin mensajes reales en pruebas.
- [ ] **T6 — QA/entrega:** unit, integración/E2E y negativos con dos tenants, regresión, accesibilidad, comparación visual, carga y documentación Docker/rollback. Revisión y aprobación humana antes del merge.
- [ ] **T7 — Evolución, no bloquea MVP:** capas avanzadas, rotación, guías/snap, grupos, más tipografías, importar diseños, más tipos de documento y galería premium. Validar prioridad antes de abrir HU hijas.

## Aceptación del MVP

- [ ] Desde blanco o catálogo, al guardar y reabrir una plantilla con logo/texto/imagen y plan, conserva diseño, orden, estilos y configuración.
- [ ] Aplicar una plantilla a dos pacientes autorizados resuelve datos por paciente sin modificar plantilla ni planes originales.
- [ ] Un plan de varios días con textos largos, tablas, tildes, imágenes y faltantes genera PDF A4 completo, seleccionable y sin solapes ni recortes; comparar con preview usando fixtures.
- [ ] Cambios en plantilla, plan o logo no alteran documentos emitidos; una corrección crea revisión nueva.
- [ ] Un tenant no puede leer ni modificar plantillas, assets, pacientes, versiones, preview, PDFs o jobs de otro; probar IDs combinados y permisos insuficientes.
- [ ] Cargas inválidas, tamaños excesivos, URLs no permitidas y JSON desconocido se rechazan sin ejecutar contenido ni acceder a red interna.
- [ ] Undo/redo, recarga tras guardar y conflictos entre sesiones dan feedback y no pierden trabajo silenciosamente.
- [ ] El flujo legacy funciona sin plantilla personalizada y conserva datos y entregas.
- [ ] Exportaciones simultáneas/fallidas tienen límites, errores recuperables, limpieza y métricas sin PII; no bloquean el SaaS.
- [ ] Pruebas reproducibles, fixtures sintéticos, ADR, evidencia PDF corta/larga, documentación, veredicto del reviewer y CI verde.

## Fuera de alcance inicial

Editar PDF externos como documentos nativos de Canva (futuro: posible importación segura como fondo, sin reconstrucción; preservar extracción de HU-020), colaboración en tiempo real, marketplace de pago, IA de diseño, firma digital legal, fuentes arbitrarias, reemplazo del módulo de planes, cambios de cobros y clonar Canva completo. Premium requiere decisión posterior.

## Reglas del arnés al tomar la HU

1. Leer `AGENTS.md`, `CHECKPOINTS.md`, `backlog/_reglas.json`, catálogo de skills, HU relacionadas y `develop` actualizado. Asignarse el issue antes de trabajar, crear `backlog/HU-032.json` y sincronizar labels/bitácora. No asumir responsable ni motor; no tocar archivos ajenos.
2. RDD `docs/hu-nutribot-studio.md` con validación humana → SDD `Refactorizaciones/nutribot-studio.md` → implementación por tareas → reviewer. Registrar `progress/impl_HU-032.md`, `progress/review_HU-032.md` y bitácora. Respetar reglas para agentes externos y no paralelizar implementadores de la misma HU.
3. Rama `feat/hu-032-nutribot-studio` desde `develop`, commits atómicos, PR a `develop` revisado por la otra persona. Solo una HU con migración en implementación; no encadenar ramas ajenas.
4. Prisma: backup fuera del repo, `migrate dev --create-only`, revisión SQL y regeneración del cliente. No `migrate reset`, `db push` sobre base migrada, BD real como shadow ni reset por drift; reportar y parar. No seeds ni cambios en datos preexistentes; fixtures propios, rollback y limpieza por IDs propios.
5. Verificar `npm run db:generate` si cambia schema, `npm run typecheck`, `npm run test`, build y `ops/harness/verify.sh` según CI. Verificar web y bot si cambia dominio compartido. Nunca enviar WhatsApp real ni dejar filas despachables de prueba.
6. Entregar por hito archivos, resultados reales, riesgos, decisiones pendientes y cómo retomar. Una captura o mock no sustituye persistencia y exportación verificadas.

