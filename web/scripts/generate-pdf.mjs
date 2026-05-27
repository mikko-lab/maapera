// CLI: render a building's PDF report from the local data files.
//
//   npx tsx --tsconfig tsconfig.app.json scripts/generate-pdf.mjs <building_id>
//
// Reads buildings_turku.fgb and timeseries_turku.parquet from
// `public/data/`, builds the PDFReportInput, and writes the PDF to
// `/tmp/tietomaapera-<bid>-<reportId>.pdf`. Useful for regression checks
// after PDF code changes — exercises the same code path as the
// browser-side `downloadReport`.

import { parquetReadObjects } from 'hyparquet'
import { geojson } from 'flatgeobuf'
import { readFile, writeFile, stat } from 'node:fs/promises'
import { pdf } from '@react-pdf/renderer'
import { jsx } from 'react/jsx-runtime'

const BUILDING_ID = process.argv[2]
if (!BUILDING_ID) {
  console.error('Usage: generate-pdf.mjs <building_id>')
  process.exit(2)
}

// --- 1. Load the building polygon from the FlatGeobuf, scanning all of Turku.
const fgbBuf = await readFile('public/data/buildings_turku.fgb')
const turkuBbox = { minX: 22.10, minY: 60.35, maxX: 22.55, maxY: 60.60 }
let building = null
for await (const f of geojson.deserialize(new Uint8Array(fgbBuf), turkuBbox)) {
  if (String(f.properties.building_id) === BUILDING_ID) {
    building = f.properties
    break
  }
}
if (!building) throw new Error(`Building ${BUILDING_ID} not found in FGB`)
console.log('Building props:', {
  bid: building.building_id,
  anomaly_class: building.anomaly_class,
  velocity_anomaly_mm_y: building.velocity_anomaly_mm_y,
  mean_velocity_mm_y: building.mean_velocity_mm_y,
  gia_baseline_mm_y: building.gia_baseline_mm_y,
  trend_class_anomaly: building.trend_class_anomaly,
  point_count: building.point_count,
  nearest_point_distance_m: building.nearest_point_distance_m,
})

// --- 2. Pull every timeseries row whose building_id matches.
const pqBuf = await readFile('public/data/timeseries_turku.parquet')
const allRows = await parquetReadObjects({
  file: pqBuf.buffer.slice(pqBuf.byteOffset, pqBuf.byteOffset + pqBuf.byteLength),
})
const buildingRows = allRows.filter((r) => String(r.building_id) === BUILDING_ID)
const pids = [...new Set(buildingRows.map((r) => String(r.pid)))]
console.log(`Timeseries rows: ${buildingRows.length}, pids: ${pids.join(', ')}`)

// Collapse to per-date mean across contributing pids (same as the
// browser path in timeseries-loader.ts).
const byDate = new Map()
for (const r of buildingRows) {
  const iso = typeof r.date === 'number'
    ? new Date(r.date * 86_400_000).toISOString().slice(0, 10)
    : r.date instanceof Date
      ? r.date.toISOString().slice(0, 10)
      : String(r.date).slice(0, 10)
  let b = byDate.get(iso)
  if (!b) { b = { sumD: 0, sumA: 0, n: 0 }; byDate.set(iso, b) }
  b.sumD += r.displacement_mm
  b.sumA += r.displacement_anomaly_mm
  b.n++
}
const timeseries = [...byDate.entries()].sort(([a], [b]) => (a < b ? -1 : 1))
  .map(([date, { sumD, sumA, n }]) => ({
    date,
    displacement_mm: sumD / n,
    displacement_anomaly_mm: sumA / n,
  }))

// --- 3. Build the validated input envelope and render.
const PDFReport = (await import('../src/pdf/PDFReport.tsx')).default
const { generateReportId } = await import('../src/pdf/lib/report-id.ts')
const generatedAt = new Date()
const input = {
  building, timeseries, pids,
  generatedAt,
  reportId: generateReportId(BUILDING_ID, generatedAt),
}
console.log('Report ID:', input.reportId)
const buf = await pdf(jsx(PDFReport, { input })).toBuffer()
const outPath = `/tmp/tietomaapera-${BUILDING_ID}-${input.reportId}.pdf`
await writeFile(outPath, buf)
const sz = (await stat(outPath)).size
console.log(`Wrote ${outPath} (${(sz / 1024).toFixed(0)} KB)`)
