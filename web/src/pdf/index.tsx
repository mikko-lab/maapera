// Public entry point for generating a downloadable PDF report from
// the BuildingPanel. Keep this module free of React-Native or Deno-only
// APIs so a future server-side renderer can re-use it as-is.

import { pdf } from '@react-pdf/renderer'
import PDFReport from './PDFReport'
import type { BuildingProperties, TimeseriesPoint } from '../lib/types'
import { generateReportId } from './lib/report-id'
import { assertPDFReportInput, type PDFReportInput } from './types'

interface GenerateArgs {
  building: BuildingProperties
  timeseries: TimeseriesPoint[]
  pids?: string[]
}

/** Build the validated PDFReportInput envelope (deterministic report ID). */
export function buildReportInput(args: GenerateArgs): PDFReportInput {
  const generatedAt = new Date()
  const input: PDFReportInput = {
    building: args.building,
    timeseries: args.timeseries,
    pids: args.pids,
    generatedAt,
    reportId: generateReportId(args.building.building_id, generatedAt),
  }
  assertPDFReportInput(input)
  return input
}

/** Render the PDF in the browser and return a Blob suitable for download. */
export async function renderReportBlob(args: GenerateArgs): Promise<{
  blob: Blob
  reportId: string
  fileName: string
}> {
  const input = buildReportInput(args)
  const blob = await pdf(<PDFReport input={input} />).toBlob()
  const fileName = `tietomaapera-${args.building.building_id}-${input.reportId}.pdf`
  return { blob, reportId: input.reportId, fileName }
}

/** Convenience: render + trigger browser download in one call. */
export async function downloadReport(args: GenerateArgs): Promise<string> {
  const { blob, reportId, fileName } = await renderReportBlob(args)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // Defer revoke so Safari has time to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 5000)
  return reportId
}

export type { PDFReportInput } from './types'
