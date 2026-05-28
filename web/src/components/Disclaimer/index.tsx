import { useState, useRef, useEffect } from 'react'

// Disclosure pattern: a button toggles a region containing the
// advisory text. WCAG: aria-expanded on the button, aria-controls
// pointing at the region's id, Escape closes, focus returns to the
// button. The region is always in the DOM (hidden via attribute)
// so screen readers can find it via aria-controls even when closed.
export default function Disclaimer() {
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    const onClickOutside = (e: MouseEvent) => {
      if (
        panelRef.current &&
        buttonRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onClickOutside)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onClickOutside)
    }
  }, [open])

  return (
    <div className="disclaimer">
      <button
        ref={buttonRef}
        type="button"
        className="btn btn-ghost"
        aria-expanded={open}
        aria-controls="disclaimer-panel"
        onClick={() => setOpen((v) => !v)}
      >
        <span aria-hidden="true">ⓘ</span> Tietoa palvelusta
      </button>
      <div
        ref={panelRef}
        id="disclaimer-panel"
        role="region"
        aria-label="Vastuunrajoitus"
        hidden={!open}
        className="disclaimer-panel"
      >
        <p>
          Tietomaaperä esittää satelliittipohjaista (Copernicus EGMS,
          Sentinel-1) arviota maanpinnan pystysuorasta liikkeestä
          rakennustasolla. Tiedot ovat suuntaa-antavia eivätkä korvaa
          pohjatutkimusta, rakennusteknistä tarkastusta tai paikalla
          käyntiä. Riskiluokitus perustuu tilastolliseen analyysiin, ei
          rakennekohtaiseen arviointiin. Päätökset korjauksista tulee
          aina tehdä valtuutetun asiantuntijan arvion perusteella.
        </p>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => {
            setOpen(false)
            buttonRef.current?.focus()
          }}
        >
          Sulje
        </button>
      </div>
    </div>
  )
}
