import { Page, View, Text } from '@react-pdf/renderer'
import { colors, styles } from '../styles/theme'
import Header from '../components/Header'
import Footer from '../components/Footer'
import type { PDFReportInput } from '../types'
import type { RiskClass } from '../../lib/types'

interface Horizon {
  title: string
  body: string
}

// The recommendation copy is keyed by the anomaly_class because that is
// the user-facing classification. Each horizon has a short, declarative
// sentence — no marketing fluff, no exclamation marks — written for a
// property manager who needs to defend their choices to a board later.
function recommendations(anomaly: RiskClass): Horizon[] {
  if (anomaly === 'urgent') {
    return [
      { title: '0–3 kk', body:
        'Tilaa rakennetekninen tarkastus välittömästi. Dokumentoi näkyvät halkeamat, kallistumat ja vesivuodot valokuvaten. Ilmoita poikkeavasta maanliikkeestä taloyhtiön hallitukselle kirjallisesti.' },
      { title: '3–12 kk', body:
        'Teetä pohjatutkimus (CPT, kairaus) lähimmistä rakennuksen vaikutusalueista. Vertaa havaittua liikettä lähinaapureihin; differentiaalinen vajoaminen on rakenneturvallisuusriski.' },
      { title: 'Pitkän tähtäimen', body:
        'Sisällytä jatkuva InSAR-seuranta PTS:ään seuraavalle 10 vuodelle. Liikkeen kiihtyminen edellyttää uutta arviointia. Varaa korjausbudjetti perustusten vahvistamiselle.' },
    ]
  }
  if (anomaly === 'attention') {
    return [
      { title: '0–3 kk', body:
        'Tarkastusta ei tarvitse tilata heti, mutta dokumentoi rakennuksen nykytila valokuvaten — vertailupohja seuraavaan EGMS-päivitykseen vuosittain.' },
      { title: '3–12 kk', body:
        'Tarkista perustusten ja vesieristyksen kunto seuraavan vuosihuollon yhteydessä. Konsultoi pohjarakenteiden asiantuntijaa jos rakennuksessa on näkyviä halkeamia.' },
      { title: 'Pitkän tähtäimen', body:
        'Seuranta jatkuvana — vuotuinen EGMS-päivitys varmistaa, ettei liike kiihdy. Sisällytä havainnot taloyhtiön PTS:ään.' },
    ]
  }
  if (anomaly === 'monitor') {
    return [
      { title: '0–3 kk', body:
        'Ei välittömiä toimenpiteitä. Tilanne on lievästi poikkeava mutta hyvin yleinen Turun savimaalla.' },
      { title: '3–12 kk', body:
        'Seuraa rakennuksen näkyvää kuntoa normaalin huollon yhteydessä. EGMS-data päivittyy seuraavan kerran loka–marraskuussa.' },
      { title: 'Pitkän tähtäimen', body:
        'Liite tämän raportin yhteenvetorivi PTS-asiakirjaan dokumentoinniksi huolellisuusvelvoitteen täyttämisestä.' },
    ]
  }
  if (anomaly === 'insufficient_data') {
    return [
      { title: '0–3 kk', body:
        'Riskiarviota ei voida muodostaa — rakennuksen alueella ei ole riittävästi EGMS-mittauspisteitä. Tämä on tyypillistä uudisrakennuksilla tai pienillä rakennuksilla, joiden katto ei reflektoi tutkasignaalia.' },
      { title: '3–12 kk', body:
        'Seuraa EGMS:n vuosittaisia päivityksiä; uudet pisteet voivat tulla mukaan ajan myötä. Vaihtoehtoisesti perinteinen pohjatutkimus.' },
      { title: 'Pitkän tähtäimen', body:
        'Mikäli rakennus laajenee tai pinnoite muuttuu, mittauspisteiden määrä voi kasvaa ja arvio päivittyy.' },
    ]
  }
  return [
    { title: '0–3 kk', body:
      'Ei välittömiä toimenpiteitä. Rakennus liikkuu odotetussa alueellisessa baselinessa.' },
    { title: '3–12 kk', body:
      'Normaali kiinteistön huoltokierto. Sisällytä tämän raportin yhteenveto PTS-päivitykseen.' },
    { title: 'Pitkän tähtäimen', body:
      'Vuotuinen EGMS-päivitys riittää. Mikäli rakennukseen tehdään merkittäviä rakennetöitä, tilaa uusi raportti.' },
  ]
}

export default function RecommendationsPage({ input }: { input: PDFReportInput }) {
  const { building, reportId } = input
  const horizons = recommendations(building.anomaly_class)
  return (
    <Page size="A4" style={styles.page}>
      <Header subtitle="4. Toimenpidesuositukset" />
      <Text style={styles.h2}>Toimenpidesuositukset</Text>

      <Text style={styles.p}>
        Suositukset on ryhmitelty kolmeen aikajaksoon. Ne perustuvat InSAR-datan
        analyysiin eivätkä korvaa rakennetekniikan ammattilaisen arviota; ne
        antavat lähtökohdan päätöksenteolle ja PTS-suunnittelulle.
      </Text>

      {horizons.map((h) => (
        <View key={h.title} style={{ marginBottom: 14 }}>
          <Text style={styles.h3}>{h.title}</Text>
          <Text>{h.body}</Text>
        </View>
      ))}

      <View
        style={{
          marginTop: 18,
          padding: 12,
          backgroundColor: '#FEF3C7',
          borderLeftWidth: 3,
          borderLeftColor: colors.riskMonitor,
          borderRadius: 2,
        }}
      >
        <Text style={{ fontSize: 11, fontWeight: 700, marginBottom: 4 }}>Rajaus</Text>
        <Text style={{ fontSize: 10, color: colors.text }}>
          Tämä raportti EI korvaa pohjatutkimusta, rakennusteknistä tarkastusta
          tai paikalla käyntiä. Se on satelliittipohjainen lähtötietoanalyysi
          osoituksena huolellisuusvelvoitteen täyttämisestä. Päätökset rakenteita
          koskevista korjauksista tehdään aina valtuutetun asiantuntijan
          arvioinnin perusteella.
        </Text>
      </View>

      <Footer reportId={reportId} />
    </Page>
  )
}
