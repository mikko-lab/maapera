# Tietomaaperä — Riskiluokituksen attribuutiospesifikaatio

**Versio:** 0.3  
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

**Kohonnut riskiluokka (`attention` tai `urgent`) edellyttää, että luokan aiheuttava piste (driving point) on KAT1 tai KAT2.**

Pelkkä KAT1/KAT2-pisteen olemassaolo ei riitä — se ei saa olla neutraali sivustakatsoja jonka varjossa KAT3-piste ajaa luokan. Sääntö tarkistaa provenienssin, ei olemassaolon.

Perustelu: `attention` tarkoittaa "tämä rakennus ansaitsee tarkastuksen". Se on väite joka kohdistetaan rakennukseen nimeltä ja josta voidaan tehdä toimenpidepäätös. Väitteen tekeminen KAT3-pisteen perusteella — piste joka on 10–75 m rakennuksen ulkopuolella — on virheellinen attribuutio, vaikka rakennuksella olisi myös neutraali KAT2-piste.

| Driving-pisteen KAT | Suurin sallittu riskiluokka | Huomautus |
|---------------------|----------------------------|-----------|
| KAT1 tai KAT2 | `urgent` | Rakennuskohtainen signaali — driving on footprintissä |
| KAT3, nopeus olisi `attention/urgent` | `monitor` + `regional_motion_flag=True` | Alueellinen maanliike — ajava piste ei ole footprintissä |
| KAT3, nopeus on `monitor/stable` | `monitor/stable` + `risk_class_uncertain=True` | Ajava piste on alueellinen, luokittelu epävarma |
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
| Anomaly-spread (P2) | `\|max_anomaly − mean_anomaly\| ≥ 1.5 mm/v` | Ajava piste poikkeaa rakennuksen kaikkien pisteiden GIA-korjatusta painotettusta keskiarvosta. Kynnys = puolet attention-kynnyksestä (3.0/2 = 1.5 mm/v) — fysiikkapohjainen, ei sovitettu yksittäisiin rakennuksiin. GIA-korjaus tehdään ennen vertailua: rakennuksella jossa kaikki raakanopeuden pisteet ovat etumerkiltään positiivisia mutta kolme on GIA-tasolla (+3 mm/v) ja yksi poikkeaa selvästi, anomaly-korjaus paljastaa outlier-rakenteen (+0.3, 0.0, −0.6, +3.2). Algebraisesti \|max_anomaly − mean_anomaly\| = \|max_velocity − mean_velocity\| (baseline supistuu), mutta viitekohta on tausta, ei raakaarvo. |

Frontend voi käyttää tätä lippua lisätiedon näyttämiseen, mutta se ei muuta karttaväriä — `regional_motion_flag` tekee sen.

---

## Numeroiden merkitys (Helsinki, ajo 2026-06-15)

Helsinki (41 214 luokiteltua rakennusta, EGMS L3 E51N42):

- **0 rakennusta** joilla `attention/urgent` ja `uncertain=False` — kaikki 7 elevated rakennusta ovat uncertain.
- **7 rakennusta** joilla `attention/urgent` ja `uncertain=True`. Uncertain-syyt:
  - P2-spread (5 kpl): ajava piste poikkeaa GIA-korjatusta rakennusmean:ista > 1.5 mm/v
  - P0-single (1 kpl, `417680071`): yksi EGMS-piste
  - P1b-uplift + P2 (1 kpl, `414500216`): max=+12.1 mm/v, spread=2.0
- **184 rakennusta** joilla `regional_motion_flag=True` — alueellinen liike havaittu, driving-piste ei ole footprintissä (KAT3-only tai KAT3-driving).
- Aiempi luku 10 sisälsi 3 varjo-tapausta joissa KAT3-driving-piste ajoi luokan KAT2-pisteen varjossa; ne on siirretty `monitor + regional_motion_flag=True`.

### CERTAIN-status edellyttää käsitarkistuksen

`uncertain=False` (CERTAIN) ei synny automaattisesti pipelinesta — se ansaitaan vasta kun rakennus on tarkistettu käsin: satelliittikuva, naapurivertailu, aikasarjakäyrä. Tähän asti yhtään Helsinki-rakennusta ei ole vahvistettu CERTAIN:iksi.

**Ainoa potentiaalinen vahvistettava:** `414052020` (1-kerroksinen, 356 m², lat=60.24195, lon=24.94402).
- Driving-piste sisällä (KAT2, matala rakennus), −26 mm aikasarjassa
- 109 naapuria, kaikki nousevat (+2.7 mm/v) — differentiaalinen lasku −36 mm naapureihin nähden
- Uncertain-lippu: P2-spread=2.42, 2 pistettä joista toinen (+3.1, 60 m ulkopuolella) on alueellista taustaa
- Satelliittikuva ja visuaalinen tarkistus tekemättä

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
| 0.4 | 2026-06-15 | P2 anomaly-spread lisätty (kynnys 1.5 mm/v = attention/2), lasketaan GIA-korjatuista arvoista. CERTAIN-luku 5→0; kaikki 7 elevated ovat uncertain. 1167003848:n "kaikki nousevat" -illuusio paljastui taustakorjauksen jälkeen kolme-neutraalia + yksi-outlier -rakenteeksi. |
| 0.3 | 2026-06-15 | KAT3-driving-korjaus: sääntö muutettu olemassaolosta provenienssipohjaiseksi — driving-pisteen KAT tarkistetaan, ei vain rakennuksen KAT-jakauma. 10→5 VARMA-luku. |
| 0.2 | 2026-06-15 | P0 (1-piste-guard), P1a (RMSE-kynnys 2.8 mm), P1b (uplift sanity +10 mm/v), P1c-vaikutuslaskelma lisätty; `risk_class_uncertain`-ehtojen taulukko täydennetty |
| 0.1 | 2026-06-15 | Perusmääritelmä, KAT1/KAT2-vaatimus attention/urgent:ille, `regional_motion_flag` ja `risk_class_uncertain` |
