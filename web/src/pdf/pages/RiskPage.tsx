import { Page, View, Text } from '@react-pdf/renderer'
import { colors, styles } from '../styles/theme'
import Header from '../components/Header'
import Footer from '../components/Footer'
import RiskThermometer from '../components/RiskThermometer'
import MetadataTable from '../components/MetadataTable'
import RiskBadge from '../components/RiskBadge'
import { TREND_LABELS_FI, formatVelocity } from '../lib/format'
import type { PDFReportInput } from '../types'

// Plain-language narrative for the three trend classes most likely to
// matter to a property manager. Returned as a short Finnish sentence
// that fits into the interpretation table without overflowing the row.
function trendInterpretation(input: PDFReportInput): string {
  const { trend_class_anomaly: trend } = input.building
  if (!trend) return 'Trendiluokitus puuttuu — havaintoja liian vähän tilastolliseen päättelyyn.'
  if (trend === 'stable') return 'Rakennus seuraa alueellista baselineä; ei selvää poikkeavaa pitkän aikavälin liikettä.'
  if (trend === 'linear') return 'Tasainen poikkeava nousu tai vajoaminen — seuraa havaintoja, tilanne on hallittavissa.'
  if (trend === 'accelerating') return 'Liike on kiihtynyt viime kahden vuoden aikana — tarkastele perustusten kuntoa lähiaikoina.'
  if (trend === 'decelerating') return 'Liike on hidastunut — mahdollisesti aiemman kuormituksen jälkivaihe.'
  if (trend === 'seasonal') return 'Vuotuinen vaihtelu hallitsee aikasarjaa — liittyy todennäköisesti routimiseen tai pohjaveteen, ei rakennevika.'
  return ''
}

export default function RiskPage({ input }: { input: PDFReportInput }) {
  const { building, reportId } = input
  return (
    <Page size="A4" style={styles.page}>
      <Header subtitle="3. Riskiarvio" />
      <Text style={styles.h2}>Riskiarvio</Text>

      <View style={{ marginTop: 4, marginBottom: 12 }}>
        <RiskBadge riskClass={building.anomaly_class} size="large" />
      </View>

      <View style={{ marginBottom: 16 }}>
        <Text style={styles.small}>Kokonaisluokka (poikkeama baselinesta)</Text>
        <Text style={{ fontSize: 11, color: colors.textDim, marginTop: 4 }}>
          {formatVelocity(building.velocity_anomaly_mm_y)} — vertaa nousevaan
          alueelliseen baseline-arvoon (+{building.gia_baseline_mm_y.toFixed(2)} mm/v).
        </Text>
      </View>

      <View style={{ marginBottom: 16 }}>
        <Text style={styles.h3}>Sijainti riskiasteikolla</Text>
        <RiskThermometer anomalyMmY={building.velocity_anomaly_mm_y} />
      </View>

      <Text style={styles.h3}>Tulkinta</Text>
      <MetadataTable
        rows={[
          { label: 'Trendi (poikkeama)',
            value: building.trend_class_anomaly
              ? TREND_LABELS_FI[building.trend_class_anomaly]
              : '—' },
          { label: 'Trendi (raaka)',
            value: building.trend_class_absolute
              ? TREND_LABELS_FI[building.trend_class_absolute]
              : '—' },
          { label: 'Selitys', value: trendInterpretation(input) },
          { label: 'Mittausepävarmuus',
            value: building.velocity_std != null
              ? `±${building.velocity_std.toFixed(2)} mm/v (EGMS mean_velocity_std)`
              : '—' },
        ]}
        labelWidth={0.32}
      />

      <Text style={{ ...styles.small, marginTop: 16, color: colors.textDim }}>
        Riskiluokka perustuu poikkeamaan alueellisesta GIA-baselinesta, ei
        absoluuttiseen nopeuteen. Suomessa maa nousee jääkauden jäljiltä
        keskimäärin 5–10 mm/v, joten absoluuttinen positiivinen nopeus ei sinänsä
        ole riskisignaali — vain poikkeama yleisestä trendistä on.
      </Text>

      <Footer reportId={reportId} />
    </Page>
  )
}
