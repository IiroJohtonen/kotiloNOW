# Pleissin muutosloki

Jokaisesta päivityksestä kirjataan päivämäärä, mitä muutettiin ja miten. Testitapaukset ja niiden
tulokset ovat testaussivulla: https://claude.ai/artifact/9ioRJQ7LnYLHtmq6WHi3ri

## 18.10.2026 · Suorakulmainen ulkoasu

**Mitä muutettiin**
- Kortit, taulukot, ikkunat, valikot ja muut laatikot ovat nyt suorakulmaisia pyöreiden kulmien sijaan.
- Painikkeissa, kentissä, välilehdissä, merkeissä ja laskureissa on vain hyvin pieni (2 px) pyöristys;
  pillerin muotoiset merkit ja laskurit ovat suorakaiteita.
- Pyöreiksi jäivät vain käyttäjäkuvakkeet ja pienet tilapisteet; kytkimen nuppi on nelikulmainen.
- Muutos koskee henkilökunnan näkymiä, asukasportaalia ja tummaa tilaa.

**Miten**
- Koko sovellus: esim. Päätösjono, tehtäväkortti, Asetukset ja kirjautumissivu.

**Testit:** T-117

## 18.10.2026 · Omat u_-kentät ServiceNow'n tapaan

**Mitä muutettiin**
- Pääkäyttäjä voi lisätä tauluun oman kentän: nimi suomeksi ja englanniksi, sisäinen nimi (alkaa u_), tyyppi,
  kuvaus, oletusarvo ja pakollisuus.
- Tyypit: teksti, kokonaisluku, desimaaliluku, kyllä/ei, päivämäärä, päivämäärä ja aika, valinta (omat valinnat)
  ja viittaus toiseen tauluun.
- Oma kenttä näkyy heti tietueissa, lomakkeessa ja hauissa Oma kenttä -merkillä. Oletusarvo tulee myös vanhoille
  ja sovelluksen itse luomille tietueille.
- Omalle valintakentälle voi lisätä ja poistaa valintoja, pakollisuutta voi muuttaa, ja kentän voi poistaa
  (arvot poistuvat pysyvästi).
- Kenttiä voi lisätä vain tauluihin, joiden tietueita voi muokata (ei lokiin, käyttäjiin, kirjautumisiin eikä sanakirjaan).
- Asukkaan omat kentät tulevat asukkaan tietojen vientiin ja tyhjenevät, kun asukkaan tiedot poistetaan; samoin
  tehtävän omat kentät, kun tehtävä anonymisoidaan.
- Kentän lisäys ja poisto kirjataan lokiin.

**Miten**
- Asetukset → Isännöitsijätoimiston tiedot → Taulut ja kentät → avaa taulu → + Lisää kenttä. Muokkaus ja poisto: paina kentän riviä.

**Testit:** T-096–T-099

## 18.10.2026 · Tietueiden muokkaus ja luonti Taulut ja kentät -näkymässä

**Mitä muutettiin**
- Pääkäyttäjä voi muokata taulun tietuetta suoraan: rivi avautuu lomakkeeksi, jossa jokaisella kentällä on nimi ja sisäinen nimi.
- Lomakkeen kentät ovat tyypin mukaisia: kyllä/ei-valintaruutu, valintalista, päivämäärä, luku ja viittauskenttä,
  josta tietueen voi hakea nimellä.
- Uusi tietue -painike luo rivin. Tunniste ja luontiaika tulevat automaattisesti, ja pakolliset kentät tarkistetaan.
- Arvot tarkistetaan ennen tallennusta: väärä valinta, päivämäärä tai olematon viittaus antaa virheen.
- Lokia, kirjautumistietoja, käyttäjätunnuksia, perustietoja ja sanakirjaa ei voi muokata täältä. Tunniste,
  luontitiedot ja salaiset kentät ovat vain luku.
- Jokainen muokkaus ja luonti kirjataan lokiin.

**Miten**
- Asetukset → Isännöitsijätoimiston tiedot → Taulut ja kentät → avaa taulu → Tietueet → paina riviä tai Uusi tietue.

**Testit:** T-092–T-095

## 17.10.2026 · Taulut ja kentät sisäisine nimineen (ServiceNow-tyyli)

**Mitä muutettiin**
- Jokaisella taululla ja kentällä on nyt oma sisäinen nimi ServiceNow'n tapaan, esim. Tehtävät = u_ticket,
  Käyttäjät = sys_user, tehtävän käsittelijä = assigned_to ja tunniste = sys_id.
- Määrittelyt ovat kolmessa uudessa taulussa: taulut, kentät ja valinnat. Ne näkyvät ja niitä muokataan vain pääkäyttäjänä.
- Kentästä näkyy nimi suomeksi ja englanniksi, tyyppi (teksti, päivämäärä, kyllä/ei, valinta, viittaus toiseen tauluun),
  pakollisuus ja tietokannan sarake.
