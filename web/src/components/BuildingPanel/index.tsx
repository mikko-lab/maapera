import { useEffect, useRef, useState } from 'react'
import type { Feature, Polygon } from 'geojson'
import type { BuildingProperties, BuildingTimeseries } from '../../lib/types'
import { loadTimeseriesForBuilding } from '../../lib/timeseries-loader'
import TimeseriesChart from '../TimeseriesChart'

const RISK_LABELS: Record<string, string> = {
  stable:            'Vakaa',
  monitor:           'Seuranta',
  attention:         'Tarkistus',
  urgent:            'Kiireellinen',
  insufficient_data: 'Ei riittävää dataa',
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

  const [series, setSeries] = useState<'anomaly' | 'raw'>('anomaly')
  const [timeseries, setTimeseries] = useState<BuildingTimeseries | null>(null)
  const [tsState, setTsState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [tsError, setTsError] = useState<string | null>(null)
  const [pdfState, setPdfState] = useState<'idle' | 'rendering' | 'error'>('idle')
  const [pdfError, setPdfError] = useState<string | null>(null)

  // Focus management — move focus to close button when panel opens.
  useEffect(() => {
    closeRef.current?.focus()
  }, [building.id])

  // Escape closes.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  // Load time series whenever the selected building changes. We reset
  // state first so the user sees an explicit loading indicator instead
  // of stale data flashing.
  useEffect(() => {
    let cancelled = false
    setTimeseries(null)
    setTsError(null)
    if (p.point_count === 0) {
      setTsState('idle')
      return
    }
    setTsState('loading')
    loadTimeseriesForBuilding(p.building_id)
      .then((ts) => {
        if (cancelled) return
        setTimeseries(ts)
        setTsState('ready')
      })
      .catch((err: Error) => {
        if (cancelled) return
        setTsError(err.message)
        setTsState('error')
      })
    return () => {
      cancelled = true
    }
  }, [p.building_id, p.point_count])

  const displayName = `Kiinteistö ${p.building_id}`
  const anomalyDisplay =
    p.velocity_anomaly_mm_y == null
      ? '—'
      : `${p.velocity_anomaly_mm_y >= 0 ? '+' : ''}${p.velocity_anomaly_mm_y.toFixed(2)} mm/v`
  const rawDisplay =
    p.mean_velocity_mm_y == null
      ? '—'
      : `${p.mean_velocity_mm_y >= 0 ? '+' : ''}${p.mean_velocity_mm_y.toFixed(2)} mm/v`
  const reliabilityDisplay =
    p.nearest_point_distance_m == null
      ? 'Ei pisteitä'
      : `${p.nearest_point_distance_m.toFixed(0)} m`

  return (
    <section
      className="building-panel"
      aria-label={`Rakennuksen tiedot: ${displayName}`}
    >
      <div className="panel-header">
        <h2 id="panel-heading">{displayName}</h2>
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
        {/* Anomaly class is the headline — paired with icon dot + label (WCAG). */}
        <div className="panel-row">
          <span className="panel-label">Riskiluokka</span>
          <span className={`risk-badge risk-${p.anomaly_class}`} role="status">
            <span className="risk-dot" aria-hidden="true" />
            <span>{RISK_LABELS[p.anomaly_class] ?? p.anomaly_class}</span>
          </span>
        </div>

        <div className="panel-row panel-row-emphasis">
          <span className="panel-label">Poikkeama GIA-baselinesta</span>
          <span className="panel-value panel-value-large">{anomalyDisplay}</span>
        </div>

        <div className="panel-row panel-row-small">
          <span className="panel-label">Raaka mittaus</span>
          <span className="panel-value">
            {rawDisplay}
            <span className="panel-value-note">
              {' '}(baseline {p.gia_baseline_mm_y.toFixed(2)} mm/v)
            </span>
          </span>
        </div>

        <div className="panel-row">
          <span className="panel-label">Trendi</span>
          <span className="panel-value">
            {p.trend_class_anomaly
              ? (TREND_LABELS[p.trend_class_anomaly] ?? p.trend_class_anomaly)
              : '—'}
          </span>
        </div>

        <div className="panel-row">
          <span className="panel-label">Mittauspisteet</span>
          <span className="panel-value">{p.point_count} kpl</span>
        </div>

        <div className="panel-row">
          <span className="panel-label">Lähin EGMS-piste</span>
          <span className="panel-value">{reliabilityDisplay}</span>
        </div>

        {p.kerrosluku != null && (
          <div className="panel-row">
            <span className="panel-label">Kerrokset</span>
            <span className="panel-value">{p.kerrosluku}</span>
          </div>
        )}

        {/* Time-series block */}
        <div className="panel-ts">
          <div className="panel-ts-header">
            <h3>Pystysuora siirtymä</h3>
            <div role="tablist" aria-label="Aikasarjan tila" className="ts-toggle">
              <button
                role="tab"
                aria-selected={series === 'anomaly'}
                className={series === 'anomaly' ? 'active' : ''}
                onClick={() => setSeries('anomaly')}
              >
                Poikkeama
              </button>
              <button
                role="tab"
                aria-selected={series === 'raw'}
                className={series === 'raw' ? 'active' : ''}
                onClick={() => setSeries('raw')}
              >
                Raaka
              </button>
            </div>
          </div>
          {tsState === 'loading' && (
            <p className="ts-loading" role="status">Ladataan aikasarjadataa…</p>
          )}
          {tsState === 'error' && (
            <p className="ts-error" role="alert">
              Aikasarjan lataus epäonnistui: {tsError}
            </p>
          )}
          {tsState === 'idle' && p.point_count === 0 && (
            <p className="ts-empty" role="status">
              Tälle rakennukselle ei ole EGMS-mittauspisteitä.
            </p>
          )}
          {tsState === 'ready' && timeseries && (
            <TimeseriesChart points={timeseries.points} series={series} />
          )}
        </div>

        {/* PDF download requires ≥3 EGMS points — otherwise the chart and
            trend classification are too unreliable for a report we'd put
            our name on. Map can still colour the building from the single
            measurement, but the PDF stays gated. */}
        <div className="panel-pdf">
          {p.point_count < 3 ? (
            <div className="pdf-disabled" role="status">
              <strong>PDF-raporttia ei voida luoda</strong>
              <p>
                Tällä kohteella on vain {p.point_count}{' '}
                mittauspist{p.point_count === 1 ? 'e' : 'että'}. Luotettavan
                raportin generointi edellyttää vähintään 3 pistettä.
              </p>
            </div>
          ) : (
            <>
              <button
                className="btn btn-primary"
                disabled={pdfState === 'rendering' || tsState === 'loading'}
                onClick={async () => {
                  setPdfState('rendering')
                  setPdfError(null)
                  try {
                    // Dynamic import: defer the ~500 KB react-pdf bundle until
                    // the user actually requests a report. Map + panel stay fast.
                    const { downloadReport } = await import('../../pdf')
                    await downloadReport({
                      building: p,
                      timeseries: timeseries?.points ?? [],
                      pids: timeseries?.pids,
                    })
                    setPdfState('idle')
                  } catch (err) {
                    setPdfError(err instanceof Error ? err.message : 'Tuntematon virhe')
                    setPdfState('error')
                  }
                }}
              >
                {pdfState === 'rendering' ? 'Luodaan PDF-raporttia…' : 'Lataa PDF-raportti'}
              </button>
              {pdfState === 'error' && (
                <p className="pdf-error" role="alert">PDF:n luonti epäonnistui: {pdfError}</p>
              )}
            </>
          )}
        </div>

        <p className="egms-attribution">
          Data: © European Union, Copernicus Land Monitoring Service,
          European Ground Motion Service (EGMS). Sentinel-1 © ESA.
        </p>
      </div>
    </section>
  )
}
