// Per-building time-series loader backed by a single Parquet file.
//
// The Parquet sits at /data/timeseries_turku.parquet (7 MB compressed,
// ~5.4 M rows). We fetch it once on first request, parse with hyparquet
// into a Map<building_id, rows[]>, and serve every subsequent click
// from memory. The fetch + parse takes ~1–2 s in modern browsers; the
// panel surfaces a loading state for that window only.
//
// A single EGMS pid may map to multiple buildings, so the parquet has
// (building_id, pid, date) granularity. We collapse to per-date means
// before handing back to the chart — that's the per-building displacement
// signal the user wants to see.

import { parquetReadObjects } from 'hyparquet'
import type { BuildingTimeseries, TimeseriesPoint } from './types'

interface ParquetRow {
  building_id: string
  pid: string
  date: number | string | Date
  displacement_mm: number
  displacement_anomaly_mm: number
}

const PARQUET_URL = '/data/timeseries_turku.parquet'

let indexPromise: Promise<Map<string, ParquetRow[]>> | null = null

function indexAllRows(): Promise<Map<string, ParquetRow[]>> {
  if (!indexPromise) {
    indexPromise = (async () => {
      const res = await fetch(PARQUET_URL)
      if (!res.ok) throw new Error(`Parquet fetch failed: ${res.status}`)
      const buffer = await res.arrayBuffer()
      const rows = (await parquetReadObjects({
        file: buffer,
      })) as ParquetRow[]
      const index = new Map<string, ParquetRow[]>()
      for (const row of rows) {
        const bid = String(row.building_id)
        let arr = index.get(bid)
        if (!arr) {
          arr = []
          index.set(bid, arr)
        }
        arr.push(row)
      }
      return index
    })().catch((err) => {
      // Reset so a subsequent call can retry (transient network blip etc.).
      indexPromise = null
      throw err
    })
  }
  return indexPromise
}

export async function loadTimeseriesForBuilding(
  buildingId: string,
): Promise<BuildingTimeseries | null> {
  const index = await indexAllRows()
  const rows = index.get(String(buildingId))
  if (!rows || rows.length === 0) return null
  return collapseToPerDateMean(buildingId, rows)
}

function collapseToPerDateMean(
  buildingId: string,
  rows: ParquetRow[],
): BuildingTimeseries {
  // group by date, average displacement across all pids on that date
  const byDate = new Map<
    string,
    { sumDisp: number; sumAnom: number; n: number }
  >()
  const pidSet = new Set<string>()
  for (const r of rows) {
    pidSet.add(String(r.pid))
    const iso = isoDate(r.date)
    let bucket = byDate.get(iso)
    if (!bucket) {
      bucket = { sumDisp: 0, sumAnom: 0, n: 0 }
      byDate.set(iso, bucket)
    }
    bucket.sumDisp += r.displacement_mm
    bucket.sumAnom += r.displacement_anomaly_mm
    bucket.n += 1
  }
  const points: TimeseriesPoint[] = Array.from(byDate.entries())
    .map(([date, { sumDisp, sumAnom, n }]) => ({
      date,
      displacement_mm: sumDisp / n,
      displacement_anomaly_mm: sumAnom / n,
    }))
    .sort((a, b) => (a.date < b.date ? -1 : 1))
  return {
    building_id: buildingId,
    pids: Array.from(pidSet),
    points,
  }
}

function isoDate(value: number | string | Date): string {
  if (typeof value === 'string') return value.slice(0, 10)
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  // hyparquet returns date32 as days since 1970-01-01
  const ms = value * 86_400_000
  return new Date(ms).toISOString().slice(0, 10)
}

// Optional warm-up: callers can fire this on app mount so the first
// building click resolves instantly. Failure is non-fatal here.
export function prewarmTimeseries(): void {
  void indexAllRows().catch(() => {})
}
