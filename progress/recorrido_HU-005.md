# Recorrido visual HU-005 (orquestador, Chrome, 2026-09-24, modo autónomo)

`next dev` reiniciado por el orquestador. Base: 890 SARA2 + 90 PROPIO; los 36 alimentos que usan
los planes siguen existiendo; la huella de los 90 propios es igual antes y después (según
impl_HU-005).

## OK (solo lectura)
- `/alimentos`: "Mostrando 980 de 980"; filtros Todas / SARA 2 / Propios, grupos, "Mostrar
  inactivos"; columna Fuente con badge (SARA 2 / Propio); paginado (20 páginas); los nombres
  repetidos se distinguen por la fuente (dos "Aceite de girasol").
- Ficha de **Banana (SARA 2)**: "Frutas · SARA 2", "Activo", "Desactivar", "Duplicar como
  propio", aviso "Dato oficial… No se puede editar"; desglose Atwater 1,2×4 + 20,4×4 + 0,2×9 =
  88,2 kcal con "La tabla publica 92 kcal" (Q2: entra con la tolerancia del 5 %); nutrientes
  principales (saturadas, azúcar agregado, fibra, sodio, colesterol); "Calcular porción".
- **Selector con búsqueda** en el editor del plan: "manzana" → Manzana (Propio), Manzana con piel
  y sin piel (SARA 2), Vinagre de manzana (Propio), Torta de manzana (SARA 2), con el grupo y la
  fuente. Primera opción "Alimento libre / sin macros".
- Kcal de cada ítem del plan subrayadas (popover de desglose).

## No verificado
- Desactivar, duplicar como propio, crear o editar un propio y agregar un ítem con el selector:
  escriben. Los cubren los tests y la prueba de carga en una transacción que se revierte.
