# Importación SARA 2: reporte del lector

- Fuente: SARA 2: Tabla de composición química de alimentos para Argentina. Compilación para ENNyS 2. Ministerio de Salud de la Nación, 2022.
- Archivo: `docs/tabla-composicion-quimica-alimentos-argentina_ennys2__.pdf`
- sha256: `14706a46e0262e2223b0c44d4c77c31090e3554cf63602fe58ab765f32b81c7f`
- Generado: 2026-09-24T09:08:40.321Z
- Estado: **ok**

Este archivo lo genera `npm run sara2:read`. No se edita a mano: las filas rechazadas no se corrigen ni se inventan.

## Resumen

| Medida | Valor |
|---|---|
| Filas A de las tablas 1–25 | 906 |
| Importadas | 890 |
| Rechazadas | 16 (1,77 %) |
| Excluidas (tabla 26) | 24 |
| Advertencias | 381 |

## Por grupo

| Tabla | Grupo | Filas A | Filas B | Emparejadas | Importadas | Rechazadas | Advertencias |
|---|---|---|---|---|---|---|---|
| 1 | Verduras | 93 | 93 | 93 | 93 | 0 | 20 |
| 2 | Frutas | 51 | 51 | 51 | 50 | ATWATER 1 | 13 |
| 3 | Legumbres, cereales, papa, choclo, batata, pan y pastas | 247 | 247 | 247 | 242 | SUMA_MACROS 2, ATWATER 2, NUMERO_INVALIDO 1 | 119 |
| 4 | Leche y postres de leche | 65 | 65 | 65 | 65 | 0 | 49 |
| 5 | Yogures | 14 | 14 | 14 | 12 | SUMA_MACROS 2 | 7 |
| 6 | Quesos | 44 | 44 | 44 | 44 | 0 | 11 |
| 7 | Carnes | 91 | 91 | 91 | 90 | SUMA_MACROS 1 | 12 |
| 8 | Huevos | 8 | 8 | 8 | 8 | 0 | 4 |
| 9 | Pescados y mariscos | 42 | 41 | 41 | 41 | SIN_PAREJA_B 1 | 8 |
| 10 | Aceites | 13 | 13 | 13 | 13 | 0 | 2 |
| 11 | Frutas secas y semillas | 16 | 16 | 16 | 16 | 0 | 1 |
| 12 | Azúcares, mermeladas y dulces | 15 | 15 | 15 | 15 | 0 | 3 |
| 13 | Golosinas y chocolates | 53 | 53 | 53 | 50 | ATWATER 1, SUMA_MACROS 2 | 33 |
| 14 | Grasas | 10 | 10 | 10 | 9 | SUMA_MACROS 1 | 4 |
| 15 | Snacks salados | 8 | 8 | 8 | 8 | 0 | 6 |
| 16 | Aderezos | 18 | 18 | 18 | 17 | ATWATER 1 | 9 |
| 17 | Caldos y sopas industriales | 13 | 13 | 13 | 13 | 0 | 3 |
| 18 | Postres industriales y helados | 13 | 13 | 13 | 13 | 0 | 8 |
| 19 | Sales | 6 | 6 | 6 | 6 | 0 | 0 |
| 20 | Bebidas con azúcar | 16 | 16 | 16 | 16 | 0 | 17 |
| 21 | Bebidas sin azúcar | 12 | 12 | 12 | 11 | SUMA_MACROS 1 | 11 |
| 22 | Bebidas alcohólicas y energizantes | 18 | 18 | 18 | 18 | 0 | 10 |
| 23 | Bebidas de frutas naturales sin azúcar agregada | 7 | 7 | 7 | 7 | 0 | 0 |
| 24 | Infusiones | 5 | 5 | 5 | 5 | 0 | 2 |
| 25 | Comidas rápidas | 28 | 28 | 28 | 28 | 0 | 29 |

## Rechazadas (16)

### Durazno, enlatado light (fruta y almíbar)

- Tabla 2, página 28
- Motivo: `ATWATER` (kcal publicadas no coinciden con Atwater)
- Detalle: kcal publicadas 43, calculadas 21,5, diferencia 21,5

```
Durazno, enlatado light (fruta y almíbar) | 43 93,13 0,44 0,06 0 0,006 0,021 0,028 0 0,027 0,001 0 0 0 4,81 6,11 4,81 0 1,3 0
Durazno, enlatado light (fruta y almíbar) | 0,27 3 99 2 0,054 10 0,32 5 0,09 0,521 3 0 27 0 0,009 0,019 0 2,9 0
```

### Capelettis frescos, artesanal, crudo

- Tabla 3, página 38
- Motivo: `SUMA_MACROS` (suma de macros fuera de 90–110 g)
- Detalle: suma de macros = 112,8 g (sin cenizas)

```
Capelettis frescos, artesanal, crudo | 295 46,3 13,7 8,0 3,4 4,00 2,30 0,97 0,17 0,84 0,075 0 0 0 42,1 44,8 1,5 0 2,7 0
Capelettis frescos, artesanal, crudo | · 364 146 141 0,04 183 1,14 29 1,2 1,35 21 0 77 69 0,341 0,126 0,50 0 0,37
```

### Facturas rellenas

- Tabla 3, página 40
- Motivo: `ATWATER` (kcal publicadas no coinciden con Atwater)
- Detalle: kcal publicadas 339, calculadas 369,3, diferencia 30,3

```
Facturas rellenas | 339 24,7 7,2 16,9 29 8,10 5,55 2,43 0,81 2,32 0,083 0 0 0 47,1 49,4 20,4 19,7 2,0 0
Facturas rellenas | 1,7 314 148 60 0,1 105 1,68 15 0,7 1,71 101 46 88 88 0,300 0,232 0,16 0,5 0
```

### Harina de maíz, hervida

- Tabla 3, página 46
- Motivo: `ATWATER` (kcal publicadas no coinciden con Atwater)
- Detalle: kcal publicadas 108, calculadas 101,6, diferencia 6,4

```
Harina de maíz, hervida | 108 71,2 3,0 0,4 0 0,06 0,09 0,23 0 0,00 0 0 0 0 21,5 24,6 0,2 0 3,0 0
Harina de maíz, hervida | 0,28 6 67 3 0,04 22 0,65 5 0,09 0,60 12 0 3 0 0,047 0,033 0 0 0
```

### Ravioles frescos, artesanal, crudos

- Tabla 3, página 56
- Motivo: `SUMA_MACROS` (suma de macros fuera de 90–110 g)
- Detalle: suma de macros = 112,8 g (sin cenizas)

```
Ravioles frescos, artesanal, crudos | 295 46,3 13,7 8,0 45 4,00 2,30 0,97 0,17 0,84 0,075 0 0 0 42,1 44,8 1,5 0 2,7 0
Ravioles frescos, artesanal, crudos | · 364 146 141 0,04 183 1,14 29 1,2 1,35 21 0 77 69 0,341 0,126 0,30 0 0,37
```

### Salvado de avena

