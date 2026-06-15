# Tietomaaperä — Riskiluokituksen attribuutiospesifikaatio

**Versio:** 0.2  
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

`risk_class_uncertain=True` tarkoittaa: **luokittelu on laskettu, mutta käytetty signaali ei ole rakennuskohtainen tai siihen liittyy tunnettu mittausepävarmuus.**

Lippu asetetaan jos jokin seuraavista täyttyy:

| Ehto | Kynnys | Perustelu |
|------|--------|-----------|
| Kaikki pisteet KAT3 | (aina) | Alueellinen data, ei rakennuskohtainen |
| Cycle-slip-artefakti | (aina) | Interferometrinen vaihevirhe havaittu |
| Uplift-nopeus (P1b) | `max_velocity > +10 mm/v` | Epäfysikaalinen nousu: GIA Helsingissä ≈ +3–5 mm/v; yli +10 on anomalia jonka detektori ei tavoita |
| Yksi piste (P0) | `point_count == 1` | Yksi piste ei erota rakennuskohtaista liikettä pistekohtaisesta hajonnasta |
| Ajavan pisteen korkea RMSE (P1a) | `driving_point_rmse > 2.8 mm` | Epälineaarinen tai kohinainen aikasarja; lineaarinen nopeusarvio epäluotettava. Kalibroidtu: 2213956894 rmse=2.97 (epäilyttävä) vs 2082371149 rmse=2.69 (suuri rakennus, odotettavissa) |

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

### P1c — Yhden pisteen tyrannia (päätöspiste, ei toteutettu)

**Laskettu vaikutus (Helsinki, 2026-06-15):** Jos sääntö olisi "attention/urgent vaatii ≥2 samansuuntaista pistettä":

| building_id | Luokka | Status | Ajavan vel | Pisteet | Same-dir | Muutos? |
|-------------|--------|--------|-----------|---------|----------|---------|
| 2169337782 | attention | VARMA | −7.6 | 2 | 1 | → demote |
| 414052020 | attention | VARMA | −7.5 | 2 | 1 | → demote |
| 417680071 | attention | uncertain | +5.0 | 1 | 1 | → demote |
| 2213956894 | urgent | uncertain | −11.7 | 2 | 1 | → demote |
| 414500216 | urgent | uncertain | +12.1 | 2 | 2 | pysyisi |
| 1641597957 | urgent | uncertain | +12.4 | 5 | 5 | pysyisi |
| 1167003848 | attention | VARMA | +6.2 | 4 | 4 | pysyisi |
| 417571296 | attention | VARMA | +6.7 | 4 | 4 | pysyisi |
| 2082371149 | attention | VARMA | +6.7 | 6 | 6 | pysyisi |
| 907625807 | attention | VARMA | +6.4 | 8 | 7 | pysyisi |

**Yhteenveto:** 4/10 muuttuisi → 6/10 pysyisi. Muuttuvista 2 on VARMA (2169337782, 414052020) — kummallakin 2 pistettä, mutta ne osoittavat eri suuntiin.

**Päätöspiste (Chris):** Otetaanko sääntö käyttöön? Seuraukset:
- Kahdelta VARMALTA attention-rakennukselta putoaisi signaali, vaikka toinen pisteistä mittaa merkittävää subsidenssia (−7 mm/v).
- Vaihtoehtoisesti ne voidaan pitää attention + uncertain:True — signaali säilyy mutta epävarmuus on merkitty.

**Koodi ei toteuta sääntöä ennen päätöstä.**

---

## Muutoshistoria

| Versio | Päivä | Muutos |
|--------|-------|--------|
| 0.2 | 2026-06-15 | P0 (1-piste-guard), P1a (RMSE-kynnys 2.8 mm), P1b (uplift sanity +10 mm/v), P1c-vaikutuslaskelma lisätty; `risk_class_uncertain`-ehtojen taulukko täydennetty |
| 0.1 | 2026-06-15 | Perusmääritelmä, KAT1/KAT2-vaatimus attention/urgent:ille, `regional_motion_flag` ja `risk_class_uncertain` |
