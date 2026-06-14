export interface CityConfig {
  id: 'turku' | 'helsinki'
  name: string
  fgbUrl: string
  tsUrl: string
  center: [number, number]  // [lng, lat] WGS84
  zoom: number
  preselectBuildingId: string
  available: boolean
}

export const CITIES: CityConfig[] = [
  {
    id: 'turku',
    name: 'Turku',
    fgbUrl: '/data/buildings_turku.fgb',
    tsUrl: '/data/timeseries_turku.parquet',
    center: [22.267, 60.452],
    zoom: 13,
    preselectBuildingId: '3000200476',
    available: true,
  },
  {
    id: 'helsinki',
    name: 'Helsinki',
    fgbUrl: '/data/buildings_helsinki.fgb',
    tsUrl: '/data/timeseries_helsinki.parquet',
    center: [24.942, 60.169],
    zoom: 13,
    preselectBuildingId: '',
    available: true,
  },
]

export const DEFAULT_CITY = CITIES[0]
