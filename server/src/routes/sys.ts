import express, { type Router } from "express";
import { z } from "zod";
import { requireAdmin } from "../auth.js";
import { db } from "../db.js";
import {
  addCustomField, buildQuery, CUSTOM_ELEMENT, CUSTOM_TYPES, deleteCustomField, displayField, getFields, getTable, keyField,
  QueryError, RecordError, recordValues, type SysTable, toRecord
} from "../sys-dictionary.js";
import { id, now } from "../util.js";

export const sysRouter: Router = express.Router();

// Järjestelmän sanakirja (taulut, kentät ja valinnat sisäisine nimineen) ja tietueiden luku
// sisäisillä nimillä. Kaikki reitit ovat vain pääkäyttäjälle.

function audit(actor: string, action: string, details: unknown) {
  db.prepare("INSERT INTO audit_log VALUES (?, ?, ?, ?, ?, ?)").run(id("audit"), null, actor, action, JSON.stringify(details), now());
}

const actorName = (res: express.Response) => res.locals.user?.name ?? "Pääkäyttäjä";

sysRouter.get("/sys/tables", requireAdmin, (_req, res) => {
  const tables = db.prepare(`
    SELECT t.name, t.physical_name AS physicalName, t.label, t.label_en AS labelEn, t.description,
           t.is_system AS isSystem, COUNT(d.element) AS fieldCount
    FROM sys_db_object t
    LEFT JOIN sys_dictionary d ON d.table_name = t.name AND d.active = 1
    WHERE t.active = 1
    GROUP BY t.name
    ORDER BY t.name
  `).all() as (Record<string, unknown> & { physicalName: string })[];
  res.json(tables.map(table => ({
    ...table,
    rowCount: (db.prepare(`SELECT COUNT(*) AS count FROM "${table.physicalName}"`).get() as { count: number }).count
  })));
});

function tableOr404(req: express.Request, res: express.Response): SysTable | undefined {
  const table = getTable(String(req.params.table));
  if (!table) res.status(404).json({ error: "Taulua ei löytynyt." });
  return table;
}

const fieldJson = (field: ReturnType<typeof getFields>[number]) => ({
  element: field.element, columnName: field.column_name, label: field.label, labelEn: field.label_en,
  description: field.description, type: field.internal_type, reference: field.reference, mandatory: !!field.mandatory,
  primaryKey: !!field.primary_key, defaultValue: field.default_value, secret: !!field.secret, readOnly: !!field.read_only,
  custom: !!field.custom
});

sysRouter.get("/sys/tables/:table", requireAdmin, (req, res) => {
  const table = tableOr404(req, res);
  if (!table) return;
  const choices = db.prepare(`
    SELECT element, value, label, label_en AS labelEn, sequence FROM sys_choice WHERE table_name = ? ORDER BY element, sequence
  `).all(table.name);
  const fields = getFields(table.name);
  res.json({
    table: {
      name: table.name, physicalName: table.physical_name, label: table.label, labelEn: table.label_en,
      description: table.description, isSystem: !!table.is_system, readOnly: !!table.read_only,
      keyField: keyField(fields)?.element ?? null, displayField: displayField(fields)?.element ?? null
    },
    fields: fields.map(fieldJson),
    choices
  });
});

const labelsSchema = z.object({
  label: z.string().trim().min(1).max(80).optional(),
  labelEn: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(1000).optional()
});

sysRouter.patch("/sys/tables/:table", requireAdmin, (req, res) => {
  const table = tableOr404(req, res);
  if (!table) return;
  const parsed = labelsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Tarkista taulun tiedot." });
  const { label = table.label, labelEn = table.label_en, description = table.description } = parsed.data;
  db.prepare("UPDATE sys_db_object SET label = ?, label_en = ?, description = ?, updated_at = ? WHERE name = ?")
    .run(label, labelEn, description, now(), table.name);
  audit(actorName(res), "dictionary_updated", { table: table.name, fields: Object.keys(parsed.data) });
  res.json({ name: table.name, label, labelEn, description });
});