- Tabla 3, página 58
- Motivo: `NUMERO_INVALIDO` (número con formato inválido)
- Detalle: número inválido «0.121» en 18:3 Alfa-linolénico (ALA)

```
Salvado de avena | 336 6,6 17,3 7,0 0 1,33 2,38 2,77 0 2,65 0.121 0 0 0 50,8 66,2 1,5 0 15,4 0
Salvado de avena | 2,89 4 566 58 0,403 734 5,41 235 3,11 0,93 52 0 0 0 1,170 0,220 0 0 0
```

### Yogur descremado

- Tabla 5, página 74
- Motivo: `SUMA_MACROS` (suma de macros fuera de 90–110 g)
- Detalle: suma de macros = 88,9 g

```
Yogur descremado | 36 79,0 2,9 0,0 3,0 0,00 0,00 0,00 0 0,00 0 0 0 0 6,0 6,0 6,0 0 0 0
Yogur descremado | 1,02 47 141 118 0,013 88 0 16 0,83 0,11 11 0 61 61 0,042 0,200 0,53 0 1,4
```

### Yogur descremado bebible

- Tabla 5, página 74
- Motivo: `SUMA_MACROS` (suma de macros fuera de 90–110 g)
- Detalle: suma de macros = 87,9 g (sin cenizas)

```
Yogur descremado bebible | 36 79,0 2,9 0,0 0 0,00 0,00 0,00 0 0,00 0 0 0 0 6,0 6,0 5,9 0 0 0
Yogur descremado bebible | · 115 146 135 0,01 89 0,08 12 0,55 0,14 7 0 172 172 0,028 0,136 0,34 0,5 1,2
```

### Vizcacha, cruda

- Tabla 7, página 92
- Motivo: `SUMA_MACROS` (suma de macros fuera de 90–110 g)
- Detalle: suma de macros = 111,9 g

```
Vizcacha, cruda | 160 73,0 23,9 3,7 57 1,11 1,00 0,72 0 0,70 0,020 0,056 0,004 0,006 7,7 7,7 0 0 0 0
Vizcacha, cruda | 3,61 41 260 69 0,145 29 2,57 19 1,57 7,27 8 0 0 0 0,100 0,150 7,16 9,9 0
```

### Salmón blanco, crudo

- Tabla 9, página 97
- Motivo: `SIN_PAREJA_B` (sin fila en la parte B)
- Detalle: la fila no está en la parte B

```
Salmón blanco, crudo | 114 75,2 21,6 3,0 46 0,55 0,92 0,55 0 0,04 0,031 0,010 0,124 0,227 0,2 0,2 0 0 0 0
```

### Caramelos duros light

- Tabla 13, página 106
- Motivo: `ATWATER` (kcal publicadas no coinciden con Atwater)
- Detalle: kcal publicadas 236, calculadas 394,4, diferencia 158,4

```
Caramelos duros light | 236 1,4 0,0 0,0 0 0,00 0,00 0,00 0 0,00 0 0 0 0 98,6 98,6 0 0 0 0
Caramelos duros light | 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0
```

### Chicles sin azúcar

- Tabla 13, página 108
- Motivo: `SUMA_MACROS` (suma de macros fuera de 90–110 g)
- Detalle: suma de macros = 70,6 g

```
Chicles sin azúcar | 256 3,5 0,0 0,4 0 0,06 0,09 0,23 0 0,00 0 0 0 0 63,0 63,0 0 0 2,4 0
Chicles sin azúcar | 1,3 7 0 20 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0
```

### Medallón de menta y chocolate

- Tabla 13, página 110
- Motivo: `SUMA_MACROS` (suma de macros fuera de 90–110 g)
- Detalle: suma de macros = 114,9 g

```
Medallón de menta y chocolate | 545 6,3 5,0 24,0 6,0 15,00 8,00 0,90 0 0,86 0,045 0 0 0 77,1 79,5 59,0 59,0 1,9 0
Medallón de menta y chocolate | 0,6 1 389 13 0,06 104 0,57 13 0,6 0,50 1 0 0 0 0,160 0,010 0 0 0
```

### Margarina (en pote y en pan)

- Tabla 14, página 112
- Motivo: `SUMA_MACROS` (suma de macros fuera de 90–110 g)
- Detalle: suma de macros = 80,5 g

```
Margarina (en pote y en pan) | 559 16,0 0,2 61,7 0 27,60 10,43 24,30 0,88 23,00 0,486 0 0 0 0,7 0,7 0 0 0 0
Margarina (en pote y en pan) | 1,92 295 18 3 0 5 0,06 3 0 0,02 1 0 450 450 0,010 0,037 0,10 0,2 3,75
```

### Mayonesa light

- Tabla 16, página 116
- Motivo: `ATWATER` (kcal publicadas no coinciden con Atwater)
- Detalle: kcal publicadas 270, calculadas 214,6, diferencia 55,4

```
Mayonesa light | 270 54,3 0,9 19,0 26 2,01 4,74 11,69 0 11,59 0,095 0,019 0,001 0,005 10,0 10,0 4,3 4,3 0 0
Mayonesa light | 2 837 24 14 0,001 30 0,26 2 0,18 0 6 0 21 12 0,010 0,020 0,21 0 0
```

### Jugo en polvo light

- Tabla 21, página 125
- Motivo: `SUMA_MACROS` (suma de macros fuera de 90–110 g)
- Detalle: suma de macros = 73 g (sin cenizas)

```
Jugo en polvo light | 285 1,84 0,0 0,0 0 0,00 0,00 0,00 0 0,00 0 0 0 0 71,2 71,2 0 0 0 0
Jugo en polvo light | · 2214 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0
```

## Excluidas: tabla 26 (24)

| Alimento | Página | Motivo |
|---|---|---|
| Dextrosa en polvo (gramo) | 137 | excluidas: no vienen cada 100 g |
| Ensure Plus (mililitro) | 137 | excluidas: no vienen cada 100 g |
| Ensure Plus drink (mililitro) | 137 | excluidas: no vienen cada 100 g |
| Ensure polvo (gramo) | 137 | excluidas: no vienen cada 100 g |
| Espesan (gramo) | 137 | excluidas: no vienen cada 100 g |
| Fortisip Standard (mililitro) | 137 | excluidas: no vienen cada 100 g |
| Frebini energy drink (mililitro) | 137 | excluidas: no vienen cada 100 g |
| Glucerna SR polvo (gramo) | 137 | excluidas: no vienen cada 100 g |
| Jevity (mililitro) | 137 | excluidas: no vienen cada 100 g |
| Kas Mil polvo (gramo) | 137 | excluidas: no vienen cada 100 g |
| MCT Oil-triglicéridos de cadena media (Nutricia Bagó) (mililitro) | 137 | excluidas: no vienen cada 100 g |
| Neocate polvo (gramo) | 137 | excluidas: no vienen cada 100 g |
| Nutramigen LGG (gramo) | 137 | excluidas: no vienen cada 100 g |
| Osmolite NH (mililitro) | 137 | excluidas: no vienen cada 100 g |
| Pediasure complete, en polvo (gramo) | 137 | excluidas: no vienen cada 100 g |
| Polimerosa (gramo) | 137 | excluidas: no vienen cada 100 g |
| Supportan (mililitro) | 137 | excluidas: no vienen cada 100 g |
| Fresubin Powder Fibre (gramo) | 137 | excluidas: no vienen cada 100 g |
| Herbalife- Batido nutricional proteico. Formula 1 (gramo) | 137 | excluidas: no vienen cada 100 g |
| Herbalife-Batido de cookies y cream. Formula 1 (gramo) | 137 | excluidas: no vienen cada 100 g |
| Supportan drink (mililitro) | 139 | excluidas: no vienen cada 100 g |
| Herbalife- Polvo de proteínas personalizado. Fórmula 3 (gramo) | 139 | excluidas: no vienen cada 100 g |
| Whey Pro. Classic Line (gramo) | 139 | excluidas: no vienen cada 100 g |
| Levadura de cerveza (gramo) | 139 | excluidas: no vienen cada 100 g |

