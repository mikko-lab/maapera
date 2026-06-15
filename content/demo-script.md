# Demo-skripti

Demoissa käytettävät konkreettiset esimerkkikohteet, jotka osoittavat tuotteen
arvon yhdellä silmäyksellä. Jokainen case sisältää tunnistetiedot, datapisteet
ja valmiin demo-narratiivin.

Riskiluokituksen määritelmä: [`docs/risk-classification-spec.md`](../docs/risk-classification-spec.md)

---

## Demo case 1 (PRIMARY) — 464881121, länsi-Turku

Käytä tätä kaikissa demoissa ja LinkedIn-postauksissa kunnes toisin sovitaan.

- **building_id:** 464881121
- **Sijainti:** 60.4454°N, 22.1834°E
- **risk_class:** urgent (raaka absoluuttinen nopeus)
- **anomaly_class:** attention (poikkeama −5.83 mm/v alueellisesta baselinesta)
- **mean_velocity_mm_y:** −0.93 (raaka)
- **velocity_anomaly_mm_y:** −5.83
- **gia_baseline_mm_y:** +4.90 (Turun mediaani)
- **trend_class_anomaly:** linear
- **point_count:** 7 EGMS-pistettä
- **nearest_point_distance_m:** 0.0 m (piste suoraan rakennuksessa)
- **Footprint:** kat1=1, kat2=1, kat3=5 — kaksi pistettä footprintin sisällä
- **Aikajakso:** 2021-06-07 → 2024-10-07, 118 havaintoa
- **Pidit:** 30pJ8QmTKy, 30pJ8QmTKz, 30pJD7RiX2, 30pJD7RiX3, 30pJD7RiX4, 30pJHo6xj6, 30pJHo6xj7

**Miksi tämä tapaus on validi.** Rakennuksessa on kaksi footprint-pistettä (KAT1 ja KAT2) — tuote tekee rakennuskohtaisen väitteen, ei alueellista arvailua. Seitsemän pisteen kokonaissignaali on lineaarisesti laskeva.

**Tulkinta.** Rakennus vajoaa alueelliseen maannousuun verrattuna noin 5.8 mm/v. Kolmen vuoden kertymä baselineen verrattuna on noin 17 mm. Lineaarinen trendi tarkoittaa, ettei kiihtymistä ole havaittu — mutta suunta on tasaisesti alaspäin.

**Demo-narratiivi.** "Tällä rakennuksella on seitsemän mittauspistettä, joista kaksi on suoraan katon päällä. Se vajoaa alueelliseen tasoon verrattuna lähes 6 mm vuodessa — kolmessa vuodessa jo 17 mm. Vauhti on tasainen, ei kiihtyvä, mutta PTS:ssä tämä ansaitsee maininnan."

---

## Demo case 2 (BACKUP) — 1072667725, Aurajoen ranta

Käytä jos kohdeyleisö tulkitsisi urgent-tason demoa liian dramaattisena tai
pelottelevana. Tarkka signaalilaatu, maltillisempi narratiivi.

- **building_id:** 1072667725
- **Sijainti:** 60.4496°N, 22.2697°E (Aurajoen pohjoisranta, ydinkeskusta)
- **risk_class:** monitor
- **anomaly_class:** monitor (poikkeama −2.83 mm/v)
- **mean_velocity_mm_y:** +2.07
- **velocity_anomaly_mm_y:** −2.83
- **gia_baseline_mm_y:** +4.90
- **trend_class_anomaly:** linear
- **point_count:** 5 EGMS-pistettä
- **nearest_point_distance_m:** 0.0 m (piste suoraan rakennuksessa)
- **Footprint:** kat1=0, kat2=1, kat3=4 — yksi piste footprintissä
- **Aikajakso:** 2021-06-07 → 2024-10-07, 118 havaintoa
- **Pidit:** 30pK7NQesY, 30pK7NQesZ, 30pKC45u4c, 30pKC45u4d, 30pKGkl9Gh

**Tulkinta.** Lievä jälkeenjääminen baselinestä, signaali on luotettava
(5 pistettä, lähin suoraan rakennuksessa). Sopiva esimerkki siitä, miten
tuote toimii arkisille kohteille jotka eivät ole hälytystilassa.

**Demo-narratiivi.** "Tämä rakennusnäyttää tutussa seurannassa: viisi mittauspistettä,
lähin suoraan katolla. Se jää noin 3 mm vuodessa jälkeen siitä, miten maan pitäisi tällä
alueella nousta. Ei hälytys — mutta juuri tällainen havainto ansaitsee maininnan seuraavassa
PTS:ssä jos trendi jatkuu."

---

## Demo case 3 — 3000200476, Kupittaa/Vasaramäki (regional motion -esimerkki)

Käytä selittämään mitä `regional_motion_flag` tarkoittaa ja miksi tuote
ei tee rakennuskohtaista väitettä kaikista rakennuksista.

- **building_id:** 3000200476
- **Sijainti:** 60.4258°N, 22.3220°E (Kupittaa/Vasaramäki)
- **risk_class:** monitor
- **anomaly_class:** monitor
- **regional_motion_flag:** True ← tämä on tämän casan ydin
- **risk_class_uncertain:** True
- **mean_velocity_mm_y:** −1.63
- **velocity_anomaly_mm_y:** −6.53
- **gia_baseline_mm_y:** +4.90
- **trend_class_anomaly:** seasonal
- **point_count:** 3 EGMS-pistettä
- **nearest_point_distance_m:** 19.1 m (kaikki pisteet footprintin ulkopuolella)
- **Footprint:** kat1=0, kat2=0, kat3=3 — ei yhtään footprint-pistettä
- **Pidit:** 30pIWvSVnk, 30pIbc7kzn, 30pIbc7kzo

**Miksi tämä case on tärkeä.** Velocity-anomalia −6.53 mm/v olisi täyttänyt attention-kynnyksen,
mutta kaikki kolme pistettä ovat 19 metrin päässä footprintin ulkopuolella. Tuote ei tee
rakennuskohtaista väitettä — se merkitsee rakennuksen teräksensinisenä kartalla ja näyttää
"Alueellinen maanliike havaittu" -ilmoituksen. Käyttäjä saa tiedon lähialueen signaalista
ilman harhaanjohtavaa rakennusnimeä.

**Demo-narratiivi.** "Tässä rakennuksessa on kiinnostava signaali lähialueella — lähes 7 mm
jälkeenjäämistä baselineen verrattuna. Mutta kaikki mittauspisteet ovat 19 metrin päässä
rakennuksen ulkopuolella. Se voi olla parkkipaikka, piha tai viereinen katumaa. Tuote ei
väitä tietävänsä enemmän kuin se mittaa: kartalla rakennus on sininen, ei oranssi, ja
paneelissa lukee selvästi miksi. Isännöitsijä voi itse harkita onko lisätutkimus tarpeen."

---

## Deprecated cases

### 149875609 / 30pJD7RiYA — Aurajoen "nouseva piste"

**Älä käytä uusissa demoissa.**

Alkuperäinen Aurajoen case (point_id 30pJD7RiYA). Lähin rakennus on 103 m päässä
joen yli, ja PDF-raportin generointiportti edellyttää vähintään 3 pistettä. Tätä casea
ei voi näyttää lopputuotteen kautta.
