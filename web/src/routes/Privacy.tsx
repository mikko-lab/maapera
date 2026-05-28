import LegalPage from '../components/LegalPage'

export default function Privacy() {
  return (
    <LegalPage title="Tietosuojaseloste">
      <dl className="legal-meta">
        <dt>Rekisterinpitäjä</dt>
        <dd>WP Saavutettavuus (Y-tunnus 3404806-1)</dd>
        <dt>Yhteystiedot</dt>
        <dd><a href="mailto:info@wpsaavutettavuus.fi">info@wpsaavutettavuus.fi</a></dd>
        <dt>Päivitetty</dt>
        <dd>28.5.2026</dd>
      </dl>

      <h2>Mitä tietoja keräämme</h2>
      <p>
        Tietomaaperä-palvelun julkinen karttanäkymä ei vaadi
        kirjautumista eikä kerää henkilötietoja kävijöistä.
      </p>
      <p>
        Palvelu käyttää teknisiä evästeitä vain toiminnallisuuden
        varmistamiseen. Emme käytä mainos- tai seurantaevästeitä.
      </p>

      <h2>Mitä dataa palvelu näyttää</h2>
      <p>Palvelu yhdistää julkisesti saatavilla olevaa avointa dataa:</p>
      <ul>
        <li>
          Copernicus European Ground Motion Service (EGMS),
          Sentinel-1 -satelliittidata (© European Union, © ESA)
        </li>
        <li>
          Maanmittauslaitoksen Maastotietokanta, rakennuspolygonit
          (lisenssi CC BY 4.0)
        </li>
      </ul>
      <p>
        Palvelu ei sisällä henkilötietoja eikä kiinteistöjen
        omistajatietoja. Rakennukset esitetään anonyymillä
        tunnisteella ja koordinaateilla.
      </p>

      <h2>Yhteydenotot</h2>
      <p>
        Tietosuojaan liittyvissä kysymyksissä:{' '}
        <a href="mailto:info@wpsaavutettavuus.fi">info@wpsaavutettavuus.fi</a>
      </p>
    </LegalPage>
  )
}
