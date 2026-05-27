import { Page, View, Text } from '@react-pdf/renderer'
import { colors, styles } from '../styles/theme'
import Header from '../components/Header'
import Footer from '../components/Footer'
import ChartImage from '../components/ChartImage'
import { formatDate, formatInteger, formatVelocity } from '../lib/format'
import type { PDFReportInput } from '../types'

export default function HistoryPage({ input }: { input: PDFReportInput }) {
  const { building, timeseries, reportId } = input
  const first = timeseries[0]
  const last = timeseries[timeseries.length - 1]

  return (
    <Page size="A4" style={styles.page}>
      <Header subtitle="2. Mittaushistoria" />
      <Text style={styles.h2}>Mittaushistoria</Text>

      <Text style={styles.p}>
        Kaavio esittää rakennuksen alueen pystysuoraa siirtymää suhteessa
        alueelliseen GIA-baselineen ({building.gia_baseline_mm_y.toFixed(2)} mm/v).
        Positiivinen poikkeama tarkoittaa, että rakennus nousee odotettua
        nopeammin; negatiivinen poikkeama, että nousu on hitaampaa tai
        rakennus vajoaa. Kaavio sisältää lineaarisen trendin (katkoviiva)
        ja sen kulmakertoimen mm/v.
      </Text>

      {/* Charts kept compact (150 px height each) so the Yhteenveto
          summary table fits on the same page; otherwise wrap={false}
          pushes the table to its own sparse page. */}
      <View style={{ marginTop: 4, marginBottom: 4 }}>
        <ChartImage points={timeseries} series="anomaly" height={150} />
        <Text style={{ ...styles.small, textAlign: 'center', marginTop: 2 }}>
          Poikkeama alueellisesta GIA-baselinesta (mm)
        </Text>
      </View>

      <View style={{ marginTop: 6, marginBottom: 4 }}>
        <ChartImage points={timeseries} series="raw" height={150} />
        <Text style={{ ...styles.small, textAlign: 'center', marginTop: 2 }}>
          Raaka pystysuora siirtymä EGMS-mittauksena (mm)
        </Text>
      </View>

      <View wrap={false}>
        <Text style={styles.h3}>Yhteenveto</Text>
        <View style={{ flexDirection: 'row', gap: 16, marginTop: 4 }}>
          <View style={{ flex: 1 }}>
            <Text style={styles.small}>Havaintojakso</Text>
            <Text>{formatDate(first?.date)} – {formatDate(last?.date)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.small}>Havaintojen lukumäärä</Text>
            <Text>{formatInteger(timeseries.length)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.small}>Keskinopeus (raaka)</Text>
            <Text>{formatVelocity(building.mean_velocity_mm_y)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.small}>Poikkeama baselinesta</Text>
            <Text>{formatVelocity(building.velocity_anomaly_mm_y)}</Text>
          </View>
        </View>
      </View>

      <Text style={{ ...styles.small, color: colors.textDim, marginTop: 10 }}>
        Lineaarinen trendi on laskettu pienimmän neliösumman menetelmällä.
        Kausivaihtelu sisältyy raakaan aikasarjaan; trendiluokitus
        käsittelee sen erikseen luvussa 3.
      </Text>

      <Footer reportId={reportId} />
    </Page>
  )
}
