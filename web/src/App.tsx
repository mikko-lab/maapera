import { useState, useEffect, useCallback, useRef } from 'react'
import type { User } from '@supabase/supabase-js'
import type { Feature, Polygon } from 'geojson'
import { supabase } from './lib/supabase'
import MapView from './components/Map'
import BuildingPanel from './components/BuildingPanel'
import AuthModal from './components/Auth/AuthModal'
import type { BuildingProperties } from './data/mock-buildings'

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [selectedBuilding, setSelectedBuilding] = useState<Feature<Polygon, BuildingProperties> | null>(null)
  const [showAuth, setShowAuth] = useState(false)
  const authBtnRef = useRef<HTMLButtonElement>(null)

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

  const selectedId = selectedBuilding?.properties.building_id ?? null

  return (
    <>
      {/* Skip link — keyboard users can bypass the map (WCAG 2.4.1) */}
      <a href="#main-content" className="skip-link">
        Siirry pääsisältöön
      </a>

      <header className="app-header" role="banner">
        <h1>Maaperä.fi</h1>
        <nav className="header-actions" aria-label="Käyttäjävalikko">
          {user ? (
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
          )}
        </nav>
      </header>

      <main
        id="main-content"
        className="app-main"
        aria-label="Karttanäkymä"
      >
        <MapView
          onBuildingSelect={handleBuildingSelect}
          selectedBuildingId={selectedId}
        />

        {/* Live region announces selection to screen readers */}
        <div
          aria-live="polite"
          aria-atomic="true"
          className="sr-only"
        >
          {selectedBuilding
            ? `Valittu rakennus: ${selectedBuilding.properties.address}`
            : ''}
        </div>

        {selectedBuilding && (
          <BuildingPanel
            building={selectedBuilding}
            onClose={handlePanelClose}
          />
        )}
      </main>

      {showAuth && <AuthModal onClose={handleAuthClose} />}
    </>
  )
}
