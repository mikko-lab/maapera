import { Page, View, Text } from '@react-pdf/renderer'
import { colors, styles } from '../styles/theme'
import Header from '../components/Header'
import Footer from '../components/Footer'
import { formatMm } from '../lib/format'
import type { PDFReportInput } from '../types'

// Compact glossary — terms the typical property manager will see in the
// report and is unlikely to know off-hand. Keep entries one-sentence
// short; longer definitions belong in the methodology section.
const GLOSSARY: Array<{ term: string; definition: string }> = [
  { term: 'EGMS', definition:
    'European Ground Motion Service. Copernicus-ohjelman tuottama, koko Eurooppaa kattava InSAR-pohjainen maanliikepalvelu.' },
  { term: 'InSAR', definition:
    'Interferometric Synthetic Aperture Radar. Tutkainterferometria, jolla mitataan maapinnan liike millimetritarkkuudella.' },
  { term: 'Sentinel-1', definition:
    'Euroopan avaruusjärjestön (ESA) tutkasatelliitti, joka kuvaa Suomea 6–12 päivän välein.' },
  { term: 'GIA-baseline', definition:
    'Glacial Isostatic Adjustment — Suomen postglasiaalinen maan kohoaminen, 5–10 mm/v. Käytetään riskiluokituksen vertailutasona.' },
  { term: 'mm/v', definition:
    'Millimetriä vuodessa. Pystysuoran nopeuden yksikkö. Positiivinen = nousu, negatiivinen = vajoaminen.' },
  { term: 'Trendiluokitus', definition:
    'Aikasarjasta lasketun pitkän aikavälin kehityksen luonne (vakaa, lineaarinen, kiihtyvä, hidastuva, kausiluonteinen).' },
  { term: 'PTS', definition:
    'Pitkän Tähtäimen Suunnitelma. Taloyhtiön kiinteistön kunnossapitoa ohjaava 10-vuotinen suunnitelma-asiakirja.' },
]

export default function AppendixPage({ input }: { input: PDFReportInput }) {
  const { timeseries, reportId, pids } = input

  // Top 10 most recent observations as a sanity-check table the technical
  // reader can scan to verify the chart matches raw values. 10 rows is
  // the tightest fit that still keeps the glossary on the same page.
  const recent = timeseries.slice(-10).reverse()

  return (
    <Page size="A4" style={styles.page}>
      <Header subtitle="6. Liitteet" />
      <Text style={styles.h2}>Liitteet</Text>

      <Text style={styles.h3}>Mittauspisteet</Text>
      {pids && pids.length > 0 ? (
        <Text style={{ ...styles.small, marginBottom: 8 }}>
          Tähän rakennukseen on liitetty {pids.length} EGMS-pistettä:
          {' '}{pids.join(', ')}
        </Text>
      ) : (
        <Text style={{ ...styles.small, marginBottom: 8 }}>
          Mittauspisteiden tunnisteet eivät ole saatavilla tässä raportissa.
        </Text>
      )}

      <Text style={styles.h3}>Viimeisimmät havainnot (raaka aikasarja)</Text>
      <View
        wrap={false}
        style={{
          borderWidth: 0.5,
          borderColor: colors.borderLight,
          borderRadius: 4,
          marginBottom: 14,
        }}
      >
        <View style={{
          flexDirection: 'row',
          backgroundColor: colors.surface,
          borderBottomWidth: 0.5,
          borderBottomColor: colors.borderLight,
          padding: 6,
        }}>
          <Text style={{ width: '34%', fontSize: 9, fontWeight: 600 }}>Päivämäärä</Text>
          <Text style={{ width: '33%', fontSize: 9, fontWeight: 600 }}>Siirtymä</Text>
          <Text style={{ width: '33%', fontSize: 9, fontWeight: 600 }}>Poikkeama</Text>
        </View>
        {recent.map((p, i) => (
          <View
            key={p.date}
            style={{
              flexDirection: 'row',
              padding: 5,
              backgroundColor: i % 2 === 0 ? '#fff' : colors.surface,
            }}
          >
            <Text style={{ width: '34%', fontSize: 9 }}>{p.date}</Text>
            <Text style={{ width: '33%', fontSize: 9 }}>{formatMm(p.displacement_mm)}</Text>
            <Text style={{ width: '33%', fontSize: 9 }}>{formatMm(p.displacement_anomaly_mm)}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.h3}>Sanasto</Text>
      {GLOSSARY.map((g) => (
        // wrap={false} keeps each term + definition pair together; the
        // compact font / lineHeight pack all seven entries onto page 8
        // without spilling to a ninth page.
        <View key={g.term} wrap={false} style={{ marginBottom: 2 }}>
          <Text style={{ fontSize: 9, fontWeight: 600, lineHeight: 1.3 }}>
            {g.term}
          </Text>
          <Text style={{ fontSize: 9, color: colors.text, lineHeight: 1.3 }}>
            {g.definition}
          </Text>
        </View>
      ))}

      <Footer reportId={reportId} />
    </Page>
  )
}
