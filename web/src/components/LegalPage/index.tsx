import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import LegalFooter from '../LegalFooter'

// Shared shell for /tietosuoja and /kayttoehdot. Renders a slim
// header (brand link, no h1), the page's h1+content, and the same
// LegalFooter as the map view. Keeps WCAG heading hierarchy clean:
// page-level h1 belongs to the route, not the shell.
interface Props {
  title: string
  children: ReactNode
}

export default function LegalPage({ title, children }: Props) {
  return (
    <>
      <a href="#legal-content" className="skip-link">
        Siirry pääsisältöön
      </a>

      <header className="app-header" role="banner">
        <Link to="/" className="brand-link" aria-label="Tietomaaperä — palaa karttanäkymään">
          Tietomaaperä
        </Link>
        <nav className="header-actions" aria-label="Palaa karttaan">
          <Link to="/" className="btn btn-ghost">← Karttanäkymä</Link>
        </nav>
      </header>

      <main id="legal-content" className="legal-page" tabIndex={-1}>
        <article>
          <h1>{title}</h1>
          {children}
        </article>
        <LegalFooter />
      </main>
    </>
  )
}
