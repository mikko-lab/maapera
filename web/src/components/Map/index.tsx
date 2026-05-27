import { useCallback, useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { MapboxOverlay } from '@deck.gl/mapbox'
import { GeoJsonLayer } from '@deck.gl/layers'
import type { Feature, FeatureCollection, Polygon } from 'geojson'
import { loadBuildingsForBbox, type Bbox } from '../../lib/fgb-loader'
import type { BuildingProperties, RiskClass } from '../../lib/types'

// Anomaly fill colours (RGBA) — keyed by the *anomaly_class* column, which is
// the user-facing classification (GIA-corrected). risk_class (absolute)
// stays in the data for audit and is rendered only in the side panel.
const ANOMALY_FILL: Record<RiskClass, [number, number, number, number]> = {
  stable:            [45,  106, 79,  170],
  monitor:           [241, 162, 8,   210],
  attention:         [220, 76,  37,  220],
  urgent:            [155, 27,  48,  235],
  insufficient_data: [110, 110, 110, 110],   // translucent grey — coverage gap
}
const ANOMALY_FILL_SELECTED: Record<RiskClass, [number, number, number, number]> = {
  stable:            [80,  190, 130, 255],
  monitor:           [255, 200, 50,  255],
  attention:         [255, 110, 70,  255],
  urgent:            [220, 60,  80,  255],
  insufficient_data: [180, 180, 180, 230],
}
const FALLBACK: [number, number, number, number] = [120, 120, 120, 160]

const DEBOUNCE_MS = 300
const TURKU_CENTER: [number, number] = [22.27, 60.45]

interface MapViewProps {
  onBuildingSelect: (feature: Feature<Polygon, BuildingProperties>) => void
  selectedBuildingId: string | null
}

export default function MapView({ onBuildingSelect, selectedBuildingId }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<maplibregl.Map | null>(null)
  const overlayRef   = useRef<MapboxOverlay | null>(null)
  const debounceRef  = useRef<number | null>(null)
  const featureCountRef = useRef<number>(0)

  const [features, setFeatures] = useState<FeatureCollection<Polygon, BuildingProperties>>({
    type: 'FeatureCollection',
    features: [],
  })
  const [loadError, setLoadError] = useState<string | null>(null)

  // Keep latest callback in a ref to avoid stale closures inside deck.gl layers
  const onSelectRef = useRef(onBuildingSelect)
  onSelectRef.current = onBuildingSelect

  const fetchForViewport = useCallback(async (bbox: Bbox) => {
    try {
      const fc = await loadBuildingsForBbox(bbox)
      featureCountRef.current = fc.features.length
      setFeatures(fc)
      setLoadError(null)
    } catch (err) {
      console.error('FGB load failed:', err)
      setLoadError(
        err instanceof Error ? err.message : 'Tuntematon virhe',
      )
    }
  }, [])

  // Mount: create the map, wire viewport-debounced FGB loads.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: TURKU_CENTER,
      zoom: 14,
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

  // Re-render the deck.gl layer whenever the feature collection or
  // selected id changes — both feed into colour/click behaviour.
  useEffect(() => {
    overlayRef.current?.setProps({
      layers: buildLayers(features, onSelectRef, selectedBuildingId),
    })
  }, [features, selectedBuildingId])

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

function buildLayers(
  data: FeatureCollection<Polygon, BuildingProperties>,
  onSelectRef: React.RefObject<(f: Feature<Polygon, BuildingProperties>) => void>,
  selectedId: string | null,
) {
  return [
    new GeoJsonLayer<BuildingProperties>({
      id: 'buildings',
      data,
      pickable: true,
      stroked: true,
      filled: true,
      getFillColor: (f) => {
        const cls = (f.properties?.anomaly_class ?? 'insufficient_data') as RiskClass
        return f.properties?.building_id === selectedId
          ? (ANOMALY_FILL_SELECTED[cls] ?? FALLBACK)
          : (ANOMALY_FILL[cls] ?? FALLBACK)
      },
      getLineColor: [255, 255, 255, 100],
      lineWidthMinPixels: 0.5,
      lineWidthMaxPixels: 2,
      onClick: ({ object }) => {
        if (object) onSelectRef.current?.(object as Feature<Polygon, BuildingProperties>)
      },
      updateTriggers: {
        getFillColor: [selectedId],
      },
    }),
  ]
}
