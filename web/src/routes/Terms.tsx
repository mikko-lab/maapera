import LegalPage from '../components/LegalPage'

export default function Terms() {
  return (
    <LegalPage title="Käyttöehdot">
      <dl className="legal-meta">
        <dt>Palveluntarjoaja</dt>
        <dd>WP Saavutettavuus (Y-tunnus 3404806-1)</dd>
        <dt>Päivitetty</dt>
        <dd>28.5.2026</dd>
      </dl>

      <h2>Palvelun luonne</h2>
      <p>
        Tietomaaperä on satelliittipohjainen maanliikkeen
        seurantapalvelu. Palvelu esittää Copernicus EGMS -ohjelman
        tuottamaa avointa dataa rakennustasolle jäsenneltynä.
      </p>

      <h2>Vastuunrajoitus</h2>
      <p>
        Palvelun tiedot ovat suuntaa-antavia. Ne perustuvat
        satelliittimittauksiin ja tilastolliseen analyysiin, eivätkä
        korvaa pohjatutkimusta, rakennusteknistä tarkastusta tai
        geoteknisen asiantuntijan arviota.
      </p>
      <p>
        Palveluntarjoaja ei vastaa vahingoista, jotka aiheutuvat
        palvelun tietojen perusteella tehdyistä päätöksistä.
        Rakenteita koskevat ratkaisut tulee aina perustaa
        valtuutetun asiantuntijan arvioon.
      </p>

      <h2>Datan lähteet ja tekijänoikeudet</h2>
      <p>
        Palvelun käyttämä satelliittidata on Euroopan unionin
        Copernicus-ohjelman ja Euroopan avaruusjärjestön (ESA)
        omaisuutta. Rakennustiedot ovat Maanmittauslaitoksen
        avointa dataa (CC BY 4.0).
      </p>

      <h2>Muutokset</h2>
      <p>
        Palvelu on kehitysvaiheessa (MVP). Ominaisuudet ja
        käyttöehdot voivat muuttua.
      </p>
    </LegalPage>
  )
}
