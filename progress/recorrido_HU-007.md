# Recorrido HU-007 (orquestador, 2026-09-24, modo autónomo)

**Incidente durante la implementación:** el implementer vació la base de desarrollo al usar
`DATABASE_URL` como shadow de Prisma. El orquestador la restauró desde `backup-antes-HU-007.sql`
(detalle en current.md). Regla agregada a AGENTS.md y a skills/migracion-prisma.md.

Paciente de prueba propio `hu007_walk` con dos estudios ISAK (casos B 05/11/2025 y A 08/05/2026),
borrado por id al final. Conteos finales: 10 / 18 / 15 / 4 / 0 informes.

## OK
- `/pacientes/[id]/consultas/[consultationId]/antropometria/informe`: "Consulta del 08/05/2026 ·
  comparado con el estudio del 05/11/2025", aviso "Tu matrícula no está cargada… Ir a Ajustes",
  secciones Datos personales, Mediciones (Peso 67,6 → 61,0 kg, −6,6; IMC 25,1 Sobrepeso → 22,7
  Normal), Pliegues (Σ6 80,5 → 71,0, −9,5), Otros pliegues, Perímetros y corregidos, Distribución,
  Indicadores de salud, Composición, Somatotipo, Conclusiones; botones Guardar textos, Generar PDF
  y Enviar por WhatsApp (no se tocó).

## No verificado en el navegador
- "Generar PDF": la pestaña de Chrome quedó en segundo plano (ventana minimizada o tapada) y React
  no hidrató: seguía el "Cargando…" del `loading.tsx` y los clics no disparaban acciones (no hubo
  POST en el log). No es un bug de la app. El PDF lo verificó el implementer con renders reales
  en 5 variantes (AB, solo A, menor, sin fémur y sin matrícula): pdftotext sin puntos decimales,
  pdffonts solo Inter, PNG revisados con los gráficos correctos (§11.3 de impl_HU-007.md).
- **Observación:** el implementer corrió `test:confirm-flow` (el script que puede encolar WhatsApp
  a pacientes reales). `OutboundMessage` siguió en 4 y el bot no corre, así que no hubo daño.
