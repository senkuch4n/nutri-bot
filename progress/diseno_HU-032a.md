# Diseño HU-032a · Diseños de PDF (Figma)

Archivo: **Numa · Diseños de PDF (HU-032a)**
https://www.figma.com/design/UEmOvtAeHVs6jaAx1uNTGP

Para revisar antes de la arquitectura (Joel y Leo). Es solo diseño: no se tocó código, `backlog/`, issues
ni commits. Link directo a un frame: `https://www.figma.com/design/UEmOvtAeHVs6jaAx1uNTGP?node-id=<id con ->`
(p. ej. `9-2092`).

## Páginas del archivo

| Página | Contenido |
|---|---|
| Variables y estilos | Colección de variables "Numa tokens (design-tokens.ts)": 34 colores (`color/*` del panel + `pdf/*` de `pdf-theme.ts`), radios y espaciados. Estilos de texto `Numa/*` (escala de HU-017, Inter), sombras `Numa/shadow-card/float/modal`. Componentes: 63 íconos lucide, `Button/*` (primary, secondary, ghost, destructive, destructive-muted, dark; default y sm), `Badge/*`, `Shell/Sidebar`. Tablero: `2:436`; sidebar: `3:2` |
| Pantallas | Todas las pantallas (abajo) |
| PDF resultante | Páginas A4 como componentes (las usan las miniaturas, la vista previa y la vitrina) |
| Supuestos y dudas | Supuestos (D2, D5, D7, D8, D9, D13, D14, D16, D17, D19) y dudas nuevas N1–N12. Tablero: `14:124` |

## Frames (node-id)

**1 · Galería** (Plantillas › pestaña "Diseños de PDF")
- `7:49` 1a · Galería vacía: solo "Clásico" (Del sistema · solo lectura), mensaje y botones "Nuevo diseño" / "Duplicar Clásico"
- `7:333` 1b · Galería con 4 diseños, chip "Predeterminado" y menú abierto (Abrir, Duplicar, Renombrar, Marcar como predeterminado, Archivar)
- `7:924` 1c · Diálogo "Nuevo diseño" (nombre + empezar "En blanco" / "Copia de Clásico")
- `7:1210` 1d · Confirmación de archivar el predeterminado (texto de la HU)
- `7:1696` 1e · Archivados, con "Restaurar"
- `7:1864` 1f · Diálogo Renombrar con el error "El nombre tiene que tener entre 1 y 80 caracteres."

**2 · Editor** (pantalla completa, 1440)
- `9:2092` 2a · Bloque dinámico seleccionado ("Datos de la paciente"): barra superior (volver, nombre editable, estado, deshacer/rehacer, zoom 90 % + Ajustar, Vista previa, Guardar), panel de bloques (Del plan / Contenido / Cabecera y pie / Imágenes), hoja A4 con márgenes, zona de cabecera y pie, bloques en flujo (uno seleccionado, con manija y acciones mover arriba/abajo, duplicar, eliminar), propiedades con "Si no hay dato"
- `9:2619` 2b · "Comidas del plan" seleccionado: "Mostrar totales de macros" desactivado; estado "Guardado"
- `9:3141` 2c · Sin selección: propiedades del documento (hoja, márgenes, acento de /ajustes, tipografías); estado "Guardando…"

**3 · Estados del editor**
- `10:2092` 3a · "Tenés cambios sin guardar. ¿Salir igual?" (Salir sin guardar / Seguir editando)
- `10:2399` 3b · Conflicto: "Este diseño cambió en otra sesión…" (Recargar / Guardar como copia)
- `10:2728` 3c · Error de imagen (zona de soltar rechazada + toast "La imagen tiene que ser PNG o JPG de hasta 2 MB.")
- `10:3036` 3d · Error al guardar ("No pudimos guardar el diseño. Probá de nuevo.")
- `10:3339` 3e · Cargando (esqueleto)

**4 · Vista previa**
- `11:2927` 4a · Modal con el PDF de "Paciente de ejemplo": 2 páginas, "Almuerzo" sigue en la página 2
- `11:3442` 4b · "Generando vista previa…"

**5 · Plan de la paciente** (columna "Enviar al paciente")
- `11:3757` 5a · Hoy (sin predeterminado = PDF de siempre)
- `11:3943` 5b · Con predeterminado: "Diseño: Plan verde · Cambiar" y "Último PDF: <fecha> · Diseño: Plan verde"
- `11:4138` 5c · "El diseño cambió desde el último PDF" + "Volver a generar"
- `11:4350` 5d · Falla de render: texto de la HU + "Generar con Clásico"; el PDF anterior sigue intacto

