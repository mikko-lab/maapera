// Top-level Document composing the seven report pages.
//
// Page order is the spec order — cover first, methodology and appendix
// last so a reader can skim the bottom-line on page 1 and drill down as
// needed. Each page imports its own header/footer; this file just lines
// them up.

import { Document, Font } from '@react-pdf/renderer'
import CoverPage from './pages/CoverPage'

// react-pdf hyphenates long Finnish compound words by default (e.g.
// "todennäköisesti routa- tai pohjavesivaikutus" breaks "routa-" off
// at a syllable). For property-management copy this looks careless;
// disable it globally so words stay intact across the document.
Font.registerHyphenationCallback((word: string) => [word])
import BuildingInfoPage from './pages/BuildingInfoPage'
import HistoryPage from './pages/HistoryPage'
import RiskPage from './pages/RiskPage'
import RecommendationsPage from './pages/RecommendationsPage'
import MethodologyPage from './pages/MethodologyPage'
import AppendixPage from './pages/AppendixPage'
import { assertPDFReportInput, type PDFReportInput } from './types'

interface Props {
  input: PDFReportInput
}

export default function PDFReport({ input }: Props) {
  assertPDFReportInput(input)
  return (
    <Document
      title={`Tietomaaperäraportti — kiinteistö ${input.building.building_id}`}
      author="Tietomaaperä (WP Saavutettavuus)"
      subject="InSAR-pohjainen maanliikeanalyysi"
      creator="Tietomaaperä PDF generator"
      producer="@react-pdf/renderer"
    >
      <CoverPage          input={input} />
      <BuildingInfoPage   input={input} />
      <HistoryPage        input={input} />
      <RiskPage           input={input} />
      <RecommendationsPage input={input} />
      <MethodologyPage    input={input} />
      <AppendixPage       input={input} />
    </Document>
  )
}
