import { Page, View, Text } from '@react-pdf/renderer'
import { colors, styles } from '../styles/theme'
import Header from '../components/Header'
import Footer from '../components/Footer'
import { formatDistance, formatInteger } from '../lib/format'
import type { PDFReportInput } from '../types'

interface Section {
  title: string
  body: string
}

// The "Tarkkuus ja rajoitukset" body is per-building so the reader sees
// exactly how many EGMS points fed their aggregate and how close the
// nearest one was. Sections 1–2 stay static (general background).
function buildSections(input: PDFReportInput): Section[] {
  const { point_count, nearest_point_distance_m } = input.building
  return [
    {
      title: 'Sentinel-1 ja InSAR-tekniikka',
      body: 'European Space Agencyn (ESA) Sentinel-1 -satelliitit kuvaavat Suomea tutkalla 6–12 päivän välein. Interferometrinen InSAR-prosessointi yhdistää saman alueen kuvia eri ajankohdilta ja erottaa millimetritarkkuudella, kuinka paljon maapinta on liikkunut kuvien välillä. Tekniikka soveltuu sekä äkilliseen liikkeeseen (maanjäristykset, sortumat) että hitaaseen vajoamiseen (savimaa, perustusten asettuminen).',
    },
    {
      title: 'EGMS-prosessointi',
      body: 'European Ground Motion Service (EGMS) on Copernicus-ohjelman koko Eurooppaa kattava ennakkoprosessoitu InSAR-tuote. Tämä raportti perustuu Ortho L3 -tuotteeseen, joka antaa pystysuoran komponentin nopeuden (mm/v) 100 m × 100 m -ruudukkona. EGMS päivittyy vuosittain loka–marraskuussa, ja jokainen julkaisu kattaa havainnot vuodesta 2018 alkaen.',
    },
    {
      title: 'Tarkkuus ja rajoitukset',
      body:
        'EGMS:n pystysuoran nopeuden mittausepävarmuus on tyypillisesti ±0,5 mm/v rakennuksessa, jolla on useita mittauspisteitä. Yksittäisten pisteiden epävarmuus voi olla suurempi — EGMS:n mean_velocity_std-arvo kuvaa tätä. Mittauspisteitä saadaan vain alueilta, joista tutkasignaali heijastuu coherentisti (rakennukset, tiet, kalliopinta). Tiheässä metsässä, pelloilla ja vesistöissä pisteitä ei ole. Rakennuksen muodonmuutoksia (esim. yksittäisen kulman vajoaminen) tämä Ortho L3 -tuote ei erottele — siihen tarvitaan tarkempi Basic L2 -tuote, joka tulee myöhemmin tarjontaan.\n\n' +
        `Tämä raportti perustuu ${formatInteger(point_count)} EGMS-mittauspisteeseen rakennuksen ympärillä, lähimpänä ${formatDistance(nearest_point_distance_m)} etäisyydellä. Tämä täyttää minimivaatimuksen luotettavalle aggregoinnille — useammilla pisteillä raportoidut nopeudet ovat tarkempia.`,
    },
  ]
}

const SOURCES: string[] = [
  'Copernicus Land Monitoring Service: European Ground Motion Service (EGMS). https://egms.land.copernicus.eu',
  'European Space Agency: Sentinel-1 Mission. https://sentinel.esa.int/web/sentinel/missions/sentinel-1',
  'Maanmittauslaitos: Maastotietokanta (rakennuspolygonit). https://maanmittauslaitos.fi',
  'Lehtonen et al. (NLS): NKG2016LU postglacial land uplift model.',
]

export default function MethodologyPage({ input }: { input: PDFReportInput }) {
  const { reportId } = input
  const sections = buildSections(input)
  return (
    <Page size="A4" style={styles.page}>
      <Header subtitle="5. Menetelmä" />
      <Text style={styles.h2}>Menetelmä</Text>

      {sections.map((s) => (
        <View key={s.title} style={{ marginBottom: 12 }}>
          <Text style={styles.h3}>{s.title}</Text>
          <Text>{s.body}</Text>
        </View>
      ))}

      <Text style={styles.h3}>Lähteet ja attribuutio</Text>
      {SOURCES.map((s, i) => (
        <Text key={i} style={{ ...styles.small, marginBottom: 2 }}>
          • {s}
        </Text>
      ))}

      <View
        style={{
          marginTop: 14,
          padding: 8,
          backgroundColor: colors.surface,
          borderRadius: 2,
        }}
      >
        <Text style={styles.small}>
          Data: © European Union, Copernicus Land Monitoring Service,
          European Ground Motion Service (EGMS). Sentinel-1 © ESA.
          {'\n'}
          Rakennustiedot: © Maanmittauslaitos, Maastotietokanta. Lisenssi: CC BY 4.0.
        </Text>
      </View>

      <Footer reportId={reportId} />
    </Page>
  )
}
