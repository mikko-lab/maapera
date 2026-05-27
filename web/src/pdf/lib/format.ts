// Finnish number, date, and unit formatting helpers used across the PDF
// pages. Centralised here so the locale and rounding rules are applied
// consistently — never reach for `.toFixed()` directly inside a page.

const NBSP = ' '

export function formatVelocity(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return '—'
  const rounded = Math.round(v * 10) / 10
  // ASCII minus only — react-pdf's built-in Helvetica uses WinAnsiEncoding,
  // which lacks the Unicode minus U+2212 (renders blank, dropping the sign).
  // Tracked under "Known Issues" in CLAUDE.md; revisit when custom TTF fonts ship.
  const sign = rounded > 0 ? '+' : rounded < 0 ? '-' : ''
  return `${sign}${Math.abs(rounded).toLocaleString('fi-FI', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}${NBSP}mm/v`
}

export function formatMm(v: number | null | undefined, digits = 1): string {
  if (v == null || Number.isNaN(v)) return '—'
  return `${v.toLocaleString('fi-FI', { minimumFractionDigits: digits, maximumFractionDigits: digits })}${NBSP}mm`
}

export function formatDistance(m: number | null | undefined): string {
  if (m == null || Number.isNaN(m)) return '—'
  return `${Math.round(m).toLocaleString('fi-FI')}${NBSP}m`
}

export function formatArea(m2: number | null | undefined): string {
  if (m2 == null || Number.isNaN(m2)) return '—'
  return `${Math.round(m2).toLocaleString('fi-FI')}${NBSP}m²`
}

export function formatInteger(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—'
  return n.toLocaleString('fi-FI')
}

export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return '—'
  const dt = typeof d === 'string' ? new Date(d) : d
  return dt.toLocaleDateString('fi-FI', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function formatDateMonth(d: Date | string): string {
  const dt = typeof d === 'string' ? new Date(d) : d
  return dt.toLocaleDateString('fi-FI', { month: '2-digit', year: 'numeric' })
}

export const RISK_LABELS_FI: Record<string, string> = {
  stable:            'Vakaa',
  monitor:           'Seuranta',
  attention:         'Tarkistus',
  urgent:            'Kiireellinen',
  insufficient_data: 'Ei riittävää dataa',
}

export const TREND_LABELS_FI: Record<string, string> = {
  stable:       'Vakaa',
  linear:       'Lineaarinen',
  accelerating: 'Kiihtyvä',
  decelerating: 'Hidastuva',
  seasonal:     'Kausiluonteinen',
}