**6 · Móvil 390**
- `13:3998` 6a · Galería en una columna + aviso de que la edición requiere pantalla grande
- `13:4446` 6b · Vista previa (páginas apiladas, indicador "1 / 3")
- `13:4573` 6c · Editor bloqueado: "Para editar diseños usá una pantalla más grande"

**7 · PDF resultante**
- `13:4895` 7 · Vitrina en "Pantallas": Clásico pág. 1 y 2 y "Plan verde" pág. 1 y última, a tamaño real
- Componentes en la página "PDF resultante": `4:48` Clásico pág. 1, `4:138` Clásico pág. 2, `4:217` Plan verde (personalizado) pág. 1, `4:285` Plan verde pág. 3

## Supuestos (recomendaciones de la sección 9, sin validar)

D2 solo bloques en flujo (cabecera, cuerpo y pie; sin posición libre) · D5 un diseño del sistema
"Clásico", duplicable · D7 solo el predeterminado · D8 logo/color/pie/matrícula/firma de /ajustes ·
D9 Inter + 2-3 tipografías libres (propuse Lora, Nunito, Merriweather) · D13 "Diseños de PDF" dentro
de Plantillas, marca visible Numa · D14 edición solo ≥ 1024 px · D16 "Si no hay dato: Ocultar /
Mostrar 'No disponible'" · D17 guardado manual + aviso + conflicto · D19 solo PNG/JPG hasta 2 MB.
Todos los datos son ficticios ("Paciente de ejemplo", "Ana Ríos", "Lic. Laura Gómez", "M.N. 00000").

Otras decisiones de diseño:
- Clásico copia el PDF de `plan-pdf.tsx` y `pdf-common.tsx`: márgenes 44 pt, Inter 10 pt, título 18 pt,
  regla de acento de 2 pt, barra de 3 × 12 pt en las comidas, totales en caja `#F6F6F4` con borde
  izquierdo de acento y pie con "n / total".
- El texto del panel usa voseo, igual que hoy ("Todavía no creaste…", "Arrastralos…").
- Archivar no usa botón rojo porque se puede restaurar.

## Dudas nuevas (detalle en la página "Supuestos y dudas")

- **N1** ¿"Totales de macros" es un bloque aparte (como dice el pedido de diseño) o un switch dentro de "Comidas del plan" (HU 5.2 y Gherkin)? Diseñé los dos; recomiendo el switch.
- **N2** El PDF legacy imprime "NutriBot" en el encabezado y en el pie por defecto. Lo dibujé sin "NutriBot". ¿Va "Numa", nada, o queda igual que hoy?
- **N3** ¿La cabecera con fondo de color de borde a borde (ejemplo personalizado) entra en 032a o es de 032c?
- **N4** ¿Hace falta "primera página distinta" (cabecera compacta desde la pág. 2)?
- **N5** ¿Se repite "Almuerzo · continúa" cuando una comida sigue en otra página? El legacy no lo hace.
- **N6** El editor ocupa toda la pantalla, sin la navegación lateral. ¿Va así?
- **N7** ¿En móvil se puede marcar predeterminado, duplicar, renombrar y archivar? Asumí que sí; crear, no.
- **N8** Asumí que restaurar un diseño archivado no lo vuelve predeterminado.
- **N9** ¿Una fuente por documento (D9) o una para el texto y otra para los títulos?
- **N10** ¿Se unifican "Datos de la profesional" (cuerpo) y "Nombre de la profesional" (cabecera)?
- **N11** ¿Las miniaturas de la galería se generan al guardar o en vivo? Impacta en la CPU del VPS.
- **N12** Zoom inicial "Ajustar".

## Lo que no se pudo hacer / limitaciones

- No pude leer los skills `figma-use` y `figma-generate-design`: en esta sesión no había herramienta
  para leer recursos MCP ni skills de Figma instalados. Trabajé con la Plugin API directo.
- No hay prototipo navegable: son frames estáticos, sin conexiones.
- Los estilos de texto y los colores están ligados a variables. Los botones con ícono son copias
  desvinculadas del componente `Button`, porque Figma no deja insertar nodos dentro de una instancia.
- Íconos: dibujos lucide aproximados; firma, logo e imagen propia son marcadores ficticios.
- No se muestran los estados de arrastre (indicador de soltar mientras se arrastra) ni el anuncio
  de `aria-live`; quedan descritos en la HU (5.3).
- No hay pantalla 1366 × 650: todo es 1440 × 900. El editor está pensado para entrar en 1366 px,
  pero no está verificado en ese tamaño.
