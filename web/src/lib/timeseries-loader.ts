// Per-building time-series loader backed by a per-city Parquet file.
//
// Cache is per-tsUrl so switching cities loads a fresh dataset.

import { parquetReadObjects } from 'hyparquet'
import type { BuildingTimeseries, TimeseriesPoint } from './types'

interface ParquetRow {
  building_id: string
  pid: string
  date: number | string | Date
  displacement_mm: number
  displacement_anomaly_mm: number
}

const indexByUrl = new Map<string, Promise<Map<string, ParquetRow[]>>>()

function indexAllRows(tsUrl: string): Promise<Map<string, ParquetRow[]>> {
  let p = indexByUrl.get(tsUrl)
  if (!p) {
    p = (async () => {
      const res = await fetch(tsUrl)
      if (!res.ok) throw new Error(`Parquet fetch failed: ${res.status}`)
      const buffer = await res.arrayBuffer()
      const rows = (await parquetReadObjects({ file: buffer })) as ParquetRow[]
      const index = new Map<string, ParquetRow[]>()
      for (const row of rows) {
        const bid = String(row.building_id)
        let arr = index.get(bid)
        if (!arr) { arr = []; index.set(bid, arr) }
        arr.push(row)
      }
      return index
    })().catch((err) => {
      indexByUrl.delete(tsUrl)
      throw err
    })
    indexByUrl.set(tsUrl, p)
  }
  return p
}

export async function loadTimeseriesForBuilding(
  buildingId: string,
  tsUrl: string,
): Promise<BuildingTimeseries | null> {
  const index = await indexAllRows(tsUrl)
  const rows = index.get(String(buildingId))
  if (!rows || rows.length === 0) return null
  return collapseToPerDateMean(buildingId, rows)
}

function collapseToPerDateMean(
  buildingId: string,
  rows: ParquetRow[],
): BuildingTimeseries {
  const byDate = new Map<string, { sumDisp: number; sumAnom: number; n: number }>()
  const pidSet = new Set<string>()
  for (const r of rows) {
    pidSet.add(String(r.pid))
    const iso = isoDate(r.date)
    let bucket = byDate.get(iso)
    if (!bucket) { bucket = { sumDisp: 0, sumAnom: 0, n: 0 }; byDate.set(iso, bucket) }
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
  return { building_id: buildingId, pids: Array.from(pidSet), points }
}

function isoDate(value: number | string | Date): string {
  if (typeof value === 'string') return value.slice(0, 10)
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return new Date(value * 86_400_000).toISOString().slice(0, 10)
}

export function prewarmTimeseries(tsUrl: string): void {
  void indexAllRows(tsUrl).catch(() => {})
}
