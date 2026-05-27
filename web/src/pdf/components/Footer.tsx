// Footer is returned as an array of two top-level fixed Text siblings.
// Tracked under "Known Issues" in CLAUDE.md (react-pdf 4.5 quirk).
//
// Why an array instead of a wrapping View (or a Fragment):
//   - Wrapping the elements in a fixed View made react-pdf 4.5 silently
//     drop the page-number Text on every page (across all real pages,
//     while a minimal isolated repro worked — diagnosed via pdftotext).
//   - Returning a React Fragment from the component triggered the same
//     symptom when the Footer was reused across multiple Pages.
//   - Returning an array works: each Text is a direct child of the Page,
//     `fixed` repeats it, and the render-prop counter renders reliably.

import { Text } from '@react-pdf/renderer'
import { colors } from '../styles/theme'

interface FooterProps {
  reportId: string
}

export default function Footer({ reportId }: FooterProps): React.ReactNode {
  return [
    <Text
      key="footer-left"
      fixed
      style={{
        position: 'absolute',
        bottom: 24,
        left: 56,
        right: 140,                // leave room for "Sivu N / N"
        fontSize: 8,
        color: colors.textDim,
      }}
    >
      {`${reportId}  ·  Tietomaaperä  ·  WP Saavutettavuus, Y-tunnus 3404806-1`}
    </Text>,
    <Text
      key="footer-right"
      fixed
      style={{
        position: 'absolute',
        bottom: 24,
        right: 56,
        fontSize: 8,
        color: colors.textDim,
        textAlign: 'right',
      }}
      render={({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) =>
        `Sivu ${pageNumber} / ${totalPages}`
      }
    />,
  ]
}
