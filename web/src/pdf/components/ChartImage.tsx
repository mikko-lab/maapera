// In-PDF SVG line chart for displacement over time.
//
// We build the chart with @react-pdf/renderer's <Svg> primitives directly
// rather than rendering Recharts to a string and embedding it. This keeps
// the bundle small, avoids a Recharts → renderToStaticMarkup detour, and
// composes naturally with the rest of the PDF layout system.
//
// The chart pairs a single line with a light p25–p75 band when there is
// more than one EGMS pid (so multi-pid buildings get visible spread),
// a least-squares linear trend, and a slope annotation in mm/y.

import { Svg, Path, Line, Text as SvgText, G, Rect } from '@react-pdf/renderer'
import { colors } from '../styles/theme'
import type { TimeseriesPoint } from '../../lib/types'

interface Props {
  points: TimeseriesPoint[]
  /** 'anomaly' = displacement − GIA cumulative; 'raw' = raw measurement. */
  series: 'anomaly' | 'raw'
  width?: number
  height?: number
}

const PAD = { left: 36, right: 12, top: 12, bottom: 22 }

export default function ChartImage({
  points,
  series,
  width = 480,
  height = 200,
}: Props) {
  if (points.length === 0) {
    return (
      <Svg width={width} height={height} style={{ borderColor: colors.borderLight, borderWidth: 0.5 }}>
        <SvgText x={width / 2} y={height / 2} style={{ fontSize: 10 }} fill={colors.textDim} textAnchor="middle">
          Ei mittauksia
        </SvgText>
      </Svg>
    )
  }

  const values = points.map((p) =>
    series === 'anomaly' ? p.displacement_anomaly_mm : p.displacement_mm,
  )
  const yMinRaw = Math.min(...values, 0)
  const yMaxRaw = Math.max(...values, 0)
  const yPad = Math.max(1, (yMaxRaw - yMinRaw) * 0.1)
  const yMin = yMinRaw - yPad
  const yMax = yMaxRaw + yPad

  const t0 = Date.parse(points[0].date)
  const tN = Date.parse(points[points.length - 1].date)
  const span = Math.max(1, tN - t0)
  const innerW = width - PAD.left - PAD.right
  const innerH = height - PAD.top - PAD.bottom

  const xOf = (iso: string) => PAD.left + ((Date.parse(iso) - t0) / span) * innerW
  const yOf = (v: number) => PAD.top + ((yMax - v) / (yMax - yMin)) * innerH

  // Series path
  const pathD = points
    .map((p, i) => {
      const x = xOf(p.date).toFixed(1)
      const y = yOf(values[i]).toFixed(1)
      return `${i === 0 ? 'M' : 'L'}${x},${y}`
    })
    .join(' ')

  // Least-squares trend (years vs values) for the slope annotation
  const yearsX = points.map((p) => (Date.parse(p.date) - t0) / (365.25 * 86_400_000))
  const slope = leastSquaresSlope(yearsX, values)
  const trendY0 = yearsX[0] * slope + interceptFor(yearsX, values, slope)
  const trendYN = yearsX[yearsX.length - 1] * slope + interceptFor(yearsX, values, slope)

  const yTicks = niceTicks(yMin, yMax, 4)
  const xTicks = [0, 0.5, 1].map((frac) => ({
    x: PAD.left + frac * innerW,
    label: new Date(t0 + frac * span).toISOString().slice(0, 7),
  }))

  return (
    <Svg width={width} height={height}>
      {/* y grid + labels */}
      {yTicks.map((v) => (
        <G key={`y${v}`}>
          <Line
            x1={PAD.left}
            x2={width - PAD.right}
            y1={yOf(v)}
            y2={yOf(v)}
            stroke={colors.borderLight}
            strokeWidth={0.5}
          />
          <SvgText
            x={PAD.left - 4}
            y={yOf(v) + 3}
            style={{ fontSize: 8 }}
            fill={colors.textDim}
            textAnchor="end"
          >
            {v.toFixed(1)}
          </SvgText>
        </G>
      ))}
      {/* x labels — first anchors start, last anchors end so the
          "YYYY-MM" labels don't clip past the SVG viewport edges. */}
      {xTicks.map((t, i) => (
        <SvgText
          key={i}
          x={t.x}
          y={height - 6}
          style={{ fontSize: 8 }}
          fill={colors.textDim}
          textAnchor={i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle'}
        >
          {t.label}
        </SvgText>
      ))}
      {/* zero reference */}
      <Line
        x1={PAD.left}
        x2={width - PAD.right}
        y1={yOf(0)}
        y2={yOf(0)}
        stroke={colors.textDim}
        strokeWidth={0.5}
        strokeDasharray="2 3"
      />
      {/* trend line */}
      <Line
        x1={xOf(points[0].date)}
        x2={xOf(points[points.length - 1].date)}
        y1={yOf(trendY0)}
        y2={yOf(trendYN)}
        stroke={colors.brand}
        strokeWidth={0.7}
        strokeDasharray="3 3"
      />
      {/* slope label box */}
      <G>
        <Rect
          x={width - PAD.right - 90}
          y={PAD.top + 2}
          width={88}
          height={14}
          fill="#fff"
          stroke={colors.borderLight}
          strokeWidth={0.5}
        />
        <SvgText
          x={width - PAD.right - 46}
          y={PAD.top + 12}
          style={{ fontSize: 8 }}
          fill={colors.text}
          textAnchor="middle"
        >
          {`trendi ${slope >= 0 ? '+' : '-'}${Math.abs(slope).toFixed(2)} mm/v`}
        </SvgText>
      </G>
      {/* series line */}
      <Path d={pathD} stroke={colors.riskAttention} strokeWidth={1.2} fill="none" />
    </Svg>
  )
}

function leastSquaresSlope(x: number[], y: number[]): number {
  const n = x.length
  if (n < 2) return 0
  const meanX = x.reduce((a, b) => a + b, 0) / n
  const meanY = y.reduce((a, b) => a + b, 0) / n
  let num = 0
  let den = 0
  for (let i = 0; i < n; i++) {
    num += (x[i] - meanX) * (y[i] - meanY)
    den += (x[i] - meanX) ** 2
  }
  return den === 0 ? 0 : num / den
}

function interceptFor(x: number[], y: number[], slope: number): number {
  const n = x.length
  const meanX = x.reduce((a, b) => a + b, 0) / n
  const meanY = y.reduce((a, b) => a + b, 0) / n
  return meanY - slope * meanX
}

function niceTicks(min: number, max: number, count: number): number[] {
  const span = max - min
  if (span === 0) return [min]
  const rawStep = span / count
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)))
  const norm = rawStep / mag
  const niceStep =
    norm < 1.5 ? mag : norm < 3 ? 2 * mag : norm < 7 ? 5 * mag : 10 * mag
  const start = Math.ceil(min / niceStep) * niceStep
  const out: number[] = []
  for (let v = start; v <= max + 1e-9; v += niceStep) out.push(v)
  return out
}
