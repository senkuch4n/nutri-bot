# Recorrido visual HU-006 (orquestador, Chrome, 2026-09-24, modo autónomo)

`next dev` reiniciado por el orquestador. Se cargó por SQL el **caso A** (exportación en PDF de
ISAKMetry, sin datos identificatorios) en un paciente de prueba propio (`hu006_walk_a`, borrado por
id al final). Conteos finales: 10 pacientes, 18 consultas, 15 mediciones, 4 mensajes.

## Página `/pacientes/[id]/consultas/[consultationId]/antropometria` contra ISAKMetry
- **Z de las 21 medidas:** coinciden (masa 0,42 contra 0,40: tolerancia D7).
- **Molecular:** masa grasa 10,73 kg (Z −0,04), MLG 50,27 kg, coinciden.
- **Tisular:** adiposo 16,48 (Z −1,23), muscular 28,97 (2,28), óseo 10,34 (0,68), residual 5,21
  (8,54 %), coinciden. El 10,85 % de residual del informe de Canva era un error de tipeo.
- **Distribución:** adiposa 30,99 / 45,07 / 23,94 y muscular 24,79 / 44,99 / 30,23, coinciden.
- **Índices:** IAM 0,57, IMO 2,80 "Medio", Σ6 71,0, Σ8 94,0, corregidos 26,74 / 48,54 / 32,62 (Z
  2,99 / 0,84 / 1,84; el muslo difiere a propósito, D5), diferencia de brazo 1,8, córmico 0,51
  Metricórmico, Manouvrier 98, envergadura relativa 1,02, coinciden.
- **Somatotipo:** 4,03 / 5,69 / 1,92, Endo-mesomorfo, con la somatocarta dibujada, coincide.
- **Salud:** IMC 22,7 Normal, ICC 0,83, cintura/talla 0,45, conicidad 1,10, IDG 0,65, coinciden.

## No verificado en el navegador
- La carga del estudio con el formulario (se insertó por SQL), las validaciones, editar y borrar,
  la comparación con el estudio anterior y los menores de 18. Los cubren los tests y el script
  `isak:validate` (100 OK, 2 tolerados, 3 conocidos).

## Ronda de resolución 1 (re-chequeo del orquestador)
- El orquestador encontró en el navegador un **segundo bug**, además del pedido por el reviewer:
  el formulario no se cerraba después de guardar un estudio nuevo. Causa: `key={study?.entryId ??
  "new"}` remontaba `IsakForm` al revalidar y se perdía el `state.ok`. Se corrigió en la misma
  ronda.
- Verificado después del arreglo, con un paciente de prueba propio (`hu006_walk_b`, borrado por
  id): alta con el caso A → el formulario se cierra, toast "Estudio ISAK guardado", tarjeta con
  "Adiposo 27,02 % · Muscular 47,49 % · Óseo 16,95 % · Residual 8,54 %", "Somatotipo 4,03 – 5,69
  – 1,92 (Endo-mesomorfo) · IMO 2,80 Medio", "Σ 6 pliegues 71,0 mm". "Editar" precarga los
  valores (61 / 9.7) y "Cancelar" vuelve a la vista. Sin errores en la consola. Conteos finales:
  10 / 18 / 15 / 4.