## Advertencias (381)

### Azúcar agregado > azúcar total o azúcar total > CHO disponibles (`AZUCARES_INCONSISTENTES`, 25)

| Alimento | Tabla | Página | Detalle |
|---|---|---|---|
| Ají rojo / morrón rojo, crudo | 1 | 18 | azúcar agregado 0 g, azúcar total 4,2 g, CHO disponibles 3,9 g |
| Ají rojo / morrón rojo, rehogado | 1 | 18 | azúcar agregado 0 g, azúcar total 4,2 g, CHO disponibles 3,9 g |
| Berenjena, cruda | 1 | 20 | azúcar agregado 0 g, azúcar total 3,5 g, CHO disponibles 2,5 g |
| Berro, crudo | 1 | 20 | azúcar agregado 0 g, azúcar total 4,4 g, CHO disponibles 2,2 g |
| Coliflor, hervido | 1 | 20 | azúcar agregado 0 g, azúcar total 2,1 g, CHO disponibles 1,8 g |
| Espárrago, crudo | 1 | 22 | azúcar agregado 0 g, azúcar total 1,9 g, CHO disponibles 1,8 g |
| Kale, crudo | 1 | 22 | azúcar agregado 0 g, azúcar total 1 g, CHO disponibles 0,3 g |
| Tomate, enlatado | 1 | 24 | azúcar agregado 0 g, azúcar total 2,6 g, CHO disponibles 1,6 g |
| Zapallito, crudo | 1 | 26 | azúcar agregado 0 g, azúcar total 2,5 g, CHO disponibles 2,1 g |
| Zucchini, crudo | 1 | 26 | azúcar agregado 0 g, azúcar total 2,5 g, CHO disponibles 2,1 g |
| Zucchini, hervido | 1 | 26 | azúcar agregado 0 g, azúcar total 2,5 g, CHO disponibles 2,1 g |
| Damasco | 2 | 28 | azúcar agregado 0 g, azúcar total 9,2 g, CHO disponibles 9,1 g |
| Mango | 2 | 30 | azúcar agregado 0 g, azúcar total 13,7 g, CHO disponibles 13,4 g |
| Mora | 2 | 30 | azúcar agregado 0 g, azúcar total 4,9 g, CHO disponibles 4,3 g |
| Puré de frutas envasado (alimento infantil) | 2 | 32 | azúcar agregado 0 g, azúcar total 9,9 g, CHO disponibles 9,1 g |
| Galletitas dulces rellenas bañadas en chocolate | 3 | 44 | azúcar agregado 56,6 g, azúcar total 53,6 g, CHO disponibles 67 g |
| Premezcla para bizcochuelo, SIN TACC | 3 | 56 | azúcar agregado 51,4 g, azúcar total 51,1 g, CHO disponibles 82 g |
| Soja, porotos, hervidos | 3 | 58 | azúcar agregado 0 g, azúcar total 3 g, CHO disponibles 2,4 g |
| Flan envasado listo para consumir | 4 | 62 | azúcar agregado 18,7 g, azúcar total 23,3 g, CHO disponibles 23,1 g |
| Queso Parmesano | 6 | 78 | azúcar agregado 0 g, azúcar total 0,1 g, CHO disponibles 0 g |
| Panceta | 7 | 86 | azúcar agregado 0 g, azúcar total 0,4 g, CHO disponibles 0 g |
| Huevo de codorníz, entero, crudo | 8 | 93 | azúcar agregado 0 g, azúcar total 0,4 g, CHO disponibles 0,1 g |
| Huevo de codorníz, entero, hervido | 8 | 93 | azúcar agregado 0 g, azúcar total 0,4 g, CHO disponibles 0,1 g |
| Alimento a base de almendras (leche de almendras) | 11 | 102 | azúcar agregado 6,3 g, azúcar total 6,3 g, CHO disponibles 6,2 g |
| Crema de leche | 14 | 112 | azúcar agregado 0 g, azúcar total 2,9 g, CHO disponibles 2,8 g |

### Saturadas + mono + poli mayor que lípidos (`GRASAS_INCONSISTENTES`, 50)

