// Gráficos SVG del informe antropométrico (HU-007). Solo dibujan: toda la geometría sale de
// packages/core (isak-report-charts.ts). Sin "server-only": los importa el PDF del informe.
import type { ComponentProps, ComponentType } from "react";
import { Circle, Line, Path, Rect, Svg, Text, View } from "@react-pdf/renderer";
import {
  REPORT_BODY_FIGURE,
  type CompositionBarsLayout,
  type GirthBarsLayout,
  type IsakTissueKey,
  type SomatochartLayout,
} from "@nutri-bot/core";
import { FONT_FAMILY } from "@/lib/pdf-common";
import {
  reportPdfColors,
  reportPdfFigureNeutral,
  reportPdfGridColor,
  reportPdfPreviousColor,
  reportPdfTissueColors,
  reportPdfTissueTextColors,
  reportPdfType,
  reportPdfZoneColors,
} from "@/lib/report-pdf-theme";

type Style = Exclude<ComponentProps<typeof View>["style"], unknown[] | undefined>;

/** `Text` de react-pdf dentro de `Svg`: el render soporta x, y y textAnchor, pero TextProps no los declara. */
type SvgTextProps = {
  x: number;
  y: number;
  textAnchor?: "start" | "middle" | "end";
  fill?: string;
  style?: Style;
  children: string;
};
const RawSvgText = Text as unknown as ComponentType<SvgTextProps>;
/** Dentro de `Svg` el texto no hereda la familia de la página (caía en Helvetica, sin "−"): se fija Inter. */
export function SvgText({ style, ...props }: SvgTextProps) {
  return <RawSvgText {...props} style={{ fontFamily: FONT_FAMILY, ...style }} />;
}

const legendStyles = {
  row: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 4 } as Style,
  item: { flexDirection: "row", alignItems: "center", gap: 4 } as Style,
  text: { fontSize: 7.5, color: reportPdfColors.muted, lineHeight: 1 } as Style,
};

function Legend({ items }: { items: Array<{ color: string; label: string; round?: boolean }> }) {
  return (
    <View style={legendStyles.row}>
      {items.map((i) => (
        <View key={i.label} style={legendStyles.item}>
          <View style={{ width: 7, height: 7, backgroundColor: i.color, borderRadius: i.round ? 3.5 : 1 }} />
          <Text style={legendStyles.text}>{i.label}</Text>
        </View>
      ))}
    </View>
  );
}

// ── Barras de perímetros ───────────────────────────────────────────────────

export function GirthBarsChart({
  layout,
  accent,
  legend,
}: {
  layout: GirthBarsLayout;
  accent: string;
  legend: { previous: string | null; current: string };
}) {
  const plotTop = layout.groups[0]?.bars[0]?.y ?? 0;
  const color = (s: "previous" | "current") => (s === "previous" ? reportPdfPreviousColor : accent);
  return (
    <View>
      <Svg width={layout.width} height={layout.height} viewBox={`0 0 ${layout.width} ${layout.height}`}>
        {layout.ticks.map((t) => (
          <Line key={`g${t.label}`} x1={t.x} y1={plotTop - 2} x2={t.x} y2={layout.axisY} stroke={reportPdfGridColor} strokeWidth={0.5} />
        ))}
        {layout.groups.map((g) => (
          <SvgText key={`l${g.key}`} x={g.labelX} y={g.labelY} textAnchor="end" fill={reportPdfColors.text} style={{ fontSize: 7 }}>
            {g.label}
          </SvgText>
        ))}
        {layout.groups.flatMap((g) =>
          g.bars.map((b) => (
            <Rect key={`b${g.key}${b.series}`} x={b.x} y={b.y} width={b.width} height={b.height} fill={color(b.series)} />
          )),
        )}
        {layout.groups.flatMap((g) =>
          g.bars.map((b) => (
            <SvgText
              key={`v${g.key}${b.series}`}
              x={b.valueX}
              y={b.valueY}
              textAnchor="start"
              fill={reportPdfColors.muted}
              style={{ fontSize: 6 }}
            >
              {b.valueLabel}
            </SvgText>
          )),
        )}
        <Line
          x1={layout.ticks[0]?.x ?? 0}
          y1={layout.axisY}
          x2={layout.ticks[layout.ticks.length - 1]?.x ?? layout.width}
          y2={layout.axisY}
          stroke={reportPdfColors.muted}
          strokeWidth={0.5}
        />
        {layout.ticks.map((t) => (
          <SvgText key={`t${t.label}`} x={t.x} y={layout.axisY + 9} textAnchor="middle" fill={reportPdfColors.muted} style={{ fontSize: 6 }}>
            {t.label}
          </SvgText>
        ))}
      </Svg>
      <Legend
        items={[
          ...(legend.previous ? [{ color: reportPdfPreviousColor, label: legend.previous }] : []),
          { color: accent, label: legend.current },
        ]}
      />
    </View>
  );
}

