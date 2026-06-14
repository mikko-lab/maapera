# Tietomaaperä — Riskiluokituksen attribuutiospesifikaatio

**Versio:** 0.1  
**Päivätty:** 2026-06-15  
**Tarkoitus:** Tämä dokumentti määrittelee mitä kukin riskiluokka väittää ja mitä mittausta se vaatii. Koodi on tämän asiakirjan implementaatio — ei toisin päin.

---

## Mitä riskiluokka väittää

`risk_class` on **rakennuskohtainen** väite: "tämä rakennus tai sen välitön perusta liikkuu tietyllä nopeudella."

Väite on perusteltu vain kun EGMS-mittauspiste on peräisin rakennuksen footprintistä tai sen välittömästä läheisyydestä niin, että piste voi erotella rakennuksen liikkeen ympäröivästä maastosta. Tätä erottelukykyä arvioidaan kolmiportaisella KAT-luokittelulla.

---

## KAT-luokittelu (pisteiden suhde rakennukseen)

| Luokka | Kriteeri | Tulkinta |
|--------|----------|----------|
| **KAT1** | Footprintin sisällä, ≥ 2.5 m reunasta, korkeus ≥ 8 m | Todennäköinen rakennusskattereri. Rakennuskohtainen signaali. |
| **KAT2** | Footprintin sisällä mutta reunan läheisyydessä (< 2.5 m) tai matala (< 8 m) | Rajakohtainen — voi olla seinä, piha tai viereinen maasto. |
| **KAT3** | Footprintin ulkopuolella (puskurivyöhykkeellä, ≤ 75 m) | Todennäköisesti parkkipaikka, täyttömaa tai piha. Rakennuskohtainen johtopäätös ei ole tuettu. |

---

## Riskiluokituksen vaatimukset KAT-luokan mukaan

**Kohonnut riskiluokka (`attention` tai `urgent`) vaatii vähintään yhden KAT1- tai KAT2-pisteen.**

Perustelu: `attention` tarkoittaa "tämä rakennus ansaitsee tarkastuksen". Se on väite joka kohdistetaan rakennukseen nimeltä ja josta voidaan tehdä toimenpidepäätös. Väitteen tekeminen pelkän KAT3-pisteen perusteella — piste joka on 10–75 m rakennuksen ulkopuolella — on virheellinen attribuutio, ei epävarmuuden huomioiminen.

| KAT-koostumus | Suurin sallittu riskiluokka | Huomautus |
|---------------|----------------------------|-----------|
| ≥ 1 KAT1 tai KAT2 | `urgent` | Rakennuskohtainen signaali |
| Vain KAT3, nopeus olisi `attention/urgent` | `monitor` + `regional_motion_flag=True` | Alueellinen maanliike — ei rakennusriski |
| Vain KAT3, nopeus on `monitor/stable` | `monitor/stable` + `risk_class_uncertain=True` | Data on alueellista, luokittelu säilyy mutta epävarmuus kirjataan |
| Ei pisteitä | `insufficient_data` | Ei dataa |

---

## `regional_motion_flag` — mitä se tarkoittaa

`regional_motion_flag=True` tarkoittaa: **mittauspiste havaitsee merkittävää maanliikettä lähialueella, mutta sitä ei voida attribuoida tähän rakennukseen.**

Syy voi olla maaperän laajamittainen painuminen, viereinen täyttömaa, tai pisteet jotka ovat liian kaukana erottelemaan rakennuksen liikkeen ympäristöstä.

Tämä ei ole "ei dataa" — se on "data on alueellista". Isännöitsijä voi nähdä että naapurustossa on liikettä, vaikka juuri tämän rakennuksen osuutta ei voida todistaa.

**Visuaalinen esitys:** Karttaväri on teräksenharmaa (RGB 70, 130, 180), erillinen kaikista riskiväreistä. Paneelissa näkyy ilmoitusteksti "Alueellinen maanliike havaittu".

---

## `risk_class_uncertain` — mitä se tarkoittaa

`risk_class_uncertain=True` tarkoittaa: **luokittelu on laskettu, mutta käytetty signaali ei ole rakennuskohtainen.**

Kaikki KAT3-only-rakennukset saavat tämän lipun riippumatta velocity-tasosta. Myös cycle-slip-artefakti-epäily asettaa tämän lipun.

Frontend voi käyttää tätä lippua lisätiedon näyttämiseen, mutta se ei muuta karttaväriä — `regional_motion_flag` tekee sen.

---

## Numeroiden merkitys (Helsinki, ajo 2026-06-15)

Helsinki (41 214 luokiteltua rakennusta, EGMS L3 E51N42):

- **10 rakennusta** joilla `attention/urgent` — kaikilla ≥ 1 KAT1/KAT2-piste. Nämä ovat rakennuskohtaisen tarkastuksen ehdokkaita.
- **181 rakennusta** joilla `regional_motion_flag=True` — alueellinen liike havaittu, rakennusattribuutio ei tue kohonnutta luokkaa.
- **39 023 rakennusta** joilla `risk_class_uncertain=True` — luokittelu perustuu alueelliseen signaaliin (KAT3-pisteet).

Turku (20 607 luokiteltua rakennusta, EGMS L3 E49N42 + E50N42):

- **285 rakennusta** joilla `attention/urgent` — kaikilla ≥ 1 KAT1/KAT2-piste.
- Aiempi luku (11 522) sisälsi KAT3-only-rakennuksia; ne on siirretty `monitor + regional_motion_flag=True`.

---

## Mitä tämä ei ratkaise

Tämä spesifikaatio kuvaa *attribuutiosäännön*, ei *signaalin fysiikkaa*:

- KAT2-piste lähellä footprintin reunaa on edelleen epävarma.
- KAT1-piste korkealla rakennuksessa on vahvempi signaali kuin KAT1-piste matalassa rakennuksessa.
- `max_velocity_mm_y`-perusteinen riskiluokka on herkkä outlier-pisteille: yksi +12 mm/v piste nostaa koko rakennuksen `urgent`-luokkaan, vaikka muut pisteet ovat alueellisella tasolla.
- Epälineaarisille aikasarjoille (korkea residuaalihajonnan RMSE) ei ole erillistä epäluotettavuuslippua — tarvitaan rmse-kynnys `risk_class_uncertain`:iin.

Nämä ovat seuraavan iteraation tarkennus kun data tukee niitä.

---

## Muutoshistoria

| Versio | Päivä | Muutos |
|--------|-------|--------|
| 0.1 | 2026-06-15 | Perusmääritelmä, KAT1/KAT2-vaatimus attention/urgent:ille, `regional_motion_flag` ja `risk_class_uncertain` |
