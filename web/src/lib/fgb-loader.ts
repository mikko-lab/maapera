// FlatGeobuf loader for buildings_<city>.fgb.
//
// Cache and in-flight deduplication are per-fgbUrl so switching cities
// loads a fresh dataset without polluting the previous city's cache.

import { geojson } from 'flatgeobuf'
import type { Feature, FeatureCollection, Polygon } from 'geojson'
import type { BuildingProperties } from './types'

export interface Bbox {
  minX: number  // west longitude
  minY: number  // south latitude
  maxX: number  // east longitude
  maxY: number  // north latitude
}

type BuildingFeature = Feature<Polygon, BuildingProperties>

// Per-URL caches: Map<fgbUrl, Map<building_id, Feature>>
const cacheByUrl = new Map<string, Map<string, BuildingFeature>>()
const allLoadedByUrl = new Map<string, Promise<void>>()

function getCache(fgbUrl: string): Map<string, BuildingFeature> {
  let c = cacheByUrl.get(fgbUrl)
  if (!c) {
    c = new Map()
    cacheByUrl.set(fgbUrl, c)
  }
  return c
}

const TILE_DEG = 0.01

function tileKey(b: Bbox): string {
  const f = (x: number) => Math.floor(x / TILE_DEG)
  return `${f(b.minX)}:${f(b.minY)}:${f(b.maxX)}:${f(b.maxY)}`
}

// Per-URL in-flight deduplication
const inFlightByUrl = new Map<string, Map<string, Promise<void>>>()

function getInFlight(fgbUrl: string): Map<string, Promise<void>> {
  let m = inFlightByUrl.get(fgbUrl)
  if (!m) {
    m = new Map()
    inFlightByUrl.set(fgbUrl, m)
  }
  return m
}

export async function loadBuildingsForBbox(
  bbox: Bbox,
  fgbUrl: string,
): Promise<FeatureCollection<Polygon, BuildingProperties>> {
  const key = tileKey(bbox)
  const inFlight = getInFlight(fgbUrl)
  let promise = inFlight.get(key)
  if (!promise) {
    promise = fetchAll(fgbUrl).finally(() => inFlight.delete(key))
    inFlight.set(key, promise)
  }
  await promise
  return featuresWithin(bbox, fgbUrl)
}

async function fetchAll(fgbUrl: string): Promise<void> {
  await prewarmAllBuildings(fgbUrl)
}

function featuresWithin(
  bbox: Bbox,
  fgbUrl: string,
): FeatureCollection<Polygon, BuildingProperties> {
  const cache = getCache(fgbUrl)
  const features: BuildingFeature[] = []
  for (const f of cache.values()) {
    const env = featureEnvelope(f)
    if (env && envelopeIntersects(env, bbox)) features.push(f)
  }
  return { type: 'FeatureCollection', features }
}

function featureEnvelope(f: BuildingFeature): Bbox | null {
  const ring = f.geometry?.coordinates?.[0]
  if (!ring || ring.length === 0) return null
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const [x, y] of ring) {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  return { minX, minY, maxX, maxY }
}

function envelopeIntersects(a: Bbox, b: Bbox): boolean {
  return (
    a.maxX >= b.minX && a.minX <= b.maxX &&
    a.maxY >= b.minY && a.minY <= b.maxY
  )
}

export function getCachedBuildingById(id: string, fgbUrl: string): BuildingFeature | null {
  return getCache(fgbUrl).get(id) ?? null
}

export function prewarmAllBuildings(fgbUrl: string): Promise<void> {
  let p = allLoadedByUrl.get(fgbUrl)
  if (p) return p
  p = (async () => {
    const res = await fetch(fgbUrl)
    if (!res.ok) throw new Error(`FGB fetch failed: ${res.status}`)
    const buf = new Uint8Array(await res.arrayBuffer())
    const iter = geojson.deserialize(buf) as AsyncIterable<BuildingFeature>
    const cache = getCache(fgbUrl)
    for await (const feature of iter) {
      const bid = feature.properties?.building_id
      if (bid && !cache.has(bid)) cache.set(bid, feature)
    }
  })().catch((err) => {
    allLoadedByUrl.delete(fgbUrl)
    throw err
  })
  allLoadedByUrl.set(fgbUrl, p)
  return p
}

export async function findBuildingById(
  id: string,
  fgbUrl: string,
): Promise<BuildingFeature | null> {
  const trimmed = id.trim()
  if (!trimmed) return null
  const cache = getCache(fgbUrl)
  if (cache.has(trimmed)) return cache.get(trimmed)!
  await prewarmAllBuildings(fgbUrl)
  return cache.get(trimmed) ?? null
}

export function buildingCenter(
  feature: BuildingFeature,
): [number, number] | null {
  const ring = feature.geometry?.coordinates?.[0]
  if (!ring || ring.length === 0) return null
  let sumX = 0, sumY = 0
  for (const [x, y] of ring) { sumX += x; sumY += y }
  return [sumX / ring.length, sumY / ring.length]
}
