import { useCallback, useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { MapboxOverlay } from '@deck.gl/mapbox'
import { GeoJsonLayer } from '@deck.gl/layers'
import type { Feature, FeatureCollection, Polygon } from 'geojson'
import { loadBuildingsForBbox, type Bbox } from '../../lib/fgb-loader'
import type { BuildingProperties, RiskClass } from '../../lib/types'

const ANOMALY_FILL: Record<RiskClass, [number, number, number, number]> = {
  stable:            [45,  106, 79,  170],
  monitor:           [241, 162, 8,   210],
  attention:         [220, 76,  37,  220],
  urgent:            [155, 27,  48,  235],
  insufficient_data: [110, 110, 110, 110],
}
const FALLBACK: [number, number, number, number] = [120, 120, 120, 160]

// Dark blue border — contrast-safe against all risk-class fills (#1e40af)
const SELECTED_LINE: [number, number, number, number] = [30, 64, 175, 255]

const DEBOUNCE_MS = 300
const INITIAL_CENTER: [number, number] = [22.3219, 60.4258]
const INITIAL_ZOOM = 16

export interface FlyTarget {
  lng: number
  lat: number
  zoom?: number
  /** Monotonically increasing token so repeat-flying to the same target re-triggers. */
  tick: number
}

interface MapViewProps {
  onBuildingSelect: (feature: Feature<Polygon, BuildingProperties>) => void
  /** Full selected feature — needed for the highlight/flash layers independent of viewport. */
  selectedBuilding: Feature<Polygon, BuildingProperties> | null
  flyTo?: FlyTarget | null
  fgbUrl: string
}

export default function MapView({ onBuildingSelect, selectedBuilding, flyTo, fgbUrl }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<maplibregl.Map | null>(null)
  const overlayRef   = useRef<MapboxOverlay | null>(null)
  const debounceRef  = useRef<number | null>(null)

  const [features, setFeatures] = useState<FeatureCollection<Polygon, BuildingProperties>>({
    type: 'FeatureCollection',
    features: [],
  })
  const [loadError, setLoadError] = useState<string | null>(null)
  const [flashKey, setFlashKey]   = useState(0)
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )

  const onSelectRef    = useRef(onBuildingSelect)
  onSelectRef.current  = onBuildingSelect

  // Stable ref so deck.gl onClick can call it without stale closure issues
  const triggerFlash = useCallback(() => setFlashKey(k => k + 1), [])
  const triggerFlashRef = useRef(triggerFlash)
  triggerFlashRef.current = triggerFlash

  // Ref so the mount-time scheduleLoad closure always calls the latest version
  // without needing to re-wire map event listeners on every fgbUrl change.
  const fgbUrlRef = useRef(fgbUrl)
  fgbUrlRef.current = fgbUrl

  const fetchForViewport = useCallback(async (bbox: Bbox) => {
    try {
      const fc = await loadBuildingsForBbox(bbox, fgbUrlRef.current)
      setFeatures(fc)
      setLoadError(null)
    } catch (err) {
      console.error('FGB load failed:', err)
      setLoadError(err instanceof Error ? err.message : 'Tuntematon virhe')
    }
  }, [])

  // Listen for OS-level reduced-motion preference changes
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // Mount: create the map, wire viewport-debounced FGB loads
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: INITIAL_CENTER,
      zoom: INITIAL_ZOOM,
      attributionControl: { compact: true },
    })

    const scheduleLoad = () => {
      if (debounceRef.current !== null) window.clearTimeout(debounceRef.current)
      debounceRef.current = window.setTimeout(() => {
        const b = map.getBounds()
        void fetchForViewport({
          minX: b.getWest(),
          minY: b.getSouth(),
          maxX: b.getEast(),
          maxY: b.getNorth(),
        })
      }, DEBOUNCE_MS)
    }

    map.on('load', () => {
      const overlay = new MapboxOverlay({
        interleaved: false,
        getCursor: ({ isHovering }: { isHovering: boolean }) =>
          isHovering ? 'pointer' : 'default',
        layers: [],
      })
      map.addControl(overlay as unknown as maplibregl.IControl)
      overlayRef.current = overlay
      scheduleLoad()
    })
    map.on('moveend', scheduleLoad)
    map.on('zoomend', scheduleLoad)

    mapRef.current = map
    return () => {
      if (debounceRef.current !== null) window.clearTimeout(debounceRef.current)
      map.remove()
      mapRef.current = null
      overlayRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Re-render deck.gl layers whenever anything that affects rendering changes
  useEffect(() => {
    overlayRef.current?.setProps({
      layers: buildLayers(
        features,
        onSelectRef,
        triggerFlashRef,
        selectedBuilding,
        flashKey,
        prefersReducedMotion,
      ),
    })
  }, [features, selectedBuilding, flashKey, prefersReducedMotion])

  // When fgbUrl changes (city switch), reload buildings for the current viewport.
  useEffect(() => {
    setFeatures({ type: 'FeatureCollection', features: [] })
    const map = mapRef.current
    if (!map) return
    const b = map.getBounds()
    void fetchForViewport({
      minX: b.getWest(), minY: b.getSouth(),
      maxX: b.getEast(), maxY: b.getNorth(),
    })
  }, [fgbUrl, fetchForViewport])

  // Fly to search result; trigger ONE-SHOT flash after the camera arrives
  useEffect(() => {
    if (!flyTo || !mapRef.current) return
    const map = mapRef.current
    map.flyTo({
      center: [flyTo.lng, flyTo.lat],
      zoom:   flyTo.zoom ?? INITIAL_ZOOM,
      essential: true,  // respects prefers-reduced-motion as a snap
    })
    map.once('moveend', () => triggerFlashRef.current())
  }, [flyTo])

  return (
    <div
      ref={containerRef}
      className="map-container"
      role="region"
      aria-label="Interaktiivinen kartta — valitse rakennus klikkaamalla tai käytä rakennuslistaa näppäimistöllä"
    >
      <div className="map-attribution-extra" aria-hidden="true">
        Rakennustiedot: © Maanmittauslaitos CC BY 4.0
      </div>
      {loadError && (
        <div className="map-error" role="alert">
          Rakennusten lataus epäonnistui: {loadError}
        </div>
      )}
    </div>
  )
}