| Alimento | Tabla | Página | Detalle |
|---|---|---|---|
| Ajo, crudo | 1 | 18 | saturadas + mono + poli = 0,4 g > lípidos 0,2 g |
| Berro, crudo | 1 | 20 | saturadas + mono + poli = 0,5 g > lípidos 0,3 g |
| Hinojo, crudo | 1 | 22 | saturadas + mono + poli = 0,3 g > lípidos 0,2 g |
| Hinojo, hervido | 1 | 22 | saturadas + mono + poli = 0,3 g > lípidos 0,2 g |
| Aceituna verde | 2 | 28 | saturadas + mono + poli = 14,7 g > lípidos 13,5 g |
| Ciruela pasa / ciruela seca | 2 | 28 | saturadas + mono + poli = 0,2 g > lípidos 0,1 g |
| Damasco | 2 | 28 | saturadas + mono + poli = 0,3 g > lípidos 0,1 g |
| Durazno | 2 | 28 | saturadas + mono + poli = 0,2 g > lípidos 0,1 g |
| Granada | 2 | 30 | saturadas + mono + poli = 0,3 g > lípidos 0,2 g |
| Kinoto | 2 | 30 | saturadas + mono + poli = 0,4 g > lípidos 0,1 g |
| Mamón | 2 | 30 | saturadas + mono + poli = 0,2 g > lípidos 0,1 g |
| Papaya | 2 | 32 | saturadas + mono + poli = 0,2 g > lípidos 0,1 g |
| Cereal desayuno, aritos frutales | 3 | 38 | saturadas + mono + poli = 3 g > lípidos 2,3 g |
| Fideos secos integrales / fideos secos de sémola y harina de legumbres, crudos | 3 | 42 | saturadas + mono + poli = 1,9 g > lípidos 1,6 g |
| Fideos secos integrales / fideos secos de sémola y harina de legumbres, hervidos | 3 | 42 | saturadas + mono + poli = 0,7 g > lípidos 0,6 g |
| Lentejas, crudas | 3 | 48 | saturadas + mono + poli = 0,9 g > lípidos 0,8 g |
| Madalenas | 3 | 48 | saturadas + mono + poli = 16,7 g > lípidos 15,6 g |
| Madalenas rellenas | 3 | 48 | saturadas + mono + poli = 14,9 g > lípidos 13,5 g |
| Pan blanco, tipo molde, lacteado | 3 | 52 | saturadas + mono + poli = 2,3 g > lípidos 2,2 g |
| Pan de molde con salvado | 3 | 52 | saturadas + mono + poli = 2,4 g > lípidos 2,1 g |
| Pan de molde con salvado sin sal | 3 | 52 | saturadas + mono + poli = 5 g > lípidos 4,8 g |
| Pan de salvado con semillas | 3 | 52 | saturadas + mono + poli = 5 g > lípidos 4,8 g |
| Premezcla para panificados, pastas y postres, SIN TACC | 3 | 56 | saturadas + mono + poli = 2,8 g > lípidos 1,8 g |
| Bebida láctea parcialmente descremada fluida, baja en lactosa, fortificada con vitaminas A, D, B2, B9 y Zinc | 4 | 62 | saturadas + mono + poli = 1 g > lípidos 0,9 g |
| Flan envasado listo para consumir | 4 | 62 | saturadas + mono + poli = 3,9 g > lípidos 2,6 g |
| Leche de oveja, entera, fluida | 4 | 62 | saturadas + mono + poli = 6,6 g > lípidos 6,5 g |
| Leche entera fluida, con azúcar, lista para consumir | 4 | 66 | saturadas + mono + poli = 2,9 g > lípidos 2,8 g |
| Leche fórmula seguimiento, en polvo | 4 | 68 | saturadas + mono + poli = 21,8 g > lípidos 21 g |
| Leche fórmula seguimiento, fluida | 4 | 68 | saturadas + mono + poli = 3,2 g > lípidos 3,1 g |
| Leche fórmula, tipo Enfabebe Confort, en polvo | 4 | 68 | saturadas + mono + poli = 27,3 g > lípidos 27 g |
| Leche fórmula, tipo Nutrilon Pepti junior HE, en polvo | 4 | 68 | saturadas + mono + poli = 27,2 g > lípidos 27 g |
| Queso Pategrás | 6 | 76 | saturadas + mono + poli = 32,7 g > lípidos 25,6 g |
| Queso Mar del Plata | 6 | 78 | saturadas + mono + poli = 32,7 g > lípidos 25,6 g |
| Queso Muzzarella | 6 | 78 | saturadas + mono + poli = 21,2 g > lípidos 19,3 g |
| Milanesa de pollo, prefrita congelada | 7 | 86 | saturadas + mono + poli = 16,6 g > lípidos 15 g |
| Abadejo, crudo | 9 | 95 | saturadas + mono + poli = 1,2 g > lípidos 0,9 g |
| Surubí, crudo | 9 | 99 | saturadas + mono + poli = 4,2 g > lípidos 4 g |
| Aceite de maíz | 10 | 100 | saturadas + mono + poli = 100,5 g > lípidos 100 g |
| Alfajor de chocolate | 13 | 106 | saturadas + mono + poli = 15,1 g > lípidos 14,1 g |
| Alfajor de chocolate con relleno tipo mousse | 13 | 106 | saturadas + mono + poli = 36,7 g > lípidos 31 g |
| Alfajor de dulce de leche | 13 | 106 | saturadas + mono + poli = 9,3 g > lípidos 8,9 g |
| Minitorta bañada | 13 | 110 | saturadas + mono + poli = 19 g > lípidos 17 g |
| Tableta de dulce de leche | 13 | 110 | saturadas + mono + poli = 6,3 g > lípidos 6 g |
| Tableta de dulce de leche light | 13 | 110 | saturadas + mono + poli = 0,4 g > lípidos 0 g |
| Margarina untable light | 14 | 112 | saturadas + mono + poli = 52,5 g > lípidos 52 g |
| Arroz con leche envasado listo para consumir | 18 | 120 | saturadas + mono + poli = 2,9 g > lípidos 2,8 g |
| McDonald's, Clubhouse/ Guacamole/ Cryspi Onion BBQ con pollo crispy | 25 | 133 | saturadas + mono + poli = 7,9 g > lípidos 5,7 g |
| McDonald's, Clubhouse/ Guacamole/ Cryspi Onion BBQ con pollo grill | 25 | 133 | saturadas + mono + poli = 7,9 g > lípidos 5,8 g |
| McDonald's, Cono | 25 | 133 | saturadas + mono + poli = 4,2 g > lípidos 4 g |
| McDonald's, Sundae dulce de leche | 25 | 135 | saturadas + mono + poli = 4,4 g > lípidos 4,1 g |

### Sin cenizas en la tabla (la suma se calculó sin ellas) (`SIN_CENIZAS`, 237)

