import { useId, useState, type FormEvent } from 'react'

// Building search by `kiinteistötunnus` (building_id) — MVP scope.
// Address search is deferred (MML data lacks address columns and needs
// a geocoder).
//
// The lookup happens inside MapRoute (via findBuildingById, which prewarms
// the full FGB on first call). This component is pure UI + a callback.
//
// Accessibility:
//   - <form role="search"> with a visible-only-to-SR <label> bound by id
//   - aria-live="polite" status region announces "löytyi" / "ei löytynyt"
//   - the inline error text is aria-hidden because the live region already
//     covers it for assistive tech (avoid double-announce)

interface SearchBoxProps {
  /** Returns true when the id was found, false otherwise. Awaits the FGB prewarm if needed. */
  onSubmit: (id: string) => Promise<boolean>
}

type Status = 'idle' | 'searching' | 'found' | 'notfound'

export default function SearchBox({ onSubmit }: SearchBoxProps) {
  const inputId = useId()
  const [value, setValue] = useState('')
  const [status, setStatus] = useState<Status>('idle')

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const id = value.trim()
    if (!id) return
    setStatus('searching')
    try {
      const found = await onSubmit(id)
      setStatus(found ? 'found' : 'notfound')
    } catch (err) {
      // Lookup threw — surface as "not found" so the button isn't stuck
      // on "Haetaan…" and the user can retry. Log so the cause is
      // recoverable from the console.
      console.error('Search lookup failed:', err)
      setStatus('notfound')
    }
  }

  return (
    <form className="map-search" role="search" onSubmit={handleSubmit}>
      <label htmlFor={inputId} className="sr-only">
        Hae rakennusta kiinteistötunnuksella
      </label>
      <input
        id={inputId}
        type="search"
        inputMode="numeric"
        placeholder="Hae kiinteistötunnuksella…"
        value={value}
        onChange={(e) => {
          setValue(e.target.value)
          if (status !== 'idle') setStatus('idle')
        }}
        autoComplete="off"
        aria-describedby={status === 'notfound' ? `${inputId}-error` : undefined}
      />
      <button type="submit" className="btn" disabled={status === 'searching' || !value.trim()}>
        {status === 'searching' ? 'Haetaan…' : 'Hae'}
      </button>
      <div role="status" aria-live="polite" className="sr-only">
        {status === 'found' && 'Kiinteistö löytyi'}
        {status === 'notfound' && 'Kiinteistöä ei löytynyt'}
      </div>
      {status === 'notfound' && (
        <span id={`${inputId}-error`} className="map-search-error" aria-hidden="true">
          Kiinteistöä ei löytynyt
        </span>
      )}
    </form>
  )
}
