import crypto from "node:crypto";
import { db } from "./db.js";

// ---------------------------------------------------------------------------------------------
// Järjestelmän sanakirja ServiceNow'n tapaan: jokaisella taululla ja kentällä on oma sisäinen nimi,
// suomen- ja englanninkielinen nimi, tyyppi ja kuvaus. Määrittelyt ovat tauluissa
//   sys_db_object   taulut (sisäinen nimi ↔ tietokannan taulu)
//   sys_dictionary  kentät (sisäinen nimi ↔ tietokannan sarake, tyyppi, viittaus, pakollisuus)
//   sys_choice      valintakenttien arvot ja niiden nimet
// Taulut näkyvät ja niitä muokataan vain pääkäyttäjänä. Sanakirja täydentyy käynnistyksessä
// tietokannan rakenteesta: uusi taulu tai sarake saa rivin, ja pääkäyttäjän muokkaamat nimet säilyvät.
// Sisäinen nimi annetaan kerran, eikä se muutu, jotta rajapinnan kutsut pysyvät samoina.
// ---------------------------------------------------------------------------------------------
db.exec(`
CREATE TABLE IF NOT EXISTS sys_db_object (
  name TEXT PRIMARY KEY,
  physical_name TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  label_en TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  is_system INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sys_dictionary (
  table_name TEXT NOT NULL,
  element TEXT NOT NULL,
  column_name TEXT NOT NULL,
  label TEXT NOT NULL,
  label_en TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  internal_type TEXT NOT NULL,
  reference TEXT,
  mandatory INTEGER NOT NULL DEFAULT 0,
  primary_key INTEGER NOT NULL DEFAULT 0,
  default_value TEXT,
  secret INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(table_name, element),
  UNIQUE(table_name, column_name)
);

CREATE TABLE IF NOT EXISTS sys_choice (
  table_name TEXT NOT NULL,
  element TEXT NOT NULL,
  value TEXT NOT NULL,
  label TEXT NOT NULL,
  label_en TEXT NOT NULL,
  sequence INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(table_name, element, value)
);
`);

