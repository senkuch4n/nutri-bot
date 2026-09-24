#!/usr/bin/env bash
# Baja las 8 tablas LMS de la OMS (HU-008) a <carpeta>, fuera del repo.
# Uso: bash packages/core/scripts/who/download-who-lms.sh <carpeta>
# Si curl falla (sin red, 404) termina con error: nunca se inventan valores.
# Los hashes se verifican en build-who-lms.ts.
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Uso: $0 <carpeta>" >&2
  exit 2
fi

dest="$1"
mkdir -p "$dest"

urls=(
  "https://cdn.who.int/media/docs/default-source/child-growth/growth-reference-5-19-years/bmi-for-age-(5-19-years)/bmi-boys-z-who-2007-exp.xlsx?sfvrsn=a84bca93_2"
  "https://cdn.who.int/media/docs/default-source/child-growth/growth-reference-5-19-years/bmi-for-age-(5-19-years)/bmi-girls-z-who-2007-exp.xlsx?sfvrsn=79222875_2"
  "https://cdn.who.int/media/docs/default-source/child-growth/growth-reference-5-19-years/height-for-age-(5-19-years)/hfa-boys-z-who-2007-exp.xlsx?sfvrsn=7fa263d_2"
  "https://cdn.who.int/media/docs/default-source/child-growth/growth-reference-5-19-years/height-for-age-(5-19-years)/hfa-girls-z-who-2007-exp.xlsx?sfvrsn=79d310ee_2"
  "https://cdn.who.int/media/docs/default-source/child-growth/child-growth-standards/indicators/body-mass-index-for-age/bmi_boys_2-to-5-years_zscores.xlsx?sfvrsn=73010c9b_5"
  "https://cdn.who.int/media/docs/default-source/child-growth/child-growth-standards/indicators/body-mass-index-for-age/bmi_girls_2-to-5-years_zscores.xlsx?sfvrsn=452aca36_7"
  "https://cdn.who.int/media/docs/default-source/child-growth/child-growth-standards/indicators/length-height-for-age/lhfa_boys_2-to-5-years_zscores.xlsx?sfvrsn=17e5ad91_9"
  "https://cdn.who.int/media/docs/default-source/child-growth/child-growth-standards/indicators/length-height-for-age/lhfa_girls_2-to-5-years_zscores.xlsx?sfvrsn=2ec187b9_11"
)

for url in "${urls[@]}"; do
  base="${url%%\?*}"
  file="${base##*/}"
  echo "Bajando ${file}…"
  curl -fsSL -A "Mozilla/5.0" -o "${dest}/${file}" "${url}"
done

shasum -a 256 "${dest}"/*.xlsx
