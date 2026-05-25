import { useEffect, useRef } from 'react'
import type { Feature, Polygon } from 'geojson'
import type { BuildingProperties } from '../../data/mock-buildings'

const RISK_LABELS: Record<string, string> = {
  stable:    'Vakaa',
  monitor:   'Seuranta',
  attention: 'Tarkistus',
  urgent:    'Kiireellinen',
}

const TREND_LABELS: Record<string, string> = {
  stable:       'Vakaa',
  linear:       'Lineaarinen',
  accelerating: 'Kiihtyvä',
  decelerating: 'Hidastuva',
  seasonal:     'Kausiluonteinen',
}

interface BuildingPanelProps {
  building: Feature<Polygon, BuildingProperties>
  onClose: () => void
}

export default function BuildingPanel({ building, onClose }: BuildingPanelProps) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const p = building.properties

  // Move focus to close button when panel opens
  useEffect(() => {
    closeRef.current?.focus()
  }, [building.id])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const velocity = p.mean_velocity_mm_y.toFixed(1)
  const maxVelocity = p.max_velocity_mm_y.toFixed(1)
  const sign = p.mean_velocity_mm_y < 0 ? '' : '+'

  return (
    <section
      className="building-panel"
      aria-label={`Rakennuksen tiedot: ${p.address}`}
    >
      <div className="panel-header">
        <h2 id="panel-heading">Rakennuksen tiedot</h2>
        <button
          ref={closeRef}
          className="panel-close"
          onClick={onClose}
          aria-label="Sulje paneeli"
        >
          ✕
        </button>
      </div>

      <div className="panel-body">
        <div className="panel-row">
          <span className="panel-label">Osoite</span>
          <span className="panel-value">{p.address}</span>
        </div>

        {/* Risk class: color + dot + text label — never color alone (WCAG) */}
        <div className="panel-row">
          <span className="panel-label">Riskiluokka</span>
          <span className={`risk-badge risk-${p.risk_class}`} role="status">
            <span className="risk-dot" aria-hidden="true" />
            <span>{RISK_LABELS[p.risk_class] ?? p.risk_class}</span>
          </span>
        </div>

        <div className="panel-row">
          <span className="panel-label">Trendi</span>
          <span className="panel-value">{TREND_LABELS[p.trend_class] ?? p.trend_class}</span>
        </div>

        <div className="panel-row">
          <span className="panel-label">Keskinopeus</span>
          <span className="panel-value">
            {sign}{velocity} mm/v
          </span>
        </div>

        <div className="panel-row">
          <span className="panel-label">Maksimisijaintimuutos</span>
          <span className="panel-value">
            {maxVelocity} mm/v
          </span>
        </div>

        <div className="panel-row">
          <span className="panel-label">InSAR-pisteitä</span>
          <span className="panel-value">{p.point_count} kpl</span>
        </div>

        <div className="panel-row">
          <span className="panel-label">Tunniste</span>
          <span className="panel-value panel-id">{p.building_id}</span>
        </div>

        <p className="egms-attribution">
          Data: © European Union, Copernicus Land Monitoring Service,
          European Ground Motion Service (EGMS). Sentinel-1 © ESA.
        </p>
      </div>
    </section>
  )
}
