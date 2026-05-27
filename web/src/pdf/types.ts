// Input contract for PDFReport. Mirrors the Pydantic models in the
// ETL (etl/src/models.py:BuildingAggregate + TimeseriesRecord) so the
// document renderer cannot accept a partially-populated building.
//
// We deliberately re-state the schema here rather than import the
// runtime types: the PDF document is a value boundary and should fail
// to compile if a contributor accidentally drops a required field.

import type {
  BuildingProperties,
  TimeseriesPoint,
} from '../lib/types'

export interface PDFReportInput {
  building: BuildingProperties
  timeseries: TimeseriesPoint[]   // sorted ascending by date
  generatedAt: Date
  reportId: string                // MAA-YYYY-MM-DD-XXXXX
  /** Optional list of contributing EGMS points for the appendix. */
  pids?: string[]
}

// Runtime guard — throw early if a caller hands us garbage. The PDF
// itself can't surface validation errors to the user gracefully, so
// the entry point fails fast before any glyph is laid out.
export function assertPDFReportInput(input: unknown): asserts input is PDFReportInput {
  const x = input as PDFReportInput
  if (!x || typeof x !== 'object') throw new Error('PDFReportInput missing')
  if (!x.building?.building_id) throw new Error('PDFReportInput.building.building_id missing')
  if (typeof x.building.gia_baseline_mm_y !== 'number')
    throw new Error('PDFReportInput.building.gia_baseline_mm_y missing')
  if (!x.building.anomaly_class) throw new Error('PDFReportInput.building.anomaly_class missing')
  if (!Array.isArray(x.timeseries)) throw new Error('PDFReportInput.timeseries must be array')
  if (!(x.generatedAt instanceof Date)) throw new Error('PDFReportInput.generatedAt must be Date')
  if (!x.reportId || !/^MAA-\d{4}-\d{2}-\d{2}-[A-Z0-9]{5}$/.test(x.reportId))
    throw new Error('PDFReportInput.reportId must match MAA-YYYY-MM-DD-XXXXX')
}
