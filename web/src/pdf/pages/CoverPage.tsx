import { Page, View, Text } from '@react-pdf/renderer'
import { colors, fonts, styles } from '../styles/theme'
import RiskBadge from '../components/RiskBadge'
import MetadataTable from '../components/MetadataTable'
import { formatDate } from '../lib/format'
import type { PDFReportInput } from '../types'

export default function CoverPage({ input }: { input: PDFReportInput }) {
  const { building, generatedAt, reportId } = input
  return (
    <Page size="A4" style={styles.page}>
      <View style={{ marginTop: 80, marginBottom: 32 }}>
        <Text style={{ fontFamily: fonts.display, fontSize: 11, color: colors.brand, letterSpacing: 1.5 }}>
          TIETOMAAPERÄRAPORTTI
        </Text>
        <Text style={styles.h1}>Rakennuksen maanliikeanalyysi</Text>
        <Text style={{ fontSize: 12, color: colors.textDim, marginTop: 4 }}>
          Sentinel-1 InSAR · EGMS Ortho L3 · {' '}
          {building.point_count} mittauspist{building.point_count === 1 ? 'e' : 'että'} ·{' '}
          {building.gia_baseline_mm_y.toFixed(2)} mm/v alueellinen GIA-baseline
        </Text>
      </View>

      <View style={{ marginBottom: 24 }}>
        <Text style={{ ...styles.small, marginBottom: 6 }}>Riskiluokka</Text>
        <RiskBadge riskClass={building.anomaly_class} size="large" />
      </View>

      <View style={{ marginBottom: 24 }}>
        <MetadataTable
          rows={[
            { label: 'Kiinteistö',     value: `Kiinteistö ${building.building_id}` },
            { label: 'Raportti-ID',    value: reportId },
            { label: 'Laadintapäivä',  value: formatDate(generatedAt) },
            { label: 'Laatija',        value: 'Tietomaaperä (WP Saavutettavuus, Y-tunnus 3404806-1)' },
            { label: 'Tilaaja',        value: '—' },
          ]}
        />
      </View>

      <View
        style={{
          marginTop: 12,
          padding: 10,
          backgroundColor: colors.surface,
          borderLeftWidth: 3,
          borderLeftColor: colors.brand,
          borderRadius: 2,
        }}
      >
        <Text style={{ fontSize: 10, color: colors.textDim }}>
          Tämä raportti dokumentoi rakennuksen pystysuoraa maanliikettä
          satelliittipohjaisen InSAR-mittauksen avulla. Raportti sisältää
          mittaushistorian, riskiluokituksen ja toimenpidesuositukset
          isännöinnin ja kiinteistönhoidon päätöksenteon tueksi.
        </Text>
      </View>

      <View style={{ position: 'absolute', bottom: 56, left: 56, right: 56 }}>
        <Text style={styles.small}>
          Data: © European Union, Copernicus Land Monitoring Service, European
          Ground Motion Service (EGMS). Sentinel-1 © ESA.{'\n'}
          Rakennustiedot: © Maanmittauslaitos, Maastotietokanta. Lisenssi: CC BY 4.0.
        </Text>
      </View>
    </Page>
  )
}
