# Tablas LMS de la OMS (HU-008)

Datos de referencia de crecimiento que usa `packages/core/src/growth-reference.ts` para el
diagnóstico de pacientes de 5 a 17 años:

- **IMC para la edad** (`BMI_FOR_AGE`) y **talla para la edad** (`HEIGHT_FOR_AGE`), por sexo;
- parámetros **L, M, S** por mes cumplido, de 60 a 228 meses (169 filas por tabla).

| Archivo | Qué es |
|---|---|
| `who-lms-data.ts` | **GENERADO.** L, M y S por indicador, sexo y mes, más la lista de fuentes (`WHO_LMS_SOURCES`). Lo usa el código de producción. |
| `who-sd-columns.test-data.ts` | **GENERADO.** Columnas de DE publicadas por la OMS (−3 a +3, y ±4 en IMC/E 2007). Solo lo usan los tests, para comprobar que L, M y S reproducen la tabla oficial. |

**No se editan a mano.** Se regeneran con los scripts de `packages/core/scripts/who/`.

## Origen

- **Meses 61 a 228:** OMS 2007, *Growth reference data for 5–19 years*, tablas "z-scores
  expanded" (una fila por mes).
  - IMC/E: <https://www.who.int/tools/growth-reference-data-for-5to19-years/indicators/bmi-for-age>
  - T/E: <https://www.who.int/tools/growth-reference-data-for-5to19-years/indicators/height-for-age>
- **Mes 60:** OMS 2006, *Child Growth Standards* (patrones de 0 a 5 años), tablas de 2 a 5 años.
  Solo se toma la fila del mes 60.
  - IMC/E: <https://www.who.int/toolkits/child-growth-standards/standards/body-mass-index-for-age-bmi-for-age>
  - Talla/E: <https://www.who.int/tools/child-growth-standards/standards/length-height-for-age>

**Por qué el mes 60 sale de la OMS 2006 (D2 de la HU):** las tablas de la OMS 2007 empiezan en el
mes 61. Un chico que cumplió 5 años justo (60 meses cumplidos) ya es paciente pediátrico, y la OMS
empalma la referencia 2007 con los patrones 2006 en ese punto. En esa fila la OMS publica las DE
con 1 decimal, por eso la tolerancia de la verificación es 0,051 y no 0,0006.

Fecha de descarga: **2026-09-24**.

| # | Indicador · sexo | Ref. | URL | SHA-256 |
|---|---|---|---|---|
| 1 | IMC/E · niños | 2007 | `https://cdn.who.int/media/docs/default-source/child-growth/growth-reference-5-19-years/bmi-for-age-(5-19-years)/bmi-boys-z-who-2007-exp.xlsx?sfvrsn=a84bca93_2` | `0a60849673f34a06b8e2fe4defe5d00348de687b6c9fce0278f1525fff89eb6d` |
| 2 | IMC/E · niñas | 2007 | `https://cdn.who.int/media/docs/default-source/child-growth/growth-reference-5-19-years/bmi-for-age-(5-19-years)/bmi-girls-z-who-2007-exp.xlsx?sfvrsn=79222875_2` | `66f5c6284b44579ad6135fc639f22c09e36fe5a695b04390377113f6a00deb72` |
| 3 | T/E · niños | 2007 | `https://cdn.who.int/media/docs/default-source/child-growth/growth-reference-5-19-years/height-for-age-(5-19-years)/hfa-boys-z-who-2007-exp.xlsx?sfvrsn=7fa263d_2` | `d78fa8cafcab77dcb5f03d71506d92bdcb28f89c642816b6bb0eef466b007466` |
| 4 | T/E · niñas | 2007 | `https://cdn.who.int/media/docs/default-source/child-growth/growth-reference-5-19-years/height-for-age-(5-19-years)/hfa-girls-z-who-2007-exp.xlsx?sfvrsn=79d310ee_2` | `df07ee16d3d2916569f1d869b7c874d7b880a41321d871215ed0254cb16679b3` |
| 5 | IMC/E · niños, 2–5 años | 2006 | `https://cdn.who.int/media/docs/default-source/child-growth/child-growth-standards/indicators/body-mass-index-for-age/bmi_boys_2-to-5-years_zscores.xlsx?sfvrsn=73010c9b_5` | `874063e82b4592e4d2dc8b7534861d759541548abe38269fba50ba3861e9aff1` |
| 6 | IMC/E · niñas, 2–5 años | 2006 | `https://cdn.who.int/media/docs/default-source/child-growth/child-growth-standards/indicators/body-mass-index-for-age/bmi_girls_2-to-5-years_zscores.xlsx?sfvrsn=452aca36_7` | `9e27264b319e9290fc32b7896894da6c5b41b4f471695f2e13016cae8f329973` |
| 7 | Talla/E · niños, 2–5 años | 2006 | `https://cdn.who.int/media/docs/default-source/child-growth/child-growth-standards/indicators/length-height-for-age/lhfa_boys_2-to-5-years_zscores.xlsx?sfvrsn=17e5ad91_9` | `a44ed06039e0a9dd6920e4a4d928395c541c9732662e49eacd489d2194ccc80d` |
| 8 | Talla/E · niñas, 2–5 años | 2006 | `https://cdn.who.int/media/docs/default-source/child-growth/child-growth-standards/indicators/length-height-for-age/lhfa_girls_2-to-5-years_zscores.xlsx?sfvrsn=2ec187b9_11` | `a976c56a6d36885cc32bf77c5539ca066e396ef2adad06011cd71d9eb0f0eb5c` |

Los `.xlsx` **no se versionan**: se bajan a una carpeta fuera del repo.

## Verificación que hace el script

`build-who-lms.ts` no escribe nada si falla alguno de estos chequeos:

- el SHA-256 de cada archivo es el de la tabla de arriba;
- OMS 2007: 168 filas contiguas (meses 61 a 228); OMS 2006: exactamente la fila del mes 60;
- en cada fila, las DE publicadas (−3 a +3) cierran con la fórmula LMS
  `M·(1 + L·S·z)^(1/L)`, con error ≤ 0,0006 (2007) o ≤ 0,051 (mes 60, 2006);
- IMC/E 2007: `SD4 = SD3 + (SD3 − SD2)` y `SD4neg = SD3neg − (SD2neg − SD3neg)` (la extensión de
  la OMS para Z extremas), con error ≤ 0,0011;
- talla para la edad: `L = 1` en todas las filas.

## Licencia y uso

Son datos publicados por la Organización Mundial de la Salud para uso clínico y de salud pública.
Se usan sin modificar, citando la fuente: *WHO Growth reference data for 5–19 years (2007)* y
*WHO Child Growth Standards (2006)*.

## Cómo regenerar

Desde la raíz del repo:

```bash
bash packages/core/scripts/who/download-who-lms.sh "$TMPDIR/who"
npx tsx packages/core/scripts/who/build-who-lms.ts "$TMPDIR/who"
git diff --exit-code packages/core/src/who/   # sin cambios si la OMS no tocó los archivos
```

Si la OMS cambió un archivo, el script corta con "El archivo de la OMS cambió: revisar el origen y
actualizar el hash a conciencia". Nunca se escriben valores a mano ni se copian de otra fuente.