| Alimento | Tabla | Página | Detalle |
|---|---|---|---|
| Medallones de verdura congelados industrializados | 1 | 22 | suma calculada sin cenizas |
| Prefritos congelados, patitas de vegetales (espinaca) | 1 | 24 | suma calculada sin cenizas |
| Tomates cherry, crudos | 1 | 26 | suma calculada sin cenizas |
| Avena, almohaditas | 3 | 34 | suma calculada sin cenizas |
| Avena, arrollada, hervida | 3 | 36 | suma calculada sin cenizas |
| Barra de cereal fortificada | 3 | 36 | suma calculada sin cenizas |
| Barra de cereal light | 3 | 36 | suma calculada sin cenizas |
| Barra de cereales, PROMEDIO | 3 | 36 | suma calculada sin cenizas |
| Bizcochitos de arroz envasados (tipo galletita) | 3 | 36 | suma calculada sin cenizas |
| Bizcochitos de grasa envasados light | 3 | 36 | suma calculada sin cenizas |
| Bizcochos tipo Bay Biscuit | 3 | 36 | suma calculada sin cenizas |
| Brownie (panadería) | 3 | 36 | suma calculada sin cenizas |
| Budín industrializado con nueces, tipo navideño | 3 | 38 | suma calculada sin cenizas |
| Capelettis / capelettinis deshidratados, envasados, crudos | 3 | 38 | suma calculada sin cenizas |
| Capelettis / capelettinis deshidratados, envasados, hervidos | 3 | 38 | suma calculada sin cenizas |
| Capelettis frescos, artesanal, hervido | 3 | 38 | suma calculada sin cenizas |
| Cereal desayuno, aritos sabor miel | 3 | 38 | suma calculada sin cenizas |
| Cereal desayuno, copos azucarados, fortificados | 3 | 38 | suma calculada sin cenizas |
| Cereal desayuno, copos azucarados, sin fortificar | 3 | 38 | suma calculada sin cenizas |
| Cereal desayuno, copos de maíz sin azúcar, sin fortificar | 3 | 38 | suma calculada sin cenizas |
| Cereal desayuno, salvado de trigo tipo bastoncitos | 3 | 38 | suma calculada sin cenizas |
| Cereal infantil para papilla | 3 | 38 | suma calculada sin cenizas |
| Churros | 3 | 40 | suma calculada sin cenizas |
| Empanaditas chinas (restaurant) | 3 | 40 | suma calculada sin cenizas |
| Galletitas de agua sin sal con chía y lino | 3 | 44 | suma calculada sin cenizas |
| Galletitas dulces hojaldradas | 3 | 44 | suma calculada sin cenizas |
| Galletitas dulces rellenas bañadas en chocolate | 3 | 44 | suma calculada sin cenizas |
| Galletitas dulces tipo Frutigran | 3 | 44 | suma calculada sin cenizas |
| Galletitas dulces, SIN TACC | 3 | 44 | suma calculada sin cenizas |
| Galletitas integrales sin sal | 3 | 46 | suma calculada sin cenizas |
| Grisines | 3 | 46 | suma calculada sin cenizas |
| Grisines sin sal | 3 | 46 | suma calculada sin cenizas |
| Madalenas | 3 | 48 | suma calculada sin cenizas |
| Madalenas fortificadas | 3 | 48 | suma calculada sin cenizas |
| Madalenas rellenas | 3 | 48 | suma calculada sin cenizas |
| Masa de tarta o empanada, integral | 3 | 50 | suma calculada sin cenizas |
| Masa de tarta, SIN TACC | 3 | 50 | suma calculada sin cenizas |
| Masas finas surtidas (panadería / confitería) | 3 | 50 | suma calculada sin cenizas |
| Milanesa de arroz, prefrita | 3 | 50 | suma calculada sin cenizas |
| Milanesa de soja, prefrita | 3 | 50 | suma calculada sin cenizas |
| Ñoquis preparados a partir de polvo premezcla | 3 | 50 | suma calculada sin cenizas |
| Ñoquis preparados a partir de polvo premezcla, SIN TACC | 3 | 50 | suma calculada sin cenizas |
| Pan blanco, tipo molde, lacteado | 3 | 52 | suma calculada sin cenizas |
| Pan de molde con salvado | 3 | 52 | suma calculada sin cenizas |
| Pan de molde con salvado sin sal | 3 | 52 | suma calculada sin cenizas |
| Pan de salvado con semillas | 3 | 52 | suma calculada sin cenizas |
| Pan rallado, SIN TACC | 3 | 54 | suma calculada sin cenizas |
| Panko (pan rallado japonés) | 3 | 54 | suma calculada sin cenizas |
| Polvo para preparar brownie | 3 | 56 | suma calculada sin cenizas |
| Porotos, enlatados | 3 | 56 | suma calculada sin cenizas |
| Premezcla para bizcochuelo, SIN TACC | 3 | 56 | suma calculada sin cenizas |
| Premezcla para panificados, pastas y postres, SIN TACC | 3 | 56 | suma calculada sin cenizas |
| Puflito | 3 | 56 | suma calculada sin cenizas |
| Quinoa inflada | 3 | 56 | suma calculada sin cenizas |
| Ravioles deshidratados, envasados, crudos | 3 | 56 | suma calculada sin cenizas |
| Ravioles frescos, artesanal, hervidos | 3 | 56 | suma calculada sin cenizas |
| Ravioles frescos, envasados, crudos | 3 | 56 | suma calculada sin cenizas |
| Soja texturizada | 3 | 58 | suma calculada sin cenizas |
| Sushi, PROMEDIO | 3 | 58 | suma calculada sin cenizas |
| Torta de manzana (panadería) | 3 | 60 | suma calculada sin cenizas |
| Tostadas de gluten | 3 | 60 | suma calculada sin cenizas |
| Tostadas de mesa | 3 | 60 | suma calculada sin cenizas |
| Tostadas integrales | 3 | 60 | suma calculada sin cenizas |
| Tostadas light | 3 | 60 | suma calculada sin cenizas |
| Tostadas sin sal | 3 | 60 | suma calculada sin cenizas |
| Tostaditas saladas, saborizadas, producto tipo copetín | 3 | 60 | suma calculada sin cenizas |
| Trigo inflado azucarado | 3 | 60 | suma calculada sin cenizas |
| Turrón de maní con oblea tipo golosina | 3 | 60 | suma calculada sin cenizas |
| Turrón tipo navideño | 3 | 60 | suma calculada sin cenizas |
| Tutuca | 3 | 60 | suma calculada sin cenizas |
| Alimento a base de leche entera y café, fortificado con calcio, varios sabores, listo para consumir | 4 | 62 | suma calculada sin cenizas |
| Bebida láctea parcialmente descremada fluida, baja en lactosa, fortificada con vitaminas A, D, B2, B9 y Zinc | 4 | 62 | suma calculada sin cenizas |
| Flan envasado listo para consumir | 4 | 62 | suma calculada sin cenizas |
| Flan envasado listo para consumir light | 4 | 62 | suma calculada sin cenizas |
| Leche descremada en polvo, tipo Nido Buen Día, fortificada con hierro y calcio | 4 | 62 | suma calculada sin cenizas |
| Leche descremada fluida, con 50% más de proteínas | 4 | 62 | suma calculada sin cenizas |
| Leche en polvo, 25% menos de grasas saturadas, fortificada con vitaminas A, D, C, calcio y zinc | 4 | 64 | suma calculada sin cenizas |
| Leche entera en polvo tipo Nido Fortigrow | 4 | 64 | suma calculada sin cenizas |
| Leche entera fluida, con CLA, fortificada con vitaminas A y D | 4 | 66 | suma calculada sin cenizas |
| Leche fórmula 0-12 meses, hipoalergénica, tipo Nutrilón HA, NAN HA, en polvo | 4 | 66 | suma calculada sin cenizas |
| Leche fórmula 0-12 meses, sin lactosa, en polvo | 4 | 66 | suma calculada sin cenizas |
| Leche fórmula antireflujo, en polvo | 4 | 66 | suma calculada sin cenizas |
| Leche fórmula etapa 3, en polvo | 4 | 66 | suma calculada sin cenizas |
| Leche fórmula etapa 3, sin lactosa, en polvo | 4 | 66 | suma calculada sin cenizas |
| Leche fórmula etapa 4, en polvo | 4 | 66 | suma calculada sin cenizas |
| Leche fórmula etapa 4, fluida | 4 | 68 | suma calculada sin cenizas |
| Leche fórmula inicio, en polvo | 4 | 68 | suma calculada sin cenizas |
| Leche fórmula inicio, fluida | 4 | 68 | suma calculada sin cenizas |
| Leche fórmula para prematuros etapa 1, fluida | 4 | 68 | suma calculada sin cenizas |
| Leche fórmula seguimiento, en polvo | 4 | 68 | suma calculada sin cenizas |
| Leche fórmula seguimiento, fluida | 4 | 68 | suma calculada sin cenizas |
| Leche fórmula, tipo Alfaré, en polvo | 4 | 68 | suma calculada sin cenizas |
| Leche fórmula, tipo Enfabebe Confort, en polvo | 4 | 68 | suma calculada sin cenizas |
| Leche fórmula, tipo GA1 Anamix Infant, en polvo | 4 | 68 | suma calculada sin cenizas |
| Leche fórmula, tipo Nutrilon Pepti junior HE, en polvo | 4 | 68 | suma calculada sin cenizas |
| Leche parcialmente descremada fluida, con Fitoesteroles y Ác. Grasos Omega 3, fortificada con calcio y vitaminas A, D y E | 4 | 70 | suma calculada sin cenizas |
| Leche parcialmente descremada, sabor chocolate o dulce de leche, fortificada con vitaminas A y D, lista para consumir | 4 | 70 | suma calculada sin cenizas |
| Leche seguimiento etapa 3, sabor vainilla | 4 | 70 | suma calculada sin cenizas |
| Leche semidescremada en polvo, deslactosada | 4 | 72 | suma calculada sin cenizas |
| Postre de leche bebible infantil | 4 | 72 | suma calculada sin cenizas |
| Postre de leche listo para consumir light | 4 | 72 | suma calculada sin cenizas |
| Postre de leche listo para consumir tipo Danonino | 4 | 72 | suma calculada sin cenizas |
| Postre de leche listo para consumir tipo Serenito | 4 | 72 | suma calculada sin cenizas |
| Probióticos descremados | 4 | 72 | suma calculada sin cenizas |
| Probióticos enteros | 4 | 72 | suma calculada sin cenizas |
| Yogur descremado con cereales | 5 | 74 | suma calculada sin cenizas |
| Yogur descremado con frutas | 5 | 74 | suma calculada sin cenizas |
| Yogur descremado con frutas y cereales | 5 | 74 | suma calculada sin cenizas |
| Yogur entero bebible saborizado | 5 | 74 | suma calculada sin cenizas |
| Yogur entero con cereales | 5 | 74 | suma calculada sin cenizas |
| Yogur entero con frutas | 5 | 74 | suma calculada sin cenizas |
| Queso en hebras light | 6 | 76 | suma calculada sin cenizas |
| Queso Fontina fundido light | 6 | 76 | suma calculada sin cenizas |
| Queso fresco sin sal | 6 | 76 | suma calculada sin cenizas |
| Queso porsalut sin sal light | 6 | 78 | suma calculada sin cenizas |
| Queso untable tipo Finlandia light | 6 | 80 | suma calculada sin cenizas |
| Queso untable tipo Tholem light | 6 | 80 | suma calculada sin cenizas |
| Hamburguesa de carne vacuna, industrializada, rebozada | 7 | 84 | suma calculada sin cenizas |
| Jamón cocido | 7 | 84 | suma calculada sin cenizas |
| Jamón crudo | 7 | 84 | suma calculada sin cenizas |
| Lomito ahumado | 7 | 86 | suma calculada sin cenizas |
| Paleta (fiambre) | 7 | 86 | suma calculada sin cenizas |
| Dorado, crudo | 9 | 95 | suma calculada sin cenizas |
| Langostino | 9 | 95 | suma calculada sin cenizas |
| Merluza, cruda | 9 | 97 | suma calculada sin cenizas |
| Merluza | 9 | 97 | suma calculada sin cenizas |
| Sardinas, enlatadas al natural | 9 | 99 | suma calculada sin cenizas |
| Aceite de canola | 10 | 100 | suma calculada sin cenizas |
| Dulce de membrillo light | 12 | 104 | suma calculada sin cenizas |
| Alfajor de arroz | 13 | 106 | suma calculada sin cenizas |
| Alfajor de chocolate | 13 | 106 | suma calculada sin cenizas |
| Alfajor de chocolate con relleno tipo mousse | 13 | 106 | suma calculada sin cenizas |
| Alfajor de dulce de leche | 13 | 106 | suma calculada sin cenizas |
| Alfajor de fruta | 13 | 106 | suma calculada sin cenizas |
| Alfajor light | 13 | 106 | suma calculada sin cenizas |
| Bananita con cobertura de chocolate | 13 | 106 | suma calculada sin cenizas |
| Barra de arroz rellena bañada | 13 | 106 | suma calculada sin cenizas |
| Barra de chocolate tipo Kinder | 13 | 106 | suma calculada sin cenizas |
| Bocadito con dulce de leche tipo Cabsha | 13 | 106 | suma calculada sin cenizas |
| Bombón tipo Bon O Bon | 13 | 106 | suma calculada sin cenizas |
| Cacao en polvo sin fortificar | 13 | 106 | suma calculada sin cenizas |
| Cacao en polvo tipo Nesquick | 13 | 106 | suma calculada sin cenizas |
| Caramelos masticables | 13 | 108 | suma calculada sin cenizas |
| Chocolate con maní | 13 | 108 | suma calculada sin cenizas |
| Chocolate light | 13 | 108 | suma calculada sin cenizas |
| Cubanito relleno | 13 | 108 | suma calculada sin cenizas |
| Garrapiñada de maní | 13 | 108 | suma calculada sin cenizas |
| Huevo de chocolate tipo Kinder | 13 | 108 | suma calculada sin cenizas |
| Lentejas de chocolate | 13 | 108 | suma calculada sin cenizas |
| Merengues / merenguitos | 13 | 110 | suma calculada sin cenizas |
| Minitorta bañada | 13 | 110 | suma calculada sin cenizas |
| Rhodesia | 13 | 110 | suma calculada sin cenizas |
| Tita | 13 | 110 | suma calculada sin cenizas |
| Margarina untable light | 14 | 112 | suma calculada sin cenizas |
| Chicharrón | 15 | 114 | suma calculada sin cenizas |
| Palitos salados | 15 | 114 | suma calculada sin cenizas |
| Snacks saborizados salados a base de maíz | 15 | 114 | suma calculada sin cenizas |
| Snacks saborizados salados a base de sémola de arroz, horneados, tipo Palitos de arroz / aros de cebolla | 15 | 114 | suma calculada sin cenizas |
| Aderezo para ensaladas light | 16 | 116 | suma calculada sin cenizas |
| Mayonesa | 16 | 116 | suma calculada sin cenizas |
| Mayonesa de soja | 16 | 116 | suma calculada sin cenizas |
| Salsa a base de tomate en tetra brick o sachet, lista para consumir (ej: pomarola, napolitana, con o sin verdeo, etc.) | 16 | 116 | suma calculada sin cenizas |
| Salsa chimichurri envasada | 16 | 116 | suma calculada sin cenizas |
| Salsa deshidratada varios sabores, polvo | 16 | 116 | suma calculada sin cenizas |
| Salsa Golf | 16 | 116 | suma calculada sin cenizas |
| Sopa crema instantánea preparada | 17 | 118 | suma calculada sin cenizas |
| Sopa crema preparada a partir de polvo premezcla light | 17 | 118 | suma calculada sin cenizas |
| Sopa crema preparada a partir de polvo premezcla sin sal light | 17 | 118 | suma calculada sin cenizas |
| Arroz con leche envasado listo para consumir | 18 | 120 | suma calculada sin cenizas |
| Helado de agua (heladería) | 18 | 120 | suma calculada sin cenizas |
| Helado de crema envasado | 18 | 120 | suma calculada sin cenizas |
| Helado envasado con cucurucho, PROMEDIO | 18 | 120 | suma calculada sin cenizas |
| Polvo para preparar helado | 18 | 120 | suma calculada sin cenizas |
| Polvo para preparar postre lácteo | 18 | 120 | suma calculada sin cenizas |
| Polvo para preparar postre lácteo, light | 18 | 120 | suma calculada sin cenizas |
| Agua saborizada Aquarius, varios sabores | 20 | 123 | suma calculada sin cenizas |
| Agua saborizada Awafrut, varios sabores | 20 | 123 | suma calculada sin cenizas |
| Agua saborizada con azúcar, PROMEDIO | 20 | 123 | suma calculada sin cenizas |
| Agua saborizada Levité, varios sabores | 20 | 123 | suma calculada sin cenizas |
| Agua saborizada tipo Sierra de los Padres, Manaos, otros | 20 | 123 | suma calculada sin cenizas |
| Amargo serrano | 20 | 123 | suma calculada sin cenizas |
| Bebida a base de soja sabor natural | 20 | 123 | suma calculada sin cenizas |
| Bebida a base de soja y jugo, varios sabores | 20 | 123 | suma calculada sin cenizas |
| Bebida a base de soja y jugo, varios sabores light | 20 | 123 | suma calculada sin cenizas |
| Gaseosa con azúcar, PROMEDIO | 20 | 123 | suma calculada sin cenizas |
| Gatorade, varios sabores | 20 | 123 | suma calculada sin cenizas |
| Jugo concentrado con azúcar, para diluir | 20 | 123 | suma calculada sin cenizas |
| Jugo congelado con azúcar en sachet | 20 | 123 | suma calculada sin cenizas |
| Jugo de fruta envasado, varios sabores | 20 | 123 | suma calculada sin cenizas |
| Jugo en polvo con azúcar | 20 | 123 | suma calculada sin cenizas |
| Powerade, varios sabores | 20 | 123 | suma calculada sin cenizas |
| Agua saborizada Flip light | 21 | 125 | suma calculada sin cenizas |
| Agua saborizada H2O, varios sabores | 21 | 125 | suma calculada sin cenizas |
| Agua saborizada Levité Cero, varios sabores light | 21 | 125 | suma calculada sin cenizas |
| Agua saborizada light, PROMEDIO | 21 | 125 | suma calculada sin cenizas |
| Agua saborizada We o Ser ligth | 21 | 125 | suma calculada sin cenizas |
| Amargo serrano light | 21 | 125 | suma calculada sin cenizas |
| Gaseosa light, PROMEDIO | 21 | 125 | suma calculada sin cenizas |
| Gatorade Zero, varios sabores (sin azúcar) | 21 | 125 | suma calculada sin cenizas |
| Jugo en polvo BC | 21 | 125 | suma calculada sin cenizas |
| Jugo tipo BC, varios sabores (alimento líquido dietético con 50% de jugo y pulpa) | 21 | 125 | suma calculada sin cenizas |
| Powerade Zero, varios sabores (sin azúcar) | 21 | 125 | suma calculada sin cenizas |
| Ananá Fizz | 22 | 127 | suma calculada sin cenizas |
| Aperitivo, tipo Gancia | 22 | 127 | suma calculada sin cenizas |
| Bebida energizante | 22 | 127 | suma calculada sin cenizas |
| Champagne | 22 | 127 | suma calculada sin cenizas |
| Chicha, bebida tradicional obtenida por fermentación del maíz | 22 | 127 | suma calculada sin cenizas |
| Fernet | 22 | 127 | suma calculada sin cenizas |
| Licor, PROMEDIO | 22 | 127 | suma calculada sin cenizas |
| Sidra | 22 | 127 | suma calculada sin cenizas |
| Vermouth | 22 | 127 | suma calculada sin cenizas |
| Capucchino preparado | 24 | 131 | suma calculada sin cenizas |
| McDonald's, BigMc | 25 | 133 | suma calculada sin cenizas |
| McDonald's, Cajita Feliz, Hamburguesa con queso Grill | 25 | 133 | suma calculada sin cenizas |
| McDonald's, Cajita Feliz, Mc Tostado | 25 | 133 | suma calculada sin cenizas |
| McDonald's, Cajita Feliz, McNuggets X4 | 25 | 133 | suma calculada sin cenizas |
| McDonald's, Cajita Feliz, Papas Kids | 25 | 133 | suma calculada sin cenizas |
| McDonald's, Cajita Feliz, Papas pequeñas | 25 | 133 | suma calculada sin cenizas |
| McDonald's, Cajita Feliz, Tomate cherry 50g | 25 | 133 | suma calculada sin cenizas |
| McDonald's, Club House | 25 | 133 | suma calculada sin cenizas |
| McDonald's, Clubhouse/ Guacamole/ Cryspi Onion BBQ con pollo crispy | 25 | 133 | suma calculada sin cenizas |
| McDonald's, Clubhouse/ Guacamole/ Cryspi Onion BBQ con pollo grill | 25 | 133 | suma calculada sin cenizas |
| McDonald's, Cono | 25 | 133 | suma calculada sin cenizas |
| McDonald's, Cuarto de Libra | 25 | 133 | suma calculada sin cenizas |
| McDonald's, Doble Cuarto de Libra con queso | 25 | 135 | suma calculada sin cenizas |
| McDonald's, Hamburguesa con queso | 25 | 135 | suma calculada sin cenizas |
| McDonald's, Mcnífica | 25 | 135 | suma calculada sin cenizas |
| McDonald's, McNuggets x 10 | 25 | 135 | suma calculada sin cenizas |
| McDonald's, McPollo Grill | 25 | 135 | suma calculada sin cenizas |
| McDonald's, Papas grandes | 25 | 135 | suma calculada sin cenizas |
| McDonald's, Papas medianas | 25 | 135 | suma calculada sin cenizas |
| McDonald's, Papas pequeñas | 25 | 135 | suma calculada sin cenizas |
| McDonald's, Pollo Jr. | 25 | 135 | suma calculada sin cenizas |
| McDonald's, Sundae chocolate | 25 | 135 | suma calculada sin cenizas |
| McDonald's, Sundae dulce de leche | 25 | 135 | suma calculada sin cenizas |
| McDonald's, Sundae frutilla | 25 | 135 | suma calculada sin cenizas |
| McDonald's, Triple Mac | 25 | 135 | suma calculada sin cenizas |