sysRouter.patch("/sys/tables/:table/fields/:element", requireAdmin, (req, res) => {
  const table = tableOr404(req, res);
  if (!table) return;
  const field = getFields(table.name).find(item => item.element === req.params.element);
  if (!field) return res.status(404).json({ error: "Kenttää ei löytynyt." });
  const parsed = labelsSchema.extend({ mandatory: z.boolean().optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Tarkista kentän tiedot." });
  if (parsed.data.mandatory !== undefined && !field.custom) return res.status(400).json({ error: "Vain itse lisätyn kentän pakollisuutta voi muuttaa." });
  const { label = field.label, labelEn = field.label_en, description = field.description } = parsed.data;
  const mandatory = parsed.data.mandatory === undefined ? field.mandatory : Number(parsed.data.mandatory);
  db.prepare("UPDATE sys_dictionary SET label = ?, label_en = ?, description = ?, mandatory = ?, updated_at = ? WHERE table_name = ? AND element = ?")
    .run(label, labelEn, description, mandatory, now(), table.name, field.element);
  audit(actorName(res), "dictionary_updated", { table: table.name, element: field.element, fields: Object.keys(parsed.data) });
  res.json(fieldJson({ ...field, label, label_en: labelEn, description, mandatory }));
});

sysRouter.patch("/sys/tables/:table/fields/:element/choices/:value", requireAdmin, (req, res) => {
  const table = tableOr404(req, res);
  if (!table) return;
  const parsed = z.object({
    label: z.string().trim().min(1).max(80).optional(),
    labelEn: z.string().trim().min(1).max(80).optional()
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Tarkista valinnan nimi." });
  const choice = db.prepare("SELECT label, label_en FROM sys_choice WHERE table_name = ? AND element = ? AND value = ?")
    .get(table.name, req.params.element, req.params.value) as { label: string; label_en: string } | undefined;
  if (!choice) return res.status(404).json({ error: "Valintaa ei löytynyt." });
  const { label = choice.label, labelEn = choice.label_en } = parsed.data;
  db.prepare("UPDATE sys_choice SET label = ?, label_en = ? WHERE table_name = ? AND element = ? AND value = ?")
    .run(label, labelEn, table.name, req.params.element, req.params.value);
  audit(actorName(res), "dictionary_updated", { table: table.name, element: req.params.element, value: req.params.value });
  res.json({ element: req.params.element, value: req.params.value, label, labelEn });
});

// Tietueet ServiceNow'n Table API:n tapaan: /api/now/table/<sisäinen nimi>?sysparm_query=…
// Vastauksessa kentät ovat sisäisillä nimillä. Vain luku; jokainen haku kirjataan lokiin.
sysRouter.get("/now/table/:table", requireAdmin, (req, res) => {
  const table = tableOr404(req, res);
  if (!table) return;
  const fields = getFields(table.name);
  const limit = Math.min(Math.max(Number(req.query.sysparm_limit) || 20, 1), 100);
  const offset = Math.max(Number(req.query.sysparm_offset) || 0, 0);
  const query = String(req.query.sysparm_query ?? "");
  const wanted = String(req.query.sysparm_fields ?? "").split(",").map(item => item.trim()).filter(Boolean);
  let built;
  try {
    built = buildQuery(fields, query);
  } catch (error) {
    if (error instanceof QueryError) return res.status(400).json({ error: error.message });
    throw error;
  }
  const visible = wanted.length ? fields.filter(field => wanted.includes(field.element)) : fields;
  const total = (db.prepare(`SELECT COUNT(*) AS count FROM "${table.physical_name}" ${built.where}`).get(...built.params) as { count: number }).count;
  const rows = db.prepare(`SELECT * FROM "${table.physical_name}" ${built.where} ${built.order || "ORDER BY rowid DESC"} LIMIT ? OFFSET ?`)
    .all(...built.params, limit, offset) as Record<string, unknown>[];
  audit(actorName(res), "table_records_viewed", { table: table.name, query, offset });
  res.json({ result: rows.map(row => toRecord(visible, row)), total, limit, offset });
});

sysRouter.get("/now/table/:table/:sysId", requireAdmin, (req, res) => {
  const table = tableOr404(req, res);
  if (!table) return;
  const fields = getFields(table.name);
  const key = keyField(fields);
  if (!key) return res.status(404).json({ error: "Taulun tietueilla ei ole yksilöivää tunnistetta." });
  const keyValue = key.internal_type === "integer" ? Number(req.params.sysId) : req.params.sysId;
  const row = db.prepare(`SELECT * FROM "${table.physical_name}" WHERE "${key.column_name}" = ?`).get(keyValue) as
    Record<string, unknown> | undefined;
  if (!row) return res.status(404).json({ error: "Tietuetta ei löytynyt." });
  audit(actorName(res), "table_records_viewed", { table: table.name, sysId: req.params.sysId });
  res.json({ result: toRecord(fields, row) });
});

// Viittauskentän vaihtoehdot: tietueen tunniste ja sitä kuvaava arvo (nimi, otsikko tms.), haku osamerkkijonolla.
sysRouter.get("/sys/tables/:table/options", requireAdmin, (req, res) => {
  const table = tableOr404(req, res);
  if (!table) return;
  const fields = getFields(table.name);
  const key = keyField(fields);
  if (!key) return res.json([]);
  const display = displayField(fields) ?? key;
  const search = String(req.query.q ?? "").trim().replace(/[\\%_]/g, character => `\\${character}`);
  const rows = db.prepare(`
    SELECT "${key.column_name}" AS value, "${display.column_name}" AS label FROM "${table.physical_name}"
    WHERE ? = '' OR "${display.column_name}" LIKE ? ESCAPE '\\' OR "${key.column_name}" LIKE ? ESCAPE '\\'
    ORDER BY 2 LIMIT 50
  `).all(search, `%${search}%`, `%${search}%`) as { value: unknown; label: unknown }[];
  res.json(rows.map(row => ({ value: String(row.value), label: String(row.label ?? row.value) })));
});

// Tietueen luonti ja muokkaus sisäisillä kenttänimillä. Arvot tarkistetaan kentän tyypin, valintojen ja
// viittausten mukaan. Vain luku -taulut (loki, kirjautumiset, käyttäjät, sanakirja) eivät ole muokattavissa.
function writableTable(req: express.Request, res: express.Response) {
  const table = tableOr404(req, res);
  if (!table) return undefined;
  if (table.read_only) {
    res.status(403).json({ error: "Tämän taulun tietueita ei voi muokata täällä." });
    return undefined;
  }
  return table;
}

function writeError(error: unknown, res: express.Response) {
  if (error instanceof RecordError) return res.status(400).json({ error: error.message });
  const code = (error as { code?: string })?.code ?? "";
  if (code.startsWith("SQLITE_CONSTRAINT")) {
    return res.status(400).json({ error: code === "SQLITE_CONSTRAINT_PRIMARYKEY" || code === "SQLITE_CONSTRAINT_UNIQUE"
      ? "Samalla tunnisteella on jo tietue." : "Tietueen arvot eivät kelpaa tietokannalle." });
  }
  throw error;
}

const recordBody = z.record(z.string(), z.unknown());

sysRouter.post("/now/table/:table", requireAdmin, (req, res) => {
  const table = writableTable(req, res);
  if (!table) return;
  const parsed = recordBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Virheellinen tietue." });
  const fields = getFields(table.name);
  const key = keyField(fields)!;
  try {
    const values = recordValues(table, fields, parsed.data, "create", actorName(res));
    const columns = [...values.keys()];
    db.prepare(`INSERT INTO "${table.physical_name}" (${columns.map(column => `"${column}"`).join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`)
      .run(...values.values());
    const keyValue = values.get(key.column_name);
    const row = db.prepare(`SELECT * FROM "${table.physical_name}" WHERE "${key.column_name}" = ?`).get(keyValue) as Record<string, unknown>;
    audit(actorName(res), "table_record_created", { table: table.name, key: keyValue, fields: Object.keys(parsed.data) });
    res.status(201).json({ result: toRecord(fields, row) });
  } catch (error) {
    writeError(error, res);
  }
});

sysRouter.patch("/now/table/:table/:sysId", requireAdmin, (req, res) => {
  const table = writableTable(req, res);
  if (!table) return;
  const parsed = recordBody.safeParse(req.body);
  if (!parsed.success || Object.keys(parsed.data).length === 0) return res.status(400).json({ error: "Anna muutettavat kentät." });
  const fields = getFields(table.name);
  const key = keyField(fields)!;
  const where = `WHERE "${key.column_name}" = ?`;
  const keyValue = key.internal_type === "integer" ? Number(req.params.sysId) : req.params.sysId;
  if (!db.prepare(`SELECT 1 FROM "${table.physical_name}" ${where}`).get(keyValue)) return res.status(404).json({ error: "Tietuetta ei löytynyt." });
  try {
    const values = recordValues(table, fields, parsed.data, "update", actorName(res));
    db.prepare(`UPDATE "${table.physical_name}" SET ${[...values.keys()].map(column => `"${column}" = ?`).join(", ")} ${where}`)
      .run(...values.values(), keyValue);
    const row = db.prepare(`SELECT * FROM "${table.physical_name}" ${where}`).get(keyValue) as Record<string, unknown>;
    audit(actorName(res), "table_record_updated", { table: table.name, key: keyValue, fields: Object.keys(parsed.data) });
    res.json({ result: toRecord(fields, row) });
  } catch (error) {
    writeError(error, res);
  }
});

// Omat kentät (u_-alkuiset): lisäys, poisto ja valintojen ylläpito. Poisto hävittää kentän arvot kaikista tietueista.
const choiceSchema = z.object({
  value: z.string().trim().min(1).max(60),
  label: z.string().trim().min(1).max(80),
  labelEn: z.string().trim().min(1).max(80)
});

const customFieldSchema = z.object({
  element: z.string().trim().regex(CUSTOM_ELEMENT),
  label: z.string().trim().min(1).max(80),
  labelEn: z.string().trim().min(1).max(80),
  description: z.string().trim().max(1000).default(""),
  type: z.enum(CUSTOM_TYPES),
  reference: z.string().nullish(),
  mandatory: z.boolean().default(false),
  defaultValue: z.union([z.string(), z.number(), z.boolean()]).nullish().transform(value => (value === null || value === undefined ? value : String(value))),
  choices: z.array(choiceSchema).max(100).optional()
});

sysRouter.post("/sys/tables/:table/fields", requireAdmin, (req, res) => {
  const table = tableOr404(req, res);
  if (!table) return;
  const parsed = customFieldSchema.safeParse(req.body);
  if (!parsed.success) {
    const element = parsed.error.issues.some(issue => issue.path[0] === "element");
    return res.status(400).json({ error: element
      ? "Sisäisen nimen pitää alkaa u_ ja sisältää vain pieniä kirjaimia, numeroita ja alaviivoja."
      : "Tarkista kentän tiedot." });
  }
  try {
    const field = addCustomField(table, parsed.data);
    audit(actorName(res), "custom_field_created", { table: table.name, element: field.element, type: field.internal_type });
    res.status(201).json(fieldJson(field));
  } catch (error) {
    if (error instanceof RecordError) return res.status(400).json({ error: error.message });
    throw error;
  }
});

function customFieldOr404(req: express.Request, res: express.Response) {
  const table = tableOr404(req, res);
  if (!table) return undefined;
  const field = getFields(table.name).find(item => item.element === req.params.element);
  if (!field) {
    res.status(404).json({ error: "Kenttää ei löytynyt." });
    return undefined;
  }
  if (!field.custom) {
    res.status(400).json({ error: "Vain itse lisättyä kenttää voi muuttaa näin." });
    return undefined;
  }
  return { table, field };
}

sysRouter.delete("/sys/tables/:table/fields/:element", requireAdmin, (req, res) => {
  const found = customFieldOr404(req, res);
  if (!found) return;
  deleteCustomField(found.table, found.field);
  audit(actorName(res), "custom_field_deleted", { table: found.table.name, element: found.field.element });
  res.json({ ok: true });
});

sysRouter.post("/sys/tables/:table/fields/:element/choices", requireAdmin, (req, res) => {
  const found = customFieldOr404(req, res);
  if (!found) return;
  if (found.field.internal_type !== "choice") return res.status(400).json({ error: "Kenttä ei ole valintakenttä." });
  const parsed = choiceSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Tarkista valinta." });
  const exists = db.prepare("SELECT 1 FROM sys_choice WHERE table_name = ? AND element = ? AND value = ?")
    .get(found.table.name, found.field.element, parsed.data.value);
  if (exists) return res.status(400).json({ error: "Valinta on jo olemassa." });
  const sequence = (db.prepare("SELECT COALESCE(MAX(sequence), -10) + 10 AS next FROM sys_choice WHERE table_name = ? AND element = ?")
    .get(found.table.name, found.field.element) as { next: number }).next;
  db.prepare("INSERT INTO sys_choice (table_name, element, value, label, label_en, sequence) VALUES (?, ?, ?, ?, ?, ?)")
    .run(found.table.name, found.field.element, parsed.data.value, parsed.data.label, parsed.data.labelEn, sequence);
  audit(actorName(res), "dictionary_updated", { table: found.table.name, element: found.field.element, value: parsed.data.value });
  res.status(201).json({ element: found.field.element, ...parsed.data, sequence });
});

sysRouter.delete("/sys/tables/:table/fields/:element/choices/:value", requireAdmin, (req, res) => {
  const found = customFieldOr404(req, res);
  if (!found) return;
  const count = (db.prepare("SELECT COUNT(*) AS count FROM sys_choice WHERE table_name = ? AND element = ?")
    .get(found.table.name, found.field.element) as { count: number }).count;
  if (count <= 1) return res.status(400).json({ error: "Valintakentällä pitää olla vähintään yksi valinta." });
  const removed = db.prepare("DELETE FROM sys_choice WHERE table_name = ? AND element = ? AND value = ?")
    .run(found.table.name, found.field.element, req.params.value).changes;
  if (!removed) return res.status(404).json({ error: "Valintaa ei löytynyt." });
  audit(actorName(res), "dictionary_updated", { table: found.table.name, element: found.field.element, removedValue: req.params.value });
  res.json({ ok: true });
});