- Pääkäyttäjä voi muuttaa taulujen, kenttien ja valintojen nimiä ja kuvauksia. Sisäinen nimi ei muutu.
- Taulun tietueita voi selata sisäisillä nimillä ja hakea ServiceNow'n koodatulla haulla
  (esim. priority=urgent^ORDERBYDESCsys_created_on). Salasanoja ja kirjautumistunnisteita ei näytetä.
- Uudet taulut ja kentät tulevat luetteloon automaattisesti palvelimen käynnistyessä. Muutokset ja tietueiden
  katselut kirjataan lokiin.

**Miten**
- Asetukset → Isännöitsijätoimiston tiedot → Taulut ja kentät (vain pääkäyttäjä). Avaa taulu → välilehdet Kentät ja Tietueet.

**Testit:** T-088–T-091

## 17.10.2026 · Lomakkeet taloyhtiön tauluihin, uusi Asetukset-sivu ja dokumentin välilehdet

**Mitä muutettiin**
- Verkkosivun mittarilukemailmoitus menee Lukemat-tauluun (kylmä ja lämmin vesi omina lukeminaan), muuttoilmoitus
  Muutot-tauluun ja auton lämmityspaikka Autopaikat-sivun uuteen Lämmityspaikan tilaukset -tauluun. Niistä ei enää tule tehtäviä.
- Tietueilla on samat kentät kuin verkkosivun lomakkeella, ja niitä voi muokata (Muokkaa-painike). Jos osoitetta ei
  tunnisteta, tietue tulee ilman asuntoa ja asunnon voi valita muokkaamalla; muuttoilmoitusta ei voi hyväksyä ilman asuntoa.
- Asukasportaalin Auton lämmityspaikka on nyt tilauslomake (paikka, tilaustyyppi, alkaen, loppuu), ja tilaus näkyy Autopaikat-sivulla.
- Huoltotyötilaus, häiriöilmoitus, irtisanomisilmoitus ja asuntohakemus pysyvät tehtävinä. Erillinen Lomakkeet-taulu poistettiin.
- Asetukset-sivu on leveämpi. Isännöitsijätoimiston tiedot ovat välilehdillä (Toimisto, Tietoturva, AI, Perustiedot,
  Käyttäjät, Järjestelmä), ja vasemmalla on aliotsikot, joista pääsee suoraan oikeaan kohtaan. Samat aliotsikot ovat käyttäjän asetuksissa.
- Dokumentin näkymässä on välilehdet Dokumentista luettu teksti ja Mitä AI poimi tästä.

**Miten**
- Ilmoitukset → Lukemat, Asukkaat → Muutot ja Tilat → Autopaikat (alhaalla Auton lämmityspaikan tilaukset): avaa rivi → Muokkaa.
- Asetukset → Isännöitsijätoimiston tiedot → välilehdet; aliotsikot vasemmalla.
- Dokumentaatio → avaa dokumentti → välilehdet (Mitä AI poimi tästä vain pääkäyttäjälle).

**Testit:** T-080–T-087

## 17.10.2026 · Verkkosivun lomakkeet sähköpostista Lomakkeet-tauluun

**Mitä muutettiin**
- Toimiston postiin tuleva viesti, jonka otsikossa on lomakkeen nimi (Mittarilukemailmoitus, Muuttoilmoitus,
  Huoltotyötilaus, Auton lämmityspaikka, Asuntohakemus, Häiriöilmoitus, Irtisanomisilmoitus), luetaan lomakkeeksi:
  viestin kentät tallentuvat tehtävälle otsikoineen
- Kenttien nimet ovat isännöitsijäyrityksen verkkosivun lomakkeista, joten myös taulukkomuotoinen viesti luetaan oikein
- Lomakkeen osoite ja huoneistonumero ohjaavat tehtävän oikeaan taloyhtiöön ja asuntoon; ilmoittaja liitetään
  asukkaaseen lomakkeen sähköpostin tai nimen perusteella
- Uusi Lomakkeet-taulu (sivupalkki → Ilmoitukset → Lomakkeet), jossa oma välilehti jokaiselle lomaketyypille;
  myös asukasportaalin lomakkeet näkyvät siellä
- Lomakkeita ei lähetetä AI:lle, koska niissä voi olla henkilötunnuksia ja tilinumeroita

**Miten**
- Sivupalkki → valitse taloyhtiö → Ilmoitukset → Lomakkeet. Rivi avaa tehtävän, jolla kaikki kentät ovat
  Lomakkeen tiedot -kortissa.

**Testit:** T-074–T-079

## 17.10.2026 · Asukasportaalin lomakkeet: huoltotyötilaus, häiriöilmoitus, irtisanomisilmoitus, asuntohakemus ja lämmityspaikka

**Mitä muutettiin**
- Asukasportaaliin uusi Lomakkeet-osio, jossa ovat isännöitsijäyrityksen sivujen lomakkeet: huoltotyötilaus,
  häiriöilmoitus, mittarilukemat, muuttoilmoitus, remontti-ilmoitus, auton lämmityspaikka, irtisanomisilmoitus
  ja yleinen asuntohakemus