// ── Silueta con los % por zona ─────────────────────────────────────────────

const FIGURE_WIDTH = 190;
/** La figura (viewBox 100 × 220) va centrada; a los costados, los rótulos. */
const FIGURE_OFFSET_X = (FIGURE_WIDTH - REPORT_BODY_FIGURE.viewBox.width) / 2;
const FIGURE_TOP = 14;
const FIGURE_HEIGHT = FIGURE_TOP + REPORT_BODY_FIGURE.viewBox.height + 4;

export function BodyFigure({
  adipose,
  muscle,
  labels,
}: {
  adipose: Array<{ key: "upper" | "central" | "lower"; label: string; value: string }>;
  muscle: Array<{ key: "arm" | "thigh" | "calf"; label: string; value: string }>;
  labels: { adipose: string; muscle: string };
}) {
  const F = REPORT_BODY_FIGURE;
  const fx = (x: number) => FIGURE_OFFSET_X + x;
  const fy = (y: number) => FIGURE_TOP + y;
  const leftEdge = FIGURE_OFFSET_X - 4;
  const rightEdge = FIGURE_OFFSET_X + F.viewBox.width + 4;
  return (
    <Svg width={FIGURE_WIDTH} height={FIGURE_HEIGHT} viewBox={`0 0 ${FIGURE_WIDTH} ${FIGURE_HEIGHT}`}>
      <SvgText x={0} y={8} textAnchor="start" fill={reportPdfColors.text} style={{ fontSize: 7, fontWeight: 600 }}>
        {labels.adipose}
      </SvgText>
      <SvgText x={FIGURE_WIDTH} y={8} textAnchor="end" fill={reportPdfColors.text} style={{ fontSize: 7, fontWeight: 600 }}>
        {labels.muscle}
      </SvgText>
      <Circle cx={fx(F.head.cx)} cy={fy(F.head.cy)} r={F.head.r} fill={reportPdfFigureNeutral} />
      {F.parts.map((p) => (
        <Rect
          key={p.key}
          x={fx(p.x)}
          y={fy(p.y)}
          width={p.width}
          height={p.height}
          rx={p.rx}
          ry={p.rx}
          fill={reportPdfZoneColors[p.zone]}
          stroke="#FFFFFF"
          strokeWidth={0.8}
        />
      ))}
      {adipose.map((z) => {
        const y = fy(F.adiposeLabelY[z.key]);
        return [
          <Rect key={`s${z.key}`} x={0} y={y - 9} width={6} height={6} fill={reportPdfZoneColors[z.key]} />,
          <SvgText key={`l${z.key}`} x={9} y={y - 3.5} textAnchor="start" fill={reportPdfColors.muted} style={{ fontSize: 6.5 }}>
            {z.label}
          </SvgText>,
          <SvgText key={`v${z.key}`} x={0} y={y + 6} textAnchor="start" fill={reportPdfColors.text} style={{ fontSize: 7.5, fontWeight: 600 }}>
            {z.value}
          </SvgText>,
        ];
      })}
      {muscle.map((m) => {
        const l = F.muscleLabels[m.key];
        const y = fy(l.y);
        return [
          <Line
            key={`g${m.key}`}
            x1={fx(l.targetX)}
            y1={fy(l.targetY)}
            x2={rightEdge + 6}
            y2={y}
            stroke={reportPdfColors.muted}
            strokeWidth={0.5}
            strokeDasharray="1.5,1.5"
          />,
          <Circle key={`c${m.key}`} cx={fx(l.targetX)} cy={fy(l.targetY)} r={1.5} fill={reportPdfColors.muted} />,
          <SvgText key={`l${m.key}`} x={FIGURE_WIDTH} y={y - 3.5} textAnchor="end" fill={reportPdfColors.muted} style={{ fontSize: 6.5 }}>
            {m.label}
          </SvgText>,
          <SvgText key={`v${m.key}`} x={FIGURE_WIDTH} y={y + 6} textAnchor="end" fill={reportPdfColors.text} style={{ fontSize: 7.5, fontWeight: 600 }}>
            {m.value}
          </SvgText>,
        ];
      })}
      {/* Separador fino entre rótulos y figura, sólo como guía visual. */}
      <Line x1={leftEdge} y1={fy(30)} x2={leftEdge} y2={fy(F.viewBox.height)} stroke={reportPdfGridColor} strokeWidth={0.5} />
    </Svg>
  );
}

// ── Composición: barras apiladas al 100 % ──────────────────────────────────

const TISSUE_LEGEND: Array<{ key: IsakTissueKey; label: string }> = [
  { key: "adipose", label: "Adiposo" },
  { key: "muscle", label: "Muscular" },
  { key: "bone", label: "Óseo" },
  { key: "residual", label: "Residual" },
];

