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
import { CITIES, DEFAULT_CITY, type CityConfig } from '../lib/cities'

// Auth UI is hidden until Stripe + paywall land (month 2).
const LOGIN_ENABLED = false

export default function MapRoute() {
  const [user, setUser] = useState<User | null>(null)
  const [city, setCity] = useState<CityConfig>(DEFAULT_CITY)
  const [selectedBuilding, setSelectedBuilding] = useState<Feature<Polygon, BuildingProperties> | null>(null)
  const [showAuth, setShowAuth] = useState(false)
  const [flyTo, setFlyTo] = useState<FlyTarget | null>(null)
  const authBtnRef = useRef<HTMLButtonElement>(null)
  const flyTickRef = useRef(0)

  const selectAndFlyToId = useCallback(async (id: string, currentCity: CityConfig): Promise<boolean> => {
    const feature = await findBuildingById(id, currentCity.fgbUrl)
    if (!feature) return false
    setSelectedBuilding(feature)
    const center = buildingCenter(feature)
    if (center) {
      flyTickRef.current += 1
      setFlyTo({ lng: center[0], lat: center[1], zoom: 17, tick: flyTickRef.current })
    }
    return true
  }, [])

  // Stable wrapper for SearchBox — always uses current city
  const cityRef = useRef(city)
  cityRef.current = city
  const handleSearch = useCallback(async (id: string): Promise<boolean> => {
    return selectAndFlyToId(id, cityRef.current)
  }, [selectAndFlyToId])

  // Auth setup — runs once
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null)
      if (session?.user) setShowAuth(false)
    })
    return () => subscription.unsubscribe()
  }, [])

  // Prewarm + preselect whenever city changes
  useEffect(() => {
    setSelectedBuilding(null)
    prewarmTimeseries(city.tsUrl)
    void prewarmAllBuildings(city.fgbUrl).catch(() => {})
    // Fly to city center
    flyTickRef.current += 1
    setFlyTo({ lng: city.center[0], lat: city.center[1], zoom: city.zoom, tick: flyTickRef.current })
    // Preselect demo building if configured
    if (city.preselectBuildingId) {
      void selectAndFlyToId(city.preselectBuildingId, city)
    }
  }, [city, selectAndFlyToId])

  const handleBuildingSelect = useCallback(
    (f: Feature<Polygon, BuildingProperties>) => setSelectedBuilding(f),
    [],
  )

  const handlePanelClose = useCallback(() => setSelectedBuilding(null), [])

  const handleAuthClose = useCallback(() => {
    setShowAuth(false)
    authBtnRef.current?.focus()
  }, [])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
  }

  return (
    <>
      <a href="#main-content" className="skip-link">
        Siirry pääsisältöön
      </a>

      <header className="app-header" role="banner">
        <h1>Tietomaaperä</h1>
        <nav className="city-tabs" aria-label="Kaupunkivalinta">
          {CITIES.map((c) => (
            <button
              key={c.id}
              className={`city-tab${city.id === c.id ? ' city-tab--active' : ''}`}
              onClick={() => setCity(c)}
              aria-current={city.id === c.id ? 'true' : undefined}
            >
              {c.name}
            </button>
          ))}
        </nav>
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
          fgbUrl={city.fgbUrl}
        />

        <SearchBox onSubmit={handleSearch} />

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
            tsUrl={city.tsUrl}
          />
        )}

        <LegalFooter />
      </main>

      {showAuth && <AuthModal onClose={handleAuthClose} />}
    </>
  )
}