- Lähetetystä lomakkeesta tulee isännöitsijälle tehtävä, jolla lomakkeen tiedot näkyvät selkeänä taulukkona;
  asukas näkee lomakkeen ja vastaukset Tehtävät-sivulla
- Irtisanomisilmoitus kertoo aikaisimman päättymispäivän; liian aikaisesta päivästä näkyy huomio myös isännöitsijälle
- Autopaikoille uusi paikkatyyppi Lämmityspaikka (hinta asetuksissa, jono portaalissa)
- Kulutuslukemat-sivu on nyt nimeltään Mittarilukemat

**Miten**
- Asukasportaali → sivupalkin Lomakkeet (puhelimella Lisää-valikko).
- Isännöitsijä: päätösjono ja Kaikki tehtävät → avaa tehtävä, jonka tyyppi on Huoltotyötilaus, Häiriöilmoitus,
  Irtisanomisilmoitus tai Asuntohakemus.

**Testit:** T-067–T-073

## 16.10.2026 · Kirjautumiskoodi sähköpostiin ja tilapäivitykset asukkaalle

**Mitä muutettiin**
- Henkilökunnan kirjautumiseen kuusinumeroinen koodi sähköpostiin (kytketään asetuksista)
- Luotettu laite: koodia ei kysytä samalla laitteella 30 päivään
- Asukas saa sähköpostin, kun hänen ilmoituksensa etenee
- Tietoturvakatselmus: kirjautumisyritykset rajattu viiteen vartissa käyttäjää kohden

**Miten**
- Asetukset → Isännöitsijätoimiston tiedot → Tietoturva: Kirjautumiskoodi sähköpostiin. Vaatii yhdistetyn
  toimiston sähköpostitilin. Hätäkatkaisin palvelimelle: TWO_FACTOR_DISABLED=1.
- Asetukset → Asukasviestintä: Tilapäivitykset asukkaalle (oletuksena päällä). Viesti lähtee työtilauksesta,
  tehdystä työstä, käsittelyyn otosta, siirrosta kolmannelle osapuolelle ja sulkemisesta.

**Testit:** T-033–T-041

## 16.10.2026 · Ilmoittaja näkyviin tietueille, siirtymä asukkaan tietueelle, uudet sauna- ja pyykkitupasivut, tiiviimpi dokumentaatio

**Mitä muutettiin**
- Ilmoittajan nimi, asunto, osoite ja sähköposti näkyvät jonoissa, muutoissa, lukemissa ja avaimen haltijana
- Ilmoittajan voi vaihtaa hakemalla asukastaulusta
- Painike ilmoittajan vieressä vie asukkaan tietueelle (kysyy ensin vahvistuksen)
- Sauna ja pyykkitupa: suodattimet ja viikkonavigaatio aina näkyvissä, tilakohtaiset värit ja viikon yhteenveto
- Dokumentaatio: tiivis otsikko, AI:n poiminnat ja luettu teksti vierekkäin, Merkitse tarkistetuksi -painike

**Miten**
- Jonot, Muutot ja Lukemat: avaa tietue → Ilmoittaja-kortti ylhäällä; hakukentästä uusi ilmoittaja,
  henkilökuvake avaa vahvistusikkunan ja Kyllä, siirry avaa asukkaan tiedot.
- Tehtäväsivulla henkilökuvake on Ilmoittaja-otsikon vieressä. Remontin ilmoittaja vaihdetaan remonttitehtävältä.
- Sauna ja Pyykkitupa: yläpalkissa viikon vaihto, taloyhtiö, kellonaika ja Kaikki / Vapaat / Varatut.
- Dokumentaatio → dokumentti: Mitä AI poimi tästä näkyy vain pääkäyttäjälle.

**Testit:** T-021–T-032

## 16.10.2026 · PR #17 · AI-kulujen raja, järjestelmähälytykset, raportit, hallituksen näkymä ja portaalin kuvaliitteet

**Mitä muutettiin**
- AI-kulujen kuukausiraja ja varoitusraja asetuksiin
- Järjestelmähälytykset sähköpostilla ja Järjestelmän tila -kortti
- Raportit: Mittarit kaikista taloyhtiöistä ja tallennettavat omat raportit (CSV)
- Hallituksen näkymä: hallituksen jäsenen omat lukutunnukset
- Asukasportaali: Ota kuva -painike, liitteiden esikatselu ja kuvien pienennys

**Miten**
- Asetukset → Isännöitsijätoimiston tiedot → AI: kulumittari, kuukausiraja ($) ja varoitusraja (%).
  Rajan täyttyessä AI kytkeytyy pois kuun loppuun.
- Asetuksissa uusi Järjestelmän tila -kortti; avoimista hälytyksistä ilmoitus sovelluksen yläosassa pääkäyttäjälle.
- Raportit-sivulla välilehdet Mittarit, Omat raportit ja Taloyhtiön raportit.
- Taloyhtiöt → yhtiö → Hallituksen näkymä -kortti: tunnusten luonti. Jäsen kirjautuu samalta kirjautumissivulta.
- Asukasportaali → Tehtävät → Luo tehtävä: uudet liitepainikkeet.

**Testit:** T-001–T-020
