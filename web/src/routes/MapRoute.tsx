import { useState, useEffect, useCallback, useRef } from 'react'
import type { User } from '@supabase/supabase-js'
import type { Feature, Polygon } from 'geojson'
import { supabase } from '../lib/supabase'
import MapView, { type FlyTarget } from '../components/Map'
import BuildingPanel from '../components/BuildingPanel'
import AuthModal from '../components/Auth/AuthModal'
import Disclaimer from '../components/Disclaimer'
import LegalFooter from '../components/LegalFooter'
import SearchBox from '../components/SearchBox'
import type { BuildingProperties } from '../lib/types'
import { prewarmTimeseries } from '../lib/timeseries-loader'
import { findBuildingById, buildingCenter, prewarmAllBuildings } from '../lib/fgb-loader'

// Demo building shown to first-time visitors so the map opens on a
// working example (3000200476, Kupittaa, attention-class).
const PRESELECT_BUILDING_ID = '3000200476'

// Auth UI is hidden until Stripe + paywall land (month 2). The
// machinery (subscription, signOut, AuthModal) is left in place so
// flipping this flag is a one-line re-enable.
const LOGIN_ENABLED = false

export default function MapRoute() {
  const [user, setUser] = useState<User | null>(null)
  const [selectedBuilding, setSelectedBuilding] = useState<Feature<Polygon, BuildingProperties> | null>(null)
  const [showAuth, setShowAuth] = useState(false)
  const [flyTo, setFlyTo] = useState<FlyTarget | null>(null)
  const authBtnRef = useRef<HTMLButtonElement>(null)
  const flyTickRef = useRef(0)

  // Imperative select-and-fly used by search hits and the initial preselect.
  // Direct map clicks go through handleBuildingSelect and don't fly — the
  // user is already centred on the clicked building.
  const selectAndFlyToId = useCallback(async (id: string): Promise<boolean> => {
    const feature = await findBuildingById(id)
    if (!feature) return false
    setSelectedBuilding(feature)
    const center = buildingCenter(feature)
    if (center) {
      flyTickRef.current += 1
      setFlyTo({ lng: center[0], lat: center[1], zoom: 17, tick: flyTickRef.current })
    }
    return true
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null)
      if (session?.user) setShowAuth(false)
    })
    // Begin fetching the time-series Parquet in the background so the
    // first building click resolves instantly. Non-blocking, errors swallowed.
    prewarmTimeseries()
    // Full-FGB scan in the background so search lookups by id (outside
    // the current viewport) hit the cache without a fresh fetch.
    void prewarmAllBuildings().catch(() => {})
    // Land on the demo building so the panel + chart are visible on first
    // paint, rather than presenting an empty map. Failure (e.g. ETL ran
    // without that id) is silent — the map still works.
    void selectAndFlyToId(PRESELECT_BUILDING_ID)
    return () => subscription.unsubscribe()
  }, [selectAndFlyToId])

  const handleBuildingSelect = useCallback(
    (f: Feature<Polygon, BuildingProperties>) => setSelectedBuilding(f),
    [],
  )

  const handlePanelClose = useCallback(() => setSelectedBuilding(null), [])

  const handleAuthClose = useCallback(() => {
    setShowAuth(false)
    // Return focus to the button that opened the modal
    authBtnRef.current?.focus()
  }, [])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
  }

  return (
    <>
      {/* Skip link — keyboard users can bypass the map (WCAG 2.4.1) */}
      <a href="#main-content" className="skip-link">
        Siirry pääsisältöön
      </a>

      <header className="app-header" role="banner">
        <h1>Tietomaaperä</h1>
        <div className="header-actions">
          <Disclaimer />
          {LOGIN_ENABLED && (user ? (
            <>
              <span className="header-user" aria-label={`Kirjautunut: ${user.email}`}>
                {user.email}
              </span>
              <button className="btn" onClick={handleSignOut}>
                Kirjaudu ulos
              </button>
            </>
          ) : (
            <button
              ref={authBtnRef}
              className="btn"
              onClick={() => setShowAuth(true)}
              aria-haspopup="dialog"
            >
              Kirjaudu sisään
            </button>
          ))}
        </div>
      </header>

      <main
        id="main-content"
        className="app-main"
        aria-label="Karttanäkymä"
      >
        <MapView
          onBuildingSelect={handleBuildingSelect}
          selectedBuilding={selectedBuilding}
          flyTo={flyTo}
        />

        <SearchBox onSubmit={selectAndFlyToId} />

        {/* Live region announces selection to screen readers */}
        <div
          aria-live="polite"
          aria-atomic="true"
          className="sr-only"
        >
          {selectedBuilding
            ? `Valittu rakennus: kiinteistö ${selectedBuilding.properties.building_id}`
            : ''}
        </div>

        {selectedBuilding && (
          <BuildingPanel
            building={selectedBuilding}
            onClose={handlePanelClose}
          />
        )}

        <LegalFooter />
      </main>

      {showAuth && <AuthModal onClose={handleAuthClose} />}
    </>
  )
}
