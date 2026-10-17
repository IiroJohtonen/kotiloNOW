import express, { type Router } from "express";
import { z } from "zod";
import { requireAdmin } from "../auth.js";
import { db } from "../db.js";
import { buildQuery, getFields, getTable, QueryError, type SysTable, toRecord } from "../sys-dictionary.js";
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
  primaryKey: !!field.primary_key, defaultValue: field.default_value, secret: !!field.secret
});

sysRouter.get("/sys/tables/:table", requireAdmin, (req, res) => {
  const table = tableOr404(req, res);
  if (!table) return;
  const choices = db.prepare(`
    SELECT element, value, label, label_en AS labelEn, sequence FROM sys_choice WHERE table_name = ? ORDER BY element, sequence
  `).all(table.name);
  res.json({
    table: {
      name: table.name, physicalName: table.physical_name, label: table.label, labelEn: table.label_en,
      description: table.description, isSystem: !!table.is_system
    },
    fields: getFields(table.name).map(fieldJson),
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
  const parsed = labelsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Tarkista kentän tiedot." });
  const { label = field.label, labelEn = field.label_en, description = field.description } = parsed.data;
  db.prepare("UPDATE sys_dictionary SET label = ?, label_en = ?, description = ?, updated_at = ? WHERE table_name = ? AND element = ?")
    .run(label, labelEn, description, now(), table.name, field.element);
  audit(actorName(res), "dictionary_updated", { table: table.name, element: field.element, fields: Object.keys(parsed.data) });
  res.json(fieldJson({ ...field, label, label_en: labelEn, description }));
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
  const key = fields.find(field => field.element === "sys_id");
  if (!key) return res.status(404).json({ error: "Taulun tietueilla ei ole tunnistetta sys_id." });
  const row = db.prepare(`SELECT * FROM "${table.physical_name}" WHERE "${key.column_name}" = ?`).get(req.params.sysId) as
    Record<string, unknown> | undefined;
  if (!row) return res.status(404).json({ error: "Tietuetta ei löytynyt." });
  audit(actorName(res), "table_records_viewed", { table: table.name, sysId: req.params.sysId });
  res.json({ result: toRecord(fields, row) });
});
