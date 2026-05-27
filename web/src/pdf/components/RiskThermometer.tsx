// Single-row thermometer placing the building's |velocity_anomaly| on a
// 0 → 12+ mm/v gradient bar. One vertical marker line, one caption row.
// Earlier version stacked four band-labels above and four band-labels
// below — react-pdf SVG packs everything onto the same baseline and the
// labels overlapped. The simplified layout removes the chrome and keeps
// only the signal: a coloured bar + a single positional marker.

import { Svg, Rect, Line, Text as SvgText, G } from '@react-pdf/renderer'
import { colors } from '../styles/theme'

interface Props {
  anomalyMmY: number | null
  width?: number
  height?: number
}

// Scale: 0 -> 12 mm/y absolute anomaly (anything 10+ = urgent).
const MAX = 12
const BANDS = [
  { lo: 0,  hi: 2,   color: colors.riskStable },
  { lo: 2,  hi: 5,   color: colors.riskMonitor },
  { lo: 5,  hi: 10,  color: colors.riskAttention },
  { lo: 10, hi: MAX, color: colors.riskUrgent },
] as const

export default function RiskThermometer({ anomalyMmY, width = 480, height = 70 }: Props) {
  const padL = 12
  const padR = 12
  const barY = 14
  const barH = 18
  const innerW = width - padL - padR
  const xOf = (v: number) => padL + (Math.max(0, Math.min(MAX, v)) / MAX) * innerW

  const abs = anomalyMmY == null ? null : Math.abs(anomalyMmY)
  const markerX = abs == null ? null : xOf(abs)

  return (
    <Svg width={width} height={height}>
      {/* Coloured bands as a continuous bar. */}
      {BANDS.map((b) => (
        <Rect
          key={b.lo}
          x={xOf(b.lo)}
          y={barY}
          width={xOf(b.hi) - xOf(b.lo)}
          height={barH}
          fill={b.color}
          opacity={0.9}
        />
      ))}

      {/* End-cap labels in ASCII so WinAnsi-encoded Helvetica renders them. */}
      <SvgText x={padL} y={barY - 3} style={{ fontSize: 8 }} fill={colors.textDim} textAnchor="start">
        0 mm/v
      </SvgText>
      <SvgText
        x={width - padR}
        y={barY - 3}
        style={{ fontSize: 8 }}
        fill={colors.textDim}
        textAnchor="end"
      >
        yli 12 mm/v
      </SvgText>

      {/* Marker + caption — single vertical line, one short text below. */}
      {markerX != null && abs != null && (
        <G>
          <Line
            x1={markerX}
            x2={markerX}
            y1={barY - 4}
            y2={barY + barH + 4}
            stroke={colors.text}
            strokeWidth={1.5}
          />
          <SvgText
            x={markerX}
            y={barY + barH + 16}
            style={{ fontSize: 9 }}
            fill={colors.text}
            textAnchor="middle"
          >
            {`Tämä kohde: ${abs.toFixed(1)} mm/v`}
          </SvgText>
        </G>
      )}
    </Svg>
  )
}