// Vain luku -merkinnät lisättiin myöhemmin: taulu tai kenttä, jota ei voi muokata tietueiden muokkauksessa.
for (const table of ["sys_db_object", "sys_dictionary"]) {
  if (!(db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).some(column => column.name === "read_only")) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN read_only INTEGER NOT NULL DEFAULT 0`);
  }
}

// Tietokannan taulu → [sisäinen nimi, nimi, nimi englanniksi, kuvaus]. sys_-alkuiset ovat järjestelmän
// omia tauluja (käyttäjät, istunnot, loki), u_-alkuiset isännöinnin tietoja kuten ServiceNow'n omat taulut.
const TABLES: Record<string, [string, string, string, string]> = {
  ai_budget_notices: ["sys_ai_budget_notice", "AI-kulurajan ilmoitukset", "AI budget notices", "Lähetetyt varoitukset AI-kulujen rajasta kuukausittain."],
  ai_usage: ["sys_ai_usage", "AI-käyttö", "AI usage", "Jokainen AI-kutsu: malli, tokenit ja kustannusarvio."],
  announcements: ["u_announcement", "Tiedotteet", "Announcements", "Taloyhtiön asukkaille julkaistut tiedotteet."],
  apartments: ["u_apartment", "Asunnot", "Apartments", "Taloyhtiöiden asunnot ja osoitteet."],
  attachments: ["sys_attachment", "Liitteet", "Attachments", "Tehtävien ja viestien liitetiedostot."],
  audit_log: ["sys_audit", "Loki", "Audit log", "Kaikki tehtäviin ja asetuksiin tehdyt muutokset."],
  billing_periods: ["u_billing_period", "Laskutuskaudet", "Billing periods", "Laskutetut kuukaudet ja niiden rivit."],
  board_members: ["u_board_member", "Hallituksen jäsenet", "Board members", "Taloyhtiön hallituksen tunnukset."],
  board_sessions: ["sys_board_session", "Hallituksen istunnot", "Board sessions", "Hallituksen jäsenten kirjautumiset."],
  booking_queue: ["u_booking_queue", "Vuorojonot", "Booking queue", "Jono varattuihin vuoroihin."],
  booking_requests: ["u_booking_request", "Vuorotoiveet", "Booking requests", "Asukkaiden toiveet jo varatuista vuoroista."],
  booking_settings: ["u_booking_setting", "Vuoroasetukset", "Booking settings", "Sauna- ja pyykkitupavuorojen säännöt ja hinnat."],
  bookings: ["u_booking", "Vuorot", "Bookings", "Sauna- ja pyykkitupavuorot."],
  building_keys: ["u_building_key", "Avaimet", "Keys", "Avainrekisterin avaimet."],
  companies: ["u_company", "Taloyhtiöt", "Housing companies", "Taloyhtiöt, vastuuisännöitsijä ja huoltoyhtiö."],
  company_managers: ["u_company_manager", "Taloyhtiöiden isännöitsijät", "Company managers", "Taloyhtiön muut isännöitsijät."],
  contact_requests: ["u_contact_request", "Yhteydenottopyynnöt", "Contact requests", "Verkkosivun yhteydenottolomakkeet."],
  deleted_mail_messages: ["sys_deleted_mail", "Poistetut sähköpostit", "Deleted emails", "Poistettujen tehtävien viestitunnisteet."],
  erasure_pending: ["u_erasure_pending", "Odottavat tietojen poistot", "Pending erasures", "Asukkaan poistopyynnöt, joiden tehtävä on vielä auki."],
  form_imports: ["sys_form_import", "Lomaketuonnit", "Form imports", "Sähköpostin lomakkeista tehdyt tietueet."],
  gmail_accounts: ["sys_mail_account", "Sähköpostitilit", "Mail accounts", "Yhdistetyt sähköpostitilit."],
  gmail_imports: ["sys_mail_import", "Sähköpostituonnit", "Mail imports", "Sähköposteista luodut tehtävät."],
  gmail_sync_state: ["sys_mail_sync_state", "Postin synkronoinnin tila", "Mail sync state", "Postin tarkistuksen kirjanpito."],
  heating_orders: ["u_heating_order", "Lämmityspaikan tilaukset", "Heating spot orders", "Auton lämmityspaikan tilaukset."],
  key_loans: ["u_key_loan", "Avainten luovutukset", "Key loans", "Avainten luovutukset ja palautukset."],
  knowledge: ["u_knowledge", "Dokumentaatio", "Documentation", "Taloyhtiön dokumentit ja vakiotiedot."],
  knowledge_chunks: ["u_knowledge_chunk", "Dokumentaation tietopalat", "Knowledge chunks", "Dokumenteista poimitut tiedot."],
  login_challenges: ["sys_login_challenge", "Kirjautumiskoodit", "Login codes", "Sähköpostiin lähetetyt kirjautumiskoodit."],
  master_data: ["sys_properties", "Perustiedot", "Master data", "Pääkäyttäjän perustiedot (hätäsanat, maskaus, määräajat, AI-mallit)."],
  messages: ["u_message", "Viestit", "Messages", "Tehtävien viestiketjut."],
  meter_readings: ["u_meter_reading", "Mittarilukemat", "Meter readings", "Veden ja sähkön mittarilukemat."],
  move_notices: ["u_move_notice", "Muuttoilmoitukset", "Move notices", "Asukkaiden muuttoilmoitukset."],
  office_settings: ["sys_office_settings", "Toimiston asetukset", "Office settings", "Isännöitsijätoimiston tiedot ja asetukset."],
  parking_assignments: ["u_parking_assignment", "Autopaikkojen haltijat", "Parking assignments", "Autopaikkojen haltijahistoria."],
  parking_prices: ["u_parking_price", "Autopaikkojen hinnat", "Parking prices", "Autopaikkojen kuukausihinnat tyypeittäin."],
  parking_spaces: ["u_parking_space", "Autopaikat", "Parking spaces", "Taloyhtiöiden autopaikat."],
  password_resets: ["sys_password_reset", "Salasanan palautukset", "Password resets", "Voimassa olevat salasanan palautuslinkit."],
  portal_forms: ["u_portal_form", "Portaalin lomakkeet", "Portal forms", "Asukasportaalin lomakkeiden tiedot."],
  reminder_log: ["sys_reminder_log", "Muistutusloki", "Reminder log", "Lähetetyt muistutuskoosteet."],
  renovation_notices: ["u_renovation_notice", "Remontti-ilmoitukset", "Renovation notices", "Asukkaiden remontti-ilmoitukset."],
  resident_credentials: ["sys_resident_credential", "Asukkaiden salasanat", "Resident credentials", "Asukasportaalin salasanat (salattuina)."],
  resident_sessions: ["sys_resident_session", "Asukkaiden istunnot", "Resident sessions", "Asukasportaalin kirjautumiset."],
  residents: ["u_resident", "Asukkaat", "Residents", "Taloyhtiöiden asukkaat."],
  saved_reports: ["u_saved_report", "Tallennetut raportit", "Saved reports", "Käyttäjien tallentamat raportit."],
  sessions: ["sys_user_session", "Käyttäjien istunnot", "User sessions", "Henkilökunnan kirjautumiset."],
  system_alerts: ["sys_alert", "Järjestelmähälytykset", "System alerts", "Palvelimen virheet ja muut hälytykset."],
  ticket_notes: ["u_ticket_note", "Muistiinpanot", "Notes", "Tehtävien sisäiset muistiinpanot."],
  ticket_reporters: ["u_ticket_reporter", "Ilmoittajat", "Reporters", "Tehtävien ilmoittajat."],
  tickets: ["u_ticket", "Tehtävät", "Tickets", "Asukkaiden yhteydenotot ja muut tehtävät."],
  topic_reports: ["u_topic_report", "Aiheraportit", "Topic reports", "Toistuvien aiheiden raportit."],
  trusted_devices: ["sys_trusted_device", "Luotetut laitteet", "Trusted devices", "Laitteet, joilla kirjautumiskoodia ei kysytä."],
  user_signatures: ["sys_user_signature", "Allekirjoitukset", "Signatures", "Käyttäjien sähköpostin allekirjoitukset."],
  users: ["sys_user", "Käyttäjät", "Users", "Henkilökunnan käyttäjätunnukset ja roolit."],
  waitlist: ["u_waitlist", "Jonot", "Waitlists", "Autopaikka- ja vuorojonot."],
  work_orders: ["u_work_order", "Työtilaukset", "Work orders", "Huoltoyhtiölle lähetetyt työtilaukset."],
  sys_db_object: ["sys_db_object", "Taulut", "Tables", "Järjestelmän taulut ja niiden sisäiset nimet."],
  sys_dictionary: ["sys_dictionary", "Kentät", "Fields", "Taulujen kentät, sisäiset nimet ja tyypit."],
  sys_choice: ["sys_choice", "Valinnat", "Choices", "Valintakenttien arvot ja nimet."]
};

// Sarake → [nimi, nimi englanniksi]. "taulu.sarake" ohittaa yleisen nimen.
const FIELD_LABELS: Record<string, [string, string]> = {
  id: ["Tunniste", "Sys ID"],
  action: ["Tapahtuma", "Action"],
  actor: ["Tekijä", "Actor"],
  address: ["Osoite", "Address"],
  ai_action: ["AI:n päätös", "AI action"],
  ai_monthly_limit: ["AI-kulujen kuukausiraja", "AI monthly limit"],
  ai_priority: ["AI arvioi prioriteetin", "AI assesses priority"],
  ai_reason: ["AI:n perustelu", "AI reason"],
  ai_relevance: ["AI suodattaa muut viestit", "AI relevance filter"],
  ai_warning_percent: ["AI-kulujen varoitusraja (%)", "AI warning percent"],
  allow_single: ["Kertavuorot sallittu", "Single bookings allowed"],
  allow_weekly: ["Viikkovuorot sallittu", "Weekly bookings allowed"],
  apartment_id: ["Asunto", "Apartment"],
  apartment_number: ["Asunnon numero", "Apartment number"],
  assignee_id: ["Käsittelijä", "Assigned to"],
  attempts: ["Yritykset", "Attempts"],
  audience: ["Kenelle", "Audience"],
  author: ["Kirjoittaja", "Author"],
  billed_at: ["Laskutettu", "Billed at"],
  billed_by: ["Laskuttaja", "Billed by"],
  body: ["Sisältö", "Body"],
  booking_id: ["Vuoro", "Booking"],
  business_id: ["Y-tunnus", "Business ID"],
  cache_read_tokens: ["Välimuistista luetut tokenit", "Cache read tokens"],
  cache_write_tokens: ["Välimuistiin kirjoitetut tokenit", "Cache write tokens"],
  channel: ["Kanava", "Channel"],
  closed_at: ["Suljettu", "Closed at"],
  code: ["Koodi", "Code"],
  code_hash: ["Koodin tiiviste", "Code hash"],
  company: ["Yritys", "Company"],
  company_id: ["Taloyhtiö", "Housing company"],
  comparison: ["Versioiden vertailu", "Comparison"],
  completed_at: ["Valmistunut", "Completed at"],
  config: ["Määritys", "Configuration"],
  connected_at: ["Yhdistetty", "Connected at"],
  connected_by: ["Yhdistäjä", "Connected by"],
  contact_email: ["Yhteydenottojen sähköposti", "Contact email"],
  content: ["Sisältö", "Content"],
  contractor: ["Urakoitsija", "Contractor"],
  contractor_contact: ["Urakoitsijan yhteystiedot", "Contractor contact"],
  contractor_email: ["Huoltoyhtiön sähköposti", "Contractor email"],
  contractor_name: ["Huoltoyhtiö", "Contractor"],
  cost_usd: ["Kustannus (USD)", "Cost (USD)"],
  count: ["Määrä", "Count"],
  covered: ["Katetut aiheet", "Covered topics"],
  created_at: ["Luotu", "Created"],
  created_by: ["Luonut", "Created by"],
  created_by_name: ["Luojan nimi", "Created by name"],
  day: ["Päivä", "Day"],
  decided_at: ["Päätetty", "Decided at"],
  decided_by: ["Päättäjä", "Decided by"],
  decision_note: ["Päätöksen perustelu", "Decision note"],
  deleted_at: ["Poistettu", "Deleted at"],
  description: ["Kuvaus", "Description"],
  details: ["Lisätiedot", "Details"],
  direction: ["Suunta", "Direction"],
  done_at: ["Tehty", "Done at"],
  done_by: ["Tekijä", "Done by"],
  door_name: ["Nimi ovessa", "Name on door"],
  draft: ["Luonnos", "Draft"],
  due_date: ["Määräaika", "Due date"],
  due_reminder_days: ["Määräajan muistutus (pv)", "Due reminder days"],
  email: ["Sähköposti", "Email"],
  email_address: ["Sähköpostiosoite", "Email address"],
  email_sent: ["Sähköposti lähetetty", "Email sent"],
  emailed_at: ["Lähetetty sähköpostilla", "Emailed at"],
  emailed_count: ["Sähköposteja lähetetty", "Emails sent"],
  end_date: ["Päättyy", "End date"],
  ends_at: ["Päättyy", "Ends at"],
  erased_at: ["Tiedot poistettu", "Erased at"],
  expires_at: ["Vanhenee", "Expires at"],
  extraction_ok: ["Teksti luettu", "Extraction OK"],
  feature: ["Toiminto", "Feature"],
  fields: ["Kentät", "Fields"],
  file_name: ["Tiedoston nimi", "File name"],
  filename: ["Tiedoston nimi", "File name"],
  form: ["Lomake", "Form"],
  generated_at: ["Tehty", "Generated at"],
  generated_by: ["Tekijä", "Generated by"],
  gmail_message_id: ["Sähköpostin tunniste", "Email message ID"],
  group_id: ["Versioryhmä", "Version group"],
  handed_at: ["Luovutettu", "Handed at"],
  handed_by: ["Luovuttaja", "Handed by"],
  hazmat_survey: ["Haitta-ainekartoitus", "Hazardous materials survey"],
  holder_name: ["Haltija", "Holder"],
  id_hash: ["Tunnisteen tiiviste", "ID hash"],
  impact_electric: ["Vaikutus sähköön", "Electrical impact"],
  impact_sewer: ["Vaikutus viemäreihin", "Sewer impact"],
  impact_structures: ["Vaikutus rakenteisiin", "Structural impact"],
  impact_ventilation: ["Vaikutus ilmanvaihtoon", "Ventilation impact"],
  impact_water: ["Vaikutus vesijohtoihin", "Water pipe impact"],
  input_tokens: ["Syötetokenit", "Input tokens"],
  inspected_at: ["Tarkastettu", "Inspected at"],
  key: ["Avain", "Key"],
  key_id: ["Avain", "Key"],
  kind: ["Laji", "Kind"],
  knowledge_id: ["Dokumentti", "Document"],
  knowledge_source_chunk_id: ["Lähteen tietopala", "Source chunk"],
  knowledge_source_id: ["Lähdedokumentti", "Source document"],
  knowledge_source_page: ["Lähteen sivu", "Source page"],
  knowledge_source_title: ["Lähteen otsikko", "Source title"],
  label: ["Tunnus", "Label"],
  last_at: ["Viimeksi", "Last at"],
  last_login_at: ["Viimeksi kirjautunut", "Last login"],
  level: ["Taso", "Level"],
  mail_account_id: ["Sähköpostitili", "Mail account"],
  maintenance_email: ["Huoltoyhtiön sähköposti", "Maintenance email"],
  maintenance_emergency_phone: ["Huollon päivystysnumero", "Maintenance emergency phone"],
  maintenance_name: ["Huoltoyhtiö", "Maintenance company"],
  maintenance_phone: ["Huoltoyhtiön puhelin", "Maintenance phone"],
  managed: ["Luotu sovelluksessa", "Managed"],
  manager_id: ["Vastuuisännöitsijä", "Manager"],
  member_id: ["Hallituksen jäsen", "Board member"],
  message: ["Viesti", "Message"],
  message_id: ["Viestin tunniste", "Message ID"],
  meter_type: ["Mittari", "Meter type"],
  mime_type: ["Tiedostotyyppi", "MIME type"],
  model: ["Malli", "Model"],
  month: ["Kuukausi", "Month"],
  monthly_price: ["Kuukausihinta", "Monthly price"],
  move_date: ["Muuttopäivä", "Move date"],
  moved_out_at: ["Muuttanut pois", "Moved out"],
  moves_out: ["Muuttaa pois", "Moves out"],
  name: ["Nimi", "Name"],
  needs_review: ["Tarkistettava", "Needs review"],
  new_residents: ["Uudet asukkaat", "New residents"],
  note: ["Huomautus", "Note"],
  offered_at: ["Tarjottu", "Offered at"],
  offered_by: ["Tarjoaja", "Offered by"],
  ordered_at: ["Tilattu", "Ordered at"],
  ordered_by: ["Tilaaja", "Ordered by"],
  origin: ["Alkuperä", "Origin"],
  output_tokens: ["Vastaustokenit", "Output tokens"],
  page: ["Sivu", "Page"],
  pages: ["Sivut", "Pages"],
  parking_id: ["Autopaikka", "Parking space"],
  parking_type: ["Autopaikan tyyppi", "Parking type"],
  password_hash: ["Salasanan tiiviste", "Password hash"],
  period: ["Jakso", "Period"],
  phone: ["Puhelin", "Phone"],
  position: ["Järjestys", "Position"],
  prices: ["Hinnat", "Prices"],
  priority: ["Prioriteetti", "Priority"],
  processing_state: ["Käsittelyn tila", "Processing state"],
  provider: ["Palvelu", "Provider"],
  queue_enabled: ["Jono käytössä", "Queue enabled"],
  queue_size: ["Jonon koko", "Queue size"],
  reading_date: ["Lukemapäivä", "Reading date"],
  reason: ["Peruste", "Reason"],
  received_by: ["Vastaanottaja", "Received by"],
  record_ids: ["Tietueet", "Records"],
  record_kind: ["Tietueen laji", "Record kind"],
  recorded_by: ["Kirjaaja", "Recorded by"],
  reminder_emails: ["Muistutussähköpostit", "Reminder emails"],
  reply_reminder_days: ["Vastausmuistutus (pv)", "Reply reminder days"],
  reporter_name: ["Ilmoittajan nimi", "Reporter name"],
  requested_by: ["Pyytäjä", "Requested by"],
  resident_id: ["Asukas", "Resident"],
  resident_status_updates: ["Tilapäivitykset asukkaalle", "Resident status updates"],
  resolved_at: ["Kuitattu", "Resolved at"],
  resource: ["Tila", "Resource"],
  result: ["Tulos", "Result"],
  retention_months: ["Säilytysaika (kk)", "Retention months"],
  returned_at: ["Palautettu", "Returned at"],
  role: ["Rooli", "Role"],
  rows: ["Rivit", "Rows"],
  sender: ["Lähettäjä", "Sender"],
  sends: ["Lähetyskerrat", "Sends"],
  sensitive: ["Arkaluonteinen", "Sensitive"],
  sensitive_source: ["Arkaluonteisuuden lähde", "Sensitivity source"],
  sent_at: ["Lähetetty", "Sent at"],
  series_id: ["Vuorosarja", "Series"],
  settings: ["Asetukset", "Settings"],
  single_price: ["Kertavuoron hinta", "Single price"],
  size: ["Koko", "Size"],
  source: ["Lähde", "Source"],
  source_channel: ["Kanava", "Channel"],
  stairwell: ["Porras", "Stairwell"],
  start_date: ["Alkaa", "Start date"],
  started_at: ["Aloitettu", "Started at"],
  starts_at: ["Alkaa", "Starts at"],
  status: ["Tila", "Status"],
  subject: ["Aihe", "Subject"],
  subject_id: ["Kohde", "Subject"],
  suggested_valid_until: ["Ehdotettu voimassaolo", "Suggested valid until"],
  summary: ["Yhteenveto", "Summary"],
  supervisor: ["Työnvalvoja", "Supervisor"],
  tags: ["Avainsanat", "Tags"],
  template: ["Pohja", "Template"],
  ticket_count: ["Tehtäviä", "Ticket count"],
  ticket_id: ["Tehtävä", "Ticket"],
  ticket_number: ["Numero", "Number"],
  title: ["Otsikko", "Title"],
  token: ["Tunniste", "Token"],
  token_hash: ["Tunnisteen tiiviste", "Token hash"],
  topics: ["Aiheet", "Topics"],
  total: ["Yhteensä", "Total"],
  two_factor: ["Kaksivaiheinen kirjautuminen", "Two-factor login"],
  type: ["Tyyppi", "Type"],
  updated_at: ["Päivitetty", "Updated"],
  user_id: ["Käyttäjä", "User"],
  valid_from: ["Voimassa alkaen", "Valid from"],
  valid_until: ["Voimassa asti", "Valid until"],
  value: ["Arvo", "Value"],
  verified: ["Tarkistettu", "Verified"],
  version: ["Versio", "Version"],
  waterproofing: ["Vedeneristys", "Waterproofing"],
  weekly_weeks: ["Viikkovuoron viikot", "Weekly weeks"],
  work_type: ["Työn laji", "Work type"],
  "sys_db_object.name": ["Sisäinen nimi", "Name"],
  "sys_db_object.physical_name": ["Tietokannan taulu", "Database table"],
  "sys_db_object.label": ["Nimi", "Label"],
  "sys_db_object.label_en": ["Nimi englanniksi", "English label"],
  "sys_db_object.is_system": ["Järjestelmätaulu", "System table"],
  "sys_db_object.active": ["Käytössä", "Active"],
  "sys_dictionary.table_name": ["Taulu", "Table"],
  "sys_dictionary.element": ["Sisäinen nimi", "Element"],
  "sys_dictionary.column_name": ["Tietokannan sarake", "Database column"],
  "sys_dictionary.label": ["Nimi", "Label"],
  "sys_dictionary.label_en": ["Nimi englanniksi", "English label"],
  "sys_dictionary.internal_type": ["Tyyppi", "Type"],
  "sys_dictionary.reference": ["Viittaus", "Reference"],
  "sys_dictionary.mandatory": ["Pakollinen", "Mandatory"],
  "sys_dictionary.primary_key": ["Perusavain", "Primary key"],
  "sys_dictionary.default_value": ["Oletusarvo", "Default value"],
  "sys_dictionary.secret": ["Salainen", "Secret"],
  "sys_dictionary.active": ["Käytössä", "Active"],
  "sys_choice.table_name": ["Taulu", "Table"],
  "sys_choice.element": ["Kenttä", "Element"],
  "sys_choice.label": ["Nimi", "Label"],
  "sys_choice.label_en": ["Nimi englanniksi", "English label"],
  "sys_choice.sequence": ["Järjestys", "Sequence"],
  "office_settings.id": ["Tunniste", "ID"],
  "office_settings.name": ["Toimiston nimi", "Office name"]
};

// Viittaukset, joita tietokannassa ei ole merkitty viiteavaimiksi: sarake → tietokannan taulu.
const REFERENCES: Record<string, string> = {
  company_id: "companies",
  apartment_id: "apartments",
  resident_id: "residents",
  ticket_id: "tickets",
  user_id: "users",
  assignee_id: "users",
  manager_id: "users",
  member_id: "board_members",
  parking_id: "parking_spaces",
  key_id: "building_keys",
  knowledge_id: "knowledge",
  booking_id: "bookings",
  mail_account_id: "gmail_accounts",
  knowledge_source_id: "knowledge",
  knowledge_source_chunk_id: "knowledge_chunks",
  "attachments.message_id": "messages",
  "sys_dictionary.table_name": "sys_db_object",
  "sys_dictionary.reference": "sys_db_object",
  "sys_choice.table_name": "sys_db_object"
};

// Sisäiset kenttänimet ServiceNow'n tapaan: tunniste on sys_id, aikaleimat sys_created_on ja
// sys_updated_on, ja viittauskentästä jää pois pääte _id (company_id → company).
const ELEMENT_NAMES: Record<string, string> = {
  id: "sys_id",
  created_at: "sys_created_on",
  updated_at: "sys_updated_on",
  created_by: "sys_created_by",
  assignee_id: "assigned_to"
};

// Kentät, joiden arvoa ei näytetä eikä niillä voi hakea (salasanat, istuntotunnisteet, salatut asetukset).
const SECRET_PATTERN = /(^|_)(password|token|secret)(_|$)|_hash$/;
const SECRET_COLUMNS = new Set(["gmail_accounts.settings"]);

// Taulut, joiden tietueita ei muokata täältä: loki, kirjautumiset ja tunnisteet, sähköpostin kirjanpito ja
// taulut, joilla on oma tarkistettu näkymänsä (käyttäjät, perustiedot, sanakirja). Myös taulut, joilla ei ole
// yhden sarakkeen perusavainta, ovat vain luku.
const READ_ONLY_TABLES = new Set([
  "audit_log", "sessions", "board_sessions", "resident_sessions", "password_resets", "login_challenges", "trusted_devices",
  "resident_credentials", "gmail_accounts", "gmail_imports", "gmail_sync_state", "deleted_mail_messages", "form_imports",
  "ai_usage", "ai_budget_notices", "reminder_log", "users", "master_data", "erasure_pending", "system_alerts",
  "sys_db_object", "sys_dictionary", "sys_choice"
]);
// Kentät, jotka järjestelmä täyttää itse: luontitiedot ja päivitysaika.
const AUTOMATIC_COLUMNS = new Set(["created_at", "created_by", "updated_at"]);

const JSON_COLUMNS = new Set([
  "prices", "rows", "fields", "topics", "covered", "config", "pages", "comparison", "new_residents", "details",
  "settings", "record_ids", "master_data.value"
]);
const NOT_BOOLEAN = /count|size|version|weeks|position|attempts|sends|days|months|percent|number|page/;

// Valintakenttien arvot: "taulu.sarake" → [arvo, nimi, nimi englanniksi].
const CHOICES: Record<string, [string, string, string][]> = {
  "tickets.status": [
    ["open", "Uusi", "New"], ["active", "Avoin", "Open"], ["waiting_manager", "Käsittelyssä", "In progress"],
    ["answered", "Vastattu", "Answered"], ["waiting_third_party", "Kolmannella osapuolella", "With third party"],
    ["closed", "Suljettu", "Closed"]
  ],
  "tickets.priority": [
    ["emergency", "Hätä", "Emergency"], ["urgent", "Kiireellinen", "Urgent"], ["normal", "Normaali", "Normal"], ["low", "Matala", "Low"]
  ],
  "tickets.source_channel": [
    ["email", "Sähköposti", "Email"], ["portal", "Portaali", "Portal"], ["quick_note", "Pikamuistio", "Quick note"],
    ["manual", "Manuaalinen", "Manual"]
  ],
  "tickets.kind": [["ticket", "Tehtävä", "Ticket"], ["renovation", "Remontti-ilmoitus", "Renovation notice"]],
  "messages.direction": [["inbound", "Saapuva", "Inbound"], ["outbound", "Lähtevä", "Outbound"]],
  "messages.channel": [
    ["email", "Sähköposti", "Email"], ["portal", "Portaali", "Portal"], ["contractor", "Huoltoyhtiö", "Contractor"]
  ],
  "users.role": [
    ["Pääkäyttäjä", "Pääkäyttäjä", "Administrator"], ["Isännöitsijä", "Isännöitsijä", "Property manager"],
    ["Asiakaspalvelu", "Asiakaspalvelu", "Customer service"]
  ],
  "knowledge.kind": [["document", "Dokumentti", "Document"], ["fact", "Vakiotieto", "Fact"]],
  "knowledge.audience": [["ai", "AI-dokumentaatio", "AI documentation"], ["internal", "Sisäinen", "Internal"]],
  "knowledge.status": [
    ["active", "Voimassa", "Active"], ["pending", "Odottaa hyväksyntää", "Pending"], ["replaced", "Korvattu", "Replaced"],
    ["deleted", "Poistettu", "Deleted"]
  ],
  "work_orders.status": [["ordered", "Tilattu", "Ordered"], ["done", "Tehty", "Done"]],
  "move_notices.status": [["pending", "Odottaa", "Pending"], ["approved", "Hyväksytty", "Approved"], ["rejected", "Hylätty", "Rejected"]],
  "renovation_notices.status": [
    ["pending", "Odottaa", "Pending"], ["approved", "Hyväksytty", "Approved"], ["rejected", "Hylätty", "Rejected"],
    ["completed", "Valmis", "Completed"]
  ],
  "heating_orders.status": [
    ["pending", "Odottaa", "Pending"], ["approved", "Myönnetty", "Approved"], ["rejected", "Hylätty", "Rejected"],
    ["ended", "Päättynyt", "Ended"]
  ],
  "booking_requests.status": [
    ["pending", "Odottaa", "Pending"], ["approved", "Hyväksytty", "Approved"], ["rejected", "Hylätty", "Rejected"],
    ["cancelled", "Peruttu", "Cancelled"]
  ],
  "bookings.resource": [["sauna", "Sauna", "Sauna"], ["laundry", "Pyykkitupa", "Laundry room"]],
  "meter_readings.meter_type": [
    ["cold_water", "Kylmä vesi", "Cold water"], ["hot_water", "Lämmin vesi", "Hot water"], ["electricity", "Sähkö", "Electricity"]
  ]
};

export type SysTable = {
  name: string; physical_name: string; label: string; label_en: string; description: string; is_system: number; active: number;
  read_only: number;
};

export type SysField = {
  table_name: string; element: string; column_name: string; label: string; label_en: string; description: string;
  internal_type: string; reference: string | null; mandatory: number; primary_key: number; default_value: string | null;
  secret: number; position: number; active: number; read_only: number;
};

type ColumnInfo = { name: string; type: string; notnull: number; dflt_value: string | null; pk: number };

function humanize(name: string) {
  const text = name.replace(/_/g, " ").trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function fieldType(table: string, column: ColumnInfo, reference: string | null): string {
  const name = column.name;
  const declared = column.type.toUpperCase();
  if (column.pk && name === "id" && declared === "TEXT") return "sys_id";
  if (reference) return "reference";
  if (JSON_COLUMNS.has(name) || JSON_COLUMNS.has(`${table}.${name}`) || column.dflt_value === "'[]'" || column.dflt_value === "'{}'") return "json";
  if (name.endsWith("_at")) return "glide_date_time";
  if (name.endsWith("_date") || name.startsWith("valid_") || name.endsWith("_valid_until") || name === "day") return "glide_date";
  if (CHOICES[`${table}.${name}`]) return "choice";
  if (declared === "INTEGER" && (column.dflt_value === "0" || column.dflt_value === "1") && !NOT_BOOLEAN.test(name)) return "boolean";
  if (declared === "INTEGER") return "integer";
  if (declared === "REAL") return "decimal";
  return "string";
}

// Lisää sanakirjaan puuttuvat taulut ja kentät ja päivittää niiden tekniset tiedot tietokannan rakenteesta.
// Nimet ja kuvaukset säilyvät sellaisina kuin pääkäyttäjä ne on kirjoittanut.
export function syncDictionary() {
  const stamp = new Date().toISOString();
  const physicalTables = (db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  ).all() as { name: string }[]).map(row => row.name);

  db.transaction(() => {
    db.prepare("UPDATE sys_db_object SET active = 0").run();
    const internalByPhysical = new Map<string, string>();
    for (const physical of physicalTables) {
      const existing = db.prepare("SELECT name FROM sys_db_object WHERE physical_name = ?").get(physical) as { name: string } | undefined;
      let name = existing?.name;
      if (!name) {
        const [preferred, label, labelEn, description] = TABLES[physical] ?? [`u_${physical}`, humanize(physical), humanize(physical), ""];
        name = preferred;
        for (let suffix = 2; db.prepare("SELECT 1 FROM sys_db_object WHERE name = ?").get(name); suffix += 1) name = `${preferred}_${suffix}`;
        db.prepare(`
          INSERT INTO sys_db_object (name, physical_name, label, label_en, description, is_system, active, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
        `).run(name, physical, label, labelEn, description, name.startsWith("sys_") ? 1 : 0, stamp, stamp);
      }
      const keyColumns = (db.prepare(`PRAGMA table_info("${physical}")`).all() as ColumnInfo[]).filter(column => column.pk).length;
      db.prepare("UPDATE sys_db_object SET active = 1, read_only = ? WHERE name = ?")
        .run(READ_ONLY_TABLES.has(physical) || keyColumns !== 1 ? 1 : 0, name);
      internalByPhysical.set(physical, name);
    }

    const upsertField = db.prepare(`
      INSERT INTO sys_dictionary
        (table_name, element, column_name, label, label_en, internal_type, reference, mandatory, primary_key, default_value,
         secret, read_only, position, active, created_at, updated_at)
      VALUES (@table, @element, @column, @label, @labelEn, @type, @reference, @mandatory, @primaryKey, @defaultValue,
         @secret, @readOnly, @position, 1, @stamp, @stamp)
      ON CONFLICT(table_name, column_name) DO UPDATE SET
        internal_type = excluded.internal_type, reference = excluded.reference, mandatory = excluded.mandatory,
        primary_key = excluded.primary_key, default_value = excluded.default_value, secret = excluded.secret,
        read_only = excluded.read_only, position = excluded.position, active = 1
    `);
    for (const physical of physicalTables) {
      const table = internalByPhysical.get(physical)!;
      const columns = db.prepare(`PRAGMA table_info("${physical}")`).all() as ColumnInfo[];
      const foreignKeys = new Map((db.prepare(`PRAGMA foreign_key_list("${physical}")`).all() as { from: string; table: string }[])
        .map(key => [key.from, key.table]));
      const existing = new Map((db.prepare("SELECT column_name, element FROM sys_dictionary WHERE table_name = ?").all(table) as
        { column_name: string; element: string }[]).map(row => [row.column_name, row.element]));
      const taken = new Set([...existing.values(), ...columns.map(column => column.name)]);
      db.prepare("UPDATE sys_dictionary SET active = 0 WHERE table_name = ?").run(table);

      columns.forEach((column, index) => {
        const target = foreignKeys.get(column.name) ?? REFERENCES[`${physical}.${column.name}`] ?? REFERENCES[column.name];
        const reference = target && internalByPhysical.has(target) ? internalByPhysical.get(target)! : null;
        let element = existing.get(column.name);
        if (!element) {
          const derived = ELEMENT_NAMES[column.name] ?? (reference && column.name.endsWith("_id") ? column.name.slice(0, -3) : column.name);
          element = derived !== column.name && taken.has(derived) ? column.name : derived;
          taken.add(element);
        }
        const [label, labelEn] = FIELD_LABELS[`${physical}.${column.name}`] ?? FIELD_LABELS[column.name] ?? [humanize(column.name), humanize(column.name)];
        upsertField.run({
          table, element, column: column.name, label, labelEn,
          type: fieldType(physical, column, reference),
          reference,
          mandatory: column.notnull || column.pk ? 1 : 0,
          primaryKey: column.pk ? 1 : 0,
          defaultValue: column.dflt_value === null ? null : column.dflt_value.replace(/^'(.*)'$/, "$1"),
          secret: SECRET_PATTERN.test(column.name) || SECRET_COLUMNS.has(`${physical}.${column.name}`) ? 1 : 0,
          readOnly: column.pk || AUTOMATIC_COLUMNS.has(column.name) || SECRET_PATTERN.test(column.name)
            || SECRET_COLUMNS.has(`${physical}.${column.name}`) ? 1 : 0,
          position: index,
          stamp
        });
      });
    }

    const insertChoice = db.prepare(
      "INSERT OR IGNORE INTO sys_choice (table_name, element, value, label, label_en, sequence) VALUES (?, ?, ?, ?, ?, ?)"
    );
    for (const [key, choices] of Object.entries(CHOICES)) {
      const [physical, column] = key.split(".");
      const table = internalByPhysical.get(physical);
      if (!table) continue;
      const field = db.prepare("SELECT element FROM sys_dictionary WHERE table_name = ? AND column_name = ?").get(table, column) as
        { element: string } | undefined;
      if (!field) continue;
      choices.forEach(([value, label, labelEn], index) => insertChoice.run(table, field.element, value, label, labelEn, index * 10));
    }
  })();
}

export function getTable(name: string): SysTable | undefined {
  return db.prepare("SELECT * FROM sys_db_object WHERE name = ? AND active = 1").get(name) as SysTable | undefined;
}

export function getFields(table: string): SysField[] {
  return db.prepare("SELECT * FROM sys_dictionary WHERE table_name = ? AND active = 1 ORDER BY position").all(table) as SysField[];
}

// ---------------------------------------------------------------------------------------------
// Koodattu haku (encoded query) ServiceNow'n tapaan: ehdot erotetaan merkillä ^, esim.
//   status=open^priority!=low^subjectLIKEvesi^due_dateISNOTEMPTY^ORDERBYDESCsys_created_on
// Kentät ovat sisäisiä nimiä; arvot välitetään tietokannalle parametreina.
// ---------------------------------------------------------------------------------------------
const OPERATORS: Record<string, string> = {
  "=": "= ?", "!=": "IS NOT ?", ">": "> ?", ">=": ">= ?", "<": "< ?", "<=": "<= ?",
  LIKE: "LIKE ?", NOTLIKE: "NOT LIKE ?", STARTSWITH: "LIKE ?", ENDSWITH: "LIKE ?",
  ISEMPTY: "", ISNOTEMPTY: ""
};
const TERM = /^([a-z][a-z0-9_]*)(ISEMPTY|ISNOTEMPTY|NOTLIKE|LIKE|STARTSWITH|ENDSWITH|!=|>=|<=|=|>|<)(.*)$/;

export class QueryError extends Error {}

export function buildQuery(fields: SysField[], query: string) {
  const byElement = new Map(fields.filter(field => !field.secret).map(field => [field.element, field]));
  const where: string[] = [];
  const params: (string | number)[] = [];
  const order: string[] = [];
  for (const raw of query.split("^").map(term => term.trim()).filter(Boolean)) {
    const ordering = /^ORDERBY(DESC)?([a-z][a-z0-9_]*)$/.exec(raw);
    if (ordering) {
      const field = byElement.get(ordering[2]);
      if (!field) throw new QueryError(`Tuntematon kenttä: ${ordering[2]}`);
      order.push(`"${field.column_name}" ${ordering[1] ? "DESC" : "ASC"}`);
      continue;
    }
    const match = TERM.exec(raw);
    if (!match) throw new QueryError(`Virheellinen ehto: ${raw}`);
    const [, element, operator, value] = match;
    const field = byElement.get(element);
    if (!field) throw new QueryError(`Tuntematon kenttä: ${element}`);
    const column = `"${field.column_name}"`;
    if (operator === "ISEMPTY") {
      where.push(`(${column} IS NULL OR ${column} = '')`);
      continue;
    }
    if (operator === "ISNOTEMPTY") {
      where.push(`(${column} IS NOT NULL AND ${column} != '')`);
      continue;
    }
    where.push(`${column} ${OPERATORS[operator]}`);
    const escaped = value.replace(/[\\%_]/g, character => `\\${character}`);
    if (operator === "LIKE" || operator === "NOTLIKE") params.push(`%${escaped}%`);
    else if (operator === "STARTSWITH") params.push(`${escaped}%`);
    else if (operator === "ENDSWITH") params.push(`%${escaped}`);
    else if (field.internal_type === "boolean") params.push(value === "true" || value === "1" ? 1 : 0);
    else if (["integer", "decimal"].includes(field.internal_type) && value !== "" && !Number.isNaN(Number(value))) params.push(Number(value));
    else params.push(value);
    if (operator.includes("LIKE") || operator.endsWith("WITH")) where[where.length - 1] += " ESCAPE '\\'";
  }
  return {
    where: where.length ? `WHERE ${where.join(" AND ")}` : "",
    order: order.length ? `ORDER BY ${order.join(", ")}` : "",
    params
  };
}

// Tietokannan rivi sisäisillä kenttänimillä. Salaiset kentät jätetään pois.
export function toRecord(fields: SysField[], row: Record<string, unknown>) {
  const record: Record<string, unknown> = {};
  for (const field of fields) {
    if (!field.secret) record[field.element] = row[field.column_name] ?? null;
  }
  return record;
}

// Kenttä, jonka arvo kuvaa tietueen (ServiceNow'n display-kenttä): nimi, otsikko, aihe tai vastaava.
const DISPLAY_ELEMENTS = ["name", "title", "subject", "label", "apartment_number", "holder_name", "code", "email", "contractor_name", "key"];

export function displayField(fields: SysField[]) {
  return DISPLAY_ELEMENTS.map(element => fields.find(field => field.element === element && !field.secret)).find(Boolean)
    ?? fields.find(field => field.primary_key);
}

// Tietueen avain: yhden sarakkeen perusavain (yleensä sys_id).
export function keyField(fields: SysField[]) {
  const keys = fields.filter(field => field.primary_key);
  return keys.length === 1 ? keys[0] : undefined;
}

export class RecordError extends Error {}

// Tarkistaa muokattavat arvot kenttien tyypin mukaan ja palauttaa ne tietokannan sarakkeina. Uudessa
// tietueessa pakolliset kentät ilman oletusarvoa pitää antaa; tunniste sys_id luodaan automaattisesti.
export function recordValues(
  table: SysTable, fields: SysField[], input: Record<string, unknown>, mode: "create" | "update", actor: string
) {
  const byElement = new Map(fields.map(field => [field.element, field]));
  const values = new Map<string, unknown>();
  for (const [element, raw] of Object.entries(input)) {
    const field = byElement.get(element);
    if (!field) throw new RecordError(`Tuntematon kenttä: ${element}`);
    const settable = !field.read_only || (mode === "create" && field.primary_key && field.internal_type !== "sys_id" && !field.secret);
    if (!settable) throw new RecordError(`Kenttää ${element} ei voi muuttaa.`);
    values.set(field.column_name, fieldValue(table, field, raw));
  }
  const stamp = new Date().toISOString();
  const has = (column: string) => fields.some(field => field.column_name === column);
  if (mode === "create") {
    const key = keyField(fields);
    if (key?.internal_type === "sys_id") values.set(key.column_name, `${table.name.replace(/^(u|sys)_/, "").replace(/_/g, "-")}-${crypto.randomUUID()}`);
    if (has("created_at")) values.set("created_at", stamp);
    if (has("created_by")) values.set("created_by", actor);
    for (const field of fields) {
      const missing = !values.has(field.column_name) || values.get(field.column_name) === null;
      if (field.mandatory && field.default_value === null && missing) {
        throw new RecordError(`Pakollinen kenttä puuttuu: ${field.element}`);
      }
    }
  }
  if (has("updated_at")) values.set("updated_at", stamp);
  return values;
}

function fieldValue(table: SysTable, field: SysField, raw: unknown): unknown {
  const empty = raw === null || raw === undefined || raw === "";
  if (empty) {
    if (field.mandatory && !["string", "json"].includes(field.internal_type)) throw new RecordError(`Pakollinen kenttä puuttuu: ${field.element}`);
    if (field.mandatory) return field.internal_type === "json" ? (field.default_value ?? "{}") : "";
    return null;
  }
  const text = String(raw).trim();
  switch (field.internal_type) {
    case "boolean":
      if (typeof raw === "boolean") return raw ? 1 : 0;
      if (["1", "true"].includes(text)) return 1;
      if (["0", "false"].includes(text)) return 0;
      throw new RecordError(`Kentän ${field.element} arvon pitää olla kyllä tai ei.`);
    case "integer":
      if (!/^-?\d+$/.test(text)) throw new RecordError(`Kentän ${field.element} arvon pitää olla kokonaisluku.`);
      return Number(text);
    case "decimal":
      if (text === "" || Number.isNaN(Number(text.replace(",", ".")))) throw new RecordError(`Kentän ${field.element} arvon pitää olla luku.`);
      return Number(text.replace(",", "."));
    case "glide_date":
      if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(text))) throw new RecordError(`Kentän ${field.element} arvon pitää olla päivämäärä (VVVV-KK-PP).`);
      return text;
    case "glide_date_time":
      if (Number.isNaN(Date.parse(text))) throw new RecordError(`Kentän ${field.element} arvon pitää olla päivämäärä ja aika.`);
      return new Date(text).toISOString();
    case "json":
      try {
        JSON.parse(text);
      } catch {
        throw new RecordError(`Kentän ${field.element} arvo ei ole kelvollista JSONia.`);
      }
      return text;
    case "choice": {
      const allowed = (db.prepare("SELECT value FROM sys_choice WHERE table_name = ? AND element = ?").all(table.name, field.element) as
        { value: string }[]).map(row => row.value);
      if (allowed.length && !allowed.includes(text)) throw new RecordError(`Kentän ${field.element} arvo ei ole sallittu valinta.`);
      return text;
    }
    case "reference": {
      const target = getTable(field.reference ?? "");
      const key = target && keyField(getFields(target.name));
      if (!target || !key || !db.prepare(`SELECT 1 FROM "${target.physical_name}" WHERE "${key.column_name}" = ?`).get(text)) {
        throw new RecordError(`Kentän ${field.element} viittaamaa tietuetta ei löytynyt.`);
      }
      return text;
    }
    default:
      if (text.length > 20000) throw new RecordError(`Kentän ${field.element} arvo on liian pitkä.`);
      return typeof raw === "string" ? raw : text;
  }
}
