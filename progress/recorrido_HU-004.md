# Recorrido visual HU-004 (orquestador, Chrome, 2026-09-24, modo autónomo)

`next dev` reiniciado por el orquestador (cliente de Prisma nuevo). `OutboundMessage` 4 → 4.

## Solo lectura: Juan Pérez, consulta del 12/09/2026
- Diagnóstico: IMC 22,6 "Normal" (18,5–24,9) con las fechas de peso y talla usadas; cintura, ICC,
  cintura/talla y conicidad "Sin dato (falta cintura)"; % de grasa estimado "Falta sexo" con el
  medido 18,5 % (bioimpedancia 12/09).

## Con paciente de prueba propio (`hu004_walk_ana`, creado por SQL y borrado por id al final)
Mujer, 34 años, 66,5 kg, 162 cm, cintura 82, cadera 100, grasa 29,4 %, Ligero, Bajar de peso.
- Diagnóstico (verificado a mano): IMC 25,3 Sobrepeso · cintura 82 Riesgo elevado · ICC 0,82 sin
  riesgo aumentado · cintura/talla 0,51 fuera de rango · conicidad 1,17 · Deurenberg 32,8 % ·
  Devine 54,2 · Hamwi 53,8 (Mediana asumida) · Broca 62 · Broca-Brugsch 52,7 · Lorentz 57,2 · peso
  actual al 122,7 % de Devine (menos de 130 %: sin sugerencia de peso ajustado, aunque la opción
  "Ajustado (57,3 kg)" está disponible).
- Calculadora: TMB Mifflin 1.347 · Harris-Benedict 1.417 · Katch-McArdle 1.384 · Cunningham
  1.533 (con la grasa de la bioimpedancia) · GET 1.851 (×1,375) · déficit moderado −20 % → VCT
  1.481 · macros 20/30/50 → 74 g / 49 g / 185 g (1,1 / 0,7 / 2,8 g/kg). Todo coincide con la
  cuenta a mano. Las kcal usan separador de miles (decisión del orquestador).
- "Guardar prescripción" → toast "Prescripción guardada"; tarjeta con el resumen, "Editar" y
  "Borrar prescripción". En el Resumen de la ficha aparece "Requerimiento indicado" con "Ver
  consulta".
- Limpieza: se borraron por id la prescripción, la medición, la consulta y el paciente. Conteos
  finales: 10 pacientes, 18 consultas, 15 mediciones, 0 prescripciones, 4 mensajes.

## No verificado
- Menores de 18, "Proteína en g/kg", editar y borrar la prescripción, peso ajustado > 130 %.
  Los cubren los tests de core.
