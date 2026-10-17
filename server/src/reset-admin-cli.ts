import "dotenv/config";
// Tietokannan päivitykset ajetaan ennen kuin taulua office_settings käytetään.
import "./startup.js";
import { ADMIN_ROLE, hashPassword, MIN_PASSWORD_LENGTH } from "./auth.js";
import { db } from "./db.js";

// Käyttö: npm run reset-admin -- <uusi salasana> [sähköposti]. Asettaa pääkäyttäjän salasanan, kytkee
// kaksivaiheisen kirjautumisen pois ja kirjaa käyttäjän ulos kaikilta laitteilta. Tarkoitettu omalle
// koneelle, kun kirjautumistiedot ovat hukassa. Ilman sähköpostia käytetään ensimmäistä pääkäyttäjää.
const [password, email] = process.argv.slice(2);

if (!password || password.length < MIN_PASSWORD_LENGTH) {
  console.error(`Anna uusi salasana (vähintään ${MIN_PASSWORD_LENGTH} merkkiä): npm run reset-admin -- <salasana> [sähköposti]`);
  process.exitCode = 1;
} else {
  const user = (email
    ? db.prepare("SELECT id, email, role FROM users WHERE email = ?").get(email.trim().toLowerCase())
    : db.prepare("SELECT id, email, role FROM users WHERE role = ? ORDER BY created_at LIMIT 1").get(ADMIN_ROLE)) as
    { id: string; email: string; role: string } | undefined;
  if (!user) {
    console.error(email ? `Käyttäjää ${email} ei löytynyt.` : "Tietokannassa ei ole pääkäyttäjää.");
    process.exitCode = 1;
  } else {
    db.transaction(() => {
      db.prepare("UPDATE users SET password_hash = ?, role = ? WHERE id = ?").run(hashPassword(password), ADMIN_ROLE, user.id);
      db.prepare("DELETE FROM sessions WHERE user_id = ?").run(user.id);
      db.prepare("UPDATE office_settings SET two_factor = 0 WHERE id = 1").run();
    })();
    console.log(`Salasana vaihdettu käyttäjälle ${user.email} (pääkäyttäjä). Kaksivaiheinen kirjautuminen on pois päältä.`);
  }
}
