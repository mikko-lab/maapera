import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { MapboxOverlay } from '@deck.gl/mapbox'
import { GeoJsonLayer } from '@deck.gl/layers'
import type { Feature, Polygon } from 'geojson'
import { MOCK_BUILDINGS, type BuildingProperties } from '../../data/mock-buildings'

// Risk fill colors (RGBA) from CLAUDE.md brand palette
const RISK_FILL: Record<string, [number, number, number, number]> = {
  stable:    [45,  106, 79,  210],
  monitor:   [241, 162, 8,   210],
  attention: [220, 76,  37,  210],
  urgent:    [155, 27,  48,  230],
}
const RISK_FILL_SELECTED: Record<string, [number, number, number, number]> = {
  stable:    [80,  190, 130, 255],
  monitor:   [255, 200, 50,  255],
  attention: [255, 110, 70,  255],
  urgent:    [220, 60,  80,  255],
}
const FALLBACK: [number, number, number, number] = [120, 120, 120, 200]

interface MapViewProps {
  onBuildingSelect: (feature: Feature<Polygon, BuildingProperties>) => void
  selectedBuildingId: string | null
}

export default function MapView({ onBuildingSelect, selectedBuildingId }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef      = useRef<maplibregl.Map | null>(null)
  const overlayRef  = useRef<MapboxOverlay | null>(null)

  // Keep latest callback in a ref to avoid stale closures in deck.gl layers
  const onSelectRef = useRef(onBuildingSelect)
  onSelectRef.current = onBuildingSelect

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      // OpenFreeMap liberty style — free, no API key required
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: [22.27, 60.45],   // Turku city centre
      zoom: 14,
      attributionControl: { compact: true },
    })

    map.on('load', () => {
      const overlay = new MapboxOverlay({
        interleaved: false,
        getCursor: ({ isHovering }: { isHovering: boolean }) =>
          isHovering ? 'pointer' : 'default',
        layers: buildLayers(onSelectRef, null),
      })
      // MapboxOverlay implements the Mapbox/MapLibre IControl interface
      map.addControl(overlay as unknown as maplibregl.IControl)
      overlayRef.current = overlay
    })

    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
      overlayRef.current = null
    }
  }, [])

  // Update layers when selection changes without recreating the map
  useEffect(() => {
    overlayRef.current?.setProps({ layers: buildLayers(onSelectRef, selectedBuildingId) })
  }, [selectedBuildingId])

  return (
    <div
      ref={containerRef}
      className="map-container"
      role="region"
      aria-label="Interaktiivinen kartta — valitse rakennus klikkaamalla tai käytä rakennuslistaa näppäimistöllä"
    >
      {/* EGMS attribution rendered by MapLibre's own attribution control */}
      <div className="map-attribution-extra" aria-hidden="true">
        Rakennustiedot: © Maanmittauslaitos CC BY 4.0
      </div>
    </div>
  )
}

function buildLayers(
  onSelectRef: React.RefObject<(f: Feature<Polygon, BuildingProperties>) => void>,
  selectedId: string | null,
) {
  return [
    new GeoJsonLayer<BuildingProperties>({
      id: 'buildings',
      data: MOCK_BUILDINGS,
      pickable: true,
      stroked: true,
      filled: true,
      getFillColor: (f) => {
        const risk = f.properties?.risk_class ?? 'stable'
        return f.properties?.building_id === selectedId
          ? (RISK_FILL_SELECTED[risk] ?? FALLBACK)
          : (RISK_FILL[risk] ?? FALLBACK)
      },
      getLineColor: [255, 255, 255, 120],
      lineWidthMinPixels: 1,
      lineWidthMaxPixels: 3,
      onClick: ({ object }) => {
        if (object) onSelectRef.current?.(object as Feature<Polygon, BuildingProperties>)
      },
      updateTriggers: {
        getFillColor: [selectedId],
      },
    }),
  ]
}