type SelectRef = React.RefObject<(f: Feature<Polygon, BuildingProperties>) => void>
type FlashRef  = React.RefObject<() => void>

function buildLayers(
  data: FeatureCollection<Polygon, BuildingProperties>,
  onSelectRef: SelectRef,
  triggerFlashRef: FlashRef,
  selectedBuilding: Feature<Polygon, BuildingProperties> | null,
  flashKey: number,
  prefersReducedMotion: boolean,
) {
  const selectedData = selectedBuilding
    ? ({ type: 'FeatureCollection', features: [selectedBuilding] } as FeatureCollection<Polygon, BuildingProperties>)
    : null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const layers: any[] = [
    new GeoJsonLayer<BuildingProperties>({
      id: 'buildings',
      data,
      pickable: true,
      stroked: true,
      filled: true,
      getFillColor: (f) => {
        const cls = (f.properties?.anomaly_class ?? 'insufficient_data') as RiskClass
        return ANOMALY_FILL[cls] ?? FALLBACK
      },
      getLineColor: [255, 255, 255, 100],
      lineWidthMinPixels: 0.5,
      lineWidthMaxPixels: 2,
      onClick: ({ object }) => {
        if (object) {
          onSelectRef.current?.(object as Feature<Polygon, BuildingProperties>)
          triggerFlashRef.current?.()
        }
      },
      updateTriggers: {
        getFillColor: [],
      },
    }),
  ]

  if (selectedData) {
    // Persistent thick border — always visible, independent of zoom or risk colour.
    // No fill so the main layer's colour shows through without blending artefacts.
    layers.push(
      new GeoJsonLayer<BuildingProperties>({
        id: 'building-selected',
        data: selectedData,
        pickable: false,
        stroked: true,
        filled: false,
        getLineColor: SELECTED_LINE,
        lineWidthMinPixels: 3.5,
        lineWidthMaxPixels: 5,
        updateTriggers: {
          getLineColor: [selectedBuilding?.properties.building_id],
        },
      }),
    )

    // One-shot white flash that fades to transparent over 800 ms.
    // Skipped entirely when the user prefers reduced motion (WCAG 2.2.2).
    // Keying by flashKey forces deck.gl to treat the feature as "new"
    // on each trigger, re-running the enter→target transition.
    if (!prefersReducedMotion) {
      layers.push(
        new GeoJsonLayer<BuildingProperties>({
          id: `building-flash-${flashKey}`,
          data: selectedData,
          pickable: false,
          stroked: false,
          filled: true,
          getFillColor: [255, 255, 255, 0] as [number, number, number, number],
          transitions: {
            getFillColor: {
              duration: 800,
              // enter = starting value when the object first appears in this layer
              enter: (): [number, number, number, number] => [255, 255, 255, 200],
            },
          },
        }),
      )
    }
  }

  return layers
}
