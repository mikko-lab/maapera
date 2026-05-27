// Minimal SVG line chart for per-building displacement time series.
//
// We intentionally avoid a charting library at this stage (Recharts pulls
// in ~120 KB and is overkill for one line + axes). A hand-rolled SVG
// keeps the bundle lean and stays trivially auditable for accessibility.
//
// The chart pairs a visible line with a hidden data table for screen
// readers, satisfying WCAG 1.1.1 (text alternative) for the visualisation.

import { useMemo } from 'react'
import type { TimeseriesPoint } from '../../lib/types'

interface Props {
  points: TimeseriesPoint[]
  /** 'anomaly' = displacement minus cumulative GIA baseline (headline);
   *  'raw'     = raw EGMS displacement (audit view).               */
  series: 'anomaly' | 'raw'
}

const WIDTH = 520
const HEIGHT = 220
const PAD_L = 44
const PAD_R = 12
const PAD_T = 12
const PAD_B = 28

export default function TimeseriesChart({ points, series }: Props) {
  const { path, xTicks, yTicks, viewBox, ariaLabel, table } = useMemo(
    () => buildChart(points, series),
    [points, series],
  )

  if (points.length === 0) {
    return (
      <p className="ts-empty" role="status">
        Ei mittauspisteitä tälle rakennukselle.
      </p>
    )
  }

  return (
    <figure className="ts-chart" aria-label={ariaLabel}>
      <svg
        viewBox={viewBox}
        width="100%"
        height="220"
        role="img"
        focusable="false"
      >
        {/* Y-axis grid + labels */}
        {yTicks.map((t) => (
          <g key={`y${t.value}`}>
            <line
              x1={PAD_L}
              x2={WIDTH - PAD_R}
              y1={t.y}
              y2={t.y}
              stroke="rgba(255,255,255,.08)"
            />
            <text
              x={PAD_L - 6}
              y={t.y + 4}
              fontSize="11"
              textAnchor="end"
              fill="var(--color-text-dim, #999)"
            >
              {t.label}
            </text>
          </g>
        ))}
        {/* X-axis date labels */}
        {xTicks.map((t) => (
          <text
            key={`x${t.x}`}
            x={t.x}
            y={HEIGHT - 8}
            fontSize="11"
            textAnchor="middle"
            fill="var(--color-text-dim, #999)"
          >
            {t.label}
          </text>
        ))}
        {/* Zero reference line */}
        <line
          x1={PAD_L}
          x2={WIDTH - PAD_R}
          y1={yZeroY(points, series)}
          y2={yZeroY(points, series)}
          stroke="rgba(255,255,255,.25)"
          strokeDasharray="3 3"
        />
        {/* Main line */}
        <path
          d={path}
          fill="none"
          stroke="var(--color-accent, #60a5fa)"
          strokeWidth={2}
        />
      </svg>
      <figcaption className="ts-caption">
        {series === 'anomaly'
          ? 'Poikkeama alueellisesta GIA-baselinesta (mm)'
          : 'Raaka pystysuuntainen siirtymä (mm)'}
        {' '}· {points.length} havaintoa
      </figcaption>
      <details className="ts-table-toggle">
        <summary>Näytä datataulukkona</summary>
        <table className="ts-table">
          <thead>
            <tr>
              <th scope="col">Päivämäärä</th>
              <th scope="col">{series === 'anomaly' ? 'Poikkeama (mm)' : 'Siirtymä (mm)'}</th>
            </tr>
          </thead>
          <tbody>
            {table.map((row) => (
              <tr key={row.date}>
                <td>{row.date}</td>
                <td>{row.value.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  )
}

function buildChart(points: TimeseriesPoint[], series: 'anomaly' | 'raw') {
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

  const xOf = (iso: string) =>
    PAD_L + ((Date.parse(iso) - t0) / span) * (WIDTH - PAD_L - PAD_R)
  const yOf = (v: number) =>
    PAD_T + ((yMax - v) / (yMax - yMin)) * (HEIGHT - PAD_T - PAD_B)

  const path = points
    .map((p, i) => {
      const x = xOf(p.date).toFixed(1)
      const y = yOf(values[i]).toFixed(1)
      return `${i === 0 ? 'M' : 'L'}${x},${y}`
    })
    .join(' ')

  const yTickValues = niceTicks(yMin, yMax, 5)
  const yTicks = yTickValues.map((value) => ({
    value,
    y: yOf(value),
    label: value.toFixed(1),
  }))

  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((frac) => {
    const ms = t0 + frac * span
    const iso = new Date(ms).toISOString().slice(0, 7)
    return {
      x: PAD_L + frac * (WIDTH - PAD_L - PAD_R),
      label: iso,
    }
  })

  const ariaLabel =
    series === 'anomaly'
      ? `Siirtymäpoikkeama, ${points.length} havaintoa, ` +
        `vaihteluväli ${yMinRaw.toFixed(1)} – ${yMaxRaw.toFixed(1)} mm`
      : `Raaka siirtymä, ${points.length} havaintoa, ` +
        `vaihteluväli ${yMinRaw.toFixed(1)} – ${yMaxRaw.toFixed(1)} mm`

  const table = points.map((p, i) => ({ date: p.date, value: values[i] }))

  return {
    path,
    xTicks,
    yTicks,
    viewBox: `0 0 ${WIDTH} ${HEIGHT}`,
    ariaLabel,
    table,
  }
}

function yZeroY(points: TimeseriesPoint[], series: 'anomaly' | 'raw'): number {
  const values = points.map((p) =>
    series === 'anomaly' ? p.displacement_anomaly_mm : p.displacement_mm,
  )
  const yMinRaw = Math.min(...values, 0)
  const yMaxRaw = Math.max(...values, 0)
  const yPad = Math.max(1, (yMaxRaw - yMinRaw) * 0.1)
  const yMin = yMinRaw - yPad
  const yMax = yMaxRaw + yPad
  return PAD_T + ((yMax - 0) / (yMax - yMin)) * (HEIGHT - PAD_T - PAD_B)
}

function niceTicks(min: number, max: number, count: number): number[] {
  const span = max - min
  if (span === 0) return [min]
  const rawStep = span / count
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)))
  const norm = rawStep / mag
  const niceStep = norm < 1.5 ? 1 * mag : norm < 3 ? 2 * mag : norm < 7 ? 5 * mag : 10 * mag
  const start = Math.ceil(min / niceStep) * niceStep
  const out: number[] = []
  for (let v = start; v <= max + 1e-9; v += niceStep) out.push(v)
  return out
}
