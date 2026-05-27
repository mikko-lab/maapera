// FlatGeobuf bbox loader for buildings_<city>.fgb.
//
// FGB ships an R-tree spatial index in the file header, queryable over
// HTTP Range Requests. We pass the current map viewport as `Rect` and
// only the polygons whose envelope intersects that rect are fetched.
//
// A module-level Map<building_id, Feature> caches every feature we have
// ever seen, so panning back to a previously visited area is free — and
// the union of all caches gives the deck.gl layer a single GeoJSON
// FeatureCollection to render without duplicate work.

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

const FGB_URL = '/data/buildings_turku.fgb'

// Global cache keyed by building_id. Concurrent loads share state so two
// near-simultaneous bbox queries do not double-fetch overlapping features.
const cache = new Map<string, BuildingFeature>()
const inFlight = new Map<string, Promise<void>>()

// Round bbox to a coarse grid so small map nudges share a cache key.
const TILE_DEG = 0.01  // ~1 km at Turku latitude

function tileKey(b: Bbox): string {
  const f = (x: number) => Math.floor(x / TILE_DEG)
  return `${f(b.minX)}:${f(b.minY)}:${f(b.maxX)}:${f(b.maxY)}`
}

export async function loadBuildingsForBbox(
  bbox: Bbox,
): Promise<FeatureCollection<Polygon, BuildingProperties>> {
  const key = tileKey(bbox)
  let promise = inFlight.get(key)
  if (!promise) {
    promise = fetchBbox(bbox).finally(() => inFlight.delete(key))
    inFlight.set(key, promise)
  }
  await promise
  return featuresWithin(bbox)
}

async function fetchBbox(bbox: Bbox): Promise<void> {
  const rect = {
    minX: bbox.minX,
    minY: bbox.minY,
    maxX: bbox.maxX,
    maxY: bbox.maxY,
  }
  const iter = geojson.deserialize(FGB_URL, rect) as AsyncIterable<
    BuildingFeature
  >
  for await (const feature of iter) {
    const bid = feature.properties?.building_id
    if (bid && !cache.has(bid)) cache.set(bid, feature)
  }
}

function featuresWithin(
  bbox: Bbox,
): FeatureCollection<Polygon, BuildingProperties> {
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
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
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
    a.maxX >= b.minX &&
    a.minX <= b.maxX &&
    a.maxY >= b.minY &&
    a.minY <= b.maxY
  )
}

export function getCachedBuildingById(id: string): BuildingFeature | null {
  return cache.get(id) ?? null
}
