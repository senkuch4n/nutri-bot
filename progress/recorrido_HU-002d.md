# Recorrido visual HU-002d (orquestador, Chrome, 2026-09-24, modo autónomo)

`next dev` del usuario en :3000, **sin reiniciar**: la HU borró los alias LEGACY de
`tailwind.config.ts` y el dev sigue con el config viejo. `OutboundMessage`: 4 antes y 4 después.

## OK
- `/alimentos`: tabla con buscador, filtro de grupo y "90 de 90"; números a la derecha con coma
  decimal; encabezado ordenable.
- `/plantillas`: estado vacío con ícono, texto y "Nueva plantilla".
- `/prueba-002d`: tabla de 120 alimentos con el encabezado fijo al scrollear **dentro** de la
  tabla, badge "Inactivo", orden con tildes y "Ñ"; editor de comidas con la franja `MacroTotals`
  (2.017 kcal, 130,6 g…), comidas con ítems, "Borrar comida" y "Quitar", formulario "Agregar
  alimento" con la unidad "g". Sin scroll horizontal.
- **"Borrar plantilla"** (borrado falso): abre el `alertdialog` "¿Borrar esta plantilla?" con el
  foco en "Cancelar"; Escape lo cierra. La regla de `useConfirm` se respeta.
- `/prueba-002d/portal` (tono cálido): plan con "Descargar PDF", la franja de totales y las
  comidas en tarjetas.
- Formato del total del PDF: `formatMacrosLine` en `packages/core`, con tests (1.846 kcal ·
  P 92,5 g …, espacio duro); 56 tests en verde.

## No verificado
- El PDF en el visor (la captura del visor de Chrome salió en negro; `/prueba-pdf` respondió y
  mostró 2 páginas). El formato queda cubierto por los tests de core.
- `/prueba-002d/360` (iframes de 360 px), el diario del portal y el efecto del cierre de LEGACY
  después de reiniciar el dev. **El usuario tiene que reiniciar `npm run dev`** y mirar si algo
  perdió un color o un borde.
- O-c2 verificado en Chrome: el COMPLETED (7/9, Sofía) se ve en verde oscuro con `hsl(var(--success))`, no hace falta el plan B.