export function CompositionBarsChart({ layout }: { layout: CompositionBarsLayout }) {
  return (
    <View>
      <Svg width={layout.width} height={layout.height} viewBox={`0 0 ${layout.width} ${layout.height}`}>
        {layout.rows.map((row) => [
          <SvgText key={`l${row.series}`} x={0} y={row.labelY} textAnchor="start" fill={reportPdfColors.text} style={{ fontSize: 7.5 }}>
            {row.label}
          </SvgText>,
          ...(row.segments
            ? row.segments.flatMap((s) => [
                <Rect key={`r${row.series}${s.key}`} x={s.x} y={s.y} width={s.width} height={s.height} fill={reportPdfTissueColors[s.key]} />,
                ...(s.label
                  ? [
                      <SvgText
                        key={`t${row.series}${s.key}`}
                        x={s.labelX}
                        y={s.labelY}
                        textAnchor="middle"
                        fill={reportPdfTissueTextColors[s.key]}
                        style={{ fontSize: 7, fontWeight: 500 }}
                      >
                        {s.label}
                      </SvgText>,
                    ]
                  : []),
              ])
            : [
                <SvgText key={`n${row.series}`} x={row.noDataX} y={row.noDataY} textAnchor="start" fill={reportPdfColors.muted} style={{ fontSize: 7.5 }}>
                  Sin dato
                </SvgText>,
              ]),
        ])}
      </Svg>
      <Legend items={TISSUE_LEGEND.map((t) => ({ color: reportPdfTissueColors[t.key], label: t.label }))} />
    </View>
  );
}

// ── Somatocarta ────────────────────────────────────────────────────────────

export function SomatochartPdf({
  layout,
  accent,
  legend,
  missingNote,
}: {
  layout: SomatochartLayout;
  accent: string;
  legend: { previous: string | null; current: string };
  missingNote: string | null;
}) {
  const { plot, points } = layout;
  return (
    <View style={{ alignItems: "center" }}>
      <Svg width={layout.width} height={layout.height} viewBox={`0 0 ${layout.width} ${layout.height}`}>
        {layout.gridX.map((g) => (
          <Line key={`gx${g.label}`} x1={g.x} y1={plot.top} x2={g.x} y2={plot.bottom} stroke={reportPdfGridColor} strokeWidth={0.5} strokeDasharray="2,2" />
        ))}
        {layout.gridY.map((g) => (
          <Line key={`gy${g.label}`} x1={plot.left} y1={g.y} x2={plot.right} y2={g.y} stroke={reportPdfGridColor} strokeWidth={0.5} strokeDasharray="2,2" />
        ))}
        {layout.gridX.map((g) => (
          <SvgText key={`tx${g.label}`} x={g.x} y={plot.bottom + 8} textAnchor="middle" fill={reportPdfColors.muted} style={{ fontSize: 5.5 }}>
            {g.label}
          </SvgText>
        ))}
        {layout.gridY.map((g) => (
          <SvgText key={`ty${g.label}`} x={plot.left - 3} y={g.y + 2} textAnchor="end" fill={reportPdfColors.muted} style={{ fontSize: 5.5 }}>
            {g.label}
          </SvgText>
        ))}
        <Path d={layout.contourPath} fill="none" stroke={reportPdfColors.text} strokeWidth={0.9} />
        {layout.axes.map((a, i) => (
          <Line key={`a${i}`} x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2} stroke={reportPdfColors.muted} strokeWidth={0.6} />
        ))}
        {layout.vertexLabels.map((l) => (
          <SvgText key={l.text} x={l.x} y={l.y} textAnchor={l.anchor} fill={reportPdfColors.text} style={{ fontSize: 7, fontWeight: 600 }}>
            {l.text}
          </SvgText>
        ))}
        {points.previous ? (
          <Circle cx={points.previous.cx} cy={points.previous.cy} r={3.5} fill={reportPdfPreviousColor} stroke="#FFFFFF" strokeWidth={0.8} />
        ) : null}
        {points.current ? (
          <Circle cx={points.current.cx} cy={points.current.cy} r={4} fill={accent} stroke="#FFFFFF" strokeWidth={0.8} />
        ) : null}
      </Svg>
      <Legend
        items={[
          ...(legend.previous && points.previous ? [{ color: reportPdfPreviousColor, label: legend.previous, round: true }] : []),
          ...(points.current ? [{ color: accent, label: legend.current, round: true }] : []),
        ]}
      />
      {missingNote ? (
        <Text style={{ fontSize: reportPdfType.caption.fontSize, color: reportPdfColors.muted, marginTop: 4 }}>{missingNote}</Text>
      ) : null}
    </View>
  );
}
