import { Link } from 'react-router-dom'

// Small links row used on the map view (overlaid at the bottom) and at
// the bottom of legal pages. Kept minimal — these links shouldn't
// compete with the map but must always be reachable.
export default function LegalFooter() {
  return (
    <nav className="legal-footer" aria-label="Sivuston tietosuoja ja käyttöehdot">
      <Link to="/tietosuoja">Tietosuoja</Link>
      <span aria-hidden="true">·</span>
      <Link to="/kayttoehdot">Käyttöehdot</Link>
    </nav>
  )
}
