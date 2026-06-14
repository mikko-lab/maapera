// Shared types for building features as they flow from FlatGeobuf into
// deck.gl layers and React panels. Matches the column set written by
// etl/src/export_fgb.py — keep both in sync when the ETL schema changes.

export type RiskClass =
  | 'stable'
  | 'monitor'
  | 'attention'
  | 'urgent'
  | 'insufficient_data'

export type TrendClass =
  | 'stable'
  | 'linear'
  | 'accelerating'
  | 'decelerating'
  | 'seasonal'

export interface BuildingProperties {
  building_id: string
  mean_velocity_mm_y: number | null
  velocity_anomaly_mm_y: number | null
  gia_baseline_mm_y: number
  risk_class: RiskClass
  anomaly_class: RiskClass
  trend_class_anomaly: TrendClass | null
  trend_class_absolute: TrendClass | null
  point_count: number
  nearest_point_distance_m: number | null
  velocity_std: number | null
  kayttotarkoitus: number | null
  kerrosluku: number | null
  footprint_area_m2: number
  has_artifact_flag: boolean
  risk_class_uncertain: boolean
  regional_motion_flag: boolean
  kat1_count: number
  kat2_count: number
  kat3_count: number
}

export interface TimeseriesPoint {
  date: string             // ISO YYYY-MM-DD
  displacement_mm: number
  displacement_anomaly_mm: number
}

export interface BuildingTimeseries {
  building_id: string
  pids: string[]           // EGMS point IDs contributing to this building
  points: TimeseriesPoint[]  // average per date across all pids
}
