# Demo-skripti

Demoissa käytettävät konkreettiset esimerkkikohteet, jotka osoittavat tuotteen
arvon yhdellä silmäyksellä. Jokainen case sisältää tunnistetiedot, datapisteet
ja valmiin demo-narratiivin.

## Demo case 1 (PRIMARY) — 3000200476, Kupittaa/Vasaramäki

Käytä tätä kaikissa demoissa ja LinkedIn-postauksissa kunnes toisin sovitaan.

- **building_id:** 3000200476
- **Sijainti:** 60.4258°N, 22.3219°E (Kupittaa/Vasaramäki)
- **anomaly_class:** attention (poikkeama −6.53 mm/v alueellisesta baselinesta)
- **risk_class (raaka, audit):** monitor
- **mean_velocity_mm_y:** −1.63 (raaka)
- **velocity_anomaly_mm_y:** −6.53
- **gia_baseline_mm_y:** +4.90 (Turun mediaani)
- **trend_class_anomaly:** seasonal
- **point_count:** 3 EGMS-pistettä
- **nearest_point_distance_m:** 19.1 m
- **Aikajakso:** 2021-06-07 → 2024-10-07, 118 havaintoa
- **Mukana olevat pidit:** 30pIWvSVnk, 30pIbc7kzn, 30pIbc7kzo

**Tulkinta.** Alue on Turun savimaata, jossa rakennuksen ympäristö
*vajoaa* +6,5 mm/v hitaammin kuin alueellinen GIA-baseline edellyttäisi
— rakennus jää jälkeen yleisestä maannoususta. Kausiluonteinen
oskillaatio tasaisen poikkeaman päällä viittaa routa-/pohjavesi-
vaikutukseen, ei rakennuksen rakennevikaan.

**Demo-narratiivi.** "Tämä taloyhtiö Kupittaalla on jäänyt 6,5 mm vuodessa
jälkeen siitä, miten maan pitäisi tällä alueella nousta. Kolmen vuoden
seurannassa siirtymä yhteensä noin 20 mm baselineen verrattuna.
Pitäisikö isännöitsijän huomioida tämä seuraavassa PTS:ssä?"

**Demo-PDF:** `/tmp/tietomaapera-3000200476-MAA-2026-05-27-FQ4KH.pdf`
**Screenshotit:** [content/screenshots/pdf/](screenshots/pdf/)

## Demo case 2 (BACKUP) — 1072667725, Aurajoen ranta

Käytä jos kohdeyleisö (esim. LinkedIn) tulkitsisi attention-tason
demoa liian dramaattiseksi tai pelottelevana. Tarkka signaalin laatu,
maltillisempi narratiivi.

- **building_id:** 1072667725
- **Sijainti:** 60.4496°N, 22.2697°E (Aurajoen pohjoisranta, ydinkeskusta)
- **anomaly_class:** monitor (poikkeama −2.83 mm/v)
- **point_count:** 5 EGMS-pistettä
- **nearest_point_distance_m:** 0.0 m (mittauspiste suoraan rakennuksen päällä)
- **trend_class_anomaly:** linear

**Tulkinta.** Lievä jälkeenjääminen baselinestä, signaali on luotettava
(5 pistettä, lähin suoraan katolla). Sopiva esimerkki "näin tämä
toimii myös arkisille kohteille jotka eivät ole hälytystilassa."

## Demo case 3 (DEPRECATED) — 30pJD7RiYA / 149875609

**Älä käytä uusissa demoissa.** Päätös 2026-05-26.

Alkuperäinen Aurajoen "nouseva piste" -case (point_id 30pJD7RiYA).
Lähin rakennus 149875609 on **103 m** päässä joen yli, ja sillä on
vain 2 EGMS-pistettä jotka aggregoituvat siihen. Lisäksi PDF-raportin
generointiportti edellyttää nyt vähintään 3 pistettä, joten tätä
casea ei voi näyttää lopputuotteen kautta lainkaan.

Säilytetään muistissa siltä varalta että lisätään myöhemmin
EGMS-pisteet ilman rakennusliitäntää näyttävä erityismoodi
(esim. "raw signal" -taso).
