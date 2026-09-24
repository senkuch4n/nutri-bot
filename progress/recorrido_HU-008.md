# Recorrido HU-008 (orquestador, Chrome, 2026-09-24, modo autónomo)

`next dev` reiniciado (cambió el cliente de Prisma). Datos de prueba creados con
`walkthrough:hu008 create` y borrados con `cleanup`, por id. Conteos finales: 10 / 18 / 15 / 4 /
0 prescripciones.

Verificado a mano: IMC 30/1,273² = 18,51 → Z LMS +1,52 con la fila del mes 96 (L −1,4629,
M 15,7368, S 0,09526); Schofield, varones de 3 a 10 años: 19,59·30 + 1,303·127,3 + 414,9 = 1.168;
22,706·30 + 504,3 = 1.185.

## OK
- **A1 (8 años, 96 meses):** "Paciente pediátrico: referencia OMS 2007"; IMC/E 18,5 · Z +1,52 ·
  P94 · Sobrepeso; T/E 127,3 cm · Z +0,01 · P50 · Talla adecuada; pie "Edad: 8 años (96 meses)";
  sin cintura, ICC ni peso ideal.
- **A1, calculadora:** sin el paso de peso para las fórmulas; Schofield (peso y talla) 1.168 y
  Schofield (peso) 1.185, "Schofield (1985), 3 a 9 años, masculino"; aviso de factores de adultos;
  GET 1.607; ayudas de macros 10–30 / 25–35 / 45–65 %.
- **A2:** IMC/E 27,8 · Z +4,60 · > P99 · Obesidad (extensión OMS para Z extremas).
- **A3:** IMC/E 9,3 · Z −6,46 → "Valor fuera de rango: revisá la medición"; talla tomada de la
  medición del 17/09 (D8).
- **B1 (4 años):** "Menor de 5 años: el sistema no tiene referencias para esta edad", IMC 15,4
  sin clasificar.

## No verificado
- Guardar la prescripción pediátrica, el informe PDF del menor y el estudio ISAK completo del menor
  en el navegador. Los cubren los tests de core y `test-prescriptions`.