### Suma de macros fuera de 97–103 g (dentro de 90–110) (`SUMA_FUERA_97_103`, 68)

| Alimento | Tabla | Página | Detalle |
|---|---|---|---|
| Habas, cruda | 1 | 22 | suma de macros = 103,9 g |
| Habas, hervida | 1 | 22 | suma de macros = 103,9 g |
| Palta | 2 | 32 | suma de macros = 104 g |
| Anchi | 3 | 34 | suma de macros = 105,1 g |
| Avena, arrollada, cruda | 3 | 34 | suma de macros = 103,9 g |
| Barra de cereales, PROMEDIO | 3 | 36 | suma de macros = 91,2 g (sin cenizas) |
| Bizcochitos de grasa envasados | 3 | 36 | suma de macros = 108,7 g |
| Bizcochuelo preparado a partir de polvo premezcla | 3 | 36 | suma de macros = 96,6 g |
| Bollitos de anís | 3 | 36 | suma de macros = 108,7 g |
| Cereal desayuno, aritos sabor miel | 3 | 38 | suma de macros = 96,3 g (sin cenizas) |
| Cereal desayuno, copos azucarados, fortificados | 3 | 38 | suma de macros = 105,3 g (sin cenizas) |
| Cereal desayuno, copos de maíz sin azúcar, sin fortificar | 3 | 38 | suma de macros = 105,3 g (sin cenizas) |
| Cereal desayuno, salvado de trigo tipo bastoncitos | 3 | 38 | suma de macros = 94,4 g (sin cenizas) |
| Chipá preparado a partir de polvo premezcla | 3 | 40 | suma de macros = 103,7 g |
| Fideos frescos, al huevo, crudos | 3 | 40 | suma de macros = 103,3 g |
| Fideos secos integrales / fideos secos de sémola y harina de legumbres, crudos | 3 | 42 | suma de macros = 103,1 g |
| Fideos secos integrales / fideos secos de sémola y harina de legumbres, hervidos | 3 | 42 | suma de macros = 96,6 g |
| Galletitas de agua con girasol alto oleico | 3 | 44 | suma de macros = 106,7 g |
| Galletitas de agua con grasa vacuna | 3 | 44 | suma de macros = 108,1 g |
| Galletitas de agua light | 3 | 44 | suma de macros = 106,7 g |
| Galletitas de agua sin sal | 3 | 44 | suma de macros = 104,9 g |
| Galletitas de agua, PROMEDIO | 3 | 44 | suma de macros = 106,7 g |
| Galletitas dulces con chips de chocolate | 3 | 44 | suma de macros = 104,2 g |
| Galletitas dulces tipo Frutigran | 3 | 44 | suma de macros = 96,3 g (sin cenizas) |
| Galletitas tipo talitas o fajitas | 3 | 46 | suma de macros = 106,7 g |
| Grisines | 3 | 46 | suma de macros = 96,7 g (sin cenizas) |
| Grisines sin sal | 3 | 46 | suma de macros = 96,7 g (sin cenizas) |
| Harina de maíz, cruda | 3 | 46 | suma de macros = 96,9 g |
| Harina de trigo con levadura para pizza, cruda | 3 | 48 | suma de macros = 104,8 g |
| Masa de pizza, preparada a partir de polvo premezcla | 3 | 48 | suma de macros = 108,6 g |
| Masa de pizza, preparada a partir de polvo premezcla, SIN TACC | 3 | 50 | suma de macros = 108,6 g |
| Masa de tarta o empanadas light | 3 | 50 | suma de macros = 91,9 g |
| Masas finas surtidas (panadería / confitería) | 3 | 50 | suma de macros = 104,1 g (sin cenizas) |
| Ñoquis de papa frescos, artesanal, hervidos | 3 | 50 | suma de macros = 94,6 g |
| Ñoquis de papa, envasados, hervidos | 3 | 50 | suma de macros = 94,6 g |
| Pan de molde con salvado sin sal | 3 | 52 | suma de macros = 106,6 g (sin cenizas) |
| Pionono | 3 | 54 | suma de macros = 96,6 g |
| Polvo para preparar brownie | 3 | 56 | suma de macros = 103,2 g (sin cenizas) |
| Rosquete | 3 | 58 | suma de macros = 103,4 g |
| Soja texturizada | 3 | 58 | suma de macros = 93,9 g (sin cenizas) |
| Soja, porotos, crudos | 3 | 58 | suma de macros = 108,3 g |
| Leche entera fluida, con azúcar, lista para consumir | 4 | 66 | suma de macros = 104,8 g |
| Leche fórmula inicio, en polvo | 4 | 68 | suma de macros = 96,5 g (sin cenizas) |
| Leche fórmula para prematuros etapa 1, fluida | 4 | 68 | suma de macros = 95,5 g (sin cenizas) |
| Leche fórmula seguimiento, en polvo | 4 | 68 | suma de macros = 94,2 g (sin cenizas) |
| Leche fórmula, tipo Alfaré, en polvo | 4 | 68 | suma de macros = 96,8 g (sin cenizas) |
| Yogur entero bebible saborizado | 5 | 74 | suma de macros = 95,7 g (sin cenizas) |
| Queso Gruyére | 6 | 76 | suma de macros = 103,3 g |
| Jamón cocido | 7 | 84 | suma de macros = 96 g (sin cenizas) |
| Jamón crudo | 7 | 84 | suma de macros = 91,5 g (sin cenizas) |
| Milanesa de pollo, prefrita congelada | 7 | 86 | suma de macros = 94,9 g |
| Paleta (fiambre) | 7 | 86 | suma de macros = 96 g (sin cenizas) |
| Salchicha de viena light | 7 | 90 | suma de macros = 90 g |
| Huevo de gallina, yema, cruda | 8 | 93 | suma de macros = 103,6 g |
| Huevo de gallina, yema, hervida | 8 | 93 | suma de macros = 103,6 g |
| Calamar, crudo | 9 | 95 | suma de macros = 103,5 g |
| Glucosa | 12 | 104 | suma de macros = 105,1 g |
| Alfajor de maicena | 13 | 106 | suma de macros = 94,5 g |
| Cacao en polvo sin fortificar | 13 | 106 | suma de macros = 95,9 g (sin cenizas) |
| Caramelos masticables | 13 | 108 | suma de macros = 95,8 g (sin cenizas) |
| Margarina untable light | 14 | 112 | suma de macros = 95,1 g (sin cenizas) |
| Chicharrón | 15 | 114 | suma de macros = 94,4 g (sin cenizas) |
| Snacks saborizados salados a base de maíz | 15 | 114 | suma de macros = 107,5 g (sin cenizas) |
| Aceto balsámico | 16 | 116 | suma de macros = 94,4 g |
| Vinagre | 16 | 116 | suma de macros = 95 g |
| Jugo concentrado con azúcar, para diluir | 20 | 123 | suma de macros = 103,4 g (sin cenizas) |
| Chicha, bebida tradicional obtenida por fermentación del maíz | 22 | 127 | suma de macros = 103,6 g (sin cenizas) |
| Café instantáneo descafeinado (polvo o granulado para preparar) | 24 | 131 | suma de macros = 110 g |

### El título de la parte B dice otro número de tabla (`TITULO_B_DISTINTO`, 1)

| Alimento | Tabla | Página | Detalle |
|---|---|---|---|
| Tabla 16.B: Azúcares, mermeladas y dulces, vitaminas y minerales | 12 | 105 | el título de la parte B dice tabla 16; se usa la 12 de su parte A (p. 104) |

