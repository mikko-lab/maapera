import { Page, Text } from '@react-pdf/renderer'
import { styles } from '../styles/theme'
import Header from '../components/Header'
import Footer from '../components/Footer'
import MetadataTable from '../components/MetadataTable'
import { formatArea, formatDistance, formatInteger } from '../lib/format'
import type { PDFReportInput } from '../types'

// `kayttotarkoitus` (the raw MTK 1-digit code) is omitted from the
// table because the bare number — 1, 2, 6 — isn't informative on its
// own. Day 7+ task: ship a Finnish lookup in lib/format.ts
// (1 = Asuinrakennus, 2 = Liike- ja toimistorakennus, …) and reinstate
// the row with the label name.

export default function BuildingInfoPage({ input }: { input: PDFReportInput }) {
  const { building, reportId } = input
  return (
    <Page size="A4" style={styles.page}>
      <Header subtitle="1. Rakennuksen tiedot" />
      <Text style={styles.h2}>Rakennuksen tiedot</Text>

      <MetadataTable
        rows={[
          { label: 'Kiinteistötunnus',  value: building.building_id },
          { label: 'Pohjapinta-ala',    value: formatArea(building.footprint_area_m2) },
          { label: 'Kerrosluku',        value: building.kerrosluku != null
                                              ? `${building.kerrosluku} krs`
                                              : '—' },
          { label: 'EGMS-mittauspisteitä', value: formatInteger(building.point_count) },
          { label: 'Lähin mittauspiste',   value: formatDistance(building.nearest_point_distance_m) },
        ]}
      />

      <Text style={{ ...styles.p, marginTop: 16 }}>
        Mittausjärjestelmä on European Ground Motion Service (EGMS), Ortho L3,
        pystysuoraan suuntaan korjattu tuote. Rakennuksiin liittyvät havainnot
        on aggregoitu 75 m säteen sisältä rakennuksen julkisivusta, painottaen
        lähimpiä mittauspisteitä. Ks. luku 5 (Menetelmä) tarkemmat tiedot.
      </Text>

      <Text style={{ ...styles.small, marginTop: 12 }}>
        Kohteen sijainti on katseltavissa Tietomaaperä-palvelun karttanäkymässä.
      </Text>

      <Footer reportId={reportId} />
    </Page>
  )
}
